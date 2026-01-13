import React, { useState, useEffect, KeyboardEvent } from 'react';
import { useApi } from '@/hooks/useApi';
import { BuildingLibraryIcon, UserIcon, PlusIcon } from '@heroicons/react/24/solid';

interface Tag {
  id: number | string; 
  label: string;
}

interface Props {
  selectedTags: (number | string)[]; 
  onChange: (tags: (number | string)[]) => void;
  disabled?: boolean; // <--- ADDED THIS
}

export const TagInput: React.FC<Props> = ({ selectedTags, onChange, disabled }) => {
  const { get } = useApi();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [displayTags, setDisplayTags] = useState<Tag[]>([]); 

  useEffect(() => {
    // Prevent search if disabled
    if (disabled) return;

    const timer = setTimeout(async () => {
      if (query.length < 2) {
        setSuggestions([]);
        return;
      }
      try {
        const results = await get(`/api/tags?search=${encodeURIComponent(query)}`);
        setSuggestions(results);
      } catch (e) {
        console.error("Tag fetch failed", e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, disabled]);

  const addTag = (tag: Tag) => {
    if (disabled) return;
    const isDuplicate = displayTags.some(t => t.label.toLowerCase() === tag.label.toLowerCase());
    if (!isDuplicate) {
      onChange([...selectedTags, tag.id]);
      setDisplayTags([...displayTags, tag]);
    }
    setQuery('');
    setSuggestions([]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (query.trim()) {
        addTag({ id: query.trim(), label: query.trim() });
      }
    }
  };

  const removeTag = (index: number) => {
    if (disabled) return; // <--- Block removal
    const newTags = [...selectedTags];
    newTags.splice(index, 1);
    onChange(newTags);

    const newDisplay = [...displayTags];
    newDisplay.splice(index, 1);
    setDisplayTags(newDisplay);
  };

  return (
    <div className="relative">
      <label className="block text-xs font-semibold text-slate-600 mb-1">TAGS</label>
      
      <div className="flex flex-wrap gap-1 mb-2">
        {displayTags.map((tag, idx) => (
          <span key={`${tag.id}-${idx}`} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full flex items-center">
            {tag.label}
            {/* Hide remove button if disabled */}
            {!disabled && (
                <button 
                type="button"
                onClick={() => removeTag(idx)}
                className="ml-1 text-blue-600 hover:text-blue-900 font-bold"
                >
                ×
                </button>
            )}
          </span>
        ))}
      </div>

      <input
        type="text"
        className="w-full p-2 text-sm border rounded bg-white disabled:bg-slate-100 disabled:text-slate-500"
        placeholder={disabled ? "Tags locked" : "Search or type new tag + Enter..."}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled} // <--- Block input
      />

      {!disabled && suggestions.length > 0 && (
        <ul className="absolute z-10 w-full bg-white border border-slate-200 rounded shadow-lg mt-1 max-h-48 overflow-y-auto">
          {suggestions.map((tag: any) => (
            <li 
              key={tag.id}
              onClick={() => addTag(tag)}
              className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer text-slate-700 flex items-center justify-between group"
            >
              <div className="flex items-center">
                {tag.is_official ? (
                  <BuildingLibraryIcon className="w-3.5 h-3.5 text-amber-500 mr-2" />
                ) : (
                  <UserIcon className="w-3.5 h-3.5 text-slate-400 mr-2 group-hover:text-blue-500" />
                )}
                <span>{tag.label}</span>
              </div>
              
              {tag.is_official && (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase tracking-wider">
                  Official
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
