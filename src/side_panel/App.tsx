import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthGate } from './components/AuthGate';
import { MainLayout } from './components/Layout/MainLayout';
import { UnitCreator } from './features/UnitCreator';
import { RelationshipManager } from './features/RelationshipManager';
import { QAManager } from './features/QAManager';
import { TaxonomyExplorer } from './features/TaxonomyExplorer';
import { SelectionProvider } from './context/SelectionContext';

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
