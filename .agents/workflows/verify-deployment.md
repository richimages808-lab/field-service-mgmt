# Deployment Verification Workflow

**MANDATORY**: Run this workflow EVERY TIME after deploying frontend (hosting) or functions.
Report results clearly to the user — do not skip or abbreviate.

---

## When Deploying Functions (`firebase deploy --only functions`)

1. **Wait for deploy to finish** — check for `✔ Deploy complete!` in output
2. **Confirm the specific functions updated** — check output for `Successful update operation` for each modified function
3. **Pull recent logs** to verify the new code is active:
   ```powershell
   npx firebase functions:log -n 5 --only <functionName>
   ```
4. **Report to user:**
   - ✅ List each function confirmed deployed
   - ⚠️ Flag any functions that errored or were missing from deploy output

---

## When Deploying Frontend (Hosting)

### Build Phase
1. Run `npm run build` from `frontend/web/`
2. Confirm build succeeded with no errors
3. Note the output file count and total size

### Copy Phase (CRITICAL — see Knowledge Item)
4. Clear `firebase/public/` and copy `frontend/web/dist/*` → `firebase/public/`
   ```powershell
   Remove-Item -Path "firebase/public/*" -Recurse -Force
   Copy-Item -Path "frontend/web/dist/*" -Destination "firebase/public/" -Recurse -Force
   ```

### Deploy Phase
5. Run `npx firebase deploy --only hosting` from `firebase/`
6. Confirm deploy output shows **new files uploaded** (not 0)

### Verification Phase
7. **Open the live site** via browser subagent: `https://maintenancemanager-c5533.web.app`
8. **Hard refresh** the page (Ctrl+Shift+R equivalent)
9. **Visually confirm** the change is present (e.g., sidebar item moved, new UI element visible)
10. **Take a screenshot** and show the user

### Report to User
- ✅ Build output size/file count
- ✅ Files uploaded count from deploy
- ✅ Visual confirmation screenshot
- ⚠️ Any warnings or discrepancies

---

## When Deploying Both (functions + hosting)

Run both sections above. Functions can deploy in parallel with the frontend build.

---

## Quick Reference

| Component | Build Command | Deploy Command | Output Dir |
|-----------|--------------|----------------|------------|
| Frontend | `npm run build` (in `frontend/web/`) | `npx firebase deploy --only hosting` (in `firebase/`) | `frontend/web/dist/` → copy to `firebase/public/` |
| Functions | Auto via predeploy hook | `npx firebase deploy --only functions` (in `firebase/`) | N/A |
| Both | See above | `npx firebase deploy` | Both |
