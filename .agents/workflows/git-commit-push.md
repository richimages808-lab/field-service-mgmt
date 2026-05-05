---
description: Safe workflow for committing and pushing code to GitHub, including secret scanning and proper remote targeting.
---

# Git Commit & Push Workflow

Follow this workflow whenever committing and pushing code to GitHub to prevent secrets from leaking and ensure code goes to the correct repository.

## Repository Information

- **Remote:** `origin` → `https://github.com/richimages808-lab/field-service-mgmt.git`
- **Branch:** `master`
- **Working directory:** `x:\Antigravity\Projects\field-service-mgmt`

> ⚠️ There is an OUTER git repo at `x:\Antigravity\Projects\.git` — do NOT use this. Always operate from the `field-service-mgmt` directory.

## Step 1: Pre-Commit Secret Scan

Before staging, scan for secrets in changed files:

```powershell
cd x:\Antigravity\Projects\field-service-mgmt

# Check for hardcoded Twilio credentials
git diff --cached --name-only | ForEach-Object { Select-String -Path $_ -Pattern "AC[0-9a-f]{32}|SK[0-9a-f]{32}" -ErrorAction SilentlyContinue } 

# Check for hardcoded passwords
git diff --cached --name-only | ForEach-Object { Select-String -Path $_ -Pattern "password.*=.*['\"](?!process\.env)" -ErrorAction SilentlyContinue }

# Check for service account keys
git diff --cached --name-only | ForEach-Object { Select-String -Path $_ -Pattern "private_key|client_email.*iam.gserviceaccount" -ErrorAction SilentlyContinue }
```

If any matches are found, do NOT commit those files. Either:
- Add them to `.gitignore`
- Remove the hardcoded secret and use environment variables instead

## Step 2: Verify .gitignore Coverage

Ensure utility scripts with credentials are excluded. The `.gitignore` should include entries for:
- `*.secret`, `serviceAccount*.json`, `credentials*.json`
- All root-level debug/setup scripts (`create-users.js`, `reset-passwords.js`, etc.)
- `firebase/functions/check-twilio-msg.js` and similar debug scripts
- `firebase/users.json`, `firebase/logs.txt`, `firebase/deploy_log.txt`

## Step 3: Stage, Commit, Push

```powershell
cd x:\Antigravity\Projects\field-service-mgmt

# Stage changes
git add -A

# Verify nothing sensitive is staged
git diff --cached --name-only | Select-String -Pattern "secret|password|credential|users\.json|\.env"

# Commit with descriptive message
git commit -m "Brief description of changes"

# Push
git push origin master
```

## Step 4: Handle Push Rejection

If GitHub blocks the push due to secret scanning:

1. Identify the offending file from the error message
2. Remove it from git tracking: `git rm --cached <file>`
3. Add it to `.gitignore`
4. Stage the updated `.gitignore`: `git add .gitignore`
5. Amend the commit: `git commit --amend -m "same message"`
6. Force push: `git push --force origin master`

## Commit Message Convention

Use descriptive messages that summarize the feature area:
```
feat: Add purchase order approval workflow
fix: Resolve timestamp crash in dispatcher console
refactor: Split MaterialsInventory into sub-components
chore: Update dependencies, clean up unused imports
```
