```
metadata-viewer/
├── public/
│   ├── manifest.json              
│   ├── side_panel.html            
│   └── icons/                     
│
├── src/
│   ├── background/
│   │   └── service_worker.ts      # Handles SidePanel toggling, Nav, and REFRESH_HIGHLIGHTS
│   │
│   ├── content/
│   │   ├── index.ts               
│   │   ├── scraper.ts             
│   │   ├── highlighter.ts         # Visual rendering (TAXONOMY_MODE, CREATE_MODE, etc.)
│   │   └── selection_handler.ts   
│   │
│   ├── side_panel/                
│   │   ├── index.tsx              
│   │   ├── App.tsx                # Routing: Default ("/") is now Tags
│   │   │
│   │   ├── components/
│   │   │   ├── AuthGate.tsx       
│   │   │   ├── UnitForm.tsx       # Metadata Form (Author/Type) for Label tab
│   │   │   ├── TagInput.tsx       # Personal tag search/creation logic
│   │   │   └── Layout/
│   │   │       └── MainLayout.tsx # Nav order: Tags -> Label -> Q&A -> Link
│   │   │
│   │   ├── features/
│   │   │   ├── Tags.tsx              # Tab 1 (Default): Unified Tree + Personal tagging
│   │   │   ├── Label.tsx             # Tab 2 (Formerly UnitCreator): Official metadata
│   │   │   ├── QAManager.tsx         # Tab 3: Question & Answer pairs
│   │   │   ├── RelationshipManager.tsx # Tab 4: Knowledge Graph connections
│   │   │   └── TaxonomyExplorer.tsx  # Recursive Tree view (used inside Tags.tsx)
│   │   │
│   │   └── context/
│   │       └── SelectionContext.tsx  # Added viewMode (mine/all) global state
│   │
│   ├── hooks/
│   │   └── useApi.ts              
│   │
│   ├── utils/
│   │   ├── offset_calculator.ts   
│   │   └── types.ts               # Added is_official to DefinedTag interface
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
