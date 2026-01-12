import React, { useState } from 'react';

interface Props {
  onLogin: () => void;
}

export const AuthGate: React.FC<Props> = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      // Send message to Background Script (service_worker.ts)
      // We cannot access cookies directly here in the Side Panel UI
      const response = await chrome.runtime.sendMessage({ type: 'PERFORM_HANDSHAKE' });

      if (response && response.success) {
        onLogin();
      } else {
        setError(response.error || "Connection failed. Are you logged into Bahai.works?");
      }
    } catch (err) {
      setError("Extension error: Could not reach background service.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen p-6 bg-slate-50 text-center">
      <div className="mb-6">
        {/* Placeholder Icon */}
        <div className="w-16 h-16 bg-blue-600 rounded-full mx-auto flex items-center justify-center text-white text-2xl font-bold">
          B
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-800">RAG Librarian</h2>
        <p className="text-sm text-slate-500 mt-2">
          Connect your account to curate the Knowledge Graph.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded border border-red-200 w-full">
          {error}
        </div>
      )}

      <button
        onClick={handleConnect}
        disabled={loading}
        className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded shadow-sm disabled:opacity-50 transition-colors"
      >
        {loading ? 'Verifying Session...' : 'Connect with Bahai.works'}
      </button>

      <p className="mt-4 text-xs text-slate-400">
        Requires an active session on bahai.works
      </p>
    </div>
  );
};
