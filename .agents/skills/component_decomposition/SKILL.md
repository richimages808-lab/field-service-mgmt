---
name: component_decomposition
description: Standards for structuring React page components to prevent monolithic files and enforce separation of concerns.
---

# Component Decomposition Standard

Page components in this project have historically grown to extreme sizes (90KB+, 2,500+ lines). This skill defines the mandatory architecture for building and refactoring page components.

## Size Limits

| File Type | Max Lines | Max Size |
|---|---|---|
| Page component (`.tsx`) | ~400 lines | ~15 KB |
| Sub-component | ~250 lines | ~10 KB |
| Custom hook | ~200 lines | ~8 KB |
| Service/utility | ~300 lines | ~12 KB |

If a file exceeds these limits, it must be split before adding more features.

## Directory Structure Pattern

When building or modifying a feature page, follow this structure:

```
src/pages/FeatureName/
├── index.tsx              // Route entry point, layout shell, tab routing
├── FeatureTable.tsx       // List/table/card grid view
├── FeatureForm.tsx        // Create/edit modal or form
├── FeatureDetail.tsx      // Detail/view panel
├── FeatureFilters.tsx     // Search bar, filter dropdowns
├── hooks/
│   ├── useFeatureData.ts  // All Firestore queries (fetch, create, update, delete)
│   └── useFeatureFilters.ts // Filter/search state management
└── types.ts               // Feature-local type definitions (if needed)
```

## Separation of Concerns

### ❌ Anti-Pattern: Everything in One Component
```typescript
// BAD — 2,000 line component with inline queries, state, logic, and rendering
function MaterialsInventory() {
    const [materials, setMaterials] = useState([]);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        const q = query(collection(db, 'materials'), where('org_id', '==', orgId));
        getDocs(q).then(snap => { ... });  // ← Firestore query inline
    }, []);
    
    const calculateReorderPoint = (material) => { ... }; // ← Business logic inline
    
    return ( /* 1,500 lines of JSX */ );
}
```

### ✅ Correct Pattern: Hooks + Pure Components
```typescript
// hooks/useMaterials.ts — data layer
export function useMaterials(orgId: string) {
    const [materials, setMaterials] = useState<Material[]>([]);
    const [loading, setLoading] = useState(true);
    // ... all Firestore queries here
    return { materials, loading, createMaterial, updateMaterial, deleteMaterial };
}

// MaterialsTable.tsx — pure rendering
function MaterialsTable({ materials, onEdit, onDelete }: Props) {
    return ( /* render the table */ );
}

// index.tsx — composition
function MaterialsInventory() {
    const { materials, loading, ...actions } = useMaterials(orgId);
    const { filters, setFilters } = useFilters();
    const filtered = applyFilters(materials, filters);
    
    return (
        <Layout>
            <MaterialFilters filters={filters} onChange={setFilters} />
            <MaterialsTable materials={filtered} onEdit={actions.updateMaterial} />
        </Layout>
    );
}
```

## When Modifying Existing Monolithic Components

If the task requires changes to one of the large existing pages (`MaterialsInventory`, `TechnicianProfile`, `SoloCalendar`, etc.):

1. **If the change is small** (< 20 lines): Make the change in place, do not refactor
2. **If the change is substantial** (new sub-feature, new tab, new modal): Extract the new feature into its own sub-component file, even if the parent stays monolithic
3. **Never add more than 50 lines to an already-oversized file** — extract to a new file instead
