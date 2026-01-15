import { getPageMetadata } from './scraper';
import { findRangeFromOffsets } from '@/utils/offset_calculator';
import { LogicalUnit } from '@/utils/types';

// --- Global State for Highlighter ---
let cachedUnits: LogicalUnit[] = [];
let currentMode: string = 'TAXONOMY_MODE';
let pendingScrollId: number | null = null;

// Constants for Healer
const ANCHOR_RETRY_SIZES = [50, 20];
const SEARCH_RADIUS = 2000;

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

// Helper: Extract ONLY visible text (ignores <script>, <style>, etc)
// This ensures our "Search" coordinates match what the user actually sees.
const getContentText = (): string => {
    const container = document.querySelector('#mw-content-text');
    if (!container) return "";
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    let text = "";
    let node;
    while ((node = walker.nextNode())) {
        text += node.textContent;
    }
    return text;
};

const verifyAndHealUnits = async () => {
    const updatesToSync: any[] = [];
    let lazyPageText: string | null = null;
    const getPageText = () => {
        if (!lazyPageText) lazyPageText = getContentText();
        return lazyPageText;
    };

    const normalize = (str: string) => str.replace(/\s+/g, ' ').trim();

    cachedUnits.forEach(unit => {
        if ((unit as any).broken_index) return;

        // 1. VERIFY
        let isHealthy = false;
        try {
            const range = findRangeFromOffsets(unit.start_char_index, unit.end_char_index);
            if (range) {
                const rangeText = range.toString();
                if (rangeText === unit.text_content || normalize(rangeText) === normalize(unit.text_content)) {
                    isHealthy = true;
                }
            }
        } catch (e) { isHealthy = false; }

        if (isHealthy) return;

        // 2. HEAL
        const pageText = getPageText();
        if (!pageText) return;

        // [NEW] Retry Loop for Anchors
        let result = null;
        for (const size of ANCHOR_RETRY_SIZES) {
             result = performAnchorSearch(unit, pageText, size);
             if (result) break; // Found it!
        }

        if (result) {
            console.log(`[Healer] Repaired Unit ${unit.id} using anchor size ${result.usedAnchorSize}.`);
            unit.start_char_index = result.start;
            unit.end_char_index = result.end;
            unit.text_content = result.newText;

            updatesToSync.push({
                id: unit.id,
                start_char_index: result.start,
                end_char_index: result.end,
                text_content: result.newText
            });
        } else {
            console.warn(`[Healer] Failed Unit ${unit.id} after all attempts.`);
            (unit as any).broken_index = 1;
            updatesToSync.push({ id: unit.id, broken_index: 1 });
        }
    });

    if (updatesToSync.length > 0) {
        chrome.runtime.sendMessage({
            type: 'BATCH_REALIGN_UNITS',
            updates: updatesToSync
        });
    }
};

const performAnchorSearch = (unit: LogicalUnit, pageText: string, anchorSize: number) => {
    const originalText = unit.text_content;
    const originalStart = unit.start_char_index;

    // Safety: Don't use anchors larger than half the text
    if (anchorSize * 2 > originalText.length) {
        return null;
    }

    const headAnchor = originalText.substring(0, anchorSize);
    const tailAnchor = originalText.substring(originalText.length - anchorSize);

    // Define Neighborhood
    const searchStart = Math.max(0, originalStart - SEARCH_RADIUS);
    const searchEnd = Math.min(pageText.length, originalStart + originalText.length + SEARCH_RADIUS);
    const neighborhood = pageText.substring(searchStart, searchEnd);

    // Helper: Find all occurrences of a string in a text block
    const findAllIndices = (haystack: string, needle: string, offset: number) => {
        const indices = [];
        let idx = haystack.indexOf(needle);
        while (idx !== -1) {
            indices.push(offset + idx);
            idx = haystack.indexOf(needle, idx + 1);
        }
        return indices;
    };

    // 1. Find all Head Candidates (Neighborhood first, then Global)
    let headCandidates = findAllIndices(neighborhood, headAnchor, searchStart);
    if (headCandidates.length === 0) {
        // Fallback: Global Search
        headCandidates = findAllIndices(pageText, headAnchor, 0);
    }
    if (headCandidates.length === 0) return null;

    // 2. Find Best Match
    let bestMatch = null;
    let minDiff = Infinity;

    for (const startPos of headCandidates) {
        // We only look for the tail AFTER the startPos
        // Optimization: Don't search the whole document, just a reasonable window after startPos
        const expectedEnd = startPos + originalText.length;
        const windowEnd = Math.min(pageText.length, expectedEnd + SEARCH_RADIUS); // Look forward 5000 chars
        const searchWindow = pageText.substring(startPos, windowEnd);

        const tailRelIndex = searchWindow.indexOf(tailAnchor, anchorSize); // Must appear AFTER head

        if (tailRelIndex !== -1) {
            const endPos = startPos + tailRelIndex + anchorSize;
            const newText = pageText.substring(startPos, endPos);
            
            const lenDiff = Math.abs(newText.length - originalText.length);
            // Allow 50% change or 50 chars (generous for deleted templates)
            const allowedDiff = Math.max(50, originalText.length * 0.5);

            if (lenDiff < allowedDiff && lenDiff < minDiff) {
                minDiff = lenDiff;
                bestMatch = { start: startPos, end: endPos, newText, usedAnchorSize: anchorSize };
            }
        }
    }

    return bestMatch;
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

    // 4. NEW: Check for pending scroll (Fixes race condition on new page load)
    if (pendingScrollId) {
        attemptScroll();
    }
};

