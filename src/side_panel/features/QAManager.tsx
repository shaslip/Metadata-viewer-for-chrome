import React, { useState, useEffect } from 'react';
import { useSelection } from '@/side_panel/context/SelectionContext';
import { useApi } from '@/hooks/useApi';
import { LogicalUnit, PageMetadata } from '@/utils/types';

type StagedAnswer = 
  | { type: 'existing', unit: LogicalUnit }
  | { type: 'new', text: string, offsets: { start: number, end: number }, context: PageMetadata };

export const QAManager = () => {
  const { currentSelection, selectedUnit, clearSelection } = useSelection();
  const { post, del, get } = useApi();

  const [questionText, setQuestionText] = useState('');
  const [author, setAuthor] = useState("‘Abdu’l-Bahá");
  const [answer, setAnswer] = useState<StagedAnswer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- 1. Edit Mode: Load existing QA ---
  useEffect(() => {
    const loadEditMode = async () => {
      if (selectedUnit && selectedUnit.unit_type === 'canonical_answer') {
        setAnswer({ type: 'existing', unit: selectedUnit });
        setAuthor(selectedUnit.author || "‘Abdu’l-Bahá");

        try {
          const res = await get(`/api/qa?answer_unit_id=${selectedUnit.id}`);
          if (res && res.length > 0) {
             setQuestionText(res[0].question_text);
          }
        } catch (e) {
          console.error("Failed to fetch linked question", e);
        }
      }
    };
    loadEditMode();
  }, [selectedUnit]);

  // --- 2. Helpers ---

  // Extracts "Some Answered Questions" from "https://bahai.works/Some_Answered_Questions/17"
  const deriveBookTitle = async (): Promise<string> => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || !tab.url) return "Unknown Source";

    try {
        const urlObj = new URL(tab.url);
        
        // Strategy A: URL Parsing (Preferred for bahai.works)
        // Path: /Some_Answered_Questions/17 -> "Some Answered Questions"
        const pathSegments = urlObj.pathname.split('/').filter(p => p);
        if (pathSegments.length > 0) {
            // Take the first segment (Book Name) and remove underscores
            let bookTitle = pathSegments[0].replace(/_/g, ' ');
            // Decode URI components (e.g. %20 -> space)
            return decodeURIComponent(bookTitle);
        }

        // Strategy B: Title Parsing (Fallback)
        // Title: "Some Answered Questions/17 - Bahaiworks..."
        if (tab.title) {
            const titlePart = tab.title.split('-')[0].trim(); // "Some Answered Questions/17"
            return titlePart.split('/')[0].trim(); // "Some Answered Questions"
        }
    } catch (e) {
        console.warn("Error parsing book title:", e);
    }
    return "Unknown Book";
  };

  const handleSetAnswer = () => {
    if (selectedUnit) {
      setAnswer({ type: 'existing', unit: selectedUnit });
      clearSelection();
    } else if (currentSelection) {
      setAnswer({ type: 'new', ...currentSelection });
      clearSelection();
    }
  };

  const handleSetQuestionFromText = () => {
    if (currentSelection) setQuestionText(currentSelection.text);
    else if (selectedUnit) setQuestionText(selectedUnit.text_content);
  };

  const handleCancel = () => {
    setQuestionText('');
    setAnswer(null);
    clearSelection();
  };

  const handleDelete = async () => {
    if (answer?.type !== 'existing') return;
    if (!confirm("Are you sure you want to delete this Q&A pair?")) return;
    
    setIsSubmitting(true);
    try {
        await del(`/api/units/${answer.unit.id}`);
        // No manual delete for QA needed; DB Cascade handles it
        handleCancel();
        chrome.tabs.reload();
    } catch (e: any) {
        alert("Delete failed: " + e.message);
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!questionText || !answer) return;
    setIsSubmitting(true);

    try {
      // 1. Calculate Source Book from Client Context (URL/Title)
      const bookTitle = await deriveBookTitle();

      // 2. If Updating: Delete OLD unit to reset ID
      if (answer.type === 'existing') {
        await del(`/api/units/${answer.unit.id}`);
      }

      // 3. Prepare Data
      // For existing units, we trust the CURRENT page context for source_code/id 
      // because the unit is highlighted on the page we are looking at.
      const context = answer.type === 'existing' 
        ? answer.context || (await getPageContextFromTab()) // Fallback if context missing
        : answer.context;

      const textToSave = answer.type === 'existing' ? answer.unit.text_content : answer.text;
      
      const offsets = answer.type === 'existing' 
        ? { start: answer.unit.start_char_index, end: answer.unit.end_char_index }
        : answer.offsets;

      // 4. Create NEW Unit
      const unitRes = await post('/api/contribute/unit', {
        source_code: context.source_code,
        source_page_id: context.source_page_id,
        text_content: textToSave,
        start_char_index: offsets.start,
        end_char_index: offsets.end,
        author: author,
        unit_type: "canonical_answer"
      });

      // 5. Create NEW Question (Using Client-Derived Book Title)
      await post('/api/contribute/qa', {
        question_text: questionText,
        answer_unit_id: unitRes.unit_id,
        source_book: bookTitle 
      });

      alert(answer.type === 'existing' ? "Q&A Updated!" : "Q&A Created!");
      handleCancel();
      chrome.tabs.reload(); 

    } catch (e: any) {
      console.error(e);
      alert("Error saving: " + (e.message || "Unknown error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to get page context if 'answer.type === existing' logic needs it
  // (Assuming your scraper normally puts this in currentSelection, but existing units lack it)
  const getPageContextFromTab = async () => {
     // This relies on your scraper having run. 
     // A cleaner way is to message the content script, 
     // but for now, we can try to use global variables or just assume the scraper is active.
     // If you have the scraper metadata stored in `SelectionContext` (even when nothing selected), use that.
     // Otherwise, we might need a quick message dispatch here.
     const response = await chrome.tabs.sendMessage(
        (await chrome.tabs.query({active:true}))[0].id!, 
        { type: "GET_PAGE_METADATA" }
     );
     return response;
  };

  const isEditMode = answer?.type === 'existing';
  const canDelete = isEditMode && (answer.unit as any).can_delete; 

  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-slate-800">
            {isEditMode ? "Edit Q&A Pair" : "Q&A Builder"}
        </h2>
        {isEditMode && (
            <button onClick={handleCancel} className="text-xs text-slate-400 hover:text-slate-600">
                Cancel
            </button>
        )}
      </div>

      {/* QUESTION INPUT */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500">QUESTION</label>
        <div className="relative">
            <textarea 
            className="w-full p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 min-h-[80px]"
            placeholder="Type the question here..."
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            />
            <button 
                type="button"
                onClick={handleSetQuestionFromText}
                disabled={!currentSelection && !selectedUnit}
                className="absolute top-2 right-2 text-[10px] bg-slate-100 border border-slate-300 px-2 py-1 rounded hover:bg-slate-200 text-slate-600 disabled:opacity-0 transition-opacity"
            >
                Paste Selection
            </button>
        </div>
      </div>

      {/* AUTHOR DROPDOWN */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">ANSWER AUTHOR</label>
        <select 
          className="w-full p-2 text-sm border rounded bg-white"
          value={author}
          onChange={e => setAuthor(e.target.value)}
        >
          <option>Bahá’u’lláh</option>
          <option>The Báb</option>
          <option>‘Abdu’l-Bahá</option>
          <option>Shoghi Effendi</option>
          <option>Universal House of Justice</option>
        </select>
      </div>

      <div className="h-px bg-slate-200 my-2"></div>

      {/* ANSWER DISPLAY */}
      <div className={`p-3 rounded border ${answer ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200 border-dashed'}`}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-bold text-slate-500">ANSWER (Highlight Text)</span>
          {/* Only allow clearing answer if in Creation mode */}
          {answer && !isEditMode && (
             <button onClick={() => setAnswer(null)} className="text-xs text-red-500 hover:underline">Clear</button>
          )}
        </div>

        {answer ? (
          <p className="text-sm line-clamp-4 italic">"{answer.type === 'existing' ? answer.unit.text_content : answer.text}"</p>
        ) : (
          <button 
            onClick={handleSetAnswer}
            disabled={!currentSelection && !selectedUnit}
            className="w-full py-2 text-sm bg-white border border-slate-300 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {currentSelection || selectedUnit ? "Set Active Selection as Answer" : "Highlight text to select..."}
          </button>
        )}
      </div>

      {/* ACTION BUTTONS */}
      <div className="flex gap-2">
          {/* DELETE BUTTON (Conditionally Rendered) */}
          {canDelete && (
              <button
                onClick={handleDelete}
                disabled={isSubmitting}
                className="px-4 py-3 bg-red-100 text-red-700 font-bold rounded shadow hover:bg-red-200 disabled:opacity-50"
              >
                Delete
              </button>
          )}

          {/* SUBMIT/UPDATE BUTTON */}
          <button 
            onClick={handleSubmit}
            disabled={!questionText || !answer || isSubmitting}
            className={`flex-1 py-3 font-bold rounded shadow-lg text-white disabled:bg-slate-300 ${
                isEditMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            {isSubmitting ? "Processing..." : (isEditMode ? "Update Q&A Pair" : "Save Q&A Pair")}
          </button>
      </div>
    </div>
  );
};
