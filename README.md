```
metadata-viewer/
├── public/
│   ├── manifest.json              
│   ├── side_panel.html            
│   └── icons/                     
│
├── src/
│   ├── background/
│   │   └── service_worker.ts      # Handles SidePanel toggling & Cross-tab Navigation
│   │
│   ├── content/
│   │   ├── index.ts               # Content Script Entry
│   │   ├── scraper.ts             # Metadata extraction
│   │   ├── highlighter.ts         # Visual rendering of units
│   │   └── selection_handler.ts   # DOM Event listeners (MouseUp/KeyUp)
│   │
│   ├── side_panel/                
│   │   ├── index.tsx              # React Entry + Router Wrapper
│   │   ├── App.tsx                # Main Auth Check & Routes
│   │   │
│   │   ├── components/
│   │   │   ├── AuthGate.tsx       # Login Screen
│   │   │   ├── UnitForm.tsx       # Reusable Form (Shared by UnitCreator)
│   │   │   ├── TagInput.tsx       # Autocomplete Component
│   │   │   └── Layout/
│   │   │       └── MainLayout.tsx # Fixed Bottom Navigation Bar
│   │   │
│   │   ├── features/
│   │   │   ├── UnitCreator.tsx       # Tab 1: Create/Edit basic Units
│   │   │   ├── RelationshipManager.tsx # Tab 2: Connect Subject -> Object
│   │   │   ├── QAManager.tsx         # Tab 3: Create Question & Answer pairs
│   │   │   └── TaxonomyExplorer.tsx  # Tab 4: Recursive Tree & Filtering
│   │   │
│   │   └── context/
│   │       └── SelectionContext.tsx  # Global State (Persists across tabs)
│   │
│   ├── hooks/
│   │   └── useApi.ts              # Fetch wrapper with JWT handling
│   │
│   ├── utils/
│   │   ├── offset_calculator.ts   # Range <-> Index logic
│   │   └── types.ts               # Shared Interfaces (StagedItem, TreeNode, etc.)
│   │
│   └── styles/
│       ├── highlights.css         
│       └── side_panel.css         
│
├── vite.config.ts                 
├── tailwind.config.js             
├── tsconfig.json                  
└── package.json
```
