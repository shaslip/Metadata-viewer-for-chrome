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
    const brokenUnits: LogicalUnit[] = []; // [NEW] Track failures locally
    
    let lazyPageText: string | null = null;
    const getPageText = () => {
        if (!lazyPageText) lazyPageText = getContentText();
        return lazyPageText;
    };

    const normalize = (str: string) => str.replace(/\s+/g, ' ').trim();

    cachedUnits.forEach(unit => {
        // If already marked broken in DB, add to list and skip check
        if ((unit as any).broken_index) {
             brokenUnits.push(unit);
             return;
        }

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
        if (!pageText) {
             // If we can't get page text, we can't heal, consider broken for this session
             brokenUnits.push(unit);
             return;
        }

        // Retry Loop for Anchors
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
            brokenUnits.push(unit); // [NEW] Add to broken list
        }
    });

    // [NEW] Render the Footer Alert
    renderBrokenLinksFooter(brokenUnits);

    if (updatesToSync.length > 0) {
        chrome.runtime.sendMessage({
            type: 'BATCH_REALIGN_UNITS',
            updates: updatesToSync
        });
    }
};

// [NEW] Footer Component Injection
const renderBrokenLinksFooter = (brokenUnits: LogicalUnit[]) => {
    // 1. Cleanup existing
    const existing = document.getElementById('rag-broken-footer');
    if (existing) existing.remove();

    if (brokenUnits.length === 0) {
        document.body.style.paddingBottom = ''; // Reset padding
        return;
    }

    // 2. Create Container
    const container = document.createElement('div');
    container.id = 'rag-broken-footer';
    container.style.cssText = `
        position: fixed; bottom: 0; left: 0; right: 0;
        background: #fff1f2; border-top: 3px solid #e11d48;
        padding: 12px 20px; z-index: 2147483647; font-family: sans-serif;
        box-shadow: 0 -4px 15px rgba(0,0,0,0.1);
        display: flex; gap: 15px; align-items: center; 
        flex-wrap: wrap;
    `;

    // 3. Label
    const label = document.createElement('div');
    label.style.cssText = 'color: #be123c; font-weight: bold; font-size: 14px; display: flex; align-items: center; gap: 8px;';
    label.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path fill-rule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clip-rule="evenodd" />
        </svg>
        ${brokenUnits.length} Broken Link(s):
    `;
    container.appendChild(label);

    // 4. Buttons for each unit
    brokenUnits.forEach(unit => {
        const btn = document.createElement('button');
        btn.textContent = `Jump to #${unit.id}`;
        btn.title = `Original text: "${unit.text_content.substring(0, 100)}..."`;
        btn.style.cssText = `
            background: #fff; border: 1px solid #e11d48; color: #e11d48;
            padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;
            font-weight: 600; transition: all 0.2s; white-space: nowrap;
        `;
        
        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#e11d48';
            btn.style.color = '#fff';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = '#fff';
            btn.style.color = '#e11d48';
        });

        btn.onclick = () => {
            // A. Open Sidebar if closed (optional, requires background support)
            // chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }); 

            // B. Send Click Event (Tags.tsx will catch this -> Expand Tree -> Reveal)
            chrome.runtime.sendMessage({ type: 'UNIT_CLICKED', unit });
        };

        container.appendChild(btn);
    });

    // 5. Close Button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.title = "Dismiss";
    closeBtn.style.cssText = `
        margin-left: auto; background: none; border: none; 
        font-size: 24px; color: #881337; cursor: pointer; line-height: 1;
    `;
    closeBtn.onclick = () => {
        container.remove();
        document.body.style.paddingBottom = '';
    };
    container.appendChild(closeBtn);

    // 6. Append
    document.body.appendChild(container);
    document.body.style.paddingBottom = '70px'; // Prevent content overlap
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
        // Never render broken units
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
        setTimeout(() => attemptScroll(attempts - 1), 250);
    } else {
        // ONLY log if we have run out of attempts
        console.warn(`Unit ${pendingScrollId} not found in DOM after retries.`);
        pendingScrollId = null;
    }
};

const highlightUnit = (unit: LogicalUnit) => {
    try {
        const range = findRangeFromOffsets(unit.start_char_index, unit.end_char_index);
        
        if (!range) {
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
