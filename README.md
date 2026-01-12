```
rag-librarian-extension/
├── public/
│   ├── manifest.json              # Permissions & Host Config
│   ├── side_panel.html            # HTML Entry for the React App
│   └── icons/
│
├── src/
│   ├── background/
│   │   └── service_worker.ts      # Auth Handshake & API Proxy (for Content Scripts)
│   │
│   ├── content/
│   │   ├── index.ts               # Main Controller: Routes messages to Highlighter/Scraper
│   │   ├── scraper.ts             # Metadata extraction (Page ID, Rev ID)
│   │   ├── highlighter.ts         # The "Read" Path: Visualizes units on DOM
│   │   └── selection_handler.ts   # The "Write" Path: Calculates offsets & sends to UI
│   │
│   ├── side_panel/                # The React Application
│   │   ├── index.tsx              # React DOM render entry
│   │   ├── App.tsx                # Main Layout & Auth State Check
│   │   ├── context/
│   │   │   └── UnitContext.tsx    # (Optional) Global state for cross-component data
│   │   ├── components/
│   │   │   ├── AuthGate.tsx       # Handles the secure handshake between the browser cookie and API
│   │   │   ├── UnitForm.tsx       # The Data Entry Form
│   │   │   ├── TagInput.tsx       # This component allows multi-tag selection (TODO: add a GET /api/tags?search=... endpoint to your Express API later.)
│   │   │   └── RelationshipManager.tsx # UI for linking units together
│   │   └── hooks/
│   │       └── useApi.ts          # Typed API wrapper with JWT handling
│   │
│   ├── utils/
│   │   ├── offset_calculator.ts   # CRITICAL: DOM Range <-> DB Index math
│   │   └── types.ts               # Shared Interfaces (LogicalUnit, PageMetadata)
│   │
│   └── styles/
│       ├── highlights.css         # CSS for the yellow/green highlights in the wiki text
│       └── side_panel.css         # CSS for the React Form
│
├── package.json
├── vite.config.ts
└── tsconfig.json
```
