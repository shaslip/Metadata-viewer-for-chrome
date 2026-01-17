import { getPageMetadata } from './scraper';
import { calculateOffsets } from '@/utils/offset_calculator';
import { CURRENT_SITE } from '@/utils/site_config';

let debounceTimer: NodeJS.Timeout;

export const initSelectionListener = () => {
    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('keyup', handleSelection);
};

const handleSelection = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim();

        if (!selection || !selectedText || selectedText.length < 5) {
            chrome.runtime.sendMessage({ type: 'SELECTION_CLEARED' });
            return;
        }

        const context = getPageMetadata();
        const range = selection.getRangeAt(0);
        let payload: any = {
            type: 'TEXT_SELECTED',
            text: selectedText,
            context: context,
            offsets: { start: 0, end: 0 },
            connected_anchors: [] 
        };

        // ---------------------------------------------------------
        // STRATEGY: BAHAI.ORG (Anchor-Relative + Multi-Block)
        // ---------------------------------------------------------
        if (CURRENT_SITE.code === 'lib') {

            // 1. Find START Anchor
            const startAnchorData = findUpstreamAnchor(range.startContainer);
            if (!startAnchorData) {
                console.warn("Selection Handler: Could not find starting anchor.");
                return;
            }

            // 2. Find END Anchor
            const endAnchorData = findUpstreamAnchor(range.endContainer);
            
            // 3. Find INTERMEDIATE Anchors (if start != end)
            // We scan the range to capture any IDs we crossed over.
            const intermediateIds: number[] = [];
            
            if (endAnchorData && startAnchorData.id !== endAnchorData.id) {
                const commonAncestor = range.commonAncestorContainer;
                const walker = document.createTreeWalker(
                    commonAncestor.nodeType === Node.ELEMENT_NODE ? commonAncestor : commonAncestor.parentNode!,
                    NodeFilter.SHOW_ELEMENT,
                    { acceptNode: (node) => {
                        // Must be a valid ID anchor AND physically inside the selection range
                        if (isValidAnchor(node) && range.intersectsNode(node)) {
                            // Don't include the start anchor in the "connected" list
                            if ((node as Element).id !== String(startAnchorData.id)) {
                                return NodeFilter.FILTER_ACCEPT;
                            }
                        }
                        return NodeFilter.FILTER_SKIP;
                    }}
                );

                while (walker.nextNode()) {
                    const id = parseInt((walker.currentNode as Element).id);
                    if (!isNaN(id)) {
                        intermediateIds.push(id);
                    }
                }
                
                // Safety: Ensure the End Anchor is included if it wasn't picked up by the walker
                if (!intermediateIds.includes(endAnchorData.id)) {
                    intermediateIds.push(endAnchorData.id);
                }
            }

            // 4. Calculate Offsets
            // Start is relative to Start Anchor
            const startOffset = calculateRelativeOffset(startAnchorData.node, range.startContainer, range.startOffset);
            
            // End is relative to End Anchor (if multi-paragraph) OR Start Anchor (if single)
            const targetEndAnchor = endAnchorData ? endAnchorData.node : startAnchorData.node;
            const endOffset = calculateRelativeOffset(targetEndAnchor, range.endContainer, range.endOffset);

            // 5. Construct Payload
            context.source_page_id = startAnchorData.id; 
            payload.offsets = { start: startOffset, end: endOffset };
            payload.connected_anchors = intermediateIds; 
            
            console.log(`Selection: Anchor ${startAnchorData.id} -> ${endAnchorData?.id} (Connected: ${intermediateIds.length})`, payload);

        } else {
            // ---------------------------------------------------------
            // STRATEGY: MEDIAWIKI (Container-Relative)
            // ---------------------------------------------------------
            const contentContainer = document.querySelector(CURRENT_SITE.contentSelector);
            if (contentContainer && contentContainer.contains(selection.anchorNode)) {
                payload.offsets = calculateOffsets(range, CURRENT_SITE.contentSelector);
            } else {
                return; // Invalid container
            }
        }

        // [DEBUG]
        console.log("--- [V1 CHECK] Content Script Payload ---", {
            hasAnchors: "connected_anchors" in payload,
            anchorsValue: payload.connected_anchors,
            fullPayload: payload
        });

        chrome.runtime.sendMessage(payload);

    }, 500);
};

// --- HELPERS ---

const isValidAnchor = (node: Node): boolean => {
    return (node instanceof Element) && 
           node.classList.contains('brl-location') && 
           !!node.id;
};

// [CHANGED] Robust Traversal to find the "Header" anchor for any given node
const findUpstreamAnchor = (node: Node | null): { id: number, node: Node } | null => {
    let curr = node;

    // Traverse DOM upwards/backwards
    while (curr) {
        // 1. Check if 'curr' is the anchor
        if (isValidAnchor(curr)) {
            return { id: parseInt((curr as Element).id), node: curr };
        }

        // 2. Check Previous Siblings (The anchor is usually a sibling of the text node)
        let sib = curr.previousSibling;
        while (sib) {
            if (isValidAnchor(sib)) {
                return { id: parseInt((sib as Element).id), node: sib };
            }
            // If sibling is a wrapper (like .brl-head), look inside it
            if (sib.nodeType === Node.ELEMENT_NODE && (sib as Element).querySelector) {
                const childAnchor = (sib as Element).querySelector('.brl-location[id]');
                if (childAnchor) {
                     return { id: parseInt(childAnchor.id), node: childAnchor };
                }
            }
            sib = sib.previousSibling;
        }

        // 3. Move Up
        curr = curr.parentNode;
        
        // Boundary Check: Don't go outside the content area
        if (curr && (curr as Element).classList?.contains('library-document-content')) {
            break;
        }
    }
    return null;
};

// Calculate characters from the *end* of the anchor tag to the selection point
const calculateRelativeOffset = (anchorNode: Node, targetNode: Node, targetOffset: number): number => {
    const range = document.createRange();
    range.setStartAfter(anchorNode);
    range.setEnd(targetNode, targetOffset);
    return range.toString().length;
};
