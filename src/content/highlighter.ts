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
            await verifyAndHealUnits(); // This renders the footer AND highlights
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
            
            // [FIX] Always re-verify to keep Footer in sync with Highlights
            verifyAndHealUnits(); 
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

// Helper: Extract ONLY visible text
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
    const brokenUnits: LogicalUnit[] = []; 
    
    let lazyPageText: string | null = null;
    const getPageText = () => {
        if (!lazyPageText) lazyPageText = getContentText();
        return lazyPageText;
    };

    const normalize = (str: string) => str.replace(/\s+/g, ' ').trim();

    cachedUnits.forEach(unit => {
        // [FIX] Explicitly treat 0/null as false to avoid type coercion issues
        const isMarkedBroken = !!(unit as any).broken_index;

        // If explicitly broken in DB, trust it (unless we want to auto-retry, but let's stick to DB)
        if (isMarkedBroken) {
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

        if (isHealthy) {
            // [FIX] Safety: Ensure broken_index is cleared in memory if it was somehow set
            if ((unit as any).broken_index) {
                (unit as any).broken_index = 0;
            }
            return;
        }

        // 2. HEAL
        const pageText = getPageText();
        if (!pageText) {
             brokenUnits.push(unit);
             return;
        }

        let result = null;
        for (const size of ANCHOR_RETRY_SIZES) {
             result = performAnchorSearch(unit, pageText, size);
             if (result) break; 
        }

        if (result) {
            console.log(`[Healer] Repaired Unit ${unit.id} using anchor size ${result.usedAnchorSize}.`);
            unit.start_char_index = result.start;
            unit.end_char_index = result.end;
            unit.text_content = result.newText;
            (unit as any).broken_index = 0; // Ensure clean state

            updatesToSync.push({
                id: unit.id,
                start_char_index: result.start,
                end_char_index: result.end,
                text_content: result.newText,
                broken_index: 0
            });
        } else {
            console.warn(`[Healer] Failed Unit ${unit.id} after all attempts.`);
            (unit as any).broken_index = 1;
            updatesToSync.push({ id: unit.id, broken_index: 1 });
            brokenUnits.push(unit); 
        }
    });

    // [FIX] This must run every time to clear the footer if brokenUnits is empty
    renderBrokenLinksFooter(brokenUnits);
    
    // Always re-render highlights to reflect the current broken/healthy state
    renderHighlights();

    if (updatesToSync.length > 0) {
        chrome.runtime.sendMessage({
            type: 'BATCH_REALIGN_UNITS',
            updates: updatesToSync
        });
    }
};

const renderBrokenLinksFooter = (brokenUnits: LogicalUnit[]) => {
    const existing = document.getElementById('rag-broken-footer');
    if (existing) existing.remove();

    if (brokenUnits.length === 0) {
        document.body.style.paddingBottom = ''; 
        return;
    }

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

    const label = document.createElement('div');
    label.style.cssText = 'color: #be123c; font-weight: bold; font-size: 14px; display: flex; align-items: center; gap: 8px;';
    label.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path fill-rule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clip-rule="evenodd" />
        </svg>
        ${brokenUnits.length} Broken Link(s):
    `;
    container.appendChild(label);

    brokenUnits.forEach(unit => {
        const btn = document.createElement('button');
        btn.textContent = `Jump to #${unit.id}`;
        btn.title = `Original text: "${unit.text_content.substring(0, 100)}..."`;
        btn.style.cssText = `
            background: #fff; border: 1px solid #e11d48; color: #e11d48;
            padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;
            font-weight: 600; transition: all 0.2s; white-space: nowrap;
        `;
        
        btn.addEventListener('mouseenter', () => { btn.style.background = '#e11d48'; btn.style.color = '#fff'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = '#fff'; btn.style.color = '#e11d48'; });

        btn.onclick = () => {
            chrome.runtime.sendMessage({ type: 'UNIT_CLICKED', unit });
        };
        container.appendChild(btn);
    });

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = 'margin-left: auto; background: none; border: none; font-size: 24px; color: #881337; cursor: pointer;';
    closeBtn.onclick = () => { container.remove(); document.body.style.paddingBottom = ''; };
    container.appendChild(closeBtn);

    document.body.appendChild(container);
    document.body.style.paddingBottom = '70px';
};

