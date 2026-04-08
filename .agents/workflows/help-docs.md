---
description: How to write and update help documentation and videos when managing DispatchBox features.
---

# Help Documentation & Knowledge Governance Workflow

This workflow dictates the exact steps an intelligence agent or developer must take whenever a user requests an update to help content, or when a **new user-facing feature** is deployed.

Whenever you finish a session that involved creating a substantial new feature (like a new Dashboard, Add-on, or Core settings panel), you should ask the user if they want you to execute this workflow to document it.

## Step 1: Identify What Changed
1. Review the feature that was just deployed. Is it visible to the Tenant (Site Admin), the Organization (Technicians/Dispatchers), or the Customer (Portal)?
2. Only document features visible to users in `frontend/web/src/lib/helpContent.ts`. Avoid overly technical documentation unless requested.

## Step 2: Update the Knowledge Base Array
1. Read the `frontend/web/src/lib/helpContent.ts` file using the `view_file` tool.
2. Locate the `HELP_ARTICLES` exported array.
3. Determine the correct **category** for your update (e.g., `'invoicing'`, `'inventory'`, `'jobs'`, `'customers'`, `'addons'`). If it does not fit, you can add a new category to `HELP_CATEGORIES`.
4. Append a new `HelpArticle` object to the array using `multi_replace_file_content`.

### Required Article Format:
```typescript
{
    id: 'unique-hyphenated-slug',
    title: 'Customer Friendly Title',
    category: 'existing_category_id',
    content: `Brief intro:\\n\\n1. Step one.\\n2. Step two.\\n\\nConclusion or pro tip.`,
    lastUpdated: 'YYYY-MM-DD',
    keywords: ['search', 'terms', 'comma', 'separated']
}
```

## Step 3: Plan Video & Q&A Content
Often, the User will ask for "video how-tos" or "Q&A" documents.
1. If the User requests updating the **Help Videos**, locate the `DEFAULT_HELP_VIDEOS` array at the bottom of `frontend/web/src/lib/helpContent.ts`.
2. Append a new video placeholder so the UI reflects the upcoming video. Set the `videoUrl` or `thumbnailUrl` empty for now if the real video isn't recorded yet.
3. If the User requests **Q&A**, generate a Q&A section directly inside the `content` block of the `HelpArticle` using markdown formatting, like:
   `**Q: Can I change this later?**\\n**A:** Yes, in your settings.`

## Step 4: Validate Changes
1. After updating the file, run `npx tsc --noEmit` locally, or just run a frontend build (`npm run build`) in `frontend/web` to ensure you did not introduce any syntax errors in the massive TypeScript array.
2. Provide a Walkthrough to the user summarizing the documentation you wrote.
