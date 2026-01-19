import React, { useState, useEffect } from 'react';
import { PencilSquareIcon, QuestionMarkCircleIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { useSelection } from '@/side_panel/context/SelectionContext';
import { UnitForm } from '@/side_panel/components/UnitForm';
import { useApi } from '@/hooks/useApi';
import { LogicalUnit } from '@/utils/types';

export const Label = () => {
  // 1. Destructure refreshTrigger
  const { currentSelection, selectedUnit, clearSelection, refreshTrigger } = useSelection();
  const { get } = useApi();

  const [repairTarget, setRepairTarget] = useState<LogicalUnit | null>(null);

  const [pageUnits, setPageUnits] = useState<{
      id: number,
      text_content: string,
      unit_type: string,
      author?: string,
      source_code: string,
      source_page_id: number,
      title?: string,
      connected_anchors?: number[]
  }[]>([]);

  useEffect(() => {
    if (selectedUnit) {
        setRepairTarget(null); 
    }
  }, [selectedUnit]);

  // 2. Refactored Fetch Logic with Retry
  useEffect(() => {
    let isMounted = true;
    
    // Clear OLD data immediately on navigation trigger
    if (!currentSelection && !selectedUnit) {
        setPageUnits([]);
    }

    const fetchStats = async (retryCount = 0) => {
        // Don't fetch if we are in the middle of creating/editing
        if (currentSelection || selectedUnit) return;

        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]?.id) {
                const res = await chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CACHED_STATS' }).catch(() => null);
                
                if (res && res.units) {
                    if (isMounted) {
                        setPageUnits(res.units.filter((u: any) => 
                            !['user_highlight', 'canonical_answer', 'link_subject', 'link_object'].includes(u.unit_type)
                        ));
                    }
                    return; // Success, exit
                }
            }

            // Retry Logic: 250ms delay, max 8 tries (2 seconds)
            if (retryCount < 8 && isMounted) {
                setTimeout(() => fetchStats(retryCount + 1), 250);
            } else if (isMounted) {
                setPageUnits([]); // Ensure empty if finally failed
            }
        } catch (e) { 
            if (isMounted) setPageUnits([]);
        }
    };
    
    fetchStats();

    return () => { isMounted = false; };
  }, [currentSelection, selectedUnit, refreshTrigger]); // Add refreshTrigger

  const handleUnitJump = (unit: typeof pageUnits[0]) => {
      chrome.runtime.sendMessage({ 
          type: 'NAVIGATE_TO_UNIT', 
          unit_id: unit.id,
          source_code: unit.source_code,
          source_page_id: unit.source_page_id,
          title: unit.title,
          connected_anchors: unit.connected_anchors
      });
  };

  const handleSuccess = () => {
      clearSelection();
      setRepairTarget(null);
      chrome.tabs.reload();
  };

  const handleCancel = () => {
      clearSelection();
      setRepairTarget(null);
  };

  // Helper to Capitalize First Letter
  const capitalize = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

  // 1. Repair Mode
  if (repairTarget) {
      return (
          <div className="p-4 space-y-6">
              <div className="flex justify-between items-center">
                 <h2 className="text-lg font-bold text-slate-800">Repair Unit</h2>
              </div>
              <UnitForm 
                  existingUnit={repairTarget}
                  isRepairing={true}
                  selection={currentSelection?.text}
                  offsets={currentSelection?.offsets}
                  connected_anchors={currentSelection?.connected_anchors}
                  onCancel={handleCancel}
                  onSuccess={handleSuccess}
              />
          </div>
      );
  }

  // 2. Edit Mode
  if (selectedUnit) {
    return (
      <div className="p-4 space-y-6">
        <div className="flex justify-between items-center">
             <h2 className="text-lg font-bold text-slate-800">Edit Unit</h2>
        </div>
        <UnitForm 
          existingUnit={selectedUnit}
          onCancel={handleCancel}
          onSuccess={handleSuccess}
          onEnterRepair={() => setRepairTarget(selectedUnit)}
        />
      </div>
    );
  }

  // 3. Create Mode
  if (currentSelection) {
    return (
      <div className="p-4 space-y-6">
        <div className="flex justify-between items-center">
             <h2 className="text-lg font-bold text-slate-800">New Addition</h2>
        </div>
        <UnitForm 
          selection={currentSelection.text}
          offsets={currentSelection.offsets}
          context={currentSelection.context}
          connected_anchors={currentSelection.connected_anchors}
          onCancel={handleCancel}
          onSuccess={handleSuccess}
        />
      </div>
    );
  }

  // 4. Idle State
  return (
    <div className="p-4 space-y-6 h-full flex flex-col">
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 group relative">
                <h2 className="text-lg font-bold text-slate-800">
                    Label Manager
                </h2>
                <QuestionMarkCircleIcon className="w-5 h-5 text-slate-400 cursor-help hover:text-slate-600 transition-colors" />
                
                <div className="absolute left-0 top-full mt-2 hidden group-hover:block w-72 p-3 bg-slate-800 text-white text-xs font-normal rounded-md shadow-xl z-20 leading-relaxed">
                    <p className="font-bold mb-1 border-b border-slate-600 pb-1">How to use this page:</p>
                    <p>Highlight a tablet, prayer, or historical account to label it.</p>
                    <div className="absolute bottom-full left-6 border-8 border-transparent border-b-slate-800"></div>
                </div>
            </div>
        </div>

        {pageUnits.length > 0 ? (
            <div className="bg-blue-50 rounded border border-blue-100 p-3 animate-in fade-in duration-500 flex flex-col h-full overflow-hidden">
                <p className="text-xs font-bold text-blue-800 mb-2 uppercase tracking-wide border-b border-blue-200 pb-1 flex-shrink-0">
                    This page contains: {pageUnits.length} Unit{pageUnits.length !== 1 ? 's' : ''}
                </p>
                
                <div className="space-y-2 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-blue-200 flex-1 min-h-0">
                    {pageUnits.map(unit => (
                        <button 
                            key={unit.id}
                            onClick={() => handleUnitJump(unit)}
                            className="w-full text-left bg-white p-2 rounded border border-blue-100 shadow-sm hover:shadow-md hover:border-blue-300 transition-all group flex flex-col gap-1"
                        >
                            <div className="flex items-start gap-2">
                                <DocumentTextIcon className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0 group-hover:text-blue-600" />
                                <span className="text-xs text-slate-600 font-serif italic line-clamp-2 group-hover:text-slate-800 break-words">
                                    "{unit.text_content}"
                                </span>
                            </div>
                            
                            {/* CLEAN METADATA LINE */}
                            <div className="w-full text-right mt-1 border-t border-slate-50 pt-1">
                                <span className="text-[10px] text-slate-500 group-hover:text-blue-600 font-medium">
                                    Author: {unit.author || 'Unknown'}
                                    <span className="mx-1">•</span>
                                    Type: {capitalize(unit.unit_type)}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <PencilSquareIcon className="h-12 w-12 mb-2 opacity-20" /> 
                <p className="text-sm max-w-xs">
                    Select text on the page to begin labeling a new logical unit.
                </p>
            </div>
        )}
    </div>
  );
};
