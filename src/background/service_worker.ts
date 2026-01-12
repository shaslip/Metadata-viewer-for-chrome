const API_BASE = "http://localhost:3008"; // Change to digitalbahairesources.org in prod

// 1. SIDE PANEL TOGGLE
// Opens the sidebar when the extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.setOptions({
        tabId: tab.id,
        path: 'public/side_panel.html',
        enabled: true
    });
    (chrome.sidePanel as any).open({ tabId: tab.id });
});

// 2. AUTHENTICATION HANDSHAKE
// Listens for a message from the Side Panel to start the login flow
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PERFORM_HANDSHAKE') {
        performHandshake().then(sendResponse);
        return true; // Async response
    }
});

async function performHandshake() {
    try {
        // A. Get the Wiki Session Cookie
        // We look for the specific cookie you identified: 'enworks_session'
        const cookie = await chrome.cookies.get({ 
            url: "https://bahai.works", 
            name: "enworks_session" 
        });

        if (!cookie) {
            return { success: false, error: "Not logged into Bahai.works" };
        }

        // B. Send to your Node API
        const response = await fetch(`${API_BASE}/auth/verify-session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_cookie: cookie.value })
        });

        const data = await response.json();

        if (!response.ok) {
            return { success: false, error: data.error || "Handshake failed" };
        }

        // C. Store the JWT
        // This JWT is now the "Master Key" for all write operations
        await chrome.storage.local.set({ 
            api_token: data.token,
            user_info: { username: data.username, role: data.role }
        });

        return { success: true, user: data.username };

    } catch (err: any) {
        return { success: false, error: err.message || "Unknown error" };
    }
}
