import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthGate } from './components/AuthGate';
import { MainLayout } from './components/Layout/MainLayout';
import { UnitCreator } from './features/UnitCreator';
import { RelationshipManager } from './features/RelationshipManager';
import { SelectionProvider } from './context/SelectionContext';

// Placeholder components for tabs we haven't built yet
const QAManager = () => <div className="p-4 text-center">Q&A Manager Coming Soon</div>;
const TaxonomyExplorer = () => <div className="p-4 text-center">Taxonomy Explorer Coming Soon</div>;

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(['api_token'], (result) => {
      if (result.api_token) setIsAuthenticated(true);
    });
  }, []);

  if (!isAuthenticated) {
    return <AuthGate onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <SelectionProvider>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<UnitCreator />} />
          <Route path="relations" element={<RelationshipManager />} />
          <Route path="qa" element={<QAManager />} />
          <Route path="taxonomy" element={<TaxonomyExplorer />} />
        </Route>
      </Routes>
    </SelectionProvider>
  );
}
