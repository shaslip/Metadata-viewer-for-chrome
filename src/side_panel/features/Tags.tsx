import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSelection } from '@/side_panel/context/SelectionContext';
import { TaxonomyExplorer } from './TaxonomyExplorer';
import { TagInput, Tag } from '../components/TagInput';
import { useApi } from '@/hooks/useApi';
import { 
    MagnifyingGlassIcon, UserIcon, BuildingLibraryIcon, 
    TrashIcon, PencilSquareIcon, CheckIcon, XMarkIcon,
    ChevronDownIcon, ExclamationTriangleIcon, ArrowPathIcon,
    FolderIcon
} from '@heroicons/react/24/solid';
import { LogicalUnit, DefinedTag } from '@/utils/types';

// Canonical Author List
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
  const handleTreeChange = (newChanges: {id: number, parent_id: number | null}[]) => {
    setTreeChanges(prev => {
        const changeMap = new Map(prev.map(c => [c.id, c]));

        newChanges.forEach(c => {
            changeMap.set(c.id, c);
        });

        return Array.from(changeMap.values());
    });
  };
  const parentInputRef = useRef<HTMLInputElement>(null);
  const [parentDropdownPos, setParentDropdownPos] = useState({ bottom: 0, left: 0, width: 0 });
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  
  // Editor State
  const [editingUnit, setEditingUnit] = useState<LogicalUnit | null>(null);
  const [editingTag, setEditingTag] = useState<DefinedTag | null>(null);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]); 
  const [isSaving, setIsSaving] = useState(false);
  const [revealUnitId, setRevealUnitId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // State for Parent Selection in Modify Mode
  const [parentSearchQuery, setParentSearchQuery] = useState('');
  const [parentSuggestions, setParentSuggestions] = useState<DefinedTag[]>([]);
  const [selectedParent, setSelectedParent] = useState<{id: number, label: string} | null>(null);

  // Repair State
  const [repairSelection, setRepairSelection] = useState<{text: string, start: number, end: number, connected_anchors?: number[]} | null>(null);
  const [forceRepairMode, setForceRepairMode] = useState(false);

  // Author Logic
  const [author, setAuthor] = useState('Undefined');
  const [isAutoDetected, setIsAutoDetected] = useState(false);
  const [showManualAuthorInput, setShowManualAuthorInput] = useState(false);

  // Refs to keep the listener stable
  const editingUnitRef = useRef(editingUnit);
  const forceRepairModeRef = useRef(forceRepairMode);
  
  // Ref handler
  const handleUnitClickRef = useRef<(unit: LogicalUnit, fromTree?: boolean) => void>(() => {});

  // Sync Refs with State
  useEffect(() => { editingUnitRef.current = editingUnit; }, [editingUnit]);
  useEffect(() => { forceRepairModeRef.current = forceRepairMode; }, [forceRepairMode]);

  // 1. Listen for clicks/selection
  useEffect(() => {
    const listener = (msg: any) => {
      // CASE A: Standard Click -> Tag Editor
      if (msg.type === 'UNIT_CLICKED' && msg.unit) {
        setForceRepairMode(false); 
        handleUnitClickRef.current(msg.unit);
      }

      // [REMOVED] Double Click logic is gone.

      // CASE B: Text Selected
      if (msg.type === 'TEXT_SELECTED') {
          // Check Refs instead of state variables
          const isRepairing = editingUnitRef.current?.broken_index || forceRepairModeRef.current;

          if (isRepairing) {
             setRepairSelection({
                 text: msg.text,
                 start: msg.offsets.start,
                 end: msg.offsets.end,
                 connected_anchors: msg.connected_anchors || []
             });
             return;
          }

          // Normal Creation Flow
          const detected = msg.context && msg.context.author && msg.context.author !== 'Undefined';
          if (detected) {
              setAuthor(msg.context.author);
              setIsAutoDetected(true);
              setShowManualAuthorInput(false);
          } else {
              setAuthor('Undefined');
              setIsAutoDetected(false);
              setShowManualAuthorInput(false);
          }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // 2. Handle Create Mode (Reset when new selection made)
  useEffect(() => {
    // [FIX] Do NOT reset if we are in Repair Mode!
    if (currentSelection && !forceRepairMode && !editingUnit?.broken_index) {
      setEditingUnit(null); 
      setEditingTag(null);
      setSelectedTags([]); 
    }
  }, [currentSelection, forceRepairMode, editingUnit]);

  // Helper
  const triggerRefresh = () => {
      chrome.runtime.sendMessage({ type: 'REFRESH_HIGHLIGHTS' });
      setRefreshKey(prev => prev + 1);
  };

  // Central Handler for Unit Clicks
  const handleUnitClick = (unit: LogicalUnit, fromTree = false) => {
        clearSelection();
        setEditingTag(null);
        
        // CASE 1: Broken Unit -> Repair
        if (unit.broken_index) {
             setEditingUnit(unit);
             setRepairSelection(null);
             setRevealUnitId(unit.id || null);
             return; 
        }

        // CASE 2: Tree Click -> Navigate Only
        if (fromTree) {
             setEditingUnit(null); 
             if (unit.id) {
                 chrome.runtime.sendMessage({ type: 'NAVIGATE_TO_UNIT', unit_id: unit.id, ...unit });
             }
             return;
        }

        // CASE 3: Page Click -> Open Editor
        setEditingUnit(unit);
        setRevealUnitId(unit.id || null);

        setAuthor(unit.author || 'Undefined');
        setIsAutoDetected(true); 
        setShowManualAuthorInput(false);

        if (unit.id) {
            get(`/api/units/${unit.id}/tags`).then((tags: Tag[]) => {
                setSelectedTags(tags); 
            });
        }
  };

  useEffect(() => { handleUnitClickRef.current = handleUnitClick; });

  const handleCreate = async () => {
    if (!currentSelection) return;
    
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
        connected_anchors: currentSelection.connected_anchors || [],
        unit_type: 'user_highlight',
        author: author,
        tags: selectedTags.map(t => t.id) 
      });
      triggerRefresh();
      clearSelection();
      alert("Highlight saved!");
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
        // SCENARIO A: Simple Tag Update (No text changes, not broken)
        if (!editingUnit.broken_index && !forceRepairMode && !repairSelection) {
             await put(`/api/units/${editingUnit.id}/tags`, { 
                tags: selectedTags.map(t => t.id) 
             });
             triggerRefresh();
             setEditingUnit(null);
             setIsSaving(false);
             return;
        }

        // SCENARIO B: Repair / Re-Highlight (Delete & Re-Create)
        if (!repairSelection) {
            alert("No text selected for repair.");
            setIsSaving(false);
            return;
        }

        // Check root properties first (from SQL), fallback to defaults
        const sourceCode = editingUnit.source_code || 'bw';
        const sourcePageId = editingUnit.source_page_id || 0;
        const unitTitle = editingUnit.title || "Restored Highlight";

        const payload = {
            source_code: sourceCode,
            source_page_id: sourcePageId,
            title: unitTitle,
            
            // NEW DATA from Repair Selection
            start_char_index: repairSelection.start,
            end_char_index: repairSelection.end,
            text_content: repairSelection.text,
            
            // Pass the new connected anchors
            connected_anchors: repairSelection.connected_anchors || [],

            author: author,
            unit_type: editingUnit.unit_type,
            tags: selectedTags.map(t => t.id)
        };

        // Execute Swap
        await del(`/api/units/${editingUnit.id}`);
        await post('/api/contribute/unit', payload);

        triggerRefresh();
        setEditingUnit(null);
        setRepairSelection(null);
        setForceRepairMode(false);
        alert("Highlight repaired and saved.");

    } catch (e) {
        console.error(e);
        alert("Update failed.");
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

  // Search for parents when user types in Modify Pane
  useEffect(() => {
    if (!editingTag || !parentSearchQuery) {
        setParentSuggestions([]);
        return;
    }
    const timer = setTimeout(async () => {
        try {
            // Re-use existing tag search API
            const results = await get(`/api/tags?search=${encodeURIComponent(parentSearchQuery)}&scope=mine`);
            // Filter out self to prevent self-parenting
            setParentSuggestions(results.filter((t: any) => t.id !== editingTag.id));
        } catch (e) { console.error(e); }
    }, 250);
    return () => clearTimeout(timer);
  }, [parentSearchQuery, editingTag]);

  // Quick Create from Tree Filter
  const handleQuickCreate = async (label: string) => {
    if (!label.trim()) return;
    setIsSaving(true);
    try {
        await post('/api/tags', { label: label, is_official: 0 });
        setFilterText(''); // Clear filter to show new tag
        triggerRefresh();
    } catch (e) {
        alert("Failed to create tag.");
    } finally {
        setIsSaving(false);
    }
  };

  useEffect(() => {
      if (parentSearchQuery && parentInputRef.current && parentSuggestions.length > 0) {
          const rect = parentInputRef.current.getBoundingClientRect();
          setParentDropdownPos({
              // Matches the bottom of the screen to the top of the input (grows upwards)
              bottom: window.innerHeight - rect.top, 
              left: rect.left,
              width: rect.width
          });
      }
  }, [parentSearchQuery, parentSuggestions]);

  // Combined Rename + Move Logic
  const handleModifyTag = async () => {
      if (!editingTag || !editingTag.label.trim()) return;
      setIsSaving(true);
      try {
          // 1. Update Label
          await put(`/api/tags/${editingTag.id}`, { label: editingTag.label });

          // 2. Update Parent (if selected)
          if (selectedParent) {
              await put('/api/tags/hierarchy', { 
                  updates: [{ id: editingTag.id, parent_id: selectedParent.id }] 
              });
          }

          setEditingTag(null);
          setSelectedParent(null); // Reset
          setParentSearchQuery(''); // Reset
          setRefreshKey(prev => prev + 1);
      } catch (e: any) {
          alert(e.message || "Failed to modify tag");
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

  const handleConfirmDelete = async (moveUnitsToUncategorized: boolean) => {
    if (!editingTag) return;

    setIsSaving(true);
    try {
        await del(`/api/tags/${editingTag.id}`, { move_units_to_uncategorized: moveUnitsToUncategorized });
        setRefreshKey(prev => prev + 1);
        setEditingTag(null);
        setIsDeleteMode(false);
    } catch (e: any) {
        alert(e.message || "Could not delete tag");
    } finally {
        setIsSaving(false);
    }
  };

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

  // Repair Logic
  const handleRepair = async () => {
    if (!editingUnit || !repairSelection) return;
    setIsSaving(true);
    
    // DELETE + POST (Re-create)
    try {
        const payload = {
            source_code: editingUnit.source_code || 'bw',
            source_page_id: editingUnit.source_page_id || 0,
            title: editingUnit.title || "Repaired Highlight",
            text_content: repairSelection.text,
            start_char_index: repairSelection.start,
            end_char_index: repairSelection.end,
            connected_anchors: repairSelection.connected_anchors || [],
            author: author,
            unit_type: editingUnit.unit_type,
            tags: selectedTags.map(t => t.id)
        };

        // 1. Delete old
        await del(`/api/units/${editingUnit.id}`);
        // 2. Create new
        await post('/api/contribute/unit', payload);
        
        triggerRefresh();
        setEditingUnit(null);
        setRepairSelection(null);
        setForceRepairMode(false);
        alert("Highlight repaired and saved.");
    } catch (e) {
        console.error(e);
        alert("Failed to update highlight.");
    } finally {
        setIsSaving(false);
    }
};

  const closeBottomPane = () => {
    clearSelection();
    setEditingUnit(null);
    setEditingTag(null);
    setRevealUnitId(null);
    setRepairSelection(null); 
    setForceRepairMode(false);
    setIsAutoDetected(false);
    setShowManualAuthorInput(false);
    setIsDeleteMode(false);
  };

  const isEditorVisible = !!currentSelection || !!editingUnit || !!editingTag;
  const isRepairView = !!editingUnit?.broken_index || forceRepairMode;

  // Clear editingTag when exiting edit mode
  const handleCancelEditMode = () => {
      setIsEditMode(false);
      setEditingTag(null); // <--- FIX ADDED HERE
      setRefreshKey(prev => prev + 1);
      setTreeChanges([]);
      setIsDeleteMode(false);
  };

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
            View Example
          </button>
        </div>
        
        <div className="flex items-center gap-2">
            <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Filter or create taxonomy..." 
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
                            onClick={handleCancelEditMode} 
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
            onTreeChange={handleTreeChange}
            onEditTag={setEditingTag}
            onUnitClick={handleUnitClick}
            onCreateTag={handleQuickCreate}
        />
      </div>

      {/* Editor Pane (Dynamic Content) */}
      {isEditorVisible && (
        <div className="border-t-2 border-blue-500 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20 flex flex-col max-h-[60%]">
            
           {/* Dynamic Header */}
           <div className={`flex items-center justify-between px-4 py-2 border-b border-slate-200 ${editingUnit?.broken_index || isDeleteMode ? 'bg-red-50' : 'bg-slate-50'}`}>
              <span className={`text-xs font-bold uppercase ${editingUnit?.broken_index || isDeleteMode ? 'text-red-600 flex items-center gap-1' : 'text-slate-500'}`}>
                {(editingUnit?.broken_index || isDeleteMode) && <ExclamationTriangleIcon className="w-4 h-4" />}
                {isDeleteMode ? "Delete Category" : (
                    editingUnit?.broken_index ? "Repair Broken Highlight" : (editingTag ? "Modify Tag" : (editingUnit ? "Edit Highlight" : "New Highlight"))
                )}
              </span>
              
              <div className="flex items-center gap-1">
                {/* Save Button (Hide in Delete Mode) */}
                {!isDeleteMode && (
                    <button 
                        onClick={
                            isRepairView ? handleRepair : 
                            (editingTag ? handleModifyTag : (editingUnit ? handleUpdate : handleCreate))
                        }
                        disabled={isSaving || (isRepairView && !repairSelection)} 
                        className={`p-1 rounded disabled:opacity-50 ${isRepairView ? 'text-green-600 hover:bg-green-50' : 'text-green-600 hover:bg-green-50'}`} 
                        title={isRepairView ? "Confirm Repair" : "Save"}
                    >
                        <CheckIcon className="w-5 h-5" />
                    </button>
                )}

                {/* [NEW] Delete Trigger Button (Only show when modifying a tag) */}
                {editingTag && !isDeleteMode && (
                    <button 
                        onClick={() => setIsDeleteMode(true)}
                        className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50"
                        title="Delete Tag"
                    >
                        <TrashIcon className="w-5 h-5" />
                    </button>
                )}

                {/* Manual Edit / Re-Align Button */}
                {editingUnit && !editingUnit.broken_index && !isRepairView && (
                    <button 
                        onClick={() => { setForceRepairMode(true); setRepairSelection(null); }}
                        className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-blue-50"
                        title="Edit Highlight Text (Re-align)"
                    >
                        <PencilSquareIcon className="w-5 h-5" />
                    </button>
                )}

                {/* Delete Highlight Button */}
                {editingUnit && (
                    <button onClick={handleDelete} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50" title="Delete">
                        <TrashIcon className="w-5 h-5" />
                    </button>
                )}
                
                <div className="h-4 w-px bg-slate-300 mx-1"></div>

                <button onClick={closeBottomPane} className="text-slate-400 hover:text-slate-600 font-bold text-lg leading-none px-1">
                    &times;
                </button>
              </div>
           </div>

           <div className="p-4 overflow-y-auto">
              
              {/* 1. DELETE MODE UI */}
              {isDeleteMode && editingTag ? (
                 <div className="space-y-4">
                    {(editingTag as any).children && (editingTag as any).children.length > 0 ? (
                        <div className="text-center p-4">
                            <p className="text-sm text-slate-600 mb-4">
                                You cannot delete <strong>"{editingTag.label}"</strong> because it contains child categories.
                            </p>
                            <p className="text-xs text-slate-400 mb-4">
                                Please delete or move the sub-categories first.
                            </p>
                            <button 
                                onClick={() => setIsDeleteMode(false)}
                                className="px-4 py-2 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 text-sm font-semibold"
                            >
                                Go Back
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                             <p className="text-sm text-slate-700">
                                You are about to delete <strong>"{editingTag.label}"</strong>. 
                                This cannot be undone.
                             </p>
                             
                             <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                                What should happen to the highlights in this category?
                             </p>

                             <div className="flex flex-col gap-2">
                                <button 
                                    onClick={() => handleConfirmDelete(true)} // true = move to uncategorized
                                    className="flex items-center justify-center gap-2 p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded hover:bg-blue-100 transition-colors text-sm font-semibold"
                                >
                                    <FolderIcon className="w-4 h-4" />
                                    Keep highlights (Move to 'Uncategorized')
                                </button>
                                
                                <button 
                                    onClick={() => handleConfirmDelete(false)} // false = delete snippets
                                    className="flex items-center justify-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded hover:bg-red-100 transition-colors text-sm font-semibold"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                    Delete highlights permanently
                                </button>
                             </div>

                             <div className="pt-2 text-center">
                                <button 
                                    onClick={() => setIsDeleteMode(false)}
                                    className="text-xs text-slate-400 hover:text-slate-600 underline"
                                >
                                    Cancel
                                </button>
                             </div>
                        </div>
                    )}
                 </div>
              ) : isRepairView ? (
                 /* 2. Repair Mode UI (Existing Code) ... */
                 <div className="space-y-4">
                   {/* ... Keep Existing Repair Logic ... */}
                   <div className="text-xs text-slate-500">
                       {editingUnit?.broken_index 
                          ? "This highlight cannot be found. Select text to repair." 
                          : "Select text on the page to update the highlighted range."}
                   </div>
                   {editingUnit && (
                       <div className="opacity-75">
                           <label className="block text-[10px] font-bold text-slate-400 mb-0.5 uppercase">Original Text</label>
                           <div className="text-xs text-slate-600 bg-slate-100 p-2 rounded border border-slate-200 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
                               "{editingUnit.text_content}"
                           </div>
                       </div>
                   )}
                   <div>
                       <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">New Selection</label>
                       {repairSelection ? (
                           <div className="p-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                               "{repairSelection.text}"
                           </div>
                       ) : (
                           <div className="p-2 border border-dashed border-slate-300 rounded text-sm text-slate-400 text-center py-4">
                               Waiting for you to select text on the page...
                           </div>
                       )}
                   </div>
                 </div>
              ) : (
                /* 3. Normal Edit/Create UI */
                editingTag ? (
                   // ... Keep Existing Tag Edit Inputs ...
                   <div className="space-y-4">
                     <div>
                       <label className="block text-xs font-bold text-slate-500 mb-1">Tag Name</label>
                       <input 
                         type="text" 
                         className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                         value={editingTag.label}
                         onChange={(e) => setEditingTag({ ...editingTag, label: e.target.value })}
                         autoFocus
                       />
                     </div>
                     <div className="relative">
                       <label className="block text-xs font-bold text-slate-500 mb-1">Move to Parent (Optional)</label>
                       {selectedParent ? (
                         <div className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
                           <div className="flex items-center gap-2">
                             <FolderIcon className="w-4 h-4 opacity-50"/>
                             {selectedParent.label}
                           </div>
                           <button onClick={() => { setSelectedParent(null); setParentSearchQuery(''); }}>
                             <XMarkIcon className="w-4 h-4"/>
                           </button>
                         </div>
                       ) : (
                         <>
                           <input 
                             ref={parentInputRef}
                             type="text" 
                             className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                             placeholder="Type to find a parent category..."
                             value={parentSearchQuery}
                             onChange={(e) => setParentSearchQuery(e.target.value)}
                           />
                           {parentSuggestions.length > 0 && createPortal(
                             <ul 
                                 className="fixed z-[9999] bg-white border border-slate-200 rounded-lg shadow-2xl ring-1 ring-black/10 overflow-hidden"
                                 style={{
                                     left: parentDropdownPos.left,
                                     bottom: parentDropdownPos.bottom,
                                     width: parentDropdownPos.width,
                                     maxHeight: '50vh',
                                     overflowY: 'auto'
                                 }}
                             >
                               <li className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                 Suggested Parents
                               </li>
                               {parentSuggestions.map(s => (
                                 <li 
                                   key={s.id} 
                                   className="px-3 py-2.5 text-sm hover:bg-blue-50 cursor-pointer flex items-center gap-2 text-slate-700 border-b border-slate-50 last:border-0"
                                   onClick={() => {
                                     setSelectedParent({ id: s.id, label: s.label });
                                     setParentSuggestions([]);
                                   }}
                                 >
                                   <FolderIcon className="w-4 h-4 text-blue-400 opacity-75"/>
                                   <span className="truncate">{s.label}</span>
                                 </li>
                               ))}
                             </ul>,
                             document.body
                          )}
                        </>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1">
                        Selected parent will be applied on save. Leave empty to keep current location.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Author Selection */}
                    {!editingUnit && (
                      <div className="mb-4">
                        {isAutoDetected ? (
                          <div className="mb-4 text-xs font-bold text-slate-500 uppercase tracking-wide">
                            Author: {author}
                          </div>
                        ) : (
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Author</label>
                            {showManualAuthorInput ? (
                              <div className="relative">
                                <input type="text" className="w-full p-2 pl-8 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" value={author === 'Undefined' ? '' : author} onChange={(e) => setAuthor(e.target.value)} placeholder="Enter Author Name..." autoFocus />
                                <UserIcon className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                                <button onClick={() => { setShowManualAuthorInput(false); setAuthor('Undefined'); }} className="absolute right-2 top-2 text-xs text-blue-600 hover:underline">Cancel</button>
                              </div>
                            ) : (
                              <div className="relative">
                                <select className="w-full p-2 pl-8 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white" value={author} onChange={(e) => { if (e.target.value === 'OTHER_MANUAL') { setShowManualAuthorInput(true); setAuthor(''); } else { setAuthor(e.target.value); } }}>
                                  <option value="Undefined" disabled>Select an Author...</option>
                                  {CANONICAL_AUTHORS.map(name => <option key={name} value={name}>{name}</option>)}
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
                  </>
                )
              )}
           </div>
        </div>
      )}
    </div>
  );
};
