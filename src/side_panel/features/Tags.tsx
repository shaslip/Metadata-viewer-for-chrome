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
  
  // Helper to accumulate tree changes
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
  
  // Delete Mode State
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [tagHasUnits, setTagHasUnits] = useState<boolean | null>(null);
  
  // Editor State
  const [editingUnit, setEditingUnit] = useState<LogicalUnit | null>(null);
  const [editingTag, setEditingTag] = useState<DefinedTag | null>(null);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]); 
  const [isSaving, setIsSaving] = useState(false);
  const [revealUnitId, setRevealUnitId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const isEditModeRef = useRef(isEditMode);
  const handleSaveTreeRef = useRef<() => Promise<void>>(() => Promise.resolve());

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
  useEffect(() => { 
      editingUnitRef.current = editingUnit; 
      forceRepairModeRef.current = forceRepairMode;
      isEditModeRef.current = isEditMode;
      handleSaveTreeRef.current = handleSaveTree;
  });

  // 1. Listen for clicks/selection
  useEffect(() => {
    const listener = (msg: any) => {
      // CASE A: Standard Click -> Tag Editor
      if (msg.type === 'UNIT_CLICKED' && msg.unit) {
        setForceRepairMode(false); 
        handleUnitClickRef.current(msg.unit);
      }

      // CASE B: Text Selected
      if (msg.type === 'TEXT_SELECTED') {
          // Check Refs instead of state variables
          const isRepairing = editingUnitRef.current?.broken_index || forceRepairModeRef.current;

          // If user selects text while in Edit Tree mode, auto-save and close tree editor
          if (!isRepairing && isEditModeRef.current) {
              handleSaveTreeRef.current();
          }

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
    if (currentSelection && !forceRepairMode && !editingUnit?.broken_index) {
      setEditingUnit(null); 
      setEditingTag(null);
      setSelectedTags([]); 
    }
  }, [currentSelection, forceRepairMode, editingUnit]);

  // 3. Check for highlights when entering Delete Mode
  useEffect(() => {
    if (isDeleteMode && editingTag) {
        setTagHasUnits(null); // Reset to loading state
        // We reuse the existing GET endpoint to check length
        get(`/api/units?tag_id=${editingTag.id}`)
            .then((units: LogicalUnit[]) => {
                setTagHasUnits(units.length > 0);
            })
            .catch(() => setTagHasUnits(false)); // Fail safe
    }
  }, [isDeleteMode, editingTag]);

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
        // SCENARIO A: Simple Tag Update
        if (!editingUnit.broken_index && !forceRepairMode && !repairSelection) {
             await put(`/api/units/${editingUnit.id}/tags`, { 
                tags: selectedTags.map(t => t.id) 
             });
             triggerRefresh();
             setEditingUnit(null);
             setIsSaving(false);
             return;
        }

        // SCENARIO B: Repair / Re-Highlight
        if (!repairSelection) {
            alert("No text selected for repair.");
            setIsSaving(false);
            return;
        }

        const sourceCode = editingUnit.source_code || 'bw';
        const sourcePageId = editingUnit.source_page_id || 0;
        const unitTitle = editingUnit.title || "Restored Highlight";

        const payload = {
            source_code: sourceCode,
            source_page_id: sourcePageId,
            title: unitTitle,
            start_char_index: repairSelection.start,
            end_char_index: repairSelection.end,
            text_content: repairSelection.text,
            connected_anchors: repairSelection.connected_anchors || [],
            author: author,
            unit_type: editingUnit.unit_type,
            tags: selectedTags.map(t => t.id)
        };

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

  const handleDelete = () => {
    if (editingUnit) {
        setIsDeleteMode(true);
    }
  };

  // Actual execution for Highlight Deletion
  const confirmHighlightDelete = async () => {
    if (!editingUnit) return;
    try {
        await del(`/api/units/${editingUnit.id}`);
        triggerRefresh();
        setEditingUnit(null);
        setIsDeleteMode(false);
    } catch (e) {
        alert("Could not delete.");
    }
  };

  // Search for parents
  useEffect(() => {
    if (!editingTag || !parentSearchQuery) {
        setParentSuggestions([]);
        return;
    }
    const timer = setTimeout(async () => {
        try {
            const results = await get(`/api/tags?search=${encodeURIComponent(parentSearchQuery)}&scope=mine`);
            setParentSuggestions(results.filter((t: any) => t.id !== editingTag.id));
        } catch (e) { console.error(e); }
    }, 250);
    return () => clearTimeout(timer);
  }, [parentSearchQuery, editingTag]);

  // Quick Create
  const handleQuickCreate = async (label: string) => {
    if (!label.trim()) return;
    setIsSaving(true);
    try {
        await post('/api/tags', { label: label, is_official: 0 });
        setFilterText(''); 
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
              bottom: window.innerHeight - rect.top, 
              left: rect.left,
              width: rect.width
          });
      }
  }, [parentSearchQuery, parentSuggestions]);

  // Modify Tag Logic
  const handleModifyTag = async () => {
      if (!editingTag || !editingTag.label.trim()) return;
      setIsSaving(true);
      try {
          await put(`/api/tags/${editingTag.id}`, { label: editingTag.label });
          if (selectedParent) {
              await put('/api/tags/hierarchy', { 
                  updates: [{ id: editingTag.id, parent_id: selectedParent.id }] 
              });
          }
          setEditingTag(null);
          setSelectedParent(null);
          setParentSearchQuery('');
          setRefreshKey(prev => prev + 1);
      } catch (e: any) {
          alert(e.message || "Failed to modify tag");
      } finally {
          setIsSaving(false);
      }
  };

  const handleSaveTree = async () => {
    // If a tag is currently being modified, save it first
    if (editingTag) {
        await handleModifyTag();
    }

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

  // Delete Logic
  const handleConfirmTagDelete = async () => {
    if (!editingTag) return;

    setIsSaving(true);
    try {
        // Always pass true to preserve highlights
        await del(`/api/tags/${editingTag.id}`, { move_units_to_uncategorized: true });
        setRefreshKey(prev => prev + 1);
        setEditingTag(null);
        setIsDeleteMode(false);
    } catch (e: any) {
        alert(e.message || "Could not delete tag");
    } finally {
        setIsSaving(false);
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
        await del(`/api/units/${editingUnit.id}`);
        await post('/api/contribute/unit', payload);
        
        triggerRefresh();
        setEditingUnit(null);
        setRepairSelection(null);
        setForceRepairMode(false);
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

  const handleCancelEditMode = () => {
      setIsEditMode(false);
      setEditingTag(null);
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

                {/* Delete Trigger Button */}
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
              {isDeleteMode ? (
                 <div className="space-y-4">
                    {/* CASE A: Deleting a TAG */}
                    {editingTag ? (
                        (editingTag as any).children && (editingTag as any).children.length > 0 ? (
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
                                 {tagHasUnits === null ? (
                                     <div className="text-center p-6 text-slate-400 text-sm">Checking...</div>
                                 ) : tagHasUnits === true ? (
                                     /* Case A1: Tag HAS snippets */
                                     <>
                                         <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-sm">
                                            <p className="font-bold mb-1">Warning</p>
                                            <p>This category contains highlights. If you delete it, these highlights will be moved to <strong>"Uncategorized"</strong>.</p>
                                         </div>
                                         
                                         <button 
                                            onClick={handleConfirmTagDelete} 
                                            className="w-full flex items-center justify-center gap-2 p-3 bg-red-500 border border-red-600 text-white rounded hover:bg-red-600 transition-colors text-sm font-semibold"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                            Delete "{editingTag.label}"
                                        </button>
                                     </>
                                 ) : (
                                     /* Case A2: Tag EMPTY */
                                     <>
                                         <p className="text-sm text-slate-700 mb-2">
                                            Are you sure you want to delete <strong>"{editingTag.label}"</strong>?
                                         </p>
                                         <button 
                                            onClick={handleConfirmTagDelete}
                                            className="w-full flex items-center justify-center gap-2 p-3 bg-red-500 border border-red-600 text-white rounded hover:bg-red-600 transition-colors text-sm font-semibold"
                                         >
                                            <TrashIcon className="w-4 h-4" />
                                            Yes, Delete
                                         </button>
                                     </>
                                 )}
    
                                 <div className="pt-2 text-center">
                                    <button 
                                        onClick={() => setIsDeleteMode(false)}
                                        className="text-xs text-slate-400 hover:text-slate-600 underline"
                                    >
                                        Cancel
                                    </button>
                                 </div>
                            </div>
                        )
                    ) : (
                        /* CASE B: Deleting a HIGHLIGHT (Unit) */
                        <div className="space-y-4">
                            <p className="text-sm text-slate-700 mb-2">
                                Are you sure you want to delete this highlight?
                            </p>
                            
                            <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs italic text-slate-500 line-clamp-3">
                                "{editingUnit?.text_content}"
                            </div>

                            <button 
                                onClick={confirmHighlightDelete}
                                className="w-full flex items-center justify-center gap-2 p-3 bg-red-500 border border-red-600 text-white rounded hover:bg-red-600 transition-colors text-sm font-semibold"
                            >
                                <TrashIcon className="w-4 h-4" />
                                Yes, Delete Highlight
                            </button>

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
                 <div className="space-y-4">
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
                editingTag ? (
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
                     </div>
                   </div>
                ) : (
                  <>
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
