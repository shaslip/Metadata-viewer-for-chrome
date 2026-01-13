import React from 'react';
import { PencilSquareIcon } from '@heroicons/react/24/outline';
import { useSelection } from '@/side_panel/context/SelectionContext';
import { UnitForm } from '@/side_panel/components/UnitForm';

export const UnitCreator = () => {
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

  // 2. Create Mode (New Selection)
  if (currentSelection) {
    return (
      <div className="p-4">
        <h2 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-wider">New Unit</h2>
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
      <PencilSquareIcon className="h-12 w-12 mb-2 opacity-20" /> {/* Import Icon if needed or remove */}
      <p className="text-sm">Highlight text on the page to create a new Logical Unit, or click an existing highlight to edit.</p>
    </div>
  );
};
