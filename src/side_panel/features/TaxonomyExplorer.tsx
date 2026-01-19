import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useApi } from '@/hooks/useApi';
import { DefinedTag, LogicalUnit } from '@/utils/types';
import { 
    TrashIcon, Bars2Icon, ExclamationTriangleIcon,
    PlusIcon, FolderIcon, FolderOpenIcon
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
    onEditTag: (tag: DefinedTag) => void;
    onUnitClick: (unit: LogicalUnit, fromTree?: boolean) => void;
    onCreateTag: (label: string) => void;
}

export const TaxonomyExplorer: React.FC<Props> = ({ 
    filter, viewMode, revealUnitId, refreshKey, 
    onTagSelect, isSelectionMode, isEditMode, onTreeChange, 
    onEditTag, onUnitClick, onCreateTag
}) => {
  const { get } = useApi();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [localTree, setLocalTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<number>>(new Set());
  const [activeDragId, setActiveDragId] = useState<number | null>(null);

  // [NEW] Track the "Active" (Green) folder
  const [activeFocusId, setActiveFocusId] = useState<number | null>(null);

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
        const primaryTag = tags[0]; 
        
        const idsToExpand = new Set(expandedNodeIds);
        const path = findPath(localTree, primaryTag.id);
        
        if (path) {
            path.forEach(id => idsToExpand.add(id));
            setExpandedNodeIds(idsToExpand);
            // Also set focus to the immediate parent tag
            setActiveFocusId(primaryTag.id);
        }
    });
  }, [revealUnitId, localTree]);

  // 3. DnD Handlers (Unchanged logic, kept for context)
  const handleDragStart = (event: DragStartEvent) => {
      setActiveDragId(event.active.id as number);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as number;
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
        if (overId === 'ROOT_DROP_ZONE') {
             setLocalTree([movedNode, ...cleaned]);
             onTreeChange([{ id: activeId, parent_id: null }]);
        } else {
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
      else {
          newSet.add(id);
          // [NEW] Set active focus when opening
          setActiveFocusId(id);
      }
      setExpandedNodeIds(newSet);
  };

  // [NEW] Handler for activating focus without toggling (optional, for clicking already open tags)
  const handleActivate = (id: number) => {
      setActiveFocusId(id);
  }

  if (loading) return <div className="p-4 text-xs text-slate-400">Loading...</div>;

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="pb-10 px-2"> 
           {isEditMode && <RootDropZone />}

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
                     onEditTag={onEditTag}
                     highlightUnitId={revealUnitId}
                     refreshKey={refreshKey}
                     onTagSelect={onTagSelect}
                     isSelectionMode={isSelectionMode}
                     isExpanded={node.forceExpand || false}
                     onToggleExpand={handleToggleExpand}
                     onActivate={handleActivate}
                     isActiveFocus={activeFocusId === node.id}
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

// [NEW] Custom Double Folder Icon for "Has Children" state
const DoubleFolderIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
    <div className={`relative ${className}`}>
        {/* Back folder */}
        <FolderIcon className="absolute top-0 right-0 w-3.5 h-3.5 text-slate-400 opacity-80" />
        {/* Front folder */}
        <FolderIcon className="absolute bottom-0 left-0 w-3.5 h-3.5 text-slate-500 z-10" />
    </div>
);

