/**
 * Calculates the absolute start/end character indices of a DOM Range
 * relative to the main article container (#mw-content-text).
 */
export const calculateOffsets = (range: Range, containerSelector: string = '#mw-content-text') => {
    const container = document.querySelector(containerSelector);
    if (!container) return null;

    // 1. Create a Range that spans from the start of the article to the start of the selection
    const preSelectionRange = document.createRange();
    preSelectionRange.selectNodeContents(container);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);

    // 2. The string length of that range is our "Start Index"
    const start = preSelectionRange.toString().length;

    // 3. The length of the user's selection
    const length = range.toString().length;

    return {
        start_char_index: start,
        end_char_index: start + length
    };
};

/**
 * REVERSE OPERATION:
 * Finds a text node in the DOM based on a DB character index.
 * Used for the "Highlighter" (Read Path).
 */
export const findRangeFromOffsets = (start: number, end: number, containerSelector: string = '#mw-content-text') => {
    // This is complex - it requires a TreeWalker to count characters
    // I can provide this implementation if you are ready for the "Read" path logic.
    return null; 
};
