import React, { useState, useEffect } from 'react';
import { useSelection } from '@/side_panel/context/SelectionContext';
import { TaxonomyExplorer } from './TaxonomyExplorer';
import { TagInput, Tag } from '../components/TagInput';
import { useApi } from '@/hooks/useApi';
import { 
    MagnifyingGlassIcon, UserIcon, BuildingLibraryIcon, 
    TrashIcon, PencilSquareIcon, CheckIcon, XMarkIcon,
    ChevronDownIcon 
} from '@heroicons/react/24/solid';
import { LogicalUnit, DefinedTag } from '@/utils/types';

// [NEW] Canonical Author List
const CANONICAL_AUTHORS = [
    "The Báb",
    "Bahá’u’lláh",
    "‘Abdu’l-Bahá",
    "Shoghi Effendi",
    "Universal House of Justice"
];

export const Tags = () => {
  const { currentSelection, clearSelection, viewMode, setViewMode } = useSelection();
  const { post, put, del, get } = useApi();
  
  // Header State
  const [filterText, setFilterText] = useState('');
  
  // Edit Tree Mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [treeChanges, setTreeChanges] = useState<{id: number, parent_id: number | null}[]>([]);
  
  // Editor State
  const [editingUnit, setEditingUnit] = useState<LogicalUnit | null>(null);
  const [editingTag, setEditingTag] = useState<DefinedTag | null>(null);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]); 
  const [isSaving, setIsSaving] = useState(false);
  const [revealUnitId, setRevealUnitId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // [NEW] Author Logic
  const [author, setAuthor] = useState('Undefined');
  const [isAutoDetected, setIsAutoDetected] = useState(false); // True if came from Scraper
  const [showManualAuthorInput, setShowManualAuthorInput] = useState(false); // For "Other" flow

  // 1. Listen for clicks/selection
  useEffect(() => {
    const listener = (msg: any) => {
      // CASE A: Existing Unit Clicked
      if (msg.type === 'UNIT_CLICKED' && msg.unit) {
        clearSelection();
        setEditingTag(null);
        setEditingUnit(msg.unit);
        setRevealUnitId(msg.unit.id);
        
        // Existing units are "locked" to whatever is in DB, treat as auto-detected for UI simplicity
        setAuthor(msg.unit.author || 'Undefined');
        setIsAutoDetected(true); 
        setShowManualAuthorInput(false);

        get(`/api/units/${msg.unit.id}/tags`).then((tags: Tag[]) => {
            setSelectedTags(tags); 
        });
      }

      // CASE B: New Text Selected
      if (msg.type === 'TEXT_SELECTED') {
         // Check scraper context
         const detected = msg.context && msg.context.author && msg.context.author !== 'Undefined';
         
         if (detected) {
             setAuthor(msg.context.author);
             setIsAutoDetected(true);
             setShowManualAuthorInput(false);
         } else {
             setAuthor('Undefined'); // Reset to default
             setIsAutoDetected(false);
             setShowManualAuthorInput(false);
         }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // 2. Handle Create Mode
  useEffect(() => {
    if (currentSelection) {
      setEditingUnit(null); 
      setEditingTag(null);
      setSelectedTags([]); 
      // Author reset handled in listener above based on message content
    }
  }, [currentSelection]);

  const triggerRefresh = () => {
      chrome.runtime.sendMessage({ type: 'REFRESH_HIGHLIGHTS' });
      setRefreshKey(prev => prev + 1);
  };

  const handleCreate = async () => {
    if (!currentSelection) return;
    
    // Validation: Don't save "Undefined"
    if (author === 'Undefined') {
        alert("Please select an author.");
        return;
    }

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
        author: author,
        tags: selectedTags.map(t => t.id) 
      });
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
        await put(`/api/units/${editingUnit.id}/tags`, { 
            tags: selectedTags.map(t => t.id) 
        });
        triggerRefresh();
        setEditingUnit(null);
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
        triggerRefresh();
        setEditingUnit(null);
    } catch (e) {
        alert("Could not delete.");
    }
  };

  const handleRename = async () => {
      if (!editingTag || !editingTag.label.trim()) return;
      setIsSaving(true);
      try {
          await put(`/api/tags/${editingTag.id}`, { label: editingTag.label });
          setEditingTag(null);
          setRefreshKey(prev => prev + 1);
      } catch (e: any) {
          alert(e.message || "Failed to rename");
      } finally {
          setIsSaving(false);
      }
  };

  const handleSaveTree = async () => {
    if (treeChanges.length === 0) {
        setIsEditMode(false);
        return;
    }
    setIsSaving(true);
    try {
        await put('/api/tags/hierarchy', { updates: treeChanges });
        setTreeChanges([]); 
        setIsEditMode(false);
        setRefreshKey(prev => prev + 1); 
    } catch (e) {
        alert("Failed to save hierarchy changes.");
    } finally {
        setIsSaving(false);
    }
  };

  const handleTagDeleteRequest = async (tag: DefinedTag, hasChildren: boolean) => {
    if (hasChildren) {
        alert("You must delete or move all child tags before you can delete this one.");
        return;
    }

    const shouldDelete = confirm(`Are you sure you want to delete "${tag.label}"?`);
    if (!shouldDelete) return;

    const moveUnits = !confirm(
        `Do you want to DELETE all snippets categorized here?\n\n` + 
        `OK = Yes, Delete snippets\n` + 
        `Cancel = No, move snippets to 'Uncategorized'`
    );

    try {
        await del(`/api/tags/${tag.id}`, { move_units_to_uncategorized: moveUnits });
        setRefreshKey(prev => prev + 1);
        if (editingTag?.id === tag.id) setEditingTag(null);
    } catch (e: any) {
        alert(e.message || "Could not delete tag");
    }
  };

  const handleTagClickFromTree = (tag: DefinedTag) => {
    if (isEditorVisible && !editingTag) { 
        if (!selectedTags.some(t => t.id === tag.id)) {
            setSelectedTags(prev => [...prev, { id: tag.id, label: tag.label }]);
        }
    }
  };

  const closeBottomPane = () => {
    clearSelection();
    setEditingUnit(null);
    setEditingTag(null);
    setRevealUnitId(null);
    setIsAutoDetected(false); // Reset
    setShowManualAuthorInput(false); // Reset
  };

  const isEditorVisible = !!currentSelection || !!editingUnit || !!editingTag;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      
      {/* Header */}
      <div className="p-3 bg-white border-b border-slate-200 shadow-sm z-10 space-y-3">
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

        <div className="flex items-center gap-2">
            <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Filter taxonomy..." 
                    className="w-full pl-8 pr-2 py-2 text-sm border rounded bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                />
            </div>

            {viewMode === 'mine' && (
                !isEditMode ? (
                    <button 
                        onClick={() => setIsEditMode(true)}
                        className="p-2 text-slate-500 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded transition-colors"
                        title="Edit Taxonomy Tree"
                    >
                        <PencilSquareIcon className="w-4 h-4" />
                    </button>
                ) : (
                    <div className="flex gap-1">
                        <button 
                            onClick={handleSaveTree}
                            disabled={isSaving}
                            className="p-2 bg-green-100 text-green-700 hover:bg-green-200 border border-green-300 rounded transition-colors"
                            title="Save Hierarchy Changes"
                        >
                            <CheckIcon className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => { setIsEditMode(false); setRefreshKey(prev => prev + 1); setTreeChanges([]); }}
                            className="p-2 bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300 rounded transition-colors"
                            title="Cancel Editing"
                        >
                            <XMarkIcon className="w-4 h-4" />
                        </button>
                    </div>
                )
            )}
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-2">
        <TaxonomyExplorer 
            filter={filterText} 
            viewMode={viewMode} 
            revealUnitId={revealUnitId}
            refreshKey={refreshKey}
            onTagSelect={handleTagClickFromTree}
            isSelectionMode={isEditorVisible && !editingTag}
            isEditMode={isEditMode}
            onTreeChange={setTreeChanges}
            onDeleteTag={handleTagDeleteRequest}
            onEditTag={setEditingTag}
        />
      </div>

      {/* Editor Pane (Dynamic Content) */}
      {isEditorVisible && (
        <div className="border-t-2 border-blue-500 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20 flex flex-col max-h-[50%]">
           <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-500 uppercase">
                {editingTag ? "Rename Tag" : (editingUnit ? "Edit Highlight" : "New Highlight")}
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
              
              {/* CONDITION: Renaming Tag */}
              {editingTag ? (
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Tag Name</label>
                          <input 
                              type="text" 
                              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                              value={editingTag.label}
                              onChange={(e) => setEditingTag({ ...editingTag, label: e.target.value })}
                              autoFocus
                              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                          />
                      </div>
                      <div className="flex justify-end">
                          <button 
                             onClick={handleRename}
                             disabled={isSaving || !editingTag.label.trim()}
                             className="bg-blue-600 text-white text-sm font-bold py-2 px-4 rounded shadow hover:bg-blue-700 disabled:opacity-50"
                          >
                             {isSaving ? 'Saving...' : 'Rename'}
                          </button>
                      </div>
                  </div>
              ) : (
                  /* CONDITION: Editing Unit (Snippet) */
                  <>
                      {/* [NEW] Author Selection Logic */}
                      {/* Only show if we are Creating New (not editing existing, though you can enable it for both if you want) */}
                      {!editingUnit && (
                          <div className="mb-4">
                               {isAutoDetected ? (
                                   // A. Auto-Detected: Minimalist
                                   <div className="mb-4 text-xs font-bold text-slate-500 uppercase tracking-wide">
                                       Author: {author}
                                   </div>
                               ) : (
                                   // B. Manual Selection
                                   <div>
                                       <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Author</label>
                                       
                                       {showManualAuthorInput ? (
                                           // C. Free Text Input (if "Other" was clicked)
                                           <div className="relative">
                                               <input 
                                                   type="text" 
                                                   className="w-full p-2 pl-8 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                                   value={author === 'Undefined' ? '' : author}
                                                   onChange={(e) => setAuthor(e.target.value)}
                                                   placeholder="Enter Author Name..."
                                                   autoFocus
                                               />
                                               <UserIcon className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                                               <button 
                                                    onClick={() => { setShowManualAuthorInput(false); setAuthor('Undefined'); }}
                                                    className="absolute right-2 top-2 text-xs text-blue-600 hover:underline"
                                               >
                                                   Cancel
                                               </button>
                                           </div>
                                       ) : (
                                           // D. Dropdown
                                           <div className="relative">
                                               <select 
                                                   className="w-full p-2 pl-8 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white"
                                                   value={author}
                                                   onChange={(e) => {
                                                       if (e.target.value === 'OTHER_MANUAL') {
                                                           setShowManualAuthorInput(true);
                                                           setAuthor('');
                                                       } else {
                                                           setAuthor(e.target.value);
                                                       }
                                                   }}
                                               >
                                                   <option value="Undefined" disabled>Select an Author...</option>
                                                   {CANONICAL_AUTHORS.map(name => (
                                                       <option key={name} value={name}>{name}</option>
                                                   ))}
                                                   <option value="OTHER_MANUAL">Other...</option>
                                               </select>
                                               <UserIcon className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                                               <ChevronDownIcon className="absolute right-2.5 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                                           </div>
                                       )}
                                   </div>
                               )}
                          </div>
                      )}

                      <TagInput tags={selectedTags} onChange={setSelectedTags} />
                      
                      <div className="mt-4 flex justify-end">
                         <button 
                            onClick={editingUnit ? handleUpdate : handleCreate}
                            disabled={isSaving}
                            className="bg-blue-600 text-white text-sm font-bold py-2 px-4 rounded shadow hover:bg-blue-700 disabled:opacity-50"
                         >
                            {isSaving ? 'Saving...' : (editingUnit ? 'Update Tags' : 'Save')}
                         </button>
                      </div>
                  </>
              )}
           </div>
        </div>
      )}
    </div>
  );
};
