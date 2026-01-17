import { getPageMetadata } from './scraper';
import { findRangeFromOffsets } from '@/utils/offset_calculator'; // Only used for mediawiki
import { LogicalUnit } from '@/utils/types';
import { CURRENT_SITE } from '@/utils/site_config';

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
    // 1. Try MediaWiki container
    let container = document.querySelector('#mw-content-text');
    
    // 2. Try Bahai.org Library container
    // Hierarchy: body -> .reader-canvas -> .library-document -> .library-document-content
    if (!container && CURRENT_SITE.code === 'lib') {
        container = document.querySelector('.library-document-content') || 
                    document.querySelector('[data-unit="section"]') || 
                    document.body;
    }

    if (!container) return "";
    
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    let text = "";
    let node;
    while ((node = walker.nextNode())) {
        // [NEW] Skip page number text in the healer's extraction to match visual renderer
        if (node.parentElement?.closest('.brl-pnum')) continue;
        text += node.textContent;
    }
    return text;
};

// [CHANGED] Enhanced normalization to handle smart quotes
const normalize = (str: string) => {
    return str.replace(/\s+/g, ' ')
              .replace(/[\u2018\u2019]/g, "'") // Replace smart single quotes
              .replace(/[\u201C\u201D]/g, '"') // Replace smart double quotes
              .trim();
};

