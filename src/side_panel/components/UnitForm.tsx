import React, { useState } from 'react';
import { PageMetadata } from '@/utils/types';
import { useApi } from '@/hooks/useApi';
import { TagInput } from './TagInput';

interface Props {
  selection: string;
  context: PageMetadata | null;
  offsets: { start: number; end: number };
  onCancel: () => void;
}

export const UnitForm: React.FC<Props> = ({ selection, context, onCancel, offsets }) => {
  const { post } = useApi();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    author: "‘Abdu’l-Bahá",
    unit_type: 'tablet',
    tags: [] as number[]
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!context) return;
    setIsSubmitting(true);

    try {
      const payload = {
        source_code: context.source_code,
        source_page_id: context.source_page_id,
        text_content: selection,
        start_char_index: offsets.start,
        end_char_index: offsets.end,
        author: formData.author,
        unit_type: formData.unit_type,
        tags: formData.tags
      };

      // 2. Send to Node API
      await post('/api/contribute/unit', payload);
      
      // 3. Cleanup
      alert("Unit Saved!");
      onCancel();
    } catch (err) {
      console.error(err);
      alert("Failed to save unit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-white p-3 rounded border border-slate-200 shadow-sm">
        <label className="block text-xs font-semibold text-slate-500 mb-1">SELECTED TEXT</label>
        <p className="text-sm text-slate-800 line-clamp-6 italic">"{selection}"</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">AUTHOR</label>
        <select 
          className="w-full p-2 text-sm border rounded bg-white"
          value={formData.author}
          onChange={e => setFormData({...formData, author: e.target.value})}
        >
          <option>Bahá’u’lláh</option>
          <option>The Báb</option>
          <option>Abdu'l-Baha</option>
          <option>Shoghi Effendi</option>
          <option>Universal House of Justice</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">UNIT TYPE</label>
        <select 
          className="w-full p-2 text-sm border rounded bg-white"
          value={formData.unit_type}
          onChange={e => setFormData({...formData, unit_type: e.target.value})}
        >
          <option value="tablet">Tablet</option>
          <option value="prayer">Prayer</option>
          <option value="talk">Talk</option>
          <option value="history">Historical Account</option>
          <option value="question">Question & Answer</option>
        </select>
      </div>
      <div className="mb-4">
        <TagInput 
          selectedTags={formData.tags}
          onChange={(ids) => setFormData({...formData, tags: ids})} 
        />
      </div>
      <div className="flex gap-2 pt-2">
        <button 
          type="button" 
          onClick={onCancel}
          className="flex-1 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded"
        >
          Cancel
        </button>
        <button 
          type="submit" 
          disabled={isSubmitting}
          className="flex-1 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : 'Save Unit'}
        </button>
      </div>
    </form>
  );
};
