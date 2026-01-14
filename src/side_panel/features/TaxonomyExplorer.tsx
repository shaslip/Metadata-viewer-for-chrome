import React, { useEffect, useState, useMemo } from 'react';
import { useApi } from '@/hooks/useApi';
import { DefinedTag, LogicalUnit } from '@/utils/types';
import { ChevronRightIcon, ChevronDownIcon, UserIcon, BuildingLibraryIcon } from '@heroicons/react/24/solid';

// 1. Updated Interfaces to support Tree Logic & Props
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
}

export const TaxonomyExplorer: React.FC<Props> = ({ filter, viewMode, revealUnitId, refreshKey, onTagSelect, isSelectionMode }) => {
  const { get } = useApi();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<number>>(new Set());

  // 2. Initial Load
  useEffect(() => {
    get('/api/tags/tree')
      .then((data) => setTree(data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  // 3. Auto-Expand Logic (When a user clicks a highlight on the page)
  useEffect(() => {
    if (!revealUnitId) return;

    // Helper: Find full path to a tagID in the tree
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

    // Fetch tags for the clicked unit, then expand the tree to show them
    get(`/api/units/${revealUnitId}/tags`).then((tags: DefinedTag[]) => {
        const idsToExpand = new Set(expandedNodeIds);
        tags.forEach(tag => {
            const path = findPath(tree, tag.id);
            if (path) path.forEach(id => idsToExpand.add(id));
        });
        setExpandedNodeIds(idsToExpand);
    });
  }, [revealUnitId, tree]);

  // 4. Recursive Filter Logic (Strict Separation)
  const processNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.map(node => {
        // A. Strict Mode Filtering
        let visible = true;
        if (viewMode === 'mine' && node.is_official) visible = false; 
        if (viewMode === 'all' && !node.is_official) visible = false;

        // B. Text Filtering
        const matchesText = node.label.toLowerCase().includes(filter.toLowerCase());
        
        // Recurse
        const processedChildren = processNodes(node.children || []);
        
        // C. Visibility Rules
        // If hidden by mode, but has valid children, we usually hide strict. 
        // Here we return null if the node itself violates the viewMode.
        if (!visible) return null;

        // If visible and matches text, keep it
        if (matchesText) {
            return { ...node, children: processedChildren, forceExpand: !!filter || expandedNodeIds.has(node.id) };
        }
        
        // If children matched, keep parent to show path
        if (processedChildren.length > 0) {
            return { ...node, children: processedChildren, forceExpand: true };
        }

        return null;
    }).filter(Boolean) as TreeNode[];
  };

  const displayTree = useMemo(() => processNodes(tree), [tree, filter, viewMode, expandedNodeIds]);

  if (loading) return <div className="p-4 text-xs text-slate-400">Loading...</div>;

  return (
    <div className="pb-10"> 
       {displayTree.length === 0 && <div className="p-4 text-sm text-slate-400">No tags found for this view.</div>}
       {displayTree.map(node => (
         <TaxonomyNode 
            key={node.id} 
            node={node} 
            highlightUnitId={revealUnitId}
            forceExpand={node.forceExpand}
            refreshKey={refreshKey}
            onTagSelect={onTagSelect}
            isSelectionMode={isSelectionMode}
         />
       ))}
    </div>
  );
};

// 5. Node Component (Now accepts highlightUnitId)
const TaxonomyNode = ({ 
    node, highlightUnitId, forceExpand, refreshKey, onTagSelect, isSelectionMode 
}: { 
    node: TreeNode,
    highlightUnitId: number | null,
    forceExpand?: boolean,
    refreshKey: number,
    onTagSelect: (tag: DefinedTag) => void,
    isSelectionMode: boolean
}) => {
    const { get } = useApi();
    const [expanded, setExpanded] = useState(forceExpand || false);
    const [units, setUnits] = useState<LogicalUnit[]>([]);
    
    useEffect(() => {
        if(forceExpand) setExpanded(true);
    }, [forceExpand]);

    // Lazy load units on expand
    useEffect(() => {
        if (expanded && units.length === 0) {
             get(`/api/units?tag_id=${node.id}&limit=10`).then(setUnits).catch(() => {});
        }
    }, [expanded]);

    return (
        <div className="ml-3 border-l border-slate-200 pl-2">
            <div 
                className="flex items-center py-1 cursor-pointer hover:bg-slate-100 rounded text-sm select-none" 
                onClick={() => setExpanded(!expanded)}
            >
                <span className="mr-1 text-slate-400">
                    {node.children.length > 0 || units.length > 0 ? (
                         expanded ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />
                    ) : <span className="w-3 h-3 block"></span>}
                </span>
                <span className="mr-1.5">
                    {node.is_official ? <BuildingLibraryIcon className="h-3 w-3 text-amber-500"/> : <UserIcon className="h-3 w-3 text-blue-400"/>}
                </span>
                <span className="text-slate-700">{node.label}</span>
            </div>

            {expanded && (
                <div>
                    {/* Render Children */}
                    {node.children.map(child => (
                        <TaxonomyNode key={child.id} node={child} highlightUnitId={highlightUnitId} forceExpand={child.forceExpand}/>
                    ))}

                    {/* Render Units */}
                    {units.map(u => {
                        const isActive = highlightUnitId === u.id;
                        return (
                            <div 
                                key={u.id}
                                className={`ml-5 text-xs py-1 px-2 mb-1 rounded cursor-pointer truncate transition-all duration-500 ${
                                    isActive 
                                    ? 'bg-yellow-100 text-yellow-800 font-bold border border-yellow-300' 
                                    : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'
                                }`}
                                onClick={() => chrome.runtime.sendMessage({ type: 'NAVIGATE_TO_UNIT', unit_id: u.id, ...u })}
                            >
                                📄 {u.text_content.substring(0, 30)}...
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
