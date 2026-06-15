---
description: How to write and update help documentation when a DispatchBox module is finished and being published to production.
---

# Help Documentation & Knowledge Governance Workflow

This workflow dictates the exact steps an intelligence agent must take whenever a **new user-facing feature is deployed to production** or when help content needs updating. This workflow runs automatically after finishing any substantial module work.

## When This Workflow Runs

- After completing a new module, dashboard, or settings panel
- After significantly modifying an existing user-facing feature
- When explicitly requested by the user

## Step 1: Identify What Changed

1. Review the feature that was just deployed. Is it visible to the Tenant (Site Admin), the Organization (Technicians/Dispatchers), or the Customer (Portal)?
2. Only document features visible to users in `frontend/web/src/lib/helpContent.ts`. Avoid overly technical documentation unless requested.

## Step 2: Capture Screenshots

1. Use the **browser subagent** to navigate to the relevant pages at `http://localhost:5173/<page>`.
2. Wait for the page to fully load (2-3 seconds), then capture screenshots.
3. Copy each screenshot into the correct category subfolder under `frontend/web/public/help-screenshots/`:

```
/public/help-screenshots/
├── getting-started/     # Dashboard, sidebar, onboarding
├── jobs/                # Calendar, dispatch, jobs list
├── invoicing/           # Invoices, quotes
├── communications/      # Comms hub, email, voice agent
├── customers/           # Customer list, detail pages
├── inventory/           # Materials, tools
├── reports/             # Reports dashboard
├── addons/              # Add-on modules
└── account/             # Org settings, profile
```

## Step 3: Create Step-by-Step Article

1. Read `frontend/web/src/lib/helpContent.ts` and locate the `HELP_ARTICLES` array.
2. Determine the correct **category** (e.g., `'invoicing'`, `'jobs'`, `'communications'`). Add a new category to `HELP_CATEGORIES` if needed.
3. Create or update a `HelpArticle` using the **visual step-by-step format** (NOT plain text):

### Required Article Format:
```typescript
{
    id: 'unique-hyphenated-slug',
    title: 'Customer Friendly Title',
    category: 'existing_category_id',
    content: `One-sentence summary of what this feature does.`,
    steps: [
        {
            stepNumber: 1,
            title: 'Action Title (verb-first)',
            description: 'What to do and what the user will see. Be specific about UI element names, locations, and expected results.',
            screenshotUrl: '/help-screenshots/category/filename.png',
            tip: 'Optional pro-tip shown in a highlighted callout box.'
        },
        {
            stepNumber: 2,
            title: 'Next Action',
            description: 'Continue the walkthrough...',
            screenshotUrl: '/help-screenshots/category/filename.png'
        }
        // 2-5 steps per article is ideal
    ],
    lastUpdated: 'YYYY-MM-DD',
    keywords: ['search', 'terms', 'comma', 'separated']
}
```

### Article Writing Guidelines:
- **`content`** — Keep this to ONE sentence. The steps do the heavy lifting.
- **`steps`** — Use 2-5 steps per article. Each step should represent one clear user action.
- **Step titles** — Start with a verb: "Open the...", "Click...", "Configure...", "Review..."
- **Step descriptions** — Be specific about where things are in the UI (sidebar location, button names, panel positions).
- **`screenshotUrl`** — Every step should have a screenshot when possible. Reuse screenshots across steps in the same page context.
- **`tip`** — Add tips for non-obvious shortcuts, best practices, or "did you know" info. Not every step needs one.
- **`keywords`** — Include all searchable terms a user might type to find this article.

### Legacy Format (deprecated):
The old format used a single `content` string with markdown. Do NOT create new articles in this format. If you encounter existing articles without `steps`, convert them to the visual format above.

## Step 4: Plan Video & Q&A Content

1. If the User requests **Help Videos**, locate the `DEFAULT_HELP_VIDEOS` array at the bottom of `helpContent.ts`. Append a new video placeholder.
2. If the User requests **Q&A**, add Q&A pairs inside step descriptions or as dedicated steps with tips.

## Step 5: Validate Changes

1. Run `npx tsc --noEmit` in `frontend/web` to verify no TypeScript errors.
2. Open `http://localhost:5173/help` in the browser and verify:
   - The article appears in the correct category
   - Step-by-step cards render with numbered steps
   - Screenshots load (no broken images)
   - PDF and PNG export buttons work
3. Provide a Walkthrough to the user summarizing the documentation.

## Tooling Pitfalls

- **Long content strings**: `replace_file_content` may fail on articles with very long single-line `content` strings (>500 chars). Use a **PowerShell script** with array slicing instead:
  ```powershell
  $lines = Get-Content $file
  $before = $lines[0..($contentLineIdx - 1)]
  $after = $lines[($keywordsLineIdx)..($lines.Length - 1)]
  $result = $before + $newContent + $after
  $result | Set-Content $file -Encoding UTF8
  ```
- **Batch updates**: When updating multiple articles, `multi_replace_file_content` works well for short articles. For long ones, use individual PowerShell scripts.

## Key Components

| File | Purpose |
|------|---------|
| `frontend/web/src/lib/helpContent.ts` | All articles, categories, and videos |
| `frontend/web/src/components/HelpArticleViewer.tsx` | Visual step-by-step renderer |
| `frontend/web/src/utils/helpExport.ts` | PDF (jspdf) and PNG (html2canvas) export |
| `frontend/web/src/pages/HelpCenter.tsx` | Main Help Center page |
| `frontend/web/public/help-screenshots/` | Screenshot images by category |
