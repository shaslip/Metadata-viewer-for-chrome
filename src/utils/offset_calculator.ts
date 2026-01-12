/**
 * Calculates the absolute start/end character indices of a DOM Range
 * relative to the main article container (#mw-content-text).
 */
export const calculateOffsets = (range: Range, containerSelector: string = '#mw-content-text') => {
    const container = document.querySelector(containerSelector);
    if (!container) return { start: 0, end: 0 }; 

    const preSelectionRange = document.createRange();
    preSelectionRange.selectNodeContents(container);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);

    const start = preSelectionRange.toString().length;
    const length = range.toString().length;

    return {
        start,
        end: start + length
    };
};

/**
 * REVERSE OPERATION:
 * Finds a text node in the DOM based on a DB character index.
 * * DEBUG MODE ENABLED
 */
export const findRangeFromOffsets = (start: number, end: number, containerSelector: string = '#mw-content-text'): Range | null => {
    const container = document.querySelector(containerSelector);
    if (!container) {
        console.error("Highlighter: Container not found", containerSelector);
        return null;
    }

    const range = document.createRange();
    let currentCharFieldIndex = 0;
    let startFound = false;
    let endFound = false;

    // TreeWalker flattens the DOM into a list of Text Nodes
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);

    console.groupCollapsed(`🔍 Debug Unit [${start} - ${end}]`);
    
    let node;
    let nodeCount = 0;

    while ((node = walker.nextNode())) {
        nodeCount++;
        const textContent = node.textContent || "";
        const textLength = textContent.length;
        const nodeStartIndex = currentCharFieldIndex;
        const nodeEndIndex = currentCharFieldIndex + textLength;

        // Log the first few nodes to check for hidden "garbage" text at the start
        if (nodeCount <= 5) {
            console.log(`Node ${nodeCount}: [${nodeStartIndex}-${nodeEndIndex}] "${textContent.substring(0, 20)}..."`);
        }

        // A. FIND START
        if (!startFound && start >= nodeStartIndex && start < nodeEndIndex) {
            console.log(`✅ Start matched at global index ${start} (Node relative: ${start - nodeStartIndex})`);
            console.log(`   Node content: "${textContent}"`);
            range.setStart(node, start - nodeStartIndex);
            startFound = true;
        }

        // B. FIND END
        if (startFound && !endFound) {
            // Check if the end is within this node
            if (end > nodeStartIndex && end <= nodeEndIndex) {
                 console.log(`✅ End matched at global index ${end} (Node relative: ${end - nodeStartIndex})`);
                 range.setEnd(node, end - nodeStartIndex);
                 endFound = true;
                 break; 
            }
        }

        currentCharFieldIndex = nodeEndIndex;
    }

    if (!startFound) {
        console.error(`❌ FAILED to find START. Searched ${currentCharFieldIndex} chars total. Target was ${start}.`);
    } else if (!endFound) {
        console.error(`❌ FAILED to find END. Searched ${currentCharFieldIndex} chars total. Target was ${end}.`);
    }

    console.groupEnd();

    return (startFound && endFound) ? range : null;
};
