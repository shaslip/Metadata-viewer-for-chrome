const API_BASE = "https://digitalbahairesources.org";
const UNITS_ENDPOINT = "/api/units";

// 1. SIDE PANEL TOGGLE
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.setOptions({
        tabId: tab.id,
        path: 'public/side_panel.html',
        enabled: true
    });
    (chrome.sidePanel as any).open({ tabId: tab.id });
});

// 2. UNIFIED MESSAGE HANDLER
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    if (request.type === 'PERFORM_HANDSHAKE') {
        performHandshake(request.credentials).then(sendResponse);
        return true; 
    }

    if (request.type === 'FETCH_PAGE_DATA') {
        fetchPageData(request.source_code, request.source_page_id).then(sendResponse);
        return true; 
    }

    // --- Handle Refresh Trigger from Side Panel ---
    if (request.type === 'REFRESH_HIGHLIGHTS') {
        const targetTabId = sender.tab?.id || request.tabId;
        if (targetTabId) {
             chrome.tabs.sendMessage(targetTabId, { type: 'TRIGGER_DATA_RELOAD' });
        } else {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    chrome.tabs.sendMessage(tabs[0].id, { type: 'TRIGGER_DATA_RELOAD' });
                }
            });
        }
        return true;
    }

    if (request.type === 'UNIT_CLICKED') {
        console.log("Unit clicked:", request.unit);
        
        // 1. Open the Side Panel
        if (sender.tab?.id) {
            (chrome.sidePanel as any).open({ tabId: sender.tab.id });
            
            // 2. Relay the message to the side panel
            setTimeout(() => {
                chrome.runtime.sendMessage({ ...request, fromBackground: true });
            }, 500);
        }
    }
    
    if (request.type === 'NAVIGATE_TO_UNIT') {
        const { source_code, source_page_id, unit_id, title } = request;

        // 1. Resolve Base URL (Adjust domains if necessary)
        let baseUrl = 'https://bahai.works'; 
        if (source_code === 'bp') baseUrl = 'https://bahaipedia.org';
        if (source_code === 'bd') baseUrl = 'https://bahaidata.org';
        if (source_code === 'bm') baseUrl = 'https://bahai.media';

        // MediaWiki standard URL pattern
        let targetUrl = `${baseUrl}/index.php?curid=${source_page_id}`;
        if (title) {
            const safeTitle = title.replace(/ /g, '_'); 
            targetUrl = `${baseUrl}/${encodeURIComponent(safeTitle)}`;
        } else {
            console.warn(`[Nav] Title missing for PageID ${source_page_id}. Falling back to curid.`);
        }

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTab = tabs[0];
            if (!currentTab?.id) return;

            // 2. Check if we are already on the correct page
            // We check if the URL contains the Page ID
            const isOnPage = currentTab.url && currentTab.url.includes(`curid=${source_page_id}`);

            if (isOnPage) {
                // A. Same Page: Just Scroll
                chrome.tabs.sendMessage(currentTab.id, { 
                    type: 'SCROLL_TO_UNIT', 
                    unit_id 
                });
            } else {
                // B. Different Page: Navigate -> Wait for Load -> Scroll
                chrome.tabs.update(currentTab.id, { url: targetUrl }, (tab) => {
                    // Add a one-time listener to wait for the page to finish loading
                    const listener = (tabId: number, changeInfo: any) => {
                        if (tabId === tab?.id && changeInfo.status === 'complete') {
                            chrome.tabs.sendMessage(tabId, { 
                                type: 'SCROLL_TO_UNIT', 
                                unit_id 
                            });
                            chrome.tabs.onUpdated.removeListener(listener);
                        }
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                });
            }
        });
    }
});

// 3. PAGE DATA FETCH (Replicating useApi logic without Hooks)
async function fetchPageData(sourceCode: string, sourcePageId: number) {
    try {
        // 1. Get Token (Same as useApi)
        const storage = await chrome.storage.local.get(['api_token']);
        const token = storage.api_token;
        
        if (!token) {
            console.warn("[Background] No token found. Cannot fetch units.");
            return { units: [] };
        }

        // 2. Construct URL
        const url = new URL(`${API_BASE}${UNITS_ENDPOINT}`);
        url.searchParams.append('source_code', sourceCode);
        url.searchParams.append('source_page_id', String(sourcePageId));

        // 3. Fetch (Same headers as useApi)
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            console.error(`[Background] API Error ${response.status}: ${response.statusText}`);
            return { units: [] };
        }

        const data = await response.json();
        
        // Ensure we return the array expected by highlighter.ts
        // If your API returns { units: [...] }, use data.units. If it returns the array directly, use data.
        return { units: data.units || data }; 

    } catch (e) {
        console.error("[Background] Network error fetching page data:", e);
        return { units: [] };
    }
}

// 4. AUTH HANDSHAKE (Unchanged)
async function performHandshake(credentials?: {username: string, password: string}) {
    try {
        if (!credentials) return { success: false, error: "Credentials missing" };
        
        const response = await fetch(`${API_BASE}/auth/verify-session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                username: credentials.username, 
                bot_password: credentials.password 
            })
        });

        if (!response.ok) {
            return { success: false, error: `Login Failed: ${response.statusText}` };
        }

        const data = await response.json();
        await chrome.storage.local.set({ 
            api_token: data.token,
            user_info: { username: data.username, role: data.role }
        });

        return { success: true, user: data.username };

    } catch (err: any) {
        return { success: false, error: err.message };
    }
}
