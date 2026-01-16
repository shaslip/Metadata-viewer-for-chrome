import React, { useState, KeyboardEvent, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom'; // [NEW] Needed to escape the scroll container
import { useApi } from '@/hooks/useApi';
import { UserIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/solid';

export interface Tag {
  id: number;
  label: string;
}

interface Props {
  tags: Tag[];
  onChange: (tags: Tag[]) => void;
  disabled?: boolean;
}

export const TagInput: React.FC<Props> = ({ tags, onChange, disabled }) => {
  const { get, post } = useApi();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  
  // [NEW] Ref and State for positioning the portal
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ bottom: 0, left: 0, width: 0 });

  // 1. Search
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

  // [NEW] Update dropdown position whenever query changes (menu appears)
  useEffect(() => {
    if (query && inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        setDropdownPos({
            // Calculate distance from bottom of screen to top of input
            bottom: window.innerHeight - rect.top + 4, 
            left: rect.left,
            width: rect.width
        });
    }
  }, [query]);

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
    if (tags.some(t => t.id === tag.id)) return;
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

  // [NEW] Render the dropdown contents (for Portal)
  const dropdownContent = (
    <ul 
        className="fixed z-[9999] bg-white border border-slate-200 rounded-md shadow-xl max-h-48 overflow-y-auto"
        style={{
            left: dropdownPos.left,
            bottom: dropdownPos.bottom,
            width: dropdownPos.width,
        }}
    >
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
  );

  return (
    <div>
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

      <div className="relative">
          {/* Input */}
          <input
            ref={inputRef} // [NEW] Attach ref here
            type="text"
            className="w-full p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            placeholder={disabled ? "Locked" : "Type to search or create..."}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
          />

          {/* [NEW] Render via Portal to Body */}
          {!disabled && query && createPortal(dropdownContent, document.body)}
      </div>
    </div>
  );
};
