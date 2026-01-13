import React, { useState, useEffect } from 'react'; // Added useEffect
import { useSelection } from '@/side_panel/context/SelectionContext';
import { useApi } from '@/hooks/useApi';
import { StagedItem } from '@/utils/types'; // Import from types now

export const RelationshipManager = () => {
  const { currentSelection, selectedUnit } = useSelection();
  const { post } = useApi();
  
  const [subject, setSubject] = useState<StagedItem | null>(null);
  const [object, setObject] = useState<StagedItem | null>(null);
  const [relType, setRelType] = useState('commentary');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- NEW: Persistence Logic ---
  // 1. Load state from storage on mount
  useEffect(() => {
    chrome.storage.local.get(['linkerState'], (result) => {
      if (result.linkerState) {
        setSubject(result.linkerState.subject);
        setObject(result.linkerState.object);
        setRelType(result.linkerState.relType || 'commentary');
      }
    });
  }, []);

  // 2. Helper to update state AND storage
  const updateState = (
    key: 'subject' | 'object' | 'relType' | 'clear', 
    value: any
  ) => {
    if (key === 'clear') {
      setSubject(null);
      setObject(null);
      setRelType('commentary');
      chrome.storage.local.remove('linkerState');
      return;
    }

    // Calculate new state based on current values
    const newState = {
      subject: key === 'subject' ? value : subject,
      object: key === 'object' ? value : object,
      relType: key === 'relType' ? value : relType
    };

    // Update React State
    if (key === 'subject') setSubject(value);
    if (key === 'object') setObject(value);
    if (key === 'relType') setRelType(value);

    // Update Storage
    chrome.storage.local.set({ linkerState: newState });
  };

  const captureSelection = (): StagedItem | null => {
    if (selectedUnit) return { type: 'existing', unit: selectedUnit };
    if (currentSelection) return { type: 'new', ...currentSelection };
    return null;
  };

  const handleSubmit = async () => {
    if (!subject || !object) return;
    setIsSubmitting(true);

    try {
      // ... (Existing ID resolution logic remains exactly the same) ...
      
      // 1. Resolve Subject ID
      let subjectId = subject.type === 'existing' ? subject.unit.id : null;
      if (!subjectId && subject.type === 'new') {
        const res = await post('/api/contribute/unit', {
          source_code: subject.context.source_code,
          source_page_id: subject.context.source_page_id,
          text_content: subject.text,
          start_char_index: subject.offsets.start,
          end_char_index: subject.offsets.end,
          author: "Unknown",
          unit_type: "other"
        });
        subjectId = res.id;
      }

      // 2. Resolve Object ID
      let objectId = object.type === 'existing' ? object.unit.id : null;
      if (!objectId && object.type === 'new') {
        const res = await post('/api/contribute/unit', {
          source_code: object.context.source_code,
          source_page_id: object.context.source_page_id,
          text_content: object.text,
          start_char_index: object.offsets.start,
          end_char_index: object.offsets.end,
          author: "Unknown",
          unit_type: "other"
        });
        objectId = res.id;
      }

      // 3. Create Relationship
      await post('/api/contribute/relationship', {
        subject_unit_id: subjectId,
        object_unit_id: objectId,
        relationship_type: relType
      });

      alert("Relationship Linked!");
      
      // Clear persistence on success
      updateState('clear', null);
      
      chrome.tabs.reload();

    } catch (e: any) {
      alert("Error linking: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-lg font-bold text-slate-800">Knowledge Linker</h2>
      
      {/* SUBJECT CARD */}
      <div className={`p-3 rounded border ${subject ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200 border-dashed'}`}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-bold text-slate-500">SUBJECT (Origin)</span>
          {/* Use updateState wrapper */}
          {subject && <button onClick={() => updateState('subject', null)} className="text-xs text-red-500 hover:underline">Clear</button>}
        </div>
        
        {subject ? (
          <p className="text-sm line-clamp-3 italic">"{subject.type === 'existing' ? subject.unit.text_content : subject.text}"</p>
        ) : (
          <button 
            onClick={() => updateState('subject', captureSelection())}
            disabled={!currentSelection && !selectedUnit}
            className="w-full py-2 text-sm bg-white border border-slate-300 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Set Current Selection
          </button>
        )}
      </div>

      {/* RELATIONSHIP TYPE */}
      <div className="flex items-center gap-2">
        <div className="h-px bg-slate-200 flex-1"></div>
        <select 
          value={relType} 
          onChange={(e) => updateState('relType', e.target.value)}
          className="text-sm border-slate-300 rounded p-1 bg-white"
        >
          <option value="commentary">Commentary on</option>
          <option value="translation">Translation of</option>
          <option value="refutation">Refutation of</option>
          <option value="allusion">Allusion to</option>
        </select>
        <div className="h-px bg-slate-200 flex-1"></div>
      </div>

      {/* OBJECT CARD */}
      <div className={`p-3 rounded border ${object ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200 border-dashed'}`}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-bold text-slate-500">OBJECT (Target)</span>
          {/* Use updateState wrapper */}
          {object && <button onClick={() => updateState('object', null)} className="text-xs text-red-500 hover:underline">Clear</button>}
        </div>

        {object ? (
          <p className="text-sm line-clamp-3 italic">"{object.type === 'existing' ? object.unit.text_content : object.text}"</p>
        ) : (
          <button 
            onClick={() => updateState('object', captureSelection())}
            disabled={!currentSelection && !selectedUnit}
            className="w-full py-2 text-sm bg-white border border-slate-300 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Set Current Selection
          </button>
        )}
      </div>

      {/* ACTION BUTTONS */}
      <div className="flex gap-2">
        {/* NEW CANCEL BUTTON */}
        <button 
          onClick={() => updateState('clear', null)}
          disabled={!subject && !object}
          className="px-4 py-3 bg-white text-slate-600 font-bold rounded shadow border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>

        <button 
          onClick={handleSubmit}
          disabled={!subject || !object || isSubmitting}
          className="flex-1 py-3 bg-slate-800 text-white font-bold rounded shadow-lg hover:bg-slate-700 disabled:bg-slate-300"
        >
          {isSubmitting ? "Linking..." : "Create Connection"}
        </button>
      </div>
    </div>
  );
};
