```
metadata-viewer-for-chrome/
├── public/
│   ├── manifest.json              # V3 Manifest (Permissions: sidePanel, activeTab, scripting)
│   ├── icons/
│   │   ├── icon-16.png
│   │   ├── icon-48.png
│   │   └── icon-128.png
│   └── side_panel.html            # Entry HTML for the Contribution UI
│
├── src/
│   ├── background/
│   │   └── service_worker.ts      # API Proxy: Handles fetch reqs to your RAG API (CORS handling)
│   │
│   ├── content/
│   │   ├── index.ts               # Main content script entry point
│   │   ├── scraper.ts             # Extracts wgArticleId, source code (bw/bp), and Revision ID
│   │   ├── highlighter.ts         # Logic to find text matches & wrap in <span class="rag-highlight">
│   │   ├── overlay_manager.ts     # Manages tooltips when hovering over RAG highlights
│   │   └── selection_listener.ts  # Detects user text selection -> Sends message to open Side Panel
│   │
│   ├── side_panel/                # The "Write" UI (React/Vue App)
│   │   ├── index.tsx              # React entry point
│   │   ├── App.tsx                # Main Side Panel View
│   │   ├── components/
│   │   │   ├── UnitForm.tsx       # Form: Text content, Unit Type (Tablet/Prayer), Author
│   │   │   ├── TagSelector.tsx    # Multi-select component for 'defined_tags'
│   │   │   └── RelationBuilder.tsx # UI to link current selection to another Unit ID
│   │   └── hooks/
│   │       └── useRagApi.ts       # React hook for submitting data to your backend
│   │
│   ├── utils/
│   │   ├── api_types.ts           # TypeScript interfaces mirroring your SQL Schema (LogicalUnit, Tag)
│   │   ├── fuzzy_search.ts        # Critical: Matches DB text to DOM text despite minor whitespace diffs
│   │   └── storage.ts             # Wrapper for chrome.storage.local (Cache RAG data per page)
│   │
│   └── styles/
│       ├── overlay.css            # Styles for the highlights (.rag-highlight) and tooltips
│       └── side_panel.css         # Styles for the sidebar form
│
├── package.json                   # Deps: React, TypeScript, Vite, etc.
├── vite.config.ts                 # Build config to output separate bundles for content/background/panel
└── tsconfig.json
```
