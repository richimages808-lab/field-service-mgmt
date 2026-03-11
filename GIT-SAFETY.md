# Git Safety Checklist

## ⚠️ CRITICAL: Files That Must NEVER Be Committed

The `.gitignore` file is configured to protect these sensitive files:

### 🔐 Highly Sensitive (Contains Credentials)

- ❌ `firebase/serviceAccountKey.json` - Firebase admin credentials
- ❌ `firebase/functions/.env` - API keys (SendGrid, Twilio, Google Maps)
- ❌ Any file matching `serviceAccount*.json`
- ❌ Any `.env` file anywhere in the project

### 💾 Data Files (Contains User Data)

- ❌ `backend/db.sqlite3` - User accounts and organizations
- ❌ `antigravity-backup-*/` - All backup folders

### 📄 Sensitive Documents

- ❌ `*.docx`, `*.xlsx` files - May contain sensitive planning docs

## ✅ Before Every Commit - Run This Checklist

```bash
# 1. Check git status
git status

# 2. Verify no sensitive files are staged
git diff --cached --name-only | grep -iE "(serviceaccount|\.env|db\.sqlite3|backup-)"

# 3. If the above returns ANYTHING, DO NOT COMMIT!
# Remove them with:
git reset HEAD <file>
```

## 🛡️ Verification Commands

### Check what .gitignore is protecting:

```bash
# Verify service account key is ignored
git check-ignore -v firebase/serviceAccountKey.json

# Verify .env is ignored
git check-ignore -v firebase/functions/.env

# Verify database is ignored
git check-ignore -v backend/db.sqlite3

# Verify backups are ignored
git check-ignore -v antigravity-backup-2025-12-05_19-16-09
```

All four commands should return a line showing they are ignored!

### List all files that would be committed:

```bash
git ls-files --others --exclude-standard
```

Review this list carefully. Should NOT include:
- serviceAccountKey.json
- .env files
- db.sqlite3
- backup folders

## ✅ Files That ARE Safe to Commit

These files are safe and SHOULD be committed:

- ✅ Source code (`.py`, `.js`, `.tsx`, `.ts`)
- ✅ Package files (`package.json`, `requirements.txt`)
- ✅ Configuration (`firebase.json`, `firestore.rules`, `firestore.indexes.json`)
- ✅ Documentation (`.md` files)
- ✅ Backup scripts (`backup-antigravity.py`, `restore-antigravity.py`)
- ✅ `.gitignore` file itself

## 🚨 If You Accidentally Commit Sensitive Files

### If you haven't pushed yet:

```bash
# Remove from last commit
git reset --soft HEAD~1

# Remove from staging
git reset HEAD <sensitive-file>

# Re-commit without the sensitive file
git commit -m "Your commit message"
```

### If you already pushed:

**🔴 CRITICAL - You must rotate all credentials immediately!**

1. **Remove from Git history:**
   ```bash
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch firebase/serviceAccountKey.json" \
     --prune-empty --tag-name-filter cat -- --all

   git push origin --force --all
   ```

2. **Rotate all credentials immediately:**
   - Generate new Firebase service account key
   - Generate new SendGrid API key
   - Generate new Twilio credentials
   - Generate new Google Maps API key
   - Update all `.env` files with new keys

3. **Delete the old keys from their respective services**

## 📋 Pre-Commit Routine

**Before every `git commit`, run:**

```bash
# 1. Check status
git status

# 2. Review what will be committed
git diff --cached --name-only

# 3. Verify no sensitive patterns
git diff --cached --name-only | grep -iE "(secret|password|key|\.env|serviceaccount)"

# 4. If step 3 returns NOTHING, you're safe to commit
# If it returns ANYTHING, investigate and remove those files!
```

## 🔍 Quick Safety Check

Run this before committing:

```bash
cd x:\Antigravity\Projects\field-service-mgmt

# Should return "All clear!"
if git diff --cached --name-only | grep -qiE "(serviceaccount|\.env|db\.sqlite3|backup-)"; then
    echo "⚠️ DANGER! Sensitive files detected!"
    git diff --cached --name-only | grep -iE "(serviceaccount|\.env|db\.sqlite3|backup-)"
else
    echo "✅ All clear! Safe to commit."
fi
```

## 📖 Additional Resources

- **Git ignore documentation:** https://git-scm.com/docs/gitignore
- **Removing sensitive data:** https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository

## 🎯 Remember

1. **Never disable .gitignore** - It's your protection
2. **Never use `git add .` blindly** - Always review what's being added
3. **Never commit in a hurry** - Take time to verify
4. **When in doubt, don't commit** - Ask for review first

## 💡 Pro Tips

- Use `git add -p` for interactive staging (review each change)
- Use `git status` obsessively before committing
- Set up a pre-commit hook to automatically check for sensitive files
- Keep your `.gitignore` updated as the project grows

---

**Last Updated:** 2025-12-05
**Verified Protection For:**
- Firebase service account keys
- API keys (.env files)
- User databases (SQLite)
- Backup folders
- Sensitive documents
