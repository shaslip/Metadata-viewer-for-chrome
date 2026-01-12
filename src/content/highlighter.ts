import { getPageMetadata } from './scraper';
import { findRangeFromOffsets } from '@/utils/offset_calculator';
import { LogicalUnit } from '@/utils/types';

export const initHighlighter = async () => {
    const meta = getPageMetadata();
    
    // 1. Ask Background script to fetch data
    const response = await chrome.runtime.sendMessage({
        type: 'FETCH_PAGE_DATA',
        source_code: meta.source_code,
        source_page_id: meta.source_page_id
    });

    if (response && response.units) {
        console.log(`[Highlighter] Found ${response.units.length} units.`);
        response.units.forEach((unit: LogicalUnit) => {
            highlightUnit(unit);
        });
    }
};

const highlightUnit = (unit: LogicalUnit) => {
    try {
        // 2. Convert DB Ints -> DOM Range
        const range = findRangeFromOffsets(unit.start_char_index, unit.end_char_index);
        
        if (!range) {
            console.warn(`Could not map unit ${unit.id} to DOM. Content may have changed.`);
            return;
        }

        // 3. Safe Highlight (Recursive)
        // Replaces range.surroundContents(wrapper) which fails on complex DOMs
        safeHighlightRange(range, unit);

    } catch (e) {
        console.error("Highlight error for unit", unit.id, e);
    }
};

/**
 * Safely wraps a Range in highlight spans, even if it crosses HTML boundaries.
 */
const safeHighlightRange = (range: Range, unit: LogicalUnit) => {
    const startNode = range.startContainer;
    const endNode = range.endContainer;
    const commonAncestor = range.commonAncestorContainer;

    // Create a TreeWalker to find all text nodes within the range
    const walker = document.createTreeWalker(
        commonAncestor,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                // Only accept nodes that are physically intersecting the range
                if (range.intersectsNode(node)) return NodeFilter.FILTER_ACCEPT;
                return NodeFilter.FILTER_REJECT;
            }
        }
    );

    const nodesToWrap: { node: Node, start: number, end: number }[] = [];

    let currentNode = walker.nextNode();
    while (currentNode) {
        // Calculate the slice for this specific text node
        const isStartNode = (currentNode === startNode);
        const isEndNode = (currentNode === endNode);
        
        const startOffset = isStartNode ? range.startOffset : 0;
        const endOffset = isEndNode ? range.endOffset : (currentNode.textContent?.length || 0);

        // Store instruction (don't modify DOM while walking it!)
        if (currentNode.textContent && currentNode.textContent.trim().length > 0) {
             nodesToWrap.push({ node: currentNode, start: startOffset, end: endOffset });
        }
       
        currentNode = walker.nextNode();
    }

    console.log(`[Highlighter] Unit ${unit.id}: Wrapping ${nodesToWrap.length} text nodes.`);

    // Apply Wrappers
    nodesToWrap.forEach(({ node, start, end }) => {
        const wrapper = document.createElement('span');
        wrapper.className = `rag-highlight unit-type-${unit.unit_type || 'default'}`;
        wrapper.dataset.unitId = String(unit.id);
        
        // Add Click Listener
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