// Helper to perform the scroll with Retry Logic
const attemptScroll = (attempts = 10) => {
    if (!pendingScrollId) return;

    const el = document.querySelector(`.rag-highlight[data-unit-id="${pendingScrollId}"]`);
    
    if (el) {
        // FOUND IT: Scroll and Flash
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        const originalTransition = (el as HTMLElement).style.transition;
        const originalBg = (el as HTMLElement).style.backgroundColor;
        
        (el as HTMLElement).style.transition = "background-color 0.5s ease";
        (el as HTMLElement).style.backgroundColor = "rgba(255, 235, 59, 0.8)"; // Bright Yellow

        setTimeout(() => {
            (el as HTMLElement).style.backgroundColor = originalBg;
            setTimeout(() => {
                (el as HTMLElement).style.transition = originalTransition;
            }, 500);
        }, 1500);

        pendingScrollId = null; // Clear queue
    } else if (attempts > 0) {
        // NOT FOUND YET: Retry in 250ms
        // IMPORTANT: No console.error here. We expect this to fail a few times.
        setTimeout(() => attemptScroll(attempts - 1), 250);
    } else {
        // ONLY log if we have run out of attempts (e.g. after ~2.5 seconds)
        console.warn(`Unit ${pendingScrollId} not found in DOM after retries.`);
        pendingScrollId = null;
    }
};

const highlightUnit = (unit: LogicalUnit) => {
    try {
        const range = findRangeFromOffsets(unit.start_char_index, unit.end_char_index);
        
        if (!range) {
            // console.warn(`Could not map unit ${unit.id} to DOM.`);
            return;
        }
        safeHighlightRange(range, unit);
    } catch (e) {
        console.error("Highlight error for unit", unit.id, e);
    }
};

const safeHighlightRange = (range: Range, unit: LogicalUnit) => {
    const commonAncestor = range.commonAncestorContainer;
    const nodesToWrap: { node: Node, start: number, end: number }[] = [];

    if (commonAncestor.nodeType === Node.TEXT_NODE) {
        nodesToWrap.push({
            node: commonAncestor,
            start: range.startOffset,
            end: range.endOffset
        });
    } else {
        const walker = document.createTreeWalker(
            commonAncestor,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    if (range.intersectsNode(node)) return NodeFilter.FILTER_ACCEPT;
                    return NodeFilter.FILTER_REJECT;
                }
            }
        );

        let currentNode = walker.nextNode();
        while (currentNode) {
            const isStartNode = (currentNode === range.startContainer);
            const isEndNode = (currentNode === range.endContainer);
            
            const startOffset = isStartNode ? range.startOffset : 0;
            const endOffset = isEndNode ? range.endOffset : (currentNode.textContent?.length || 0);

            if (currentNode.textContent && currentNode.textContent.trim().length > 0) {
                 nodesToWrap.push({ node: currentNode, start: startOffset, end: endOffset });
            }
            
            currentNode = walker.nextNode();
        }
    }

    nodesToWrap.forEach(({ node, start, end }) => {
        const wrapper = document.createElement('span');
        wrapper.className = `rag-highlight unit-type-${unit.unit_type || 'default'}`;
        wrapper.dataset.unitId = String(unit.id);
        
        wrapper.addEventListener('mouseenter', () => {
            const allParts = document.querySelectorAll(`.rag-highlight[data-unit-id="${unit.id}"]`);
            allParts.forEach(el => el.classList.add('active'));
        });

        wrapper.addEventListener('mouseleave', () => {
            const allParts = document.querySelectorAll(`.rag-highlight[data-unit-id="${unit.id}"]`);
            allParts.forEach(el => el.classList.remove('active'));
        });

        wrapper.addEventListener('click', (e) => {
            e.stopPropagation(); 
            chrome.runtime.sendMessage({ type: 'UNIT_CLICKED', unit });
        });

        const rangePart = document.createRange();
        rangePart.setStart(node, start);
        rangePart.setEnd(node, end);
        rangePart.surroundContents(wrapper);
    });
};
