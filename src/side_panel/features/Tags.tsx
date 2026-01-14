import React, { useState, useEffect } from 'react';
import { useSelection } from '@/side_panel/context/SelectionContext';
import { TaxonomyExplorer } from './TaxonomyExplorer';
import { TagInput } from '../components/TagInput';
import { useApi } from '@/hooks/useApi';
import { DefinedTag } from '@/utils/types';
import { MagnifyingGlassIcon, UserIcon, BuildingLibraryIcon, TrashIcon } from '@heroicons/react/24/solid';
import { LogicalUnit } from '@/utils/types';

export const Tags = () => {
  const { currentSelection, clearSelection, viewMode, setViewMode } = useSelection();
  const { post, put, del, get } = useApi();
  
  // Header State
  const [filterText, setFilterText] = useState('');
  
  // Editor State
  const [editingUnit, setEditingUnit] = useState<LogicalUnit | null>(null);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [revealUnitId, setRevealUnitId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // 1. Listen for clicks on existing highlights (from Background/Highlighter)
  useEffect(() => {
    const listener = (msg: any) => {
      if (msg.type === 'UNIT_CLICKED' && msg.unit) {
        // Switch to Edit Mode
        clearSelection(); // Clear "Create" selection if active
        setEditingUnit(msg.unit);
        setRevealUnitId(msg.unit.id); // Trigger Tree expansion
        
        // Load tags for this unit
        get(`/api/units/${msg.unit.id}/tags`).then((tags: any[]) => {
            setTagIds(tags.map(t => t.id));
        });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // 2. Handle Selection Changes (Create Mode)
  useEffect(() => {
    if (currentSelection) {
      setEditingUnit(null); // Close Edit mode
      setTagIds([]);
    }
  }, [currentSelection]);

  // Helper to trigger refreshes
  const triggerRefresh = () => {
      chrome.runtime.sendMessage({ type: 'REFRESH_HIGHLIGHTS' });
      setRefreshKey(prev => prev + 1); // <--- Updates Tree
  };

    // --- ACTIONS ---
  const handleCreate = async () => {
    if (!currentSelection) return;
    setIsSaving(true);
    try {
      await post('/api/contribute/unit', {
        source_code: currentSelection.context.source_code,
        source_page_id: currentSelection.context.source_page_id,
        title: currentSelection.context.title,
        text_content: currentSelection.text,
        start_char_index: currentSelection.offsets.start,
        end_char_index: currentSelection.offsets.end,
        unit_type: 'user_highlight',
        author: 'Undefined',
        tags: tagIds
      });
      chrome.runtime.sendMessage({ type: 'REFRESH_HIGHLIGHTS' });
      triggerRefresh();
      clearSelection();
    } catch (e) {
      console.error(e);
      alert("Failed to save.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingUnit) return;
    setIsSaving(true);
    try {
        await put(`/api/units/${editingUnit.id}/tags`, { tags: tagIds });
        chrome.runtime.sendMessage({ type: '' });
        triggerRefresh();
        setEditingUnit(null); // Close editor
    } catch (e) {
        console.error(e);
        alert("Failed to update.");
    } finally {
        setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingUnit || !confirm("Delete this highlight?")) return;
    try {
        await del(`/api/units/${editingUnit.id}`);
        chrome.runtime.sendMessage({ type: 'REFRESH_HIGHLIGHTS' });
        triggerRefresh();
        setEditingUnit(null);
    } catch (e) {
        alert("Could not delete. You may not be the owner.");
    }
  };

  // Handle Tag Clicks from Tree
  const handleTagClickFromTree = (tag: DefinedTag) => {
    // Only attach tag if we are currently editing or creating (Editor Visible)
    if (isEditorVisible) {
        if (!tagIds.includes(tag.id)) {
            setTagIds(prev => [...prev, tag.id]);
        }
    }
  };

  const closeBottomPane = () => {
    clearSelection();
    setEditingUnit(null);
  };

  // Determine if Bottom Pane is visible
  const isEditorVisible = !!currentSelection || !!editingUnit;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      
      {/* SECTION 1: HEADER (Always Visible) */}
      <div className="p-3 bg-white border-b border-slate-200 shadow-sm z-10 space-y-3">
        {/* Toggle */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('mine')}
            className={`flex-1 flex items-center justify-center py-1.5 text-xs font-semibold rounded-md transition-colors ${
              viewMode === 'mine' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <UserIcon className="w-3 h-3 mr-1" />
            My Tags
          </button>
          <button
            onClick={() => setViewMode('all')}
            className={`flex-1 flex items-center justify-center py-1.5 text-xs font-semibold rounded-md transition-colors ${
              viewMode === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <BuildingLibraryIcon className="w-3 h-3 mr-1" />
            View Examples
          </button>
        </div>
        {/* Filter Input */}
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Filter taxonomy..." 
            className="w-full pl-8 pr-2 py-2 text-sm border rounded bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </div>
      </div>

      {/* SECTION 2: TAXONOMY TREE (Always Visible, scrollable) */}
      <div className="flex-1 overflow-y-auto p-2">
        <TaxonomyExplorer 
            filter={filterText} 
            viewMode={viewMode} 
            revealUnitId={revealUnitId}
            refreshKey={refreshKey}
            onTagSelect={handleTagClickFromTree}
            isSelectionMode={isEditorVisible}
        />
      </div>

      {/* SECTION 3: EDITOR (Conditional Slide-up) */}
      {isEditorVisible && (
        <div className="border-t-2 border-blue-500 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20 flex flex-col max-h-[50%]">
           {/* Handle Bar / Header */}
           <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-500 uppercase">
                {editingUnit ? "Edit Highlight" : "New Highlight"}
              </span>
              <div className="flex gap-2">
                {editingUnit && (
                    <button onClick={handleDelete} className="text-red-500 hover:text-red-700 p-1" title="Delete">
                        <TrashIcon className="w-4 h-4" />
                    </button>
                )}
                <button onClick={closeBottomPane} className="text-slate-400 hover:text-slate-600 font-bold text-lg leading-none px-1">
                    &times;
                </button>
              </div>
           </div>

           <div className="p-4 overflow-y-auto">
              {/* Context Text */}
              <blockquote className="text-xs text-slate-600 italic border-l-2 border-slate-300 pl-2 mb-4 line-clamp-3">
                 "{currentSelection ? currentSelection.text : editingUnit?.text_content}"
              </blockquote>

              <TagInput selectedTags={tagIds} onChange={setTagIds} />
              
              <div className="mt-4 flex justify-end">
                 <button 
                    onClick={editingUnit ? handleUpdate : handleCreate}
                    disabled={isSaving}
                    className="bg-blue-600 text-white text-sm font-bold py-2 px-4 rounded shadow hover:bg-blue-700 disabled:opacity-50"
                 >
                    {isSaving ? 'Saving...' : (editingUnit ? 'Update Tags' : 'Save')}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
