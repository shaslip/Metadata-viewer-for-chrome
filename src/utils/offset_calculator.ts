/**
 * Calculates the absolute start/end character indices of a DOM Range
 * relative to the main article container (#mw-content-text).
 */
export const calculateOffsets = (range: Range, containerSelector: string = '#mw-content-text') => {
    const container = document.querySelector(containerSelector);
    if (!container) return { start: 0, end: 0 }; // Fallback

    // 1. Create a Range that spans from the start of the article to the start of the selection
    const preSelectionRange = document.createRange();
    preSelectionRange.selectNodeContents(container);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);

    // 2. The string length of that range is our "Start Index"
    const start = preSelectionRange.toString().length;

    // 3. The length of the user's selection
    const length = range.toString().length;

    return {
        start,
        end: start + length
    };
};

/**
 * REVERSE OPERATION:
 * Finds a text node in the DOM based on a DB character index.
 */
export const findRangeFromOffsets = (start: number, end: number, containerSelector: string = '#mw-content-text'): Range | null => {
    const container = document.querySelector(containerSelector);
    if (!container) return null;

    const range = document.createRange();
    let currentCharFieldIndex = 0;
    let startFound = false;
    let endFound = false;

    // TreeWalker flattens the DOM into a list of Text Nodes
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);

    let node;
    while ((node = walker.nextNode())) {
        const textLength = node.textContent?.length || 0;
        const nodeEndIndex = currentCharFieldIndex + textLength;

        // A. FIND START
        if (!startFound && start >= currentCharFieldIndex && start < nodeEndIndex) {
            range.setStart(node, start - currentCharFieldIndex);
            startFound = true;
        }

        // B. FIND END
        if (startFound && !endFound && end > currentCharFieldIndex && end <= nodeEndIndex) {
            range.setEnd(node, end - currentCharFieldIndex);
            endFound = true;
            break; // We are done
        }

        currentCharFieldIndex = nodeEndIndex;
    }

    return (startFound && endFound) ? range : null;
};
