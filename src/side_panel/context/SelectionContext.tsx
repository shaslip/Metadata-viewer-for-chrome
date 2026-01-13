import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PageMetadata, LogicalUnit } from '@/utils/types';

interface SelectionState {
  text: string;
  offsets: { start: number; end: number };
  context: PageMetadata;
}

interface SelectionContextType {
  // The raw text selection (Create Mode)
  currentSelection: SelectionState | null;
  // The clicked existing unit (View/Edit Mode)
  selectedUnit: (LogicalUnit & { can_delete?: boolean }) | null;
  
  clearSelection: () => void;
}

const SelectionContext = createContext<SelectionContextType | undefined>(undefined);

export const SelectionProvider = ({ children }: { children: ReactNode }) => {
  const [currentSelection, setCurrentSelection] = useState<SelectionState | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<(LogicalUnit & { can_delete?: boolean }) | null>(null);

  useEffect(() => {
    const handleMessage = (request: any) => {
      // CASE 1: New Text Selected
      if (request.type === 'TEXT_SELECTED') {
        setSelectedUnit(null); // Deselect existing unit
        setCurrentSelection({
          text: request.text,
          offsets: request.offsets,
          context: request.context
        });
      }
      
      // CASE 2: Existing Unit Clicked
      if (request.type === 'UNIT_CLICKED') {
        setCurrentSelection(null); // Deselect raw text
        setSelectedUnit(request.unit);
      }

      // CASE 3: Cleared
      if (request.type === 'SELECTION_CLEARED') {
        setCurrentSelection(null);
        // We do NOT clear selectedUnit here to allow reading while scrolling
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const clearSelection = () => {
    setCurrentSelection(null);
    setSelectedUnit(null);
  };

  return (
    <SelectionContext.Provider value={{ currentSelection, selectedUnit, clearSelection }}>
      {children}
    </SelectionContext.Provider>
  );
};

export const useSelection = () => {
  const context = useContext(SelectionContext);
  if (!context) throw new Error("useSelection must be used within a SelectionProvider");
  return context;
};
