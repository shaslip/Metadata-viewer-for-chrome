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
    viewMode: 'tree' | 'flat';
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

// [CHANGED] Refined Double Folder Icon
const DoubleFolderIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
    <div className={`relative flex items-center justify-center ${className}`}>
        {/* Back folder */}
        <FolderIcon className="absolute -top-0.5 -right-0.5 w-4 h-4 text-blue-300/80 dark:text-blue-500/80" />
        {/* Front folder */}
        <FolderIcon className="relative w-4 h-4 text-blue-400 z-10" />
    </div>
);

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
  const [activeFocusId, setActiveFocusId] = useState<number | null>(null);

  // 1. Initial Load
  useEffect(() => {
    setLoading(true);
    
    const url = viewMode === 'flat' 
        ? `/api/tags/tree?format=flat`
        : `/api/tags/tree`;

    get(url)
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
            setActiveFocusId(primaryTag.id);
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
          setActiveFocusId(id);
      }
      setExpandedNodeIds(newSet);
  };

  const handleActivate = (id: number) => {
      setActiveFocusId(id);
  }

  if (loading) return <div className="p-4 text-xs text-slate-400">Loading...</div>;

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="pb-10 px-2"> 
           {isEditMode && <RootDropZone />}

           {/* [CHANGED] Always render tree items if they exist */}
           {displayTree.map(node => (
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
                  activeFocusId={activeFocusId}
                  onUnitClick={onUnitClick}
                />
            ))}

            {/* [CHANGED] Always render Create Button at the bottom if filter is active */}
            {filter.trim().length > 0 && (
                <button 
                    onClick={() => onCreateTag(filter)}
                    className={`
                        w-full flex items-center gap-2 px-3 py-2 mt-2 rounded-md text-sm transition-all
                        ${displayTree.length === 0 
                            ? 'bg-blue-50 text-blue-600 border border-blue-200 justify-center py-8 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400' // Prominent if empty
                            : 'hover:bg-blue-50 text-slate-400 hover:text-blue-600 border border-transparent hover:border-blue-100 dark:hover:bg-slate-800 dark:hover:text-blue-400' // Subtle list item if tree exists
                        }
                    `}
                >
                    <PlusIcon className="w-4 h-4" />
                    <span className="font-semibold">Create "{filter}"</span>
                </button>
            )}

            {/* [CHANGED] Empty state only if no filter and no tree */}
            {displayTree.length === 0 && filter.trim().length === 0 && (
                <div className="p-8 text-center text-slate-400 text-xs italic">
                    No tags found.
                </div>
            )}
        </div>

        <DragOverlay>
            {activeDragId ? (
                <div className="bg-white border border-blue-400 p-2 rounded shadow-lg opacity-90 text-sm font-bold text-blue-800">
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
                    ? 'border-blue-400 bg-blue-50 text-blue-400 scale-[1.02] shadow-sm dark:bg-blue-900/20 dark:border-blue-500' 
                    : 'border-slate-200 text-slate-400 hover:border-slate-300 dark:border-slate-700 dark:text-slate-500 dark:hover:border-slate-600'
                }
            `}
        >
            {isOver ? "Release to Make Root Item" : "Drag here to move to Root Level"}
        </div>
    );
};

const TaxonomyNode = ({ 
    node, isEditMode, onEditTag, highlightUnitId, refreshKey, 
    onTagSelect, isSelectionMode, isExpanded, onToggleExpand, 
    onActivate, activeFocusId, onUnitClick
}: any) => {
    const { get } = useApi();
    const [units, setUnits] = useState<LogicalUnit[]>([]);
    
    // Strict Active Check
    const isActive = activeFocusId === node.id;
    
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
            onToggleExpand(node.id);
            if (!isExpanded) onActivate(node.id);
        }
    };

    const renderIcon = () => {
        if (isExpanded) {
            return <FolderOpenIcon className={`w-5 h-5 ${isActive ? 'text-blue-500' : 'text-blue-400'}`} />;
        }
        if (node.children && node.children.length > 0) {
            return <DoubleFolderIcon className="w-5 h-5" />;
        }
        return <FolderIcon className="w-4 h-4 text-blue-400" />;
    };

    return (
        <div ref={setDropRef} className={`ml-3 pl-2 transition-colors duration-300 rounded-lg ${isOver ? 'bg-blue-50 ring-1 ring-blue-300 dark:bg-blue-900/20 dark:ring-blue-700' : ''}`}>
            
            <div 
                ref={setDragRef} 
                style={style} 
                className={`
                    flex items-center py-1.5 px-2 rounded cursor-pointer select-none group transition-colors mb-0.5
                    ${isDragging ? 'bg-white ring-2 ring-blue-400 shadow-sm dark:bg-slate-800 dark:ring-blue-600' : ''}
                    
                    ${!isDragging && !isActive ? 'text-slate-700 dark:text-slate-300' : ''}
                    ${isActive && !isDragging ? 'text-blue-500 font-medium dark:text-blue-400' : ''}
                `}
                onClick={handleNodeClick}
                title={isEditMode ? "Edit Tag" : "Toggle Folder"}
            >
                {/* Drag Handle */}
                {isEditMode && !node.is_official && (
                    <div {...listeners} {...attributes} className="mr-2 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
                        <Bars2Icon className="w-4 h-4"/>
                    </div>
                )}

                {/* Fixed Width Icon Container for Alignment */}
                <div className="w-6 flex items-center justify-center mr-1 flex-shrink-0">
                    {renderIcon()}
                </div>

                {/* Tag Label */}
                <div className="flex-1 text-sm truncate">
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
                            activeFocusId={activeFocusId}
                            onUnitClick={onUnitClick}
                        />
                    ))}
                    
                    {/* Render Units (Snippets) */}
                    {!isEditMode && units.length > 0 && (
                        <div className="mt-1 rounded-md overflow-hidden">
                            {units.map((u: any) => {
                                const isUnitSelected = highlightUnitId === u.id;
                                const isBroken = u.broken_index === 1;

                                return (
                                    <div 
                                        key={u.id}
                                        ref={isUnitSelected ? activeUnitRef : null}
                                        className={`
                                            flex items-center ml-3 text-xs py-1.5 px-2 cursor-pointer truncate transition-all duration-200 border-l-2
                                            
                                            ${isUnitSelected 
                                                ? 'bg-yellow-50 text-yellow-900 font-semibold border-yellow-400 dark:bg-yellow-900/20 dark:text-yellow-200 dark:border-yellow-700'
                                                : `border-transparent
                                                   ${isActive ? 'text-blue-400' : 'text-slate-500 dark:text-slate-400'}`
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
