import React, { useState, useEffect, KeyboardEvent } from 'react';
import { useApi } from '@/hooks/useApi';
import { UserIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/solid';

interface Tag {
  id: number;
  label: string;
}

interface Props {
  selectedTags: number[]; // Array of IDs
  onChange: (tagIds: number[]) => void;
  disabled?: boolean;
}

export const TagInput: React.FC<Props> = ({ selectedTags, onChange, disabled }) => {
  const { get, post } = useApi();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [displayTags, setDisplayTags] = useState<Tag[]>([]); // Resolved objects for display

  // 1. Load details for selected IDs (Initialization)
  useEffect(() => {
    if (selectedTags.length > 0 && displayTags.length === 0) {
      // In a real app, you might bulk fetch these. 
      // For MVP, we assume the parent passed empty tags initially or we fetch them.
      // Skipping for now to focus on Creation flow.
    }
  }, [selectedTags]);

  // 2. Search (My Tags Only)
  useEffect(() => {
    if (disabled || query.length < 1) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        // NOTE: We assume the backend supports ?scope=mine to filter out globals
        const results = await get(`/api/tags?search=${encodeURIComponent(query)}&scope=mine`);
        setSuggestions(results);
      } catch (e) {
        console.error("Tag fetch failed", e);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, disabled]);

  // 3. Create New Tag
  const createTag = async (label: string) => {
    if (disabled) return;
    try {
      // Instant Creation
      const newTag = await post('/api/tags', { label, is_official: 0 });
      handleSelect(newTag);
    } catch (e) {
      console.error("Failed to create tag", e);
      alert("Could not create tag. It might already exist.");
    }
  };

  const handleSelect = (tag: Tag) => {
    if (displayTags.some(t => t.id === tag.id)) return; // No duplicates
    
    const newDisplay = [...displayTags, tag];
    setDisplayTags(newDisplay);
    onChange(newDisplay.map(t => t.id));
    
    setQuery('');
    setSuggestions([]);
  };

  const handleKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!query.trim()) return;

      // If exact match exists in suggestions, select it
      const exactMatch = suggestions.find(s => s.label.toLowerCase() === query.trim().toLowerCase());
      if (exactMatch) {
        handleSelect(exactMatch);
      } else {
        // Otherwise, create new
        await createTag(query.trim());
      }
    }
  };

  return (
    <div className="relative">
      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">
        Tags / Topics
      </label>
      
      {/* Selected Tags Area */}
      <div className="flex flex-wrap gap-2 mb-2">
        {displayTags.map((tag, idx) => (
          <span key={tag.id} className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-1 rounded-md flex items-center shadow-sm">
            <UserIcon className="w-3 h-3 mr-1 opacity-50" />
            {tag.label}
            <button 
              type="button"
              onClick={() => {
                const newDisplay = [...displayTags];
                newDisplay.splice(idx, 1);
                setDisplayTags(newDisplay);
                onChange(newDisplay.map(t => t.id));
              }}
              className="ml-2 hover:text-blue-900"
            >
              <XMarkIcon className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      {/* Input */}
      <input
        type="text"
        className="w-full p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
        placeholder={disabled ? "Locked" : "Type to search or create..."}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />

      {/* Dropdown */}
      {!disabled && query && (
        <ul className="absolute z-20 w-full bg-white border border-slate-200 rounded-b shadow-xl mt-0.5 max-h-48 overflow-y-auto">
          {/* Existing Matches */}
          {suggestions.map((tag) => (
            <li 
              key={tag.id}
              onClick={() => handleSelect(tag)}
              className="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer text-slate-700 flex items-center"
            >
              <UserIcon className="w-4 h-4 text-slate-400 mr-2" />
              {tag.label}
            </li>
          ))}

          {/* Create Option (Always show if query exists and isn't exact match) */}
          {!suggestions.some(s => s.label.toLowerCase() === query.toLowerCase()) && (
            <li 
              onClick={() => createTag(query)}
              className="px-3 py-2 text-sm bg-blue-50 text-blue-700 cursor-pointer hover:bg-blue-100 font-semibold flex items-center border-t border-blue-100"
            >
              <PlusIcon className="w-4 h-4 mr-2" />
              Create "{query}"
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
