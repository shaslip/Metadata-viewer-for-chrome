```
metadata-viewer-for-chrome/
├── public/
│   ├── manifest.json              # Permissions: cookies, storage, host_permissions: [*://*.bahai.works/*, *://digitalbahairesources.org/*]
│   ├── side_panel.html            # Entry point
│   └── icons/
│
├── src/
│   ├── background/
│   │   └── service_worker.ts      # Main Event Loop and Handshake Logic
│   │
│   ├── content/
│   │   ├── index.ts               # Entry: Injects CSS & Listeners
│   │   ├── scraper.ts             # Grabs page_id, rev_id, and checks for "Restricted" access text
│   │   ├── highlighter.ts         # Renders saved units (Green) & OCR noise (Red) on page load
│   │   ├── selection_handler.ts   # Captures user selection & opens Side Panel
│   │   └── dom_events.ts          # Listens for API "Paint" messages to update the view
│   │
│   ├── side_panel/
│   │   ├── index.tsx              # React Entry
│   │   ├── App.tsx                # Checks if the user is authenticated
│   │   ├── context/
│   │   │   └── UnitContext.tsx    # State: Holds the "Pinned" Unit ID (Active Subject) for cross-page linking
│   │   ├── components/
│   │   │   ├── AuthGate.tsx       # "Connect with MediaWiki" button
│   │   │   ├── UnitForm.tsx       # Gathers the data and POSTs it to /api/contribute/unit endpoint
│   │   │   ├── RelationshipManager.tsx # The "Linker": Shows Active Subject -> Connect to Current Selection
│   │   │   └── TagInput.tsx       # Async Select for 'defined_tags' taxonomy
│   │   └── hooks/
│   │       └── useApi.ts          # Helper ensures every request to API includes the JWT stored in chrome.storage.local
│   │
│   ├── utils/
│   │   ├── api_client.ts          # Typed fetcher for your Express API (GET /units, POST /relationships)
│   │   ├── offset_calculator.ts   # CRITICAL: Maps DOM Range <-> Database Integer Indices (start_char, end_char)
│   │   ├── types.ts               # Contract between the Extension and Database
│   │   └── logger.ts              # Dev logging
│   │
│   └── styles/
│       ├── highlights.css         # .rag-unit-highlight (Green), .ocr-noise (Red underline)
│       └── side_panel.css         # Tailwind or CSS modules
│
├── package.json
├── vite.config.ts                 # Multi-entry build config
└── tsconfig.json
```
