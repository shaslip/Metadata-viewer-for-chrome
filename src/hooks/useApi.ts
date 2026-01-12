import { useState } from 'react';

const API_BASE = "https://digitalbahairesources.org"; // Or localhost:3008

export const useApi = () => {
  const [error, setError] = useState<string | null>(null);

  const request = async (endpoint: string, method: string, body?: any) => {
    // 1. Get Token
    const storage = await chrome.storage.local.get(['api_token']);
    const token = storage.api_token;

    if (!token) throw new Error("No API token found. Please login.");

    // 2. Fetch
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'API Request failed');
    }

    return res.json();
  };

  return {
    get: (url: string) => request(url, 'GET'),
    post: (url: string, data: any) => request(url, 'POST', data),
    error
  };
};