const verifyAndHealUnits = async () => {
    const updatesToSync: any[] = [];
    const brokenUnits: LogicalUnit[] = []; 
    
    let lazyPageText: string | null = null;
    const getPageText = () => {
        if (!lazyPageText) lazyPageText = getContentText();
        return lazyPageText;
    };

    cachedUnits.forEach(unit => {
        const isMarkedBroken = !!(unit as any).broken_index;

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
                // [CHANGED] Use the enhanced normalize function
                if (rangeText === unit.text_content || normalize(rangeText) === normalize(unit.text_content)) {
                    isHealthy = true;
                }
            }
        } catch (e) { isHealthy = false; }

        if (isHealthy) {
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
            (unit as any).broken_index = 0; 

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

    renderBrokenLinksFooter(brokenUnits);
    renderHighlights();

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
    // [CHANGED] Normalize inputs for search context
    const originalText = normalize(unit.text_content); 
    const originalStart = unit.start_char_index;

    // Safety: Don't use anchors larger than half the text
    if (anchorSize * 2 > originalText.length) {
        return null;
    }

    const headAnchor = originalText.substring(0, anchorSize);
    const tailAnchor = originalText.substring(originalText.length - anchorSize);

    // [CHANGED] Create a normalized version of the page text for searching
    // Since replacing smart quotes with ASCII quotes doesn't change string length, indices remain valid.
    const searchablePageText = normalize(pageText);

    // Define Neighborhood
    const searchStart = Math.max(0, originalStart - SEARCH_RADIUS);
    const searchEnd = Math.min(searchablePageText.length, originalStart + originalText.length + SEARCH_RADIUS);
    const neighborhood = searchablePageText.substring(searchStart, searchEnd);

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
        headCandidates = findAllIndices(searchablePageText, headAnchor, 0);
    }
    if (headCandidates.length === 0) return null;

    // 2. Find Best Match
    let bestMatch = null;
    let minDiff = Infinity;

    for (const startPos of headCandidates) {
        const expectedEnd = startPos + originalText.length;
        const windowEnd = Math.min(searchablePageText.length, expectedEnd + SEARCH_RADIUS); 
        const searchWindow = searchablePageText.substring(startPos, windowEnd);

        const tailRelIndex = searchWindow.indexOf(tailAnchor, anchorSize); 

        if (tailRelIndex !== -1) {
            const endPos = startPos + tailRelIndex + anchorSize;
            
            // IMPORTANT: Extract the *actual* text from the *original* pageText to preserve original formatting/quotes
            const newText = pageText.substring(startPos, endPos);
            
            // Compare lengths using normalized versions to avoid false mismatches
            const lenDiff = Math.abs(normalize(newText).length - originalText.length);
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

    console.log(`[Highlighter] Render called. Mode: ${currentMode}. Cached Units: ${cachedUnits.length}`);

    // 2. Filter Units
    const unitsToRender = cachedUnits.filter(unit => {
        // Check Broken Status
        if ((unit as any).broken_index) {
            console.log(`[Highlighter] Skipped Unit ${unit.id}: Marked as Broken.`);
            return false;
        }

        // Check Mode Logic
        let shouldRender = false;
        if (currentMode === 'TAXONOMY_MODE') shouldRender = (unit.unit_type === 'user_highlight');
        else if (currentMode === 'QA_MODE') shouldRender = (unit.unit_type === 'canonical_answer');
        else if (currentMode === 'RELATIONS_MODE') shouldRender = (unit.unit_type === 'link_subject' || unit.unit_type === 'link_object');
        else if (currentMode === 'CREATE_MODE') shouldRender = !['canonical_answer', 'link_subject', 'link_object', 'user_highlight'].includes(unit.unit_type);

        if (!shouldRender) {
            console.log(`[Highlighter] Skipped Unit ${unit.id}: Unit Type '${unit.unit_type}' does not match Mode '${currentMode}'.`);
        }
        
        return shouldRender;
    });

    console.log(`[Highlighter] Units passing filter: ${unitsToRender.length}`);

    // 3. Draw
    unitsToRender.forEach(highlightUnit);

    // 4. Scroll
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

// Main Highlight Loop
const highlightUnit = (unit: LogicalUnit) => {
    try {
        if (CURRENT_SITE.code === 'lib') {
            highlightLibUnit(unit);
        } else {
            // Existing MediaWiki Logic
            const range = findRangeFromOffsets(unit.start_char_index, unit.end_char_index);
            if (range) safeHighlightRange(range, unit);
        }
    } catch (e) {
        console.error("Highlight error for unit", unit.id, e);
    }
};

// Logic for Bahai.org
const highlightLibUnit = (unit: LogicalUnit) => {
    console.log(`[Highlighter] Processing Unit ${unit.id} (Bahai.org mode)`);
    
    const startId = unit.source_page_id;
    const connected = unit.connected_anchors || [];
    
    // 1. Lookup Anchor
    let startEl = document.getElementById(String(startId));
    if (!startEl) {
        const named = document.getElementsByName(String(startId));
        if (named.length > 0) startEl = named[0] as HTMLElement;
    }

    if (!startEl) {
        console.error(`[Highlighter] Unit ${unit.id}: Start Anchor ID '${startId}' NOT FOUND in DOM.`);
        return;
    }

    // 2. Lookup Scope
    if (!startEl.parentElement) {
        console.error(`[Highlighter] Unit ${unit.id}: Anchor '${startId}' has no parentElement.`);
        return;
    }

    const scope = startEl.parentElement;
    console.log(`[Highlighter] Unit ${unit.id}: Found Anchor. Scope is <${scope.tagName.toLowerCase()} class="${scope.className}">`);

    // 3. Render
    if (connected.length === 0) {
        console.log(`[Highlighter] Unit ${unit.id}: Rendering Single Paragraph (${unit.start_char_index} -> ${unit.end_char_index})`);
        renderRelativeRange(startEl, unit.start_char_index, unit.end_char_index, unit, scope);
    } else {
        console.log(`[Highlighter] Unit ${unit.id}: Rendering Multi-Part START (${unit.start_char_index} -> END)`);
        renderRelativeRange(startEl, unit.start_char_index, 99999, unit, scope);
    }

    // 4. Connected Anchors
    connected.forEach((anchorId, index) => {
        let anchorEl = document.getElementById(String(anchorId));
        if (!anchorEl || !anchorEl.parentElement) {
            console.warn(`[Highlighter] Unit ${unit.id}: Connected anchor ${anchorId} missing or detached.`);
            return;
        }

        const scope = anchorEl.parentElement;
        const isLast = index === connected.length - 1;
        console.log(`[Highlighter] Unit ${unit.id}: Rendering Connected Anchor ${anchorId} (Last? ${isLast})`);

        if (isLast) {
            renderRelativeRange(anchorEl, 0, unit.end_char_index, unit, scope);
        } else {
            renderRelativeRange(anchorEl, 0, 99999, unit, scope);
        }
    });
};

// Helper to Create Range relative to an Anchor
const renderRelativeRange = (
    anchorEl: HTMLElement, 
    startOffset: number, 
    endOffset: number, 
    unit: LogicalUnit, 
    scopeEl: HTMLElement
) => {
    const range = document.createRange();
    
    // 1. Start walker at Scope
    const walker = document.createTreeWalker(scopeEl, NodeFilter.SHOW_TEXT);
    
    let charCount = 0;
    let startFound = false;
    let node;
    let nodesScanned = 0;

    console.log(`[Highlighter] Starting Scan for Unit ${unit.id}. Offset Goal: ${startOffset}. Scope text length: ${scopeEl.textContent?.length}`);

    while ((node = walker.nextNode())) {
        nodesScanned++;

        // 2. Position Check
        if (anchorEl !== scopeEl) {
            const position = anchorEl.compareDocumentPosition(node);
            // We want nodes FOLLOWING (4) or CONTAINED_BY (16 - unlikely for text) the anchor
            if (!(position & Node.DOCUMENT_POSITION_FOLLOWING)) {
                // console.log(`[Highlighter] Node skipped (Precedes anchor): "${node.textContent?.substring(0, 10)}..."`);
                continue; 
            }
        }

        // 3. Noise Check
        if (node.parentElement?.closest('.brl-pnum')) {
            console.log(`[Highlighter] Node skipped (Noise/PageNum)`);
            continue;
        }

        const len = node.textContent?.length || 0;
        // console.log(`[Highlighter] Scanning Node: "${node.textContent?.substring(0,10)}..." (Len: ${len}, CurrentCount: ${charCount})`);
        
        // A. FIND START
        if (!startFound) {
            if (charCount + len >= startOffset) {
                console.log(`[Highlighter] START FOUND in node: "${node.textContent?.substring(0,20)}..." at offset ${startOffset - charCount}`);
                range.setStart(node, startOffset - charCount);
                startFound = true;
            }
        }
        
        // B. FIND END
        if (startFound) {
             if (charCount + len >= endOffset) {
                 console.log(`[Highlighter] END FOUND in node: "${node.textContent?.substring(0,20)}..." at offset ${endOffset - charCount}`);
                 range.setEnd(node, endOffset - charCount);
                 safeHighlightRange(range, unit); 
                 return;
             }
        }
        
        // Only increment if we are actively scanning valid text
        charCount += len;
        
        if (charCount > 50000) {
            console.warn(`[Highlighter] Force break: >50k chars scanned.`);
            break; 
        }
    }
    
    // C. Handle "Rest of Paragraph"
    if (startFound) {
        console.log(`[Highlighter] Reached End of Scope. capping selection.`);
        range.setEnd(node || anchorEl, node?.textContent?.length || 0);
        safeHighlightRange(range, unit);
    } else {
        console.error(`[Highlighter] FAILED. Scanned ${nodesScanned} nodes, ${charCount} chars. Never reached StartOffset ${startOffset}.`);
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
        
        // Ensure position is relative so z-index works
        wrapper.style.position = 'relative'; 

        wrapper.addEventListener('mouseenter', () => {
            const allParts = document.querySelectorAll(`.rag-highlight[data-unit-id="${unit.id}"]`);
            allParts.forEach(el => {
                el.classList.add('active');
                // Bring hovered item to front so nested inner items are clickable
                (el as HTMLElement).style.zIndex = '999'; 
            });
        });

        wrapper.addEventListener('mouseleave', () => {
            const allParts = document.querySelectorAll(`.rag-highlight[data-unit-id="${unit.id}"]`);
            allParts.forEach(el => {
                el.classList.remove('active');
                (el as HTMLElement).style.zIndex = 'auto';
            });
        });

        // [CHANGED] Simple, immediate click handler. Removed Double Click logic.
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
