export const getPageMetadata = () => {
    const html = document.body.innerHTML;
    const url = window.location.hostname;

    // 1. Determine Source Code
    let sourceCode = 'unknown';
    if (url.includes('bahai.works')) sourceCode = 'bw';
    else if (url.includes('bahaipedia.org')) sourceCode = 'bp';
    else if (url.includes('bahaidata.org')) sourceCode = 'bd';

    // 2. Extract MediaWiki ID (wgArticleId)
    // MediaWiki embeds this in a generic <script> block: "wgArticleId":10542,
    const idMatch = html.match(/"wgArticleId":\s*(\d+)/);
    const pageId = idMatch ? parseInt(idMatch[1]) : null;

    // 3. Extract Revision ID (wgCurRevisionId) for sync checks
    const revMatch = html.match(/"wgCurRevisionId":\s*(\d+)/);
    const revId = revMatch ? parseInt(revMatch[1]) : 0;

    return {
        source_code: sourceCode,
        source_page_id: pageId,
        latest_rev_id: revId,
        url: window.location.href,
        title: document.title.split(' - ')[0] // Cleanup "Title - Bahai.works"
    };
};
