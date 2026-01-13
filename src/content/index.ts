import { getPageMetadata } from './scraper';
import { initSelectionListener } from './selection_handler';
import { initHighlighter } from './highlighter';
import '../styles/highlights.css';

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

    if (request.type === 'SCROLL_TO_UNIT') {
        const unitId = request.unit_id;
        const element = document.querySelector(`.rag-highlight[data-unit-id="${unitId}"]`);
        
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Optional: Flash the element to make it obvious
            element.classList.add('flash-highlight'); // Define this in highlights.css
            setTimeout(() => element.classList.remove('flash-highlight'), 2000);
        } else {
            console.warn(`Unit ${unitId} not found in DOM.`);
        }
    }
    
    // Return true to indicate we might respond asynchronously (though we aren't here)
    // checking specific types avoids errors
    return false;
});
