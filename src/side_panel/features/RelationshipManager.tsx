import React, { useState, useEffect } from 'react';
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { useSelection } from '@/side_panel/context/SelectionContext';
import { useApi } from '@/hooks/useApi';
import { StagedItem } from '@/utils/types';

// Standardized List for RAG Priority
const AUTHOR_OPTIONS = [
  "Bahá’u’lláh",
  "The Báb",
  "‘Abdu’l-Bahá",
  "Shoghi Effendi",
  "Universal House of Justice",
  "Other" // Maps to "All others" bucket
];

export const RelationshipManager = () => {
  const { currentSelection, selectedUnit, clearSelection } = useSelection();
  const { post, get, del } = useApi();
  const [subject, setSubject] = useState<StagedItem | null>(null);
  const [object, setObject] = useState<StagedItem | null>(null);
  const [subjectAuthor, setSubjectAuthor] = useState('Other');
  const [objectAuthor, setObjectAuthor] = useState('Other');
  const [relType, setRelType] = useState('commentary');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load existing relationships when this tab opens
  useEffect(() => {
    const fetchAndHighlight = async () => {
      // 1. Get current page context (You might need a helper for this if you don't have one)
      // Assuming you can get the current active tab's URL/Context
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return;

      // We need source_code/page_id. 
      // Option A: Ask content script for it
      const metadata = await chrome.tabs.sendMessage(tab.id, { type: 'GET_METADATA' });
      
      if (metadata && metadata.source_code) {
        // 2. Fetch from API
        const rels = await get(`/api/relationships?source_code=${metadata.source_code}&source_page_id=${metadata.source_page_id}`);
        
        // 3. Send to Content Script to Highlight
        // We map the relationships back to a structure the highlighter understands
        const unitsToHighlight = rels.flatMap((r: any) => {
             // Create highlightable units for both subject and object if they are on this page
             const units = [];
             if (r.subject_page_id === metadata.source_page_id) {
                 units.push({ ...r, ...r.subject_unit, unit_type: 'link_subject', id: r.subject_unit_id });
             }
             if (r.object_page_id === metadata.source_page_id) {
                 units.push({ ...r, ...r.object_unit, unit_type: 'link_object', id: r.object_unit_id });
             }
             return units;
        });

        chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_HIGHLIGHTS', units: unitsToHighlight });
      }
    };

    fetchAndHighlight();
  }, []);

  // Load state from storage on mount
  useEffect(() => {
    chrome.storage.local.get(['linkerState'], (result) => {
      if (result.linkerState) {
        setSubject(result.linkerState.subject);
        setObject(result.linkerState.object);
        setRelType(result.linkerState.relType || 'commentary');
        setSubjectAuthor(result.linkerState.subjectAuthor || 'Other');
        setObjectAuthor(result.linkerState.objectAuthor || 'Other');
      }
    });
  }, []);

  // Helper to update state AND storage
  const updateState = (
    key: 'subject' | 'object' | 'relType' | 'subjectAuthor' | 'objectAuthor' | 'clear', 
    value: any
  ) => {
    if (key === 'clear') {
      setSubject(null);
      setObject(null);
      setSubjectAuthor('Other');
      setObjectAuthor('Other');
      setRelType('commentary');
      chrome.storage.local.remove('linkerState');
      return;
    }

    // React State
    if (key === 'subject') setSubject(value);
    if (key === 'object') setObject(value);
    if (key === 'relType') setRelType(value);
    
    // [FIX] Auto-set Author if detecting new selection
    let newSubjectAuthor = subjectAuthor;
    let newObjectAuthor = objectAuthor;

    if (key === 'subject' && value?.type === 'new' && value.context?.author && value.context.author !== 'Undefined') {
        setSubjectAuthor(value.context.author);
        newSubjectAuthor = value.context.author;
    } else if (key === 'subjectAuthor') {
        setSubjectAuthor(value);
        newSubjectAuthor = value;
    }

    if (key === 'object' && value?.type === 'new' && value.context?.author && value.context.author !== 'Undefined') {
        setObjectAuthor(value.context.author);
        newObjectAuthor = value.context.author;
    } else if (key === 'objectAuthor') {
        setObjectAuthor(value);
        newObjectAuthor = value;
    }

    if (key === 'relType') setRelType(value);

    // Persistence Calculation
    const newState = {
      subject: key === 'subject' ? value : subject,
      object: key === 'object' ? value : object,
      relType: key === 'relType' ? value : relType,
      subjectAuthor: newSubjectAuthor,
      objectAuthor: newObjectAuthor,
    };

    chrome.storage.local.set({ linkerState: newState });
  };

  const captureSelection = (): StagedItem | null => {
    if (selectedUnit) return { type: 'existing', unit: selectedUnit };
    if (currentSelection) return { type: 'new', ...currentSelection };
    return null;
  };

  const handleDelete = async () => {
    if (!selectedUnit?.id) return;
    if (!confirm("Are you sure you want to delete this link? Both ends will be removed.")) return;

    setIsSubmitting(true);
    try {
      await del(`/api/contribute/unit/${selectedUnit.id}`);
      alert("Link deleted.");
      clearSelection();
      chrome.tabs.reload();
    } catch (e: any) {
      alert("Error deleting: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // [FIX] Helper to check if author is detected
  const isSubjectAuto = subject?.type === 'new' && subject.context?.author && subject.context.author !== 'Undefined';
  const isObjectAuto = object?.type === 'new' && object.context?.author && object.context.author !== 'Undefined';

  return (
      <div className="p-4 space-y-4">
         <h2 className="text-lg font-bold text-slate-800">Manage Link</h2>
         <div className="p-4 bg-slate-100 rounded border border-slate-300">
            <span className="text-xs font-bold text-slate-500 uppercase block mb-2">
              Selected {selectedUnit.unit_type === 'link_subject' ? 'Subject' : 'Object'}
            </span>
            <p className="text-sm italic text-slate-700 mb-4">"{selectedUnit.text_content}"</p>
            
            <div className="flex gap-2">
              <button 
                onClick={clearSelection}
                className="flex-1 py-2 bg-white border border-slate-300 rounded text-slate-600 hover:bg-slate-50"
              >
                Back
              </button>
              <button 
                onClick={handleDelete}
                disabled={isSubmitting}
                className="flex-1 py-2 bg-red-600 text-white font-bold rounded hover:bg-red-700 disabled:opacity-50"
              >
                {isSubmitting ? "Deleting..." : "Delete Link"}
              </button>
            </div>
         </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!subject || !object) return;
    setIsSubmitting(true);

    try {
      // 1. Resolve Subject ID
      let subjectId = subject.type === 'existing' ? subject.unit.id : null;
      if (!subjectId && subject.type === 'new') {
        const res = await post('/api/contribute/unit', {
          source_code: subject.context.source_code,
          source_page_id: subject.context.source_page_id,
          title: subject.context.title,
          text_content: subject.text,
          start_char_index: subject.offsets.start,
          end_char_index: subject.offsets.end,
          connected_anchors: (subject as any).connected_anchors || [],
          author: subjectAuthor,
          unit_type: "link_subject"
        });
        subjectId = res.unit_id;
      }

      // 2. Resolve Object ID
      let objectId = object.type === 'existing' ? object.unit.id : null;
      if (!objectId && object.type === 'new') {
        const res = await post('/api/contribute/unit', {
          source_code: object.context.source_code,
          source_page_id: object.context.source_page_id,
          title: object.context.title,
          text_content: object.text,
          start_char_index: object.offsets.start,
          end_char_index: object.offsets.end,
          connected_anchors: (object as any).connected_anchors || [],
          author: objectAuthor,
          unit_type: "link_object"
        });
        objectId = res.unit_id;
      }

      if (!subjectId || !objectId) throw new Error("Failed to resolve Unit IDs");

      // 3. Create Relationship
      await post('/api/contribute/relationship', {
        subject_unit_id: subjectId,
        object_unit_id: objectId,
        relationship_type: relType
      });

      alert("Relationship Linked!");
      updateState('clear', null);
      chrome.tabs.reload();

    } catch (e: any) {
      alert("Error linking: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Helper Component for Author Dropdown ---
  const AuthorSelect = ({ 
    value, 
    onChange, 
    disabled 
  }: { value: string, onChange: (val: string) => void, disabled?: boolean }) => (
    <div className="mt-2">
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
        Author / Speaker
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full text-xs border-slate-300 rounded p-1.5 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      >
        {AUTHOR_OPTIONS.map(opt => (
          <option key={opt} value={opt}>{opt === 'Other' ? 'All others' : opt}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-2 group relative">
        <h2 className="text-lg font-bold text-slate-800">Knowledge Linker</h2>
        <QuestionMarkCircleIcon className="w-5 h-5 text-slate-400 cursor-help hover:text-slate-600 transition-colors" />

        {/* Tooltip */}
        <div className="absolute left-0 top-full mt-2 hidden group-hover:block w-72 p-3 bg-slate-800 text-white text-xs font-normal rounded-md shadow-xl z-20 leading-relaxed">
          <p className="font-bold mb-1 border-b border-slate-600 pb-1">How to use this page:</p>
          <p>This tab could be used to link a specific Hidden Word to the commentary or explanations about it. These connections inform bahai.chat as it's answering questions on that particular topic.</p>
          {/* Tooltip Arrow */}
          <div className="absolute bottom-full left-6 border-8 border-transparent border-b-slate-800"></div>
        </div>
      </div>
      
      {/* SUBJECT CARD */}
      <div className={`p-3 rounded border ${subject ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200 border-dashed'}`}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-bold text-slate-500">SUBJECT (Origin)</span>
          {subject && <button onClick={() => updateState('subject', null)} className="text-xs text-red-500 hover:underline">Clear</button>}
        </div>
        
        {subject ? (
          <>
            <p className="text-sm line-clamp-3 italic mb-2">
              "{subject.type === 'existing' ? subject.unit.text_content : subject.text}"
            </p>
            {/* Show Dropdown ONLY if creating new. If existing, show Read-Only author */}
            {subject.type === 'new' ? (
               <AuthorSelect 
                 value={subjectAuthor} 
                 onChange={(val) => updateState('subjectAuthor', val)}
                 disabled={isSubjectAuto}
               />
            ) : (
               <div className="text-xs text-slate-500">
                 Author: <span className="font-semibold">{subject.unit.author}</span>
               </div>
            )}
          </>
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
          className="text-sm border-slate-300 rounded p-1 bg-white font-medium text-slate-700"
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
          {object && <button onClick={() => updateState('object', null)} className="text-xs text-red-500 hover:underline">Clear</button>}
        </div>

        {object ? (
          <>
            <p className="text-sm line-clamp-3 italic mb-2">
              "{object.type === 'existing' ? object.unit.text_content : object.text}"
            </p>
            {object.type === 'new' ? (
               <AuthorSelect 
                 value={objectAuthor} 
                 onChange={(val) => updateState('objectAuthor', val)}
                 disabled={isObjectAuto}
               />
            ) : (
               <div className="text-xs text-slate-500">
                 Author: <span className="font-semibold">{object.unit.author}</span>
               </div>
            )}
          </>
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
