import React, { useState, useEffect } from 'react';
import { useSelection } from '@/side_panel/context/SelectionContext';
import { useApi } from '@/hooks/useApi';
import { TagInput } from '../components/TagInput';

export const UnitCreator = () => {
  const { currentSelection, clearSelection } = useSelection();
  const { post } = useApi();
  
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when selection changes
  useEffect(() => {
    setTagIds([]);
  }, [currentSelection]);

  const handleSave = async () => {
    if (!currentSelection) return;
    setIsSaving(true);

    try {
      // 1. Create the Logical Unit
      const unitPayload = {
        article_id: currentSelection.context.source_page_id, // Simplified mapping
        text_content: currentSelection.text,
        start_char_index: currentSelection.offsets.start,
        end_char_index: currentSelection.offsets.end,
        unit_type: 'user_highlight', 
        tags: tagIds // Backend handles linking in unit_tags table
      };

      await post('/api/units', unitPayload);

      // 2. Notify Content Script to draw the new highlight immediately
      chrome.runtime.sendMessage({ type: 'REFRESH_HIGHLIGHTS' });
      
      // 3. Clear form
      clearSelection();

    } catch (e) {
      console.error("Save failed", e);
      alert("Failed to save highlight.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentSelection) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
        <div className="mb-4 text-4xl">✍️</div>
        <p className="text-sm">Select text on the page to create a new highlight.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="p-4 flex-1 overflow-y-auto">
        
        {/* Preview Card */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6 relative">
          <div className="absolute -top-3 left-3 bg-white px-2 text-xs font-bold text-slate-400">
            SELECTED TEXT
          </div>
          <blockquote className="text-slate-700 italic font-serif leading-relaxed">
            "{currentSelection.text}"
          </blockquote>
        </div>

        {/* Form Controls */}
        <div className="space-y-6">
          <TagInput 
            selectedTags={tagIds} 
            onChange={setTagIds} 
          />
          
          <div className="text-xs text-slate-500">
            <p>Tip: Press <strong>Enter</strong> to create a new tag instantly.</p>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 bg-white border-t border-slate-200 flex justify-end gap-3">
        <button 
          onClick={clearSelection}
          className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 font-medium"
        >
          Cancel
        </button>
        <button 
          onClick={handleSave}
          disabled={isSaving || tagIds.length === 0}
          className={`px-6 py-2 text-sm text-white rounded shadow-md font-bold transition-all ${
            isSaving || tagIds.length === 0
              ? 'bg-slate-300 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg'
          }`}
        >
          {isSaving ? 'Saving...' : 'Save Highlight'}
        </button>
      </div>
    </div>
  );
};
