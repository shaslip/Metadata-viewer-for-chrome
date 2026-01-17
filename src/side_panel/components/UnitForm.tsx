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
  connected_anchors?: number[]; // [FIX] Added to Props

  // View Mode
  existingUnit?: LogicalUnit & { can_delete?: boolean }; 
}

export const UnitForm: React.FC<Props> = ({ 
  selection, 
  context, 
  onCancel, 
  offsets, 
  connected_anchors, // [FIX] Destructure here
  existingUnit,
  onSuccess
}) => {
  console.log("[UnitForm] Received Props anchors:", connected_anchors);
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
      if (isViewMode) {
        // SCENARIO 1: REPAIR (Create New + Delete Old)
        if (isRepairing && selection && offsets) {
            const repairPayload = {
                source_code: (existingUnit as any).source_code,
                source_page_id: (existingUnit as any).source_page_id,
                title: (existingUnit as any).title || "Restored Unit",
                text_content: selection,
                start_char_index: offsets.start,
                end_char_index: offsets.end,
                connected_anchors: connected_anchors || [],
                author: formData.author,
                unit_type: formData.unit_type,
            };

            await post('/api/contribute/unit', repairPayload);
            await del(`/api/units/${existingUnit.id}`);
            alert("Unit re-aligned and saved! (New ID created)");
        } 
        // SCENARIO 2: METADATA UPDATE ONLY (PUT)
        else {
            await put(`/api/units/${existingUnit.id}`, {
                author: formData.author,
                unit_type: formData.unit_type
            });
            alert("Unit metadata updated!");
        }
      } else {
        // ... existing Create Logic (SCENARIO 3) ...
        // (No changes needed here, keeping existing createPayload logic)
         if (!context?.source_code || !context?.source_page_id) { throw new Error("Missing Source"); }
         const createPayload = { /* ... standard create props ... */ };
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
      <div className={`p-3 rounded border shadow-sm ${isRepairing ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
        <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-semibold text-slate-500">
                {isRepairing ? "NEW SELECTION (REPAIRING)" : (isViewMode ? "SAVED CONTENT" : "SELECTED TEXT")}
            </label>
            {isViewMode && !isRepairing && canEdit && (
                <button 
                    type="button" 
                    onClick={onEnterRepair}
                    className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-100"
                    title="Update the text highlights for this unit"
                >
                    <ArrowPathIcon className="w-3 h-3" /> Re-align
                </button>
            )}
        </div>
        
        {isRepairing && !selection ? (
            <div className="text-sm text-slate-400 italic py-2 text-center animate-pulse">
                Select the correct text on the page...
            </div>
        ) : (
            <p className="text-sm text-slate-800 line-clamp-6 italic font-serif">
                "{isRepairing && selection ? selection : (isViewMode ? existingUnit!.text_content : selection)}"
            </p>
        )}
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
                    <button 
                        type="submit" 
                        disabled={isRepairing && !selection} 
                        className={`flex-1 py-2 text-sm text-white rounded transition-colors ${
                            isRepairing 
                            ? 'bg-green-600 hover:bg-green-700 disabled:bg-green-300' 
                            : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                    >
                        {isRepairing ? 'Confirm Repair' : 'Update'}
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
