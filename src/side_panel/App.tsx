import React, { useEffect, useState } from 'react';
import { AuthGate } from './components/AuthGate';
import { UnitForm } from './components/UnitForm';
import { PageMetadata, LogicalUnit } from '@/utils/types';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // STATE: CREATE MODE
  const [currentSelection, setCurrentSelection] = useState<string | null>(null);
  const [currentOffsets, setCurrentOffsets] = useState<{start: number; end: number} | null>(null);
  
  // STATE: VIEW MODE (The clicked unit)
  const [viewUnit, setViewUnit] = useState<LogicalUnit & { can_delete?: boolean } | null>(null);

  const [pageContext, setPageContext] = useState<PageMetadata | null>(null);

  useEffect(() => {
    chrome.storage.local.get(['api_token'], (result) => {
      if (result.api_token) setIsAuthenticated(true);
    });
  }, []);

  useEffect(() => {
    const handleMessage = (request: any) => {
      // CASE 1: USER HIGHLIGHTS NEW TEXT (Create Mode)
      if (request.type === 'TEXT_SELECTED') {
        setViewUnit(null); // Clear view mode
        setCurrentSelection(request.text);
        setPageContext(request.context);
        setCurrentOffsets(request.offsets); 
      }
      
      // CASE 2: USER CLICKS EXISTING HIGHLIGHT (View Mode)
      if (request.type === 'UNIT_CLICKED') {
        setCurrentSelection(null); // Clear create mode
        setCurrentOffsets(null);
        setViewUnit(request.unit);
        // Note: pageContext is usually already set, but we could request it if null
      }

      if (request.type === 'SELECTION_CLEARED') {
        setCurrentSelection(null);
        setCurrentOffsets(null);
        // We do NOT clear viewUnit here, so the user can keep reading the side panel
        // even if they click away on the page.
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  if (!isAuthenticated) {
    return <AuthGate onLogin={() => setIsAuthenticated(true)} />;
  }

  // RENDER LOGIC
  return (
    <div className="p-4 bg-slate-50 min-h-screen text-slate-800">
      <header className="mb-4 border-b border-slate-200 pb-2">
        <h1 className="text-lg font-bold text-slate-900">RAG Librarian</h1>
      </header>

      <main>
        {/* VIEW MODE */}
        {viewUnit ? (
           <UnitForm 
             context={pageContext}
             existingUnit={viewUnit} // Pass the existing unit
             onCancel={() => setViewUnit(null)}
             onSuccess={() => {
                setViewUnit(null);
                // Optional: Trigger a page refresh to remove the highlight
                chrome.tabs.reload(); 
             }}
           />
        ) : 
        /* CREATE MODE */
        currentSelection && currentOffsets ? (
          <UnitForm 
            selection={currentSelection} 
            context={pageContext} 
            offsets={currentOffsets} 
            onCancel={() => setCurrentSelection(null)}
          />
        ) : (
          /* IDLE STATE */
          <div className="text-center mt-10 text-slate-400">
            <p className="text-sm">Select text to contribute, or click a highlight to view details.</p>
          </div>
        )}
      </main>
    </div>
  );
}
