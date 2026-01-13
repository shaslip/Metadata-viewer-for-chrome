import React, { useState } from 'react';
import { PageMetadata, LogicalUnit } from '@/utils/types';
import { useApi } from '@/hooks/useApi';

interface Props {
  // Common
  onCancel: () => void;
  onSuccess?: () => void;
  context?: PageMetadata | null;

  // Create Mode
  selection?: string;
  offsets?: { start: number; end: number };

  // View Mode
  existingUnit?: LogicalUnit & { can_delete?: boolean }; 
}

export const UnitForm: React.FC<Props> = ({ 
  selection, 
  context, 
  onCancel, 
  offsets, 
  existingUnit,
  onSuccess
}) => {
  const { post, del } = useApi();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete Confirmation State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Determine Mode
  const isViewMode = !!existingUnit;
  const canEdit = existingUnit?.can_delete ?? true; // Default to true for Create Mode

  const [formData, setFormData] = useState({
    author: existingUnit?.author || "‘Abdu’l-Bahá",
    unit_type: existingUnit?.unit_type || 'tablet'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // 1. Prepare Data
      const payloadSourceCode = isViewMode ? (existingUnit as any).source_code : context?.source_code;
      const payloadPageId     = isViewMode ? (existingUnit as any).source_page_id : context?.source_page_id;

      if (!payloadSourceCode || !payloadPageId) {
          throw new Error("Missing Source Context. Cannot create record.");
      }

      const payload = {
        source_code: payloadSourceCode,
        source_page_id: payloadPageId,
        text_content: isViewMode ? existingUnit!.text_content : selection,
        start_char_index: isViewMode ? existingUnit!.start_char_index : offsets!.start,
        end_char_index: isViewMode ? existingUnit!.end_char_index : offsets!.end,
        author: formData.author,
        unit_type: formData.unit_type
      };

      if (isViewMode) {
          // --- UPDATE STRATEGY: CREATE NEW -> DELETE OLD ---
          await post('/api/contribute/unit', payload);
          await del(`/api/units/${existingUnit!.id}`);
          alert("Unit Updated");
      } else {
          // --- CREATE STRATEGY ---
          await post('/api/contribute/unit', payload);
          alert("Unit Saved!");
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

  // Modified Cancel Handler
  const handleCancel = () => {
    if (deleteConfirmOpen) {
        // If confirming delete, "Cancel" just backs out of the delete mode
        setDeleteConfirmOpen(false);
    } else {
        // Otherwise, it closes the form
        onCancel();
    }
  };

  const handleDelete = async () => {
      // Step 1: Open Confirmation
      if (!deleteConfirmOpen) {
          setDeleteConfirmOpen(true);
          return;
      }

      // Step 2: Actually Delete
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
      <div className="bg-white p-3 rounded border border-slate-200 shadow-sm">
        <label className="block text-xs font-semibold text-slate-500 mb-1">
            {isViewMode ? "SAVED CONTENT" : "SELECTED TEXT"}
        </label>
        <p className="text-sm text-slate-800 line-clamp-6 italic">
            "{isViewMode ? existingUnit.text_content : selection}"
        </p>
      </div>

      {/* 2. METADATA FIELDS */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">AUTHOR</label>
        <select 
          className="w-full p-2 text-sm border rounded bg-white disabled:bg-slate-100 disabled:text-slate-500"
          value={formData.author}
          onChange={e => setFormData({...formData, author: e.target.value})}
          disabled={!canEdit} 
        >
          <option>Bahá’u’lláh</option>
          <option>The Báb</option>
          <option>‘Abdu’l-Bahá</option>
          <option>Shoghi Effendi</option>
          <option>Universal House of Justice</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">UNIT TYPE</label>
        <select 
          className="w-full p-2 text-sm border rounded bg-white disabled:bg-slate-100 disabled:text-slate-500"
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
      <div className="flex gap-2 pt-2 border-t border-slate-100 mt-4">
        
        {/* CASE A: NO PERMISSION (Close Only) */}
        {isViewMode && !canEdit && (
            <button 
                type="button" 
                onClick={onCancel}
                className="w-full py-2 text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 rounded"
            >
                Close
            </button>
        )}

        {/* CASE B: CREATE MODE (Cancel / Save) */}
        {!isViewMode && (
            <>
                <button type="button" onClick={onCancel} className="flex-1 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded">
                    Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="flex-1 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                    {isSubmitting ? 'Saving...' : 'Save Unit'}
                </button>
            </>
        )}

        {/* CASE C: HAS PERMISSION (Cancel / Update / Delete) */}
        {isViewMode && canEdit && (
            <>
                {/* 1. Cancel Button: Always visible, changes behavior based on state */}
                <button 
                    type="button" 
                    onClick={handleCancel} 
                    className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded border border-transparent hover:border-slate-300"
                >
                    {deleteConfirmOpen ? 'Cancel' : 'Close'} 
                </button>

                {/* 2. Update Button: Hidden during delete confirmation to reduce noise */}
                {!deleteConfirmOpen && (
                    <button type="submit" className="flex-1 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                        Update
                    </button>
                )}

                {/* 3. Delete Button: Changes color/text when confirming */}
                <button 
                    type="button"
                    onClick={handleDelete}
                    className={`px-3 py-2 text-sm rounded transition-all duration-200 border ${
                        deleteConfirmOpen 
                            ? 'flex-1 bg-red-600 text-white border-red-700 hover:bg-red-700 font-bold' // Confirm State
                            : 'bg-white text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300' // Initial State (Clean, not muted)
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
