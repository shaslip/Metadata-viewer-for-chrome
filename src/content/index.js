import { getPageMetadata } from './scraper';

console.log("RAG Librarian: Active");

// Listen for requests from the Side Panel (React App)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // The Side Panel needs to know "Where are we?" to load the right data
    if (request.type === 'GET_PAGE_CONTEXT') {
        const meta = getPageMetadata();
        sendResponse(meta);
    }
    
    // The Side Panel wants to highlight a specific unit (e.g. user clicked a list item)
    if (request.type === 'HIGHLIGHT_UNIT') {
        // We will implement the DOM Highlighting logic next
        // highlightTextRange(request.unit); 
        console.log("Highlight requested for:", request.unit);
    }
});
