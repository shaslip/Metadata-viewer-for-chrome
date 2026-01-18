import React, { useState, useEffect } from 'react';
import { PencilSquareIcon, QuestionMarkCircleIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { useSelection } from '@/side_panel/context/SelectionContext';
import { UnitForm } from '@/side_panel/components/UnitForm';
import { useApi } from '@/hooks/useApi';
import { LogicalUnit } from '@/utils/types';

export const Label = () => {
  const { currentSelection, selectedUnit, clearSelection } = useSelection();
  const { get } = useApi();
  
  const [repairTarget, setRepairTarget] = useState<LogicalUnit | null>(null);
  
  // [CHANGE] State now holds all fields needed for navigation
  const [pageUnits, setPageUnits] = useState<{
      id: number, 
      text_content: string, 
      unit_type: string,
      source_code: string,
      source_page_id: number,
      connected_anchors?: number[]
  }[]>([]);

  useEffect(() => {
    if (selectedUnit) {
        setRepairTarget(null); 
    }
  }, [selectedUnit]);

  // Fetch list of units from cache
  useEffect(() => {
    const fetchStats = async () => {
        if (!currentSelection && !selectedUnit) {
            try {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs[0]?.id) {
                    const res = await chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CACHED_STATS' }).catch(() => null);
                    if (res && res.units) {
                         setPageUnits(res.units);
                    } else {
                         setPageUnits([]);
                    }
                }
            } catch (e) { 
                setPageUnits([]);
            }
        }
    };
    fetchStats();
  }, [currentSelection, selectedUnit]);

  // [FIX] Pass connected_anchors and source info for Service Worker routing
  const handleUnitJump = (unit: typeof pageUnits[0]) => {
      chrome.runtime.sendMessage({ 
          type: 'NAVIGATE_TO_UNIT', 
          unit_id: unit.id,
          source_code: unit.source_code,
          source_page_id: unit.source_page_id,
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
        {/* Header matches Q&A exactly */}
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 group relative">
                <h2 className="text-lg font-bold text-slate-800">
                    Label Manager
                </h2>
                <QuestionMarkCircleIcon className="w-5 h-5 text-slate-400 cursor-help hover:text-slate-600 transition-colors" />
                
                <div className="absolute left-0 top-full mt-2 hidden group-hover:block w-72 p-3 bg-slate-800 text-white text-xs font-normal rounded-md shadow-xl z-20 leading-relaxed">
                    <p className="font-bold mb-1 border-b border-slate-600 pb-1">How to use this page:</p>
                    <p>Highlight a tablet, prayer, or historical account to label it. This allows the RAG system to understand the specific type of content.</p>
                    <div className="absolute bottom-full left-6 border-8 border-transparent border-b-slate-800"></div>
                </div>
            </div>
        </div>

        {/* List of Units */}
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
                            className="w-full text-left bg-white p-2 rounded border border-blue-100 shadow-sm hover:shadow-md hover:border-blue-300 transition-all group flex items-start gap-2"
                        >
                            <DocumentTextIcon className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0 group-hover:text-blue-600" />
                            <span className="text-xs text-slate-600 font-serif italic line-clamp-2 group-hover:text-slate-800 break-words">
                                "{unit.text_content}"
                            </span>
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
