import React, { useState } from 'react';
import { useSelection } from '@/side_panel/context/SelectionContext';
import { useApi } from '@/hooks/useApi';
import { LogicalUnit, PageMetadata } from '@/utils/types';

// Helper type for the answer (Existing Unit or Raw Text)
type StagedAnswer = 
  | { type: 'existing', unit: LogicalUnit }
  | { type: 'new', text: string, offsets: { start: number, end: number }, context: PageMetadata };

export const QAManager = () => {
  const { currentSelection, selectedUnit } = useSelection();
  const { post } = useApi();

  const [questionText, setQuestionText] = useState('');
  const [answer, setAnswer] = useState<StagedAnswer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Capture current selection as the Answer
  const handleSetAnswer = () => {
    if (selectedUnit) {
      setAnswer({ type: 'existing', unit: selectedUnit });
    } else if (currentSelection) {
      setAnswer({ type: 'new', ...currentSelection });
    }
  };

  // Helper: Allow highlighting text to auto-fill the Question input
  const handleSetQuestionFromText = () => {
    if (currentSelection) setQuestionText(currentSelection.text);
    else if (selectedUnit) setQuestionText(selectedUnit.text_content);
  };

  const handleSubmit = async () => {
    if (!questionText || !answer) return;
    setIsSubmitting(true);

    try {
      // 1. Resolve Answer ID (Create Unit if it's raw text)
      let answerUnitId = answer.type === 'existing' ? answer.unit.id : null;

      if (!answerUnitId && answer.type === 'new') {
        const res = await post('/api/contribute/unit', {
          source_code: answer.context.source_code,
          source_page_id: answer.context.source_page_id,
          text_content: answer.text,
          start_char_index: answer.offsets.start,
          end_char_index: answer.offsets.end,
          author: "Unknown", 
          unit_type: "other"
        });
        answerUnitId = res.id;
      }

      // 2. Create Canonical Question
      await post('/api/contribute/qa', {
        question_text: questionText,
        answer_unit_id: answerUnitId,
        source_book: answer.type === 'existing' ? answer.unit.source_code : answer.context.source_code // Simple fallback
      });

      alert("Q&A Pair Saved!");
      setQuestionText('');
      setAnswer(null);
      chrome.tabs.reload(); 

    } catch (e: any) {
      alert("Error saving Q&A: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-lg font-bold text-slate-800">Q&A Builder</h2>

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

      <div className="h-px bg-slate-200"></div>

      {/* ANSWER INPUT */}
      <div className={`p-3 rounded border ${answer ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200 border-dashed'}`}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-bold text-slate-500">ANSWER (Highlight Text)</span>
          {answer && <button onClick={() => setAnswer(null)} className="text-xs text-red-500 hover:underline">Clear</button>}
        </div>

        {answer ? (
          <p className="text-sm line-clamp-4 italic">"{answer.type === 'existing' ? answer.unit.text_content : answer.text}"</p>
        ) : (
          <button 
            onClick={handleSetAnswer}
            disabled={!currentSelection && !selectedUnit}
            className="w-full py-2 text-sm bg-white border border-slate-300 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Set Selected Text as Answer
          </button>
        )}
      </div>

      {/* SUBMIT */}
      <button 
        onClick={handleSubmit}
        disabled={!questionText || !answer || isSubmitting}
        className="w-full py-3 bg-slate-800 text-white font-bold rounded shadow-lg hover:bg-slate-700 disabled:bg-slate-300"
      >
        {isSubmitting ? "Saving..." : "Save Q&A Pair"}
      </button>
    </div>
  );
};
