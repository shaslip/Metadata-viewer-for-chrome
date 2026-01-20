import React, { useState } from 'react';
import { PageMetadata, LogicalUnit } from '@/utils/types';
import { useApi } from '@/hooks/useApi';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

interface Props {
  // Common
  onCancel: () => void;
  onSuccess?: () => void;
  context?: PageMetadata | null;

  // Create Mode / Repair Data
  selection?: string;
  offsets?: { start: number; end: number };
  connected_anchors?: number[]; 

  // View Mode
  existingUnit?: LogicalUnit & { can_delete?: boolean }; 
  
  // Repair Logic
  isRepairing?: boolean;
  onEnterRepair?: () => void;
}

export const UnitForm: React.FC<Props> = ({ 
  selection, 
  context, 
  onCancel, 
  offsets, 
  connected_anchors,
  existingUnit,
  onSuccess,
  isRepairing,
  onEnterRepair
}) => {
  const { post, put, del } = useApi();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Mode Detection
  const isViewMode = !!existingUnit;
  const canEdit = existingUnit?.can_delete ?? true; 

  // Detect Author from Context
  const detectedAuthor = !isViewMode && context?.author && context.author !== 'Undefined' ? context.author : null;

  const [formData, setFormData] = useState({
    // Use detectedAuthor as default if available
    author: detectedAuthor || existingUnit?.author || "‘Abdu’l-Bahá",
    unit_type: existingUnit?.unit_type || 'tablet'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (isViewMode) {
        
        // SCENARIO 1: REPAIR (Create New + Delete Old)
        // We MUST create a new record to trigger the RAG indexer
        if (isRepairing && selection && offsets) {
            
            // 1. Build Payload for NEW unit (inheriting root props from old unit)
            // Note: We use existingUnit.source_code/id because 'context' might be null in ViewMode
            const repairPayload = {
                source_code: (existingUnit as any).source_code,
                source_page_id: (existingUnit as any).source_page_id,
                title: (existingUnit as any).title || "Restored Unit", // Fallback title
                
                // New Position Data
                text_content: selection,
                start_char_index: offsets.start,
                end_char_index: offsets.end,
                connected_anchors: connected_anchors || [],
                
                // Form Data
                author: formData.author,
                unit_type: formData.unit_type,

                // Carry over tags from the old unit if you have them in the object
                // tags: (existingUnit as any).tags || [] 
            };

            // 2. Execute Swap
            await post('/api/contribute/unit', repairPayload);
            await del(`/api/units/${existingUnit.id}`);
            
            alert("Unit re-aligned and saved! (New ID created)");
        } 
        // SCENARIO 2: METADATA UPDATE ONLY (PUT)
        // Text didn't change, so we can just update the row. RAG doesn't need to re-index text.
        else {
            await put(`/api/units/${existingUnit.id}`, {
                author: formData.author,
                unit_type: formData.unit_type
            });
            alert("Unit metadata updated!");
        }

      } else {
        // SCENARIO 3: FRESH CREATE (POST)
        if (!context?.source_code || !context?.source_page_id) {
            throw new Error("Missing Source Context. Cannot create record.");
        }

        const createPayload = {
          source_code: context.source_code,
          source_page_id: context.source_page_id,
          title: context.title,
          text_content: selection,
          start_char_index: offsets?.start,
          end_char_index: offsets?.end,
          connected_anchors: connected_anchors || [],
          author: formData.author,
          unit_type: formData.unit_type
        };

        await post('/api/contribute/unit', createPayload);
        alert("Unit Created!");
      }

      if (onSuccess) onSuccess();
      onCancel();

    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to save unit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (deleteConfirmOpen) {
      setDeleteConfirmOpen(false);
    } else {
      onCancel();
    }
  };

  const handleDelete = async () => {
      if (!deleteConfirmOpen) {
          setDeleteConfirmOpen(true);
          return;
      }
      try {
          await del(`/api/units/${existingUnit!.id}`);
          alert("Unit deleted.");
          if (onSuccess) onSuccess();
          onCancel();
      } catch (err) {
          console.error(err);
          alert("Failed to delete.");
      }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      
      {/* 1. TEXT DISPLAY */}
      <div className={`p-3 rounded border shadow-sm ${
          isRepairing 
            ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' 
            : 'bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700'
      }`}>
        <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {isRepairing ? "NEW SELECTION (REPAIRING)" : (isViewMode ? "SAVED CONTENT" : "SELECTED TEXT")}
            </label>
            {isViewMode && !isRepairing && canEdit && (
                <button 
                    type="button" 
                    onClick={onEnterRepair}
                    className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 dark:hover:text-blue-300"
                    title="Update the text highlights for this unit"
                >
                    <ArrowPathIcon className="w-3 h-3" /> Re-align
                </button>
            )}
        </div>
        
        {isRepairing && !selection ? (
            <div className="text-sm text-slate-400 italic py-2 text-center animate-pulse dark:text-slate-500">
                Select the correct text on the page...
            </div>
        ) : (
            <p className="text-sm text-slate-800 line-clamp-6 italic font-serif dark:text-slate-300">
                "{isRepairing && selection ? selection : (isViewMode ? existingUnit!.text_content : selection)}"
            </p>
        )}
      </div>

      {/* 2. METADATA FIELDS */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1 dark:text-slate-400">AUTHOR</label>
        <select 
          className="w-full p-2 text-sm border rounded bg-white disabled:bg-slate-100 disabled:text-slate-500 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:disabled:bg-slate-900 dark:disabled:text-slate-600"
          value={formData.author}
          onChange={e => setFormData({...formData, author: e.target.value})}
          disabled={!canEdit || !!detectedAuthor} 
        >
          <option>Bahá’u’lláh</option>
          <option>The Báb</option>
          <option>‘Abdu’l-Bahá</option>
          <option>Shoghi Effendi</option>
          <option>Universal House of Justice</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1 dark:text-slate-400">UNIT TYPE</label>
        <select 
          className="w-full p-2 text-sm border rounded bg-white disabled:bg-slate-100 disabled:text-slate-500 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:disabled:bg-slate-900 dark:disabled:text-slate-600"
          value={formData.unit_type}
          onChange={e => setFormData({...formData, unit_type: e.target.value as any})}
          disabled={!canEdit}
        >
          <option value="tablet">Tablet</option>
          <option value="prayer">Prayer</option>
          <option value="talk">Talk</option>
          <option value="history">Historical Account</option>
        </select>
      </div>

      {/* 3. BUTTONS */}
      <div className="flex gap-2 pt-2 border-t border-slate-100 mt-4 dark:border-slate-800">
        
        {/* CASE A: NO PERMISSION */}
        {isViewMode && !canEdit && (
            <button type="button" onClick={onCancel} className="w-full py-2 text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 rounded dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700">
                Close
            </button>
        )}

        {/* CASE B: CREATE MODE */}
        {!isViewMode && (
            <>
                <button type="button" onClick={onCancel} className="flex-1 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded dark:text-slate-400 dark:hover:bg-slate-800">
                    Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="flex-1 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                    {isSubmitting ? 'Saving...' : 'Save Unit'}
                </button>
            </>
        )}

        {/* CASE C: HAS PERMISSION (EDIT/REPAIR) */}
        {isViewMode && canEdit && (
            <>
                <button 
                    type="button" 
                    onClick={handleCancel} 
                    className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded border border-transparent hover:border-slate-300 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:border-slate-700"
                >
                    {deleteConfirmOpen ? 'Cancel' : 'Close'} 
                </button>

                {!deleteConfirmOpen && (
                    <button 
                        type="submit" 
                        disabled={isRepairing && !selection} // Disable if repairing but no text selected
                        className={`flex-1 py-2 text-sm text-white rounded transition-colors ${
                            isRepairing 
                            ? 'bg-green-600 hover:bg-green-700 disabled:bg-green-300 dark:disabled:bg-green-900' 
                            : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                    >
                        {isRepairing ? 'Confirm Repair' : 'Update'}
                    </button>
                )}

                <button 
                    type="button"
                    onClick={handleDelete}
                    className={`px-3 py-2 text-sm rounded transition-all duration-200 border ${
                        deleteConfirmOpen 
                            ? 'flex-1 bg-red-600 text-white border-red-700 hover:bg-red-700 font-bold' 
                            : 'bg-white text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 dark:bg-transparent dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20' 
                    }`}
                >
                    {deleteConfirmOpen ? "Confirm Delete?" : "Delete"}
                </button>
            </>
        )}
      </div>
    </form>
  );
};
