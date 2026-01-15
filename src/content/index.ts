import { getPageMetadata } from './scraper';
import { initSelectionListener } from './selection_handler';
import { initHighlighter } from './highlighter';
import '../styles/highlights.css';

const init = () => {
    // 1. Check if we are on a MediaWiki site
    const isWiki = document.body.classList.contains('mediawiki');

    if (isWiki) {
        // STRICT RULE: If it's a wiki, we ONLY run if class 'action-view' is present.
        // This prevents running on Edit, History, Delete, Info, etc.
        if (!document.body.classList.contains('action-view')) {
            console.log("RAG Librarian: Wiki Action is not 'view'. Hibernating.");
            return;
        }

        // BLOCK: Special Pages (Login, Search, RecentChanges) and Diffs
        if (document.body.classList.contains('ns-special') || 
            document.body.classList.contains('ns--1') ||
            window.location.search.includes('diff=')) {
            console.log("RAG Librarian: Special/Diff page detected. Hibernating.");
            return;
        }
    }

    // 2. Global Guard: VisualEditor (Can trigger dynamically)
    if (document.body.classList.contains('ve-active')) {
        console.log("RAG Librarian: VisualEditor active. Hibernating.");
        return;
    }

    // -----------------------------------------------------------
    // Safe to Initialize
    // -----------------------------------------------------------
    console.log("RAG Librarian: Active (Read Mode)");

    // Initialize Write Path
    initSelectionListener();

    // Initialize Read Path
    setTimeout(() => {
        initHighlighter();
    }, 1000);
};

// Ensure DOM is ready (MediaWiki body classes might populate slightly after parse)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Listen for requests from the Side Panel
// We leave this outside the guard so the side panel doesn't hang if opened on an Edit page,
// even if functionality is limited.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // The Side Panel needs to know "Where are we?" to load the right data
    if (request.type === 'GET_PAGE_CONTEXT') {
        const meta = getPageMetadata();
        sendResponse(meta);
    }
    
    if (request.type === 'HIGHLIGHT_UNIT') {
        console.log("Highlight requested for:", request.unit);
    }
    
    // Return true to indicate we might respond asynchronously (though we aren't here)
    // checking specific types avoids errors
    return false;
});
