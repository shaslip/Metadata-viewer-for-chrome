import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PageMetadata, LogicalUnit } from '@/utils/types';

interface SelectionState {
  text: string;
  offsets: { start: number; end: number };
  context: PageMetadata;
  connected_anchors?: number[];
}

interface SelectionContextType {
  currentSelection: SelectionState | null;
  selectedUnit: (LogicalUnit & { can_delete?: boolean }) | null;
  clearSelection: () => void;
  viewMode: 'mine' | 'all';
  setViewMode: (mode: 'mine' | 'all') => void;
  refreshTrigger: number;
}

const SelectionContext = createContext<SelectionContextType | undefined>(undefined);

export const SelectionProvider = ({ children }: { children: ReactNode }) => {
  const [currentSelection, setCurrentSelection] = useState<SelectionState | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<(LogicalUnit & { can_delete?: boolean }) | null>(null);
  const [viewMode, setViewModeState] = useState<'mine' | 'all'>('mine');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Navigation Listener
  useEffect(() => {
    const handleTabUpdated = (tabId: number, changeInfo: any, tab: chrome.tabs.Tab) => {
      // Only refresh when page load completes and it is the active tab
      if (changeInfo.status === 'complete' && tab.active) {
        setRefreshTrigger(prev => prev + 1);
        clearSelection(); 
      }
    };

    const handleTabActivated = () => {
      setRefreshTrigger(prev => prev + 1);
      clearSelection();
    };

    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    chrome.tabs.onActivated.addListener(handleTabActivated);

    return () => {
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
      chrome.tabs.onActivated.removeListener(handleTabActivated);
    };
  }, []);

  useEffect(() => {
    const handleMessage = (request: any) => {
      // [DEBUG] 
      console.log("--- [V1 CHECK] Context Received ---", {
          type: request.type,
          hasAnchors: "connected_anchors" in request,
          anchorsValue: request.connected_anchors
      });

      // CASE 1: New Text Selected
      if (request.type === 'TEXT_SELECTED') {
        setSelectedUnit(null); 
        setCurrentSelection({
          text: request.text,
          offsets: request.offsets,
          context: request.context,
          connected_anchors: request.connected_anchors || []
        });
      }
      
      // CASE 2: Existing Unit Clicked
      if (request.type === 'UNIT_CLICKED') {
        setCurrentSelection(null); 
        setSelectedUnit(request.unit);
      }

      // CASE 3: Cleared
      if (request.type === 'SELECTION_CLEARED') {
        setCurrentSelection(null);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const clearSelection = () => {
    setCurrentSelection(null);
    setSelectedUnit(null);
  };

  const setViewMode = (mode: 'mine' | 'all') => {
    setViewModeState(mode);
    chrome.storage.local.set({ viewMode: mode });
  };

  return (
    <SelectionContext.Provider value={{ 
        currentSelection, 
        selectedUnit, 
        clearSelection, 
        viewMode, 
        setViewMode,
        refreshTrigger
    }}>
      {children}
    </SelectionContext.Provider>
  );
};

export const useSelection = () => {
  const context = useContext(SelectionContext);
  if (!context) throw new Error("useSelection must be used within a SelectionProvider");
  return context;
};
