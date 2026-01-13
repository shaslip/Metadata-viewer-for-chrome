import React, { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { DefinedTag, LogicalUnit } from '@/utils/types';
import { useSelection } from '@/context/SelectionContext';
import { ChevronRightIcon, ChevronDownIcon, MagnifyingGlassIcon, UserIcon, BuildingLibraryIcon } from '@heroicons/react/24/solid';

// Extended type for tree logic
interface TreeNode extends DefinedTag {
  children: TreeNode[];
  units?: LogicalUnit[];
}

export const TaxonomyExplorer = () => {
  const { get } = useApi();
  const { viewMode, setViewMode } = useSelection();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get('/api/tags/tree')
      .then((data) => setTree(data))
      .catch((err) => console.error("Failed to load taxonomy", err))
      .finally(() => setLoading(false));
  }, []);

  // Recursive Filter Logic
  const filterNodes = (nodes: TreeNode[], query: string, mode: 'mine' | 'all'): TreeNode[] => {
    return nodes
      .map(node => {
        const matchesText = node.label.toLowerCase().includes(query.toLowerCase());
        
        // 2. Mode Match (If mode is 'mine', hide official tags unless they have 'my' children?)
        // actually, simpler: If mode is 'mine', only show nodes that are NOT official (or have user contributions).
        // For MVP: Let's assume the API returns (Official + Mine). 
        // We filter out 'is_official' if mode === 'mine', unless you want to see the official PARENT of your tag.
        
        // Let's stick to simple text filtering for now, and let the Toggle control the API or specific visual cues.
        // If you want strict filtering:
        if (mode === 'mine' && node.is_official) {
           // This logic depends on if you want to see the "Structure" (Official) that holds your "Content" (Private)
           // usually yes, so we might just filter LEAF nodes. 
           // For now, let's keep the Tree unified but use the toggle to filter HIGHLIGHTS on page.
        }
        
        const filteredChildren = filterNodes(node.children || [], query, mode);
        
        if (matchesText || filteredChildren.length > 0) {
          return { ...node, children: filteredChildren, forceExpand: !!query }; 
        }
        return null;
      })
      .filter(Boolean) as TreeNode[];
  };

  const displayTree = filterNodes(tree, filter, viewMode);

  return (
    <div className="flex flex-col h-full">
      {/* HEADER: Search + Toggle */}
      <div className="p-4 border-b border-slate-200 bg-white sticky top-0 z-10 space-y-3">
        
        {/* View Mode Toggle */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('mine')}
            className={`flex-1 flex items-center justify-center py-1 text-xs font-semibold rounded-md transition-colors ${
              viewMode === 'mine' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <UserIcon className="w-3 h-3 mr-1" />
            My Tags
          </button>
          <button
            onClick={() => setViewMode('all')}
            className={`flex-1 flex items-center justify-center py-1 text-xs font-semibold rounded-md transition-colors ${
              viewMode === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <BuildingLibraryIcon className="w-3 h-3 mr-1" />
            View All
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Filter taxonomy..." 
            className="w-full pl-8 pr-2 py-2 text-sm border rounded bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      {/* TREE CONTENT */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
            <div className="text-center text-slate-400 mt-10">Loading Taxonomy...</div>
        ) : (
            displayTree.map(node => <TaxonomyNode key={node.id} node={node} />)
        )}
      </div>
    </div>
  );
};

// Recursive Node Component
const TaxonomyNode = ({ node }: { node: TreeNode & { forceExpand?: boolean } }) => {
  const { get } = useApi();
  const [expanded, setExpanded] = useState(node.forceExpand || false);
  const [units, setUnits] = useState<LogicalUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);

  // Sync expansion if search forces it
  useEffect(() => {
    if (node.forceExpand) setExpanded(true);
  }, [node.forceExpand]);

  const handleToggle = async () => {
    setExpanded(!expanded);
    
    // Lazy Load units if expanding and not yet loaded
    if (!expanded && units.length === 0) {
        setLoadingUnits(true);
        try {
            // Fetch units for this specific tag
            const data = await get(`/api/units?tag_id=${node.id}&limit=5`); 
            setUnits(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingUnits(false);
        }
    }
  };

  const handleUnitClick = (unit: LogicalUnit) => {
      // Send message to background to navigate/scroll
      chrome.runtime.sendMessage({ 
          type: 'NAVIGATE_TO_UNIT', 
          source_code: unit.source_code, 
          source_page_id: unit.source_page_id,
          unit_id: unit.id 
      });
  };

  return (
    <div className="ml-2">
      {/* Node Label */}
      <div 
        className="flex items-center py-1 cursor-pointer hover:bg-slate-100 rounded text-sm text-slate-700 select-none"
        onClick={handleToggle}
      >
        <span className="mr-1 text-slate-400">
          {node.children.length > 0 ? (
             expanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />
          ) : (
             <span className="w-4 h-4 inline-block" /> // spacer
          )}
        </span>
        <span className="font-medium">{node.label}</span>
      </div>

      {/* Children & Units */}
      {expanded && (
        <div className="ml-4 border-l border-slate-200 pl-2">
          
          {/* 1. Associated Units (Preview) */}
          {loadingUnits && <div className="text-xs text-slate-400 py-1">Loading items...</div>}
          
          {units.map(unit => (
              <div 
                key={`u-${unit.id}`} 
                onClick={() => handleUnitClick(unit)}
                className="text-xs text-slate-500 py-1 px-2 hover:bg-blue-50 hover:text-blue-600 cursor-pointer truncate border-b border-slate-100 last:border-0"
                title={unit.text_content}
              >
                  📄 "{unit.text_content.substring(0, 40)}..."
              </div>
          ))}

          {/* 2. Nested Tags */}
          {node.children.map(child => (
            <TaxonomyNode key={child.id} node={{...child, forceExpand: node.forceExpand}} />
          ))}
        </div>
      )}
    </div>
  );
};
