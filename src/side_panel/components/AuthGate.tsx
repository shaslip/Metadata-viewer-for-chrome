import React, { useState } from 'react';

interface Props {
  onLogin: () => void;
}

export const AuthGate: React.FC<Props> = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // New State for Credentials
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Send credentials to Background Script
      const response = await chrome.runtime.sendMessage({ 
        type: 'PERFORM_HANDSHAKE',
        credentials: { username, password }
      });

      if (response && response.success) {
        onLogin();
      } else {
        setError(response.error || "Login failed.");
      }
    } catch (err) {
      setError("Extension error: Could not reach background service.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen p-6 bg-slate-50 text-center dark:bg-slate-950">
      <div className="mb-6">
        <div className="w-16 h-16 bg-blue-600 rounded-full mx-auto flex items-center justify-center text-white text-2xl font-bold">
          B
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-800 dark:text-slate-100">Text Annotation Tool</h2>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded border border-red-200 w-full dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleConnect} className="w-full space-y-3">
        <input 
          type="text" 
          placeholder="Username (e.g. Sarah@Annotation)"
          className="w-full p-2 text-sm border rounded dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
          value={username}
          onChange={e => setUsername(e.target.value)}
          required
        />
        <input 
          type="password" 
          placeholder="Bot Password"
          className="w-full p-2 text-sm border rounded dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded shadow-sm disabled:opacity-50"
        >
          {loading ? 'Authenticating...' : 'Log In'}
        </button>
      </form>

      <div className="mt-6 text-xs text-slate-400 text-left dark:text-slate-500">
        <p className="mb-1 font-semibold">How to get a Bot Password:</p>
        <ol className="list-decimal pl-4 space-y-1">
          <li>Go to <b>Special:BotPasswords</b> on Bahai.works</li>
          <li>Create a new bot (e.g. named "AnnotationTool")</li>
          <li>Grant it <b>High-volume editing</b> (or basic rights)</li>
          <li>Copy the password generated there.</li>
        </ol>
      </div>
    </div>
  );
};
