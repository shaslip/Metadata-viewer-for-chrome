import React from 'react';
import { PencilSquareIcon } from '@heroicons/react/24/outline';
import { useSelection } from '@/side_panel/context/SelectionContext';
import { UnitForm } from '@/side_panel/components/UnitForm';

export const Label = () => {
  const { currentSelection, selectedUnit, clearSelection } = useSelection();

  // 1. Edit Mode (Existing Unit)
  if (selectedUnit) {
    return (
      <div className="p-4">
        <h2 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-wider">Edit Unit</h2>
        <UnitForm 
          existingUnit={selectedUnit}
          onCancel={clearSelection}
          onSuccess={() => {
             clearSelection();
             chrome.tabs.reload(); // Refresh to update highlights
          }}
        />
      </div>
    );
  }

  // 2. Label Mode (New Selection)
  if (currentSelection) {
    return (
      <div className="p-4">
        <h2 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-wider">New addition</h2>
        <UnitForm 
          selection={currentSelection.text}
          offsets={currentSelection.offsets}
          context={currentSelection.context}
          onCancel={clearSelection}
          onSuccess={() => {
             clearSelection();
             chrome.tabs.reload();
          }}
        />
      </div>
    );
  }

  // 3. Idle State
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-400">
      <p className="text-sm">This tab could be used to highlight a tablet from ‘Abdu’l-Bahá in Star of the West or a letter from the Guardian in Bahá’í News.</p> 
      <p className="text-sm">Drag your mouse over the content you want to highlight.</p>
      <PencilSquareIcon className="h-12 w-12 mb-2 opacity-20" /> {/* Import Icon if needed or remove */}
      <p className="text-sm">Doing so would allow bahai.chat to answer queries like 'Tell me about the tablets from ‘Abdu’l-Bahá that appeared in Star of the West in 1910'.</p>
    </div>
  );
};
