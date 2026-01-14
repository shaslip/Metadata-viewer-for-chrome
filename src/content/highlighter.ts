import { getPageMetadata } from './scraper';
import { findRangeFromOffsets } from '@/utils/offset_calculator';
import { LogicalUnit } from '@/utils/types';

// --- Global State for Highlighter ---
let cachedUnits: LogicalUnit[] = [];
let currentMode: string = 'TAXONOMY_MODE';

export const initHighlighter = async () => {
    const meta = getPageMetadata();
    
    // 1. Load active mode
    const storageResult = await chrome.storage.local.get('highlightMode');
    if (storageResult.highlightMode) {
        currentMode = storageResult.highlightMode;
    }
    
    // Helper to run the fetch (Used by Init + Reload Trigger)
    const fetchAndRender = async () => {
        // Ensure we actually have the metadata required to fetch
        if (!meta.source_code || !meta.source_page_id) return;

        const response = await chrome.runtime.sendMessage({
            type: 'FETCH_PAGE_DATA',
            source_code: meta.source_code,
            source_page_id: meta.source_page_id
        });

        if (response && response.units) {
            cachedUnits = response.units;
            renderHighlights(); 
        }
    };

    // 2. Initial Fetch
    await fetchAndRender();

    // 3. Listen to Storage changes (Tab Switching)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.highlightMode) {
            currentMode = changes.highlightMode.newValue;
            renderHighlights();
        }
    });

    // 4. NEW: Listen for Relationship Updates from Side Panel
    chrome.runtime.onMessage.addListener((request) => {
        if (request.type === 'UPDATE_HIGHLIGHTS' && Array.isArray(request.units)) {
            // Merge incoming units into cache, overwriting duplicates by ID
            const incomingIds = new Set(request.units.map((u: any) => u.id));
            cachedUnits = [
                ...cachedUnits.filter(u => !incomingIds.has(u.id)), 
                ...request.units
            ];
            renderHighlights();
        }

        // --- Handle Data Reload (Triggered by Save) ---
        if (request.type === 'TRIGGER_DATA_RELOAD') {
            fetchAndRender();
        }
    });
};

const renderHighlights = () => {
    // 1. Clear Existing Highlights
    document.querySelectorAll('.rag-highlight').forEach(el => {
        const parent = el.parentNode;
        if (parent) {
            while (el.firstChild) parent.insertBefore(el.firstChild, el);
            parent.removeChild(el);
        }
    });

    // 2. Filter Units based on Mode
    const unitsToRender = cachedUnits.filter(unit => {
        // --- FIXED LOGIC HERE ---
        // OLD: return unit.unit_type === 'user_highlight'; 
        // PROBLEM: This hid all Tablets/Prayers (the base content).
        
        if (currentMode === 'TAXONOMY_MODE') {
             // Show User Highlights AND Base Content.
             // Hide only the "special" overlays (QA and Relations).
             return !['canonical_answer', 'link_subject', 'link_object'].includes(unit.unit_type);
        }

        if (currentMode === 'QA_MODE') {
            return unit.unit_type === 'canonical_answer';
        }
        
        if (currentMode === 'RELATIONS_MODE') {
            return unit.unit_type === 'link_subject' || unit.unit_type === 'link_object';
        }

        if (currentMode === 'CREATE_MODE') {
            // Label Tab: Show Base Content to edit it. Hide User Highlights/Relations.
            return !['canonical_answer', 'link_subject', 'link_object', 'user_highlight'].includes(unit.unit_type); 
        }
        
        return false; 
    });

    // 3. Draw
    unitsToRender.forEach(highlightUnit);
};

const highlightUnit = (unit: LogicalUnit) => {
    try {
        const range = findRangeFromOffsets(unit.start_char_index, unit.end_char_index);
        
        if (!range) {
            console.warn(`Could not map unit ${unit.id} to DOM.`);
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
        // Add specific class for CSS styling per mode if needed
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
