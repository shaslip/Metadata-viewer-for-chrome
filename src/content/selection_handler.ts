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
            connected_anchors: [] // New Field
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
            // We scan the range for any other ID anchors the user dragged across
            const intermediateIds: number[] = [];
            
            if (startAnchorData.id !== endAnchorData?.id) {
                const walker = document.createTreeWalker(
                    range.commonAncestorContainer,
                    NodeFilter.SHOW_ELEMENT,
                    { acceptNode: (node) => {
                        // Check if node is an anchor, has ID, AND is inside range
                        if (isValidAnchor(node) && range.intersectsNode(node)) {
                            // Filter out the start anchor itself if caught
                            if ((node as Element).id !== String(startAnchorData.id)) {
                                return NodeFilter.FILTER_ACCEPT;
                            }
                        }
                        return NodeFilter.FILTER_SKIP;
                    }}
                );

                while (walker.nextNode()) {
                    const id = parseInt((walker.currentNode as Element).id);
                    if (!isNaN(id) && !intermediateIds.includes(id)) {
                        intermediateIds.push(id);
                    }
                }
            }

            // 4. Calculate Offsets
            // Start is relative to Start Anchor
            const startOffset = calculateRelativeOffset(startAnchorData.node, range.startContainer, range.startOffset);
            
            // End is relative to End Anchor (or Start Anchor if single paragraph)
            const targetEndAnchor = endAnchorData ? endAnchorData.node : startAnchorData.node;
            const endOffset = calculateRelativeOffset(targetEndAnchor, range.endContainer, range.endOffset);

            // 5. Construct Payload
            context.source_page_id = startAnchorData.id; // Primary ID
            payload.offsets = { start: startOffset, end: endOffset };
            payload.connected_anchors = intermediateIds; // [Middle... End]
            
            // Debug Log
            console.log(`Selection: Anchor ${startAnchorData.id} -> ${endAnchorData?.id || startAnchorData.id}`, payload);

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

        chrome.runtime.sendMessage(payload);

    }, 500);
};

// --- HELPERS ---

const isValidAnchor = (node: Node): boolean => {
    return (node instanceof Element) && 
           node.classList.contains('brl-location') && 
           !!node.id;
};

const findUpstreamAnchor = (startNode: Node | null): { id: number, node: Node } | null => {
    if (!startNode) return null;
    const docContent = document.querySelector('.library-document-content');
    if (!docContent) return null;

    const walker = document.createTreeWalker(
        docContent, 
        NodeFilter.SHOW_ELEMENT, 
        { acceptNode: (node) => {
            if (isValidAnchor(node)) return NodeFilter.FILTER_ACCEPT;
            return NodeFilter.FILTER_SKIP;
        }}
    );

    walker.currentNode = startNode;
    
    // If the startNode itself is an anchor (rare but possible), use it
    if (isValidAnchor(startNode)) {
        return { id: parseInt((startNode as Element).id), node: startNode };
    }

    const anchor = walker.previousNode();
    if (anchor) {
        return { id: parseInt((anchor as Element).id), node: anchor };
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