const TaxonomyNode = ({ 
    node, isEditMode, onEditTag, highlightUnitId, refreshKey, 
    onTagSelect, isSelectionMode, isExpanded, onToggleExpand, 
    onActivate, isActiveFocus, onUnitClick
}: any) => {
    const { get } = useApi();
    const [units, setUnits] = useState<LogicalUnit[]>([]);
    
    const activeUnitRef = useRef<HTMLDivElement>(null);

    const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
        id: node.id,
        disabled: !isEditMode || !!node.is_official
    });

    const { setNodeRef: setDropRef, isOver } = useDroppable({
        id: node.id,
        disabled: !isEditMode
    });

    useEffect(() => {
        if (isExpanded && units.length === 0 && !isEditMode) {
             get(`/api/units?tag_id=${node.id}`).then(setUnits).catch(() => {});
        }
    }, [isExpanded, refreshKey, isEditMode]);

    useEffect(() => {
        if (activeUnitRef.current && highlightUnitId) {
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

    const handleNodeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isEditMode) {
            if (!node.is_official) onEditTag(node);
            return;
        } 
        if (isSelectionMode) {
            onTagSelect(node);
        } else {
            // [CHANGED] Combined click: Toggle expand and set Active
            onToggleExpand(node.id);
            if (!isExpanded) onActivate(node.id); // If opening, activate
        }
    };

    // [NEW] Icon Selection Logic
    const renderIcon = () => {
        if (isExpanded) {
            return <FolderOpenIcon className={`w-5 h-5 ${isActiveFocus ? 'text-green-600' : 'text-blue-400'}`} />;
        }
        // "Double closed folder if children tags exist"
        if (node.children && node.children.length > 0) {
            return <DoubleFolderIcon className="w-5 h-5" />;
        }
        // "Single closed folder if no child"
        return <FolderIcon className="w-4 h-4 text-slate-400" />;
    };

    return (
        // [CHANGED] Removed border-l, added general padding
        <div ref={setDropRef} className={`ml-3 pl-2 transition-colors duration-300 rounded-lg ${isOver ? 'bg-blue-50 ring-1 ring-blue-300' : ''}`}>
            
            <div 
                ref={setDragRef} 
                style={style} 
                className={`
                    flex items-center py-1.5 px-2 rounded cursor-pointer select-none group transition-colors mb-0.5
                    ${isDragging ? 'bg-white ring-2 ring-blue-400 shadow-sm' : ''}
                    ${isActiveFocus && !isDragging ? 'bg-green-100 text-green-800 shadow-sm' : 'hover:bg-slate-100 text-slate-700'}
                `}
                onClick={handleNodeClick}
                title={isEditMode ? "Edit Tag" : "Toggle Folder"}
            >
                {/* Drag Handle (Only in Edit Mode) */}
                {isEditMode && !node.is_official && (
                    <div {...listeners} {...attributes} className="mr-2 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600">
                        <Bars2Icon className="w-4 h-4"/>
                    </div>
                )}

                {/* Folder Icon */}
                <div className="mr-2 flex-shrink-0">
                    {renderIcon()}
                </div>

                {/* Tag Label */}
                <div className={`flex-1 text-sm font-medium truncate ${isActiveFocus ? 'text-green-900' : ''}`}>
                    {node.label}
                </div>
            </div>

            {/* Children & Units Container */}
            {isExpanded && !isDragging && (
                <div className="space-y-0.5">
                    {/* Render Children Tags */}
                    {node.children.map((child: any) => (
                        <TaxonomyNode 
                            key={child.id} 
                            node={child} 
                            isEditMode={isEditMode} 
                            onEditTag={onEditTag} 
                            highlightUnitId={highlightUnitId}
                            refreshKey={refreshKey}
                            onTagSelect={onTagSelect}
                            isSelectionMode={isSelectionMode}
                            isExpanded={child.forceExpand || false}
                            onToggleExpand={onToggleExpand}
                            onActivate={onActivate}
                            isActiveFocus={isActiveFocus} // NOTE: Focus stays on parent usually, but logic allows changing
                            onUnitClick={onUnitClick}
                        />
                    ))}
                    
                    {/* Render Units (Snippets) */}
                    {/* [CHANGED] Add matching margin (ml-3) and background hue for active units */}
                    {!isEditMode && units.length > 0 && (
                        <div className={`mt-1 rounded-md overflow-hidden ${isActiveFocus ? 'bg-green-50/50 border border-green-100' : ''}`}>
                            {units.map((u: any) => {
                                const isActive = highlightUnitId === u.id;
                                const isBroken = u.broken_index === 1;

                                return (
                                    <div 
                                        key={u.id}
                                        ref={isActive ? activeUnitRef : null}
                                        // [CHANGED] Added ml-3 to align snippets with children tags
                                        className={`
                                            flex items-center ml-3 text-xs py-1.5 px-2 cursor-pointer truncate transition-all duration-200 border-l-2
                                            ${isActive 
                                                ? 'bg-yellow-50 text-yellow-900 font-semibold border-yellow-400' 
                                                : `border-transparent hover:border-blue-300 hover:bg-white hover:text-blue-700 ${isActiveFocus ? 'text-green-800' : 'text-slate-500'}`
                                            }
                                        `}
                                        onClick={(e) => { e.stopPropagation(); onUnitClick(u, true); }}
                                    >
                                        <span className="w-3 inline-block flex-shrink-0 mr-1 opacity-50 text-[10px]">
                                            {isBroken ? '⚠️' : '📄'}
                                        </span>
                                        
                                        {isBroken ? (
                                             <span className="truncate italic opacity-75" title="Broken Link">
                                                 {u.text_content.substring(0, 60)}...
                                             </span>
                                        ) : (
                                             <span className="truncate">{u.text_content.substring(0, 60)}...</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
