export interface SiteConfig {
    code: 'bw' | 'bp' | 'bd' | 'lib';
    contentSelector: string;
    isMediaWiki: boolean;
}

export const getSiteConfig = (): SiteConfig => {
    const hostname = window.location.hostname;

    if (hostname.includes('bahai.works')) {
        return { code: 'bw', contentSelector: '#mw-content-text', isMediaWiki: true };
    } 
    else if (hostname.includes('bahaipedia.org')) {
        return { code: 'bp', contentSelector: '#mw-content-text', isMediaWiki: true };
    }
    else if (hostname.includes('bahai.org')) {
        // We target the dynamic content wrapper
        return { code: 'lib', contentSelector: '.library-document-content', isMediaWiki: false };
    }

    return { code: 'bw', contentSelector: '#mw-content-text', isMediaWiki: true };
};

export const CURRENT_SITE = getSiteConfig();
