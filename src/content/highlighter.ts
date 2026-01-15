import { getPageMetadata } from './scraper';
import { findRangeFromOffsets } from '@/utils/offset_calculator';
import { LogicalUnit } from '@/utils/types';

// --- Global State for Highlighter ---
let cachedUnits: LogicalUnit[] = [];
let currentMode: string = 'TAXONOMY_MODE';
let pendingScrollId: number | null = null;

// Constants for Healer
const ANCHOR_SIZE = 50; 
const SEARCH_RADIUS = 2000; // Search +/- 2000 chars around original spot

export const initHighlighter = async () => {
    // 1. Load active mode
    const storageResult = await chrome.storage.local.get('highlightMode');
    if (storageResult.highlightMode) {
        currentMode = storageResult.highlightMode;
    }
    
    // Define helper first
    const fetchAndRender = async () => {
        const meta = getPageMetadata(); 

        if (!meta.source_code || !meta.source_page_id) {
            console.warn("Highlighter: Missing metadata, skipping fetch.");
            return;
        }

        const response = await chrome.runtime.sendMessage({
            type: 'FETCH_PAGE_DATA',
            source_code: meta.source_code,
            source_page_id: meta.source_page_id
        });

        if (response && response.units) {
            cachedUnits = response.units;
            
            // [NEW] Run the Healer before rendering
            await verifyAndHealUnits();
            
            renderHighlights(); 
        }
    };

    // 2. REGISTER LISTENER FIRST
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        
        if (request.type === 'GET_PAGE_CONTEXT') {
            const meta = getPageMetadata();
            sendResponse(meta);
            return true; 
        }

        if (request.type === 'UPDATE_HIGHLIGHTS' && Array.isArray(request.units)) {
            const incomingIds = new Set(request.units.map((u: any) => u.id));
            // Remove old versions of incoming units, then add new ones
            cachedUnits = [
                ...cachedUnits.filter(u => !incomingIds.has(u.id)), 
                ...request.units
            ];
            // Note: We assume newly created units are correct, no healing needed immediately
            renderHighlights();
        }

        if (request.type === 'TRIGGER_DATA_RELOAD') {
            fetchAndRender();
        }

        if (request.type === 'SCROLL_TO_UNIT') {
            pendingScrollId = request.unit_id;
            if (cachedUnits.length > 0) {
                attemptScroll();
            }
            sendResponse({ success: true });
        }
    });

    // 3. Initial Fetch
    await fetchAndRender();

    // 4. Listen to Storage changes
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.highlightMode) {
            currentMode = changes.highlightMode.newValue;
            renderHighlights();
        }
    });
};

// --- [NEW] HEALING LOGIC ---

const verifyAndHealUnits = async () => {
    const fullPageText = document.body.textContent || "";
    const updatesToSync: any[] = [];
    
    // Helper to normalize text (ignore extra whitespace differences)
    const normalize = (str: string) => str.replace(/\s+/g, ' ').trim();

    cachedUnits.forEach(unit => {
        // Skip units already marked as broken by Admin (unless we want to auto-retry them?)
        // For now, let's try to heal everything that isn't already flagged broken locally.
        if ((unit as any).broken_index) return;

        const currentTextAtSpot = fullPageText.substring(unit.start_char_index, unit.end_char_index);
        
        // 1. HAPPY PATH: Exact Match
        if (currentTextAtSpot === unit.text_content) {
            return; // Perfect. Do nothing.
        }

        // 2. SOFT MATCH: Whitespace differences
        if (normalize(currentTextAtSpot) === normalize(unit.text_content)) {
            return; // Good enough. Do nothing.
        }

        // 3. ANCHOR SEARCH (The Healer)
        const healedOffsets = performAnchorSearch(unit, fullPageText);

        if (healedOffsets) {
            // Success! Update local cache immediately so it renders correctly
            unit.start_char_index = healedOffsets.start;
            unit.end_char_index = healedOffsets.end;
            
            // Queue for DB update
            updatesToSync.push({
                id: unit.id,
                start_char_index: healedOffsets.start,
                end_char_index: healedOffsets.end
            });
        } else {
            // Failure! Mark as broken locally and remotely
            (unit as any).broken_index = 1;
            updatesToSync.push({
                id: unit.id,
                broken_index: 1
            });
        }
    });

    // If we have any changes, send them to background
    if (updatesToSync.length > 0) {
        console.log(`[Healer] Patching ${updatesToSync.length} units.`);
        chrome.runtime.sendMessage({
            type: 'BATCH_REALIGN_UNITS',
            updates: updatesToSync
        });
    }
};

const performAnchorSearch = (unit: LogicalUnit, pageText: string) => {
    const originalStart = unit.start_char_index;
    const textLen = unit.text_content.length;
    
    // Define Neighborhood
    const searchStart = Math.max(0, originalStart - SEARCH_RADIUS);
    const searchEnd = Math.min(pageText.length, originalStart + textLen + SEARCH_RADIUS);
    const neighborhood = pageText.substring(searchStart, searchEnd);

    // Create Anchors
    const headAnchor = unit.text_content.substring(0, ANCHOR_SIZE);
    const tailAnchor = unit.text_content.substring(unit.text_content.length - ANCHOR_SIZE);

    // Search in Neighborhood
    const foundHeadRel = neighborhood.indexOf(headAnchor);
    const foundTailRel = neighborhood.lastIndexOf(tailAnchor); // Use lastIndexOf to find the end of the unit if multiple tags exist

    // Validation
    if (foundHeadRel !== -1 && foundTailRel !== -1) {
        // Calculate absolute positions
        const newStart = searchStart + foundHeadRel;
        const newEnd = searchStart + foundTailRel + ANCHOR_SIZE; // End of tail anchor

        // Sanity Check: Is the length roughly the same? (Allow for some growth/shrinkage due to edits)
        // If the user edited the text *between* the anchors heavily, the length might differ.
        const newLen = newEnd - newStart;
        const lenDiff = Math.abs(newLen - textLen);

        // Allow up to 20% size difference or 50 chars, whichever is greater, to account for edits.
        if (lenDiff < Math.max(50, textLen * 0.2)) {
             return { start: newStart, end: newEnd };
        }
    }

    return null; // Could not heal confidently
};

// --- RENDER LOGIC ---

const renderHighlights = () => {
    // 1. Clear Existing Highlights
    document.querySelectorAll('.rag-highlight').forEach(el => {
        const parent = el.parentNode;
        if (parent) {
            while (el.firstChild) parent.insertBefore(el.firstChild, el);
            parent.removeChild(el);
        }
    });

    // 2. Filter Units based on Mode AND Integrity
    const unitsToRender = cachedUnits.filter(unit => {
        // [NEW] Never render broken units
        if ((unit as any).broken_index) return false;

        // Mode Logic
        if (currentMode === 'TAXONOMY_MODE') return unit.unit_type === 'user_highlight';
        if (currentMode === 'CREATE_MODE') return !['canonical_answer', 'link_subject', 'link_object', 'user_highlight'].includes(unit.unit_type); 
        if (currentMode === 'QA_MODE') return unit.unit_type === 'canonical_answer';
        if (currentMode === 'RELATIONS_MODE') return unit.unit_type === 'link_subject' || unit.unit_type === 'link_object';

        return false; 
    });

    // 3. Draw
    unitsToRender.forEach(highlightUnit);

    // 4. Check for pending scroll
    if (pendingScrollId) {
        attemptScroll();
    }
};

// ... (attemptScroll, highlightUnit, safeHighlightRange remain unchanged) ...
