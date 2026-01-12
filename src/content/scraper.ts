import { PageMetadata } from '@/utils/types';

export const getPageMetadata = (): PageMetadata => {
    const html = document.body.innerHTML;
    const url = window.location.hostname;

    // 1. Determine Source Code
    let sourceCode = 'unknown';
    if (url.includes('bahai.works')) sourceCode = 'bw';
    else if (url.includes('bahaipedia.org')) sourceCode = 'bp';
    else if (url.includes('bahaidata.org')) sourceCode = 'bd';

    // 2. Extract MediaWiki ID (wgArticleId)
    const idMatch = html.match(/"wgArticleId":\s*(\d+)/);
    const pageId = idMatch ? parseInt(idMatch[1]) : 0;
    //const revMatch = html.match(/"wgCurRevisionId":\s*(\d+)/); 
    //const revId = revMatch ? parseInt(revMatch[1]) : 0;

    return {
        source_code: sourceCode,
        source_page_id: pageId,
        //latest_rev_id: revId,
        url: window.location.href,
        title: document.title.split(' - ')[0]
    };
};
