import { getPageMetadata } from './scraper';
import { findRangeFromOffsets } from '@/utils/offset_calculator';
import { LogicalUnit } from '@/utils/types';

export const initHighlighter = async () => {

    const meta = getPageMetadata();
    
    const response = await chrome.runtime.sendMessage({
        type: 'FETCH_PAGE_DATA',
        source_code: meta.source_code,
        source_page_id: meta.source_page_id
    });

    if (response && response.units) {
        response.units.forEach((unit: LogicalUnit) => {
            highlightUnit(unit);
        });
    }
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

    // CASE 1: Single Node
    if (commonAncestor.nodeType === Node.TEXT_NODE) {
        nodesToWrap.push({
            node: commonAncestor,
            start: range.startOffset,
            end: range.endOffset
        });
    } 
    // CASE 2: Multi Node
    else {
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
