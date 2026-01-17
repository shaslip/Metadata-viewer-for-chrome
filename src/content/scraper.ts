import { PageMetadata } from '@/utils/types';
import { CURRENT_SITE } from '@/utils/site_config';

// [NEW] Simple hash to turn a URL path into a stable Integer ID
// Required because DB schema enforces source_page_id as INT
function getPathHash(path: string): number {
    let hash = 0;
    if (path.length === 0) return hash;
    for (let i = 0; i < path.length; i++) {
        const char = path.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash); // Ensure positive ID
}

function getPageAuthor(): string {
    // 1. Bahai.org specific extraction
    if (CURRENT_SITE.code === 'lib') {
        // Attempt to parse URL structure: /library/author-name/book-name
        const parts = window.location.pathname.split('/');
        if (parts[1] === 'library' && parts[2]) {
            // Convert "abdul-baha" to "Abdul-Baha"
            return parts[2].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
    }

    // 2. MediaWiki / Standard Fallback
    const headerEl = document.getElementById('header_author_text');
    if (headerEl) {
        const fn = headerEl.querySelector('.fn');
        return (fn?.textContent || headerEl.textContent || "Undefined").trim();
    }
    
    const metaAuthor = document.querySelector('meta[name="author"]');
    if (metaAuthor) {
        return metaAuthor.getAttribute('content') || "Undefined";
    }

    return "Undefined";
}

export const getPageMetadata = (): PageMetadata => {
    const html = document.documentElement.innerHTML;
    
    // 1. Source Code from Config
    const sourceCode = CURRENT_SITE.code;

    // 2. Extract ID (Wiki ID or Path Hash)
    let pageId = 0;
    let revId = 0;

    if (CURRENT_SITE.isMediaWiki) {
        const idJsonMatch = html.match(/"wgArticleId":\s*(\d+)/);
        const idVarMatch = html.match(/wgArticleId\s*=\s*(\d+)/);
        if (idJsonMatch) pageId = parseInt(idJsonMatch[1]);
        else if (idVarMatch) pageId = parseInt(idVarMatch[1]);

        const revJsonMatch = html.match(/"wgCurRevisionId":\s*(\d+)/);
        const revVarMatch = html.match(/wgCurRevisionId\s*=\s*(\d+)/);
        if (revJsonMatch) revId = parseInt(revJsonMatch[1]);
        else if (revVarMatch) revId = parseInt(revVarMatch[1]);
    } else {
        // Non-Wiki: Hash the pathname to create a stable ID
        pageId = getPathHash(window.location.pathname);
        // Rev ID is not applicable, use 1 or timestamp if needed. 
        revId = 1; 
    }

    return {
        source_code: sourceCode,
        source_page_id: pageId,
        latest_rev_id: revId,
        url: window.location.href,
        title: document.title.split(' - ')[0], // Bahai.org usually puts title first
        author: getPageAuthor()
    };
};
