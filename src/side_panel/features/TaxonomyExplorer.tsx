import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useApi } from '@/hooks/useApi';
import { DefinedTag, LogicalUnit } from '@/utils/types';
import { 
    ChevronRightIcon, ChevronDownIcon, UserIcon, 
    BuildingLibraryIcon, TrashIcon, Bars2Icon, ExclamationTriangleIcon,
    PlusIcon
} from '@heroicons/react/24/solid';
import {
    DndContext, 
    useDraggable, 
    useDroppable, 
    DragEndEvent,
    DragOverlay,
    DragStartEvent
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

interface TreeNode extends DefinedTag {
  children: TreeNode[];
  units?: LogicalUnit[];
  forceExpand?: boolean; 
}

interface Props {
    filter: string;
    viewMode: 'mine' | 'all';
    revealUnitId: number | null;
    refreshKey: number;
    onTagSelect: (tag: DefinedTag) => void;
    isSelectionMode: boolean;
    isEditMode: boolean;
    onTreeChange: (changes: {id: number, parent_id: number | null}[]) => void;
    onDeleteTag: (tag: DefinedTag, hasChildren: boolean) => void;
    onEditTag: (tag: DefinedTag) => void;
    onUnitClick: (unit: LogicalUnit, fromTree?: boolean) => void;
    onCreateTag: (label: string) => void;
}

export const TaxonomyExplorer: React.FC<Props> = ({ 
    filter, viewMode, revealUnitId, refreshKey, 
    onTagSelect, isSelectionMode, isEditMode, onTreeChange, 
    onDeleteTag, onEditTag, onUnitClick, onCreateTag
}) => {
  const { get } = useApi();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [localTree, setLocalTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<number>>(new Set());
  const [activeDragId, setActiveDragId] = useState<number | null>(null);

  // 1. Initial Load
  useEffect(() => {
    setLoading(true);
    get(`/api/tags/tree?scope=${viewMode}`)
      .then((data) => {
          setTree(data);
          setLocalTree(data);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [viewMode, refreshKey]);

  // 2. Auto-Expand Logic
  useEffect(() => {
    if (!revealUnitId) return;

    const findPath = (nodes: TreeNode[], targetTagId: number, path: number[] = []): number[] | null => {
        for (const node of nodes) {
            if (node.id === targetTagId) return [...path, node.id];
            if (node.children) {
                const result = findPath(node.children, targetTagId, [...path, node.id]);
                if (result) return result;
            }
        }
        return null;
    };

    get(`/api/units/${revealUnitId}/tags`).then((tags: DefinedTag[]) => {
        if (tags.length === 0) return;

        // Take only the FIRST tag. 
        // This prevents opening multiple folders and triggering multiple "scroll" 
        // events that race against each other.
        const primaryTag = tags[0]; 
        
        const idsToExpand = new Set(expandedNodeIds);
        const path = findPath(localTree, primaryTag.id);
        
        if (path) {
            path.forEach(id => idsToExpand.add(id));
            setExpandedNodeIds(idsToExpand);
        }
    });
  }, [revealUnitId, localTree]);

  // 3. DnD Handlers
  const handleDragStart = (event: DragStartEvent) => {
      setActiveDragId(event.active.id as number);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as number;
    // Over ID can be string ('ROOT_DROP_ZONE') or number (Tag ID)
    const overId = over.id; 

    const removeNode = (nodes: TreeNode[], id: number): { cleaned: TreeNode[], movedNode: TreeNode | null } => {
        let movedNode: TreeNode | null = null;
        const cleaned = nodes.reduce((acc, node) => {
            if (node.id === id) {
                movedNode = node;
                return acc;
            }
            if (node.children) {
                const result = removeNode(node.children, id);
                if (result.movedNode) movedNode = result.movedNode;
                return [...acc, { ...node, children: result.cleaned }];
            }
            return [...acc, node];
        }, [] as TreeNode[]);
        return { cleaned, movedNode };
    };

    const insertNode = (nodes: TreeNode[], targetId: number, nodeToInsert: TreeNode): TreeNode[] => {
        return nodes.map(node => {
            if (node.id === targetId) {
                return { ...node, children: [...(node.children || []), nodeToInsert] };
            }
            if (node.children) {
                return { ...node, children: insertNode(node.children, targetId, nodeToInsert) };
            }
            return node;
        });
    };

    const { cleaned, movedNode } = removeNode(localTree, activeId);
    
    if (movedNode) {
        // CASE A: Dropped into Root Zone
        if (overId === 'ROOT_DROP_ZONE') {
             // Add to root level of cleaned tree
             setLocalTree([...cleaned, movedNode]);
             onTreeChange([{ id: activeId, parent_id: null }]);
        } 
        // CASE B: Dropped into another tag (Nesting)
        else {
             const newTree = insertNode(cleaned, overId as number, movedNode);
             setLocalTree(newTree);
             onTreeChange([{ id: activeId, parent_id: overId as number }]);
        }
    }
  };

  // 4. Recursive Processing
  const processNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.map(node => {
        const matchesText = node.label.toLowerCase().includes(filter.toLowerCase());
        const processedChildren = processNodes(node.children || []);
        
        const isExpandedInState = expandedNodeIds.has(node.id);
        const shouldExpand = (!!filter && processedChildren.length > 0) || isExpandedInState;

        if (matchesText || processedChildren.length > 0) {
            return { ...node, children: processedChildren, forceExpand: shouldExpand };
        }
        return null;
    }).filter(Boolean) as TreeNode[];
  };

  const displayTree = useMemo(() => processNodes(localTree), [localTree, filter, expandedNodeIds]);

  const handleToggleExpand = (id: number) => {
      const newSet = new Set(expandedNodeIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setExpandedNodeIds(newSet);
  };

  if (loading) return <div className="p-4 text-xs text-slate-400">Loading...</div>;

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="pb-10 px-2"> 
           {isEditMode && <RootDropZone />}

           {/* [CHANGED] Display Tree Logic */}
           {displayTree.length === 0 ? (
               <div className="flex flex-col items-center justify-center p-6 text-center">
                   {filter.trim().length > 0 && (
                       <button 
                           onClick={() => onCreateTag(filter)}
                           className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-md text-sm font-semibold hover:bg-blue-100 transition-colors border border-blue-200"
                       >
                           <PlusIcon className="w-4 h-4" />
                           Create "{filter}"
                       </button>
                   )}
               </div>
           ) : (
               displayTree.map(node => (
                   <TaxonomyNode 
                     key={node.id} 
                     node={node} 
                     isEditMode={isEditMode}
                     onDeleteTag={onDeleteTag}
                     onEditTag={onEditTag}
                     highlightUnitId={revealUnitId}
                     refreshKey={refreshKey}
                     onTagSelect={onTagSelect}
                     isSelectionMode={isSelectionMode}
                     isExpanded={node.forceExpand || false}
                     onToggleExpand={handleToggleExpand}
                     onUnitClick={onUnitClick}
                   />
               ))
           )}
        </div>
        
        <DragOverlay>
            {activeDragId ? (
                <div className="bg-white border border-blue-500 p-2 rounded shadow-lg opacity-90 text-sm font-bold text-blue-800">
                    Moving Tag...
                </div>
            ) : null}
        </DragOverlay>
    </DndContext>
  );
};

// [NEW] Root Drop Zone Component
const RootDropZone = () => {
    const { setNodeRef, isOver } = useDroppable({ id: 'ROOT_DROP_ZONE' });
    return (
        <div 
            ref={setNodeRef} 
            className={`
                mb-2 p-3 border-2 border-dashed rounded-lg text-center text-xs font-bold transition-all duration-200
                ${isOver 
                    ? 'border-blue-500 bg-blue-50 text-blue-600 scale-[1.02] shadow-sm' 
                    : 'border-slate-200 text-slate-400 hover:border-slate-300'
                }
            `}
        >
            {isOver ? "Release to Make Root Item" : "Drag here to move to Root Level"}
        </div>
    );
};

const TaxonomyNode = ({ 
    node, isEditMode, onDeleteTag, onEditTag, highlightUnitId, refreshKey, onTagSelect, isSelectionMode, isExpanded, onToggleExpand, onUnitClick
}: any) => {
    const { get } = useApi();
    const [units, setUnits] = useState<LogicalUnit[]>([]);
    
    // [NEW] Ref to scroll to the active snippet
    const activeUnitRef = useRef<HTMLDivElement>(null);

    const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
        id: node.id,
        disabled: !isEditMode || !!node.is_official
    });

    const { setNodeRef: setDropRef, isOver } = useDroppable({
        id: node.id,
        disabled: !isEditMode
    });

    // 1. Fetch Units when expanded
    useEffect(() => {
        if (isExpanded && units.length === 0 && !isEditMode) {
             get(`/api/units?tag_id=${node.id}`).then(setUnits).catch(() => {});
        }
    }, [isExpanded, refreshKey, isEditMode]);

    // [NEW] 2. Scroll into view when the active unit appears
    useEffect(() => {
        if (activeUnitRef.current && highlightUnitId) {
            // Slight delay ensures the tree expansion animation (if any) has settled
            setTimeout(() => {
                activeUnitRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    }, [highlightUnitId, units, isExpanded]);

    const style = transform ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 999 : 'auto',
        opacity: isDragging ? 0.5 : 1
    } : undefined;

    const handleLabelClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isEditMode) {
            if (!node.is_official) onEditTag(node);
            return;
        } 
        if (isSelectionMode) {
            onTagSelect(node);
        } else {
            onToggleExpand(node.id);
        }
    };

    return (
        <div ref={setDropRef} className={`ml-3 border-l border-slate-200 pl-2 transition-colors ${isOver ? 'bg-blue-50 rounded-l border-blue-300' : ''}`}>
            <div ref={setDragRef} style={style} className={`flex items-center py-1 rounded text-sm select-none group ${isDragging ? 'bg-white ring-2 ring-blue-400 shadow-sm' : ''}`}>
                
                {isEditMode && !node.is_official && (
                    <div {...listeners} {...attributes} className="mr-1 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 p-1">
                        <div className="w-4 h-4"><Bars2Icon /></div>
                    </div>
                )}

                <div 
                    className="mr-1 text-slate-400 cursor-pointer p-0.5 hover:text-slate-700 hover:bg-slate-200 rounded"
                    onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
                >
                     {node.children.length > 0 || (isExpanded && units.length > 0 && !isEditMode) ? (
                         isExpanded ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />
                     ) : <span className="w-3 h-3 block"></span>}
                </div>

                <div 
                    className={`flex items-center flex-1 cursor-pointer hover:bg-slate-100 px-1 rounded ${
                        (isSelectionMode && !isEditMode) || (isEditMode && !node.is_official) ? 'hover:text-blue-600 hover:font-semibold' : 'text-slate-700'
                    }`}
                    onClick={handleLabelClick}
                    title={isEditMode ? "Rename tag" : (isSelectionMode ? "Click to add this tag" : "Click to expand")}
                >
                    <span className="mr-1.5">
                        {node.is_official ? <BuildingLibraryIcon className="h-3 w-3 text-amber-500"/> : <UserIcon className="h-3 w-3 text-blue-400"/>}
                    </span>
                    <span>{node.label}</span>
                </div>
            </div>

            {isExpanded && !isDragging && (
                <div>
                    {node.children.map((child: any) => (
                        <TaxonomyNode 
                            key={child.id} 
                            node={child} 
                            isEditMode={isEditMode} 
                            onDeleteTag={onDeleteTag}
                            onEditTag={onEditTag} 
                            highlightUnitId={highlightUnitId}
                            refreshKey={refreshKey}
                            onTagSelect={onTagSelect}
                            isSelectionMode={isSelectionMode}
                            isExpanded={child.forceExpand || false}
                            onToggleExpand={onToggleExpand}
                            onUnitClick={onUnitClick}
                        />
                    ))}
                    
                    {!isEditMode && units.map((u: any) => {
                        const isActive = highlightUnitId === u.id;
                        const isBroken = u.broken_index === 1;

                        return (
                            <div 
                                key={u.id}
                                ref={isActive ? activeUnitRef : null}
                                className={`flex items-center ml-0 text-xs py-1 px-1 mb-1 rounded cursor-pointer truncate transition-all duration-500 ${
                                    isActive 
                                    ? 'bg-yellow-100 text-yellow-800 font-bold border border-yellow-300' 
                                    : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'
                                }`}
                                // [CHANGED] Pass 'true' to indicate this click originated from the Tree
                                onClick={() => onUnitClick(u, true)} 
                            >
                                <span className="w-4 inline-block flex-shrink-0"></span>
                                
                                {isBroken ? (
                                    <>
                                        <ExclamationTriangleIcon className="w-3 h-3 text-red-500 mr-1" />
                                        <span className="truncate border-b-2 border-red-400 border-dotted" title="Broken Link - Click to Repair">
                                            {u.text_content.substring(0, 60)}...
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <span className="mr-1">📄</span>
                                        <span className="truncate">{u.text_content.substring(0, 60)}...</span>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
