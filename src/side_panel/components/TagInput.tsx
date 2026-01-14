import React, { useState, KeyboardEvent, useEffect } from 'react';
import { useApi } from '@/hooks/useApi';
import { UserIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/solid';

// Define the shape here or import from types
export interface Tag {
  id: number;
  label: string;
}

interface Props {
  tags: Tag[]; // CHANGED: Now accepts full objects, not just IDs
  onChange: (tags: Tag[]) => void;
  disabled?: boolean;
}

export const TagInput: React.FC<Props> = ({ tags, onChange, disabled }) => {
  const { get, post } = useApi();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Tag[]>([]);

  // 1. Search (My Tags Only)
  useEffect(() => {
    if (disabled || query.length < 1) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await get(`/api/tags?search=${encodeURIComponent(query)}&scope=mine`);
        setSuggestions(results);
      } catch (e) {
        console.error("Tag fetch failed", e);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, disabled]);

  // 2. Create New Tag
  const createTag = async (label: string) => {
    if (disabled) return;
    try {
      const newTag = await post('/api/tags', { label, is_official: 0 });
      handleSelect(newTag);
    } catch (e) {
      console.error("Failed to create tag", e);
      alert("Could not create tag.");
    }
  };

  const handleSelect = (tag: Tag) => {
    // Prevent duplicates
    if (tags.some(t => t.id === tag.id)) return;
    
    // Bubbling up the full object immediately
    onChange([...tags, tag]);
    
    setQuery('');
    setSuggestions([]);
  };

  const removeTag = (indexToRemove: number) => {
    const newTags = tags.filter((_, index) => index !== indexToRemove);
    onChange(newTags);
  };

  const handleKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!query.trim()) return;

      const exactMatch = suggestions.find(s => s.label.toLowerCase() === query.trim().toLowerCase());
      if (exactMatch) {
        handleSelect(exactMatch);
      } else {
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
        {tags.map((tag, idx) => (
          <span key={tag.id} className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-1 rounded-md flex items-center shadow-sm">
            <UserIcon className="w-3 h-3 mr-1 opacity-50" />
            {tag.label}
            <button 
              type="button"
              onClick={() => removeTag(idx)}
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
