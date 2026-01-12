import { getPageMetadata } from './scraper';
import { initSelectionListener } from './selection_handler';
import { initHighlighter } from './highlighter';

console.log("RAG Librarian: Active");

// Initialize Write Path
initSelectionListener();

// Initialize Read Path
setTimeout(() => {
    initHighlighter();
}, 1000);

// Listen for requests from the Side Panel
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