const performAnchorSearch = (unit: LogicalUnit, pageText: string, anchorSize: number) => {
    const originalText = unit.text_content;
    const originalStart = unit.start_char_index;
    if (anchorSize * 2 > originalText.length) return null;

    const headAnchor = originalText.substring(0, anchorSize);
    const tailAnchor = originalText.substring(originalText.length - anchorSize);
    const searchStart = Math.max(0, originalStart - SEARCH_RADIUS);
    const searchEnd = Math.min(pageText.length, originalStart + originalText.length + SEARCH_RADIUS);
    const neighborhood = pageText.substring(searchStart, searchEnd);

    const findAllIndices = (haystack: string, needle: string, offset: number) => {
        const indices = [];
        let idx = haystack.indexOf(needle);
        while (idx !== -1) {
            indices.push(offset + idx);
            idx = haystack.indexOf(needle, idx + 1);
        }
        return indices;
    };

    let headCandidates = findAllIndices(neighborhood, headAnchor, searchStart);
    if (headCandidates.length === 0) headCandidates = findAllIndices(pageText, headAnchor, 0);
    if (headCandidates.length === 0) return null;

    let bestMatch = null;
    let minDiff = Infinity;

    for (const startPos of headCandidates) {
        const expectedEnd = startPos + originalText.length;
        const windowEnd = Math.min(pageText.length, expectedEnd + SEARCH_RADIUS); 
        const searchWindow = pageText.substring(startPos, windowEnd);
        const tailRelIndex = searchWindow.indexOf(tailAnchor, anchorSize); 

        if (tailRelIndex !== -1) {
            const endPos = startPos + tailRelIndex + anchorSize;
            const newText = pageText.substring(startPos, endPos);
            const lenDiff = Math.abs(newText.length - originalText.length);
            const allowedDiff = Math.max(50, originalText.length * 0.5);

            if (lenDiff < allowedDiff && lenDiff < minDiff) {
                minDiff = lenDiff;
                bestMatch = { start: startPos, end: endPos, newText, usedAnchorSize: anchorSize };
            }
        }
    }
    return bestMatch;
};

const renderHighlights = () => {
    document.querySelectorAll('.rag-highlight').forEach(el => {
        const parent = el.parentNode;
        if (parent) {
            while (el.firstChild) parent.insertBefore(el.firstChild, el);
            parent.removeChild(el);
        }
    });

    const unitsToRender = cachedUnits.filter(unit => {
        if ((unit as any).broken_index) return false;
        if (currentMode === 'TAXONOMY_MODE') return unit.unit_type === 'user_highlight';
        if (currentMode === 'CREATE_MODE') return !['canonical_answer', 'link_subject', 'link_object', 'user_highlight'].includes(unit.unit_type); 
        if (currentMode === 'QA_MODE') return unit.unit_type === 'canonical_answer';
        if (currentMode === 'RELATIONS_MODE') return unit.unit_type === 'link_subject' || unit.unit_type === 'link_object';
        return false; 
    });

    unitsToRender.forEach(highlightUnit);

    if (pendingScrollId) {
        attemptScroll();
    }
};

const attemptScroll = (attempts = 10) => {
    if (!pendingScrollId) return;
    const el = document.querySelector(`.rag-highlight[data-unit-id="${pendingScrollId}"]`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const originalTransition = (el as HTMLElement).style.transition;
        const originalBg = (el as HTMLElement).style.backgroundColor;
        (el as HTMLElement).style.transition = "background-color 0.5s ease";
        (el as HTMLElement).style.backgroundColor = "rgba(255, 235, 59, 0.8)";
        setTimeout(() => {
            (el as HTMLElement).style.backgroundColor = originalBg;
            setTimeout(() => { (el as HTMLElement).style.transition = originalTransition; }, 500);
        }, 1500);
        pendingScrollId = null; 
    } else if (attempts > 0) {
        setTimeout(() => attemptScroll(attempts - 1), 250);
    } else {
        console.warn(`Unit ${pendingScrollId} not found in DOM after retries.`);
        pendingScrollId = null;
    }
};

const highlightUnit = (unit: LogicalUnit) => {
    try {
        const range = findRangeFromOffsets(unit.start_char_index, unit.end_char_index);
        if (!range) return;
        safeHighlightRange(range, unit);
    } catch (e) {
        console.error("Highlight error for unit", unit.id, e);
    }
};

const safeHighlightRange = (range: Range, unit: LogicalUnit) => {
    const commonAncestor = range.commonAncestorContainer;
    const nodesToWrap: { node: Node, start: number, end: number }[] = [];

    if (commonAncestor.nodeType === Node.TEXT_NODE) {
        nodesToWrap.push({ node: commonAncestor, start: range.startOffset, end: range.endOffset });
    } else {
        const walker = document.createTreeWalker(
            commonAncestor, NodeFilter.SHOW_TEXT,
            { acceptNode: (node) => range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }
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
        wrapper.addEventListener('mouseenter', () => document.querySelectorAll(`.rag-highlight[data-unit-id="${unit.id}"]`).forEach(el => el.classList.add('active')));
        wrapper.addEventListener('mouseleave', () => document.querySelectorAll(`.rag-highlight[data-unit-id="${unit.id}"]`).forEach(el => el.classList.remove('active')));
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
