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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // --- 1. Edit Mode: Load existing QA ---
  useEffect(() => {
    const loadEditMode = async () => {
      if (selectedUnit && selectedUnit.unit_type === 'canonical_answer') {
        setAnswer({ type: 'existing', unit: selectedUnit });
        setAuthor(selectedUnit.author || "‘Abdu’l-Bahá");
        setDeleteConfirmOpen(false); // Reset UI state

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
        
        // Strategy A: URL Parsing (Preferred)
        // MediaWiki structure: /Main_Book_Title/Sub_Page_Title...
        const pathSegments = urlObj.pathname.split('/').filter(p => p);
        
        if (pathSegments.length > 0) {
            // "Book_Title" or "Some_Answered_Questions"
            let bookSegment = pathSegments[0];
            
            // 1. Replace Underscores with Spaces
            // 2. Decode URI (handles %20, %2C, etc.)
            return decodeURIComponent(bookSegment.replace(/_/g, ' '));
        }

        // Strategy B: Title Parsing (Fallback)
        // Only runs if URL parsing failed (e.g. strict root path, weird permalinks)
        // Title format: "Some Answered Questions/17 - Bahaiworks"
        if (tab.title) {
            // 1. Split by " - " to remove the site name suffix
            const pageName = tab.title.split(' - ')[0].trim(); 
            
            // 2. Split by "/" to remove subpages
            // This is safe because MediaWiki puts spaces around slashes in Titles rarely, 
            // but usually / denotes subpage.
            return pageName.split('/')[0].trim(); 
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
    if (deleteConfirmOpen) {
        setDeleteConfirmOpen(false);
    } else {
        setQuestionText('');
        setAnswer(null);
        clearSelection();
    }
  };

  const handleDelete = async () => {
    // Step 1: Open Confirmation
    if (!deleteConfirmOpen) {
        setDeleteConfirmOpen(true);
        return;
    }

    // Step 2: Actually Delete
    if (answer?.type !== 'existing') return;
    
    setIsSubmitting(true);
    try {
        await del(`/api/units/${answer.unit.id}`);
        setQuestionText('');
        setAnswer(null);
        clearSelection();
        setDeleteConfirmOpen(false);
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
      const bookTitle = await deriveBookTitle();

      if (answer.type === 'existing') {
        await del(`/api/units/${answer.unit.id}`);
      }

      const unitPayload = answer.type === 'existing' ? {
          source_code: answer.unit.source_code,
          source_page_id: answer.unit.source_page_id,
          text_content: answer.unit.text_content,
          start_char_index: answer.unit.start_char_index,
          end_char_index: answer.unit.end_char_index,
      } : {
          source_code: answer.context.source_code,
          source_page_id: answer.context.source_page_id,
          title: answer.context.title,
          text_content: answer.text,
          start_char_index: answer.offsets.start,
          end_char_index: answer.offsets.end,
      };

      const unitRes = await post('/api/contribute/unit', {
        ...unitPayload, 
        author: author,
        unit_type: "canonical_answer"
      });

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
  
  const isEditMode = answer?.type === 'existing';
  const canDelete = isEditMode && (answer.unit as any).can_delete; 

  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-slate-800">
            {isEditMode ? "Edit Q&A Pair" : "Q&A Builder"}
        </h2>
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
            {!isEditMode && !questionText && (
                <button 
                    type="button"
                    onClick={handleSetQuestionFromText}
                    disabled={!currentSelection && !selectedUnit}
                    className="absolute top-2 right-2 text-[10px] bg-slate-100 border border-slate-300 px-2 py-1 rounded hover:bg-slate-200 text-slate-600 disabled:opacity-0 transition-opacity"
                >
                    Paste Selection
                </button>
            )}
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
      <div className="flex gap-2 pt-2 border-t border-slate-100 mt-4">
        
        {/* A. Cancel / Close */}
        <button 
            type="button" 
            onClick={handleCancel} 
            className={`py-2 text-sm text-slate-600 hover:bg-slate-100 rounded border border-transparent hover:border-slate-300 ${
                isEditMode ? "px-3" : "flex-1"
            }`}
        >
            {deleteConfirmOpen ? 'Cancel' : (isEditMode ? 'Close' : 'Cancel')} 
        </button>

        {/* B. Create / Update (Hidden if confirming delete) */}
        {!deleteConfirmOpen && (
            <button 
                onClick={handleSubmit}
                disabled={!questionText || !answer || isSubmitting}
                className="flex-1 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-slate-300"
            >
                {isSubmitting ? "Processing..." : (isEditMode ? "Update" : "Save Q&A Pair")}
            </button>
        )}

        {/* C. Delete (Edit Mode Only) */}
        {canDelete && (
            <button 
                type="button"
                onClick={handleDelete}
                className={`px-3 py-2 text-sm rounded transition-all duration-200 border ${
                    deleteConfirmOpen 
                        ? 'flex-1 bg-red-600 text-white border-red-700 hover:bg-red-700 font-bold' 
                        : 'bg-white text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300' 
                }`}
            >
                {deleteConfirmOpen ? "Confirm Delete?" : "Delete"}
            </button>
        )}
      </div>
    </div>
  );
};
