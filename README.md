```
metadata-viewer-for-chrome/
├── public/
│   ├── manifest.json              # Permissions: cookies, storage, host_permissions: [*://*.bahai.works/*, *://admin.bahaidata.org/*]
│   ├── side_panel.html            # Entry point
│   └── icons/
│
├── src/
│   ├── background/
│   │   ├── service_worker.ts      # Main Event Loop
│   │   └── auth_manager.ts        # Handshake Logic: Reads Wiki Cookie -> POSTs to API -> Saves JWT
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
│   │   ├── App.tsx                # Routing: Show Login vs. Editor vs. Viewer
│   │   ├── context/
│   │   │   └── UnitContext.tsx    # State: Holds the "Pinned" Unit ID (Active Subject) for cross-page linking
│   │   ├── components/
│   │   │   ├── AuthGate.tsx       # "Connect with MediaWiki" button
│   │   │   ├── UnitForm.tsx       # Inputs: Type, Author, Tags (Auto-filled with selection text)
│   │   │   ├── RelationshipManager.tsx # The "Linker": Shows Active Subject -> Connect to Current Selection
│   │   │   └── TagInput.tsx       # Async Select for 'defined_tags' taxonomy
│   │   └── hooks/
│   │       └── useApi.ts          # Wrapper for fetch() that attaches the JWT automatically
│   │
│   ├── utils/
│   │   ├── api_client.ts          # Typed fetcher for your Express API (GET /units, POST /relationships)
│   │   ├── offset_calculator.ts   # CRITICAL: Maps DOM Range <-> Database Integer Indices (start_char, end_char)
│   │   ├── types.ts               # Interfaces: LogicalUnit, Relation, UserRole
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
