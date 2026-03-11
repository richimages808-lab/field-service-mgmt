# 🚀 Antigravity Backup & Restore Guide

This guide explains how to backup and restore all your Antigravity Field Service Management data.

## 📋 What Gets Backed Up?

The backup script will export:

1. **SQLite Database** (`backend/db.sqlite3`)
   - User accounts and passwords
   - Organizations
   - User roles (owner/dispatcher/technician)
   - Django authentication data

2. **Firestore Collections** (Cloud database)
   - Jobs
   - Invoices
   - Technician profiles
   - Organizations
   - Notifications
   - Email logs

3. **Firebase Storage** (Optional)
   - Job photos and attachments

4. **Configuration Files**
   - `.env` file with API keys (SendGrid, Google Maps, Twilio)
   - Firestore security rules
   - Firestore indexes
   - Firebase configuration

## 🔧 Setup (First Time Only)

### Install Required Package

```bash
pip install firebase-admin
```

### Get Firebase Credentials

To backup Firestore data, you need a service account key:

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select project: **maintenancemanager-c5533**
3. Click the gear icon → **Project Settings**
4. Go to **Service Accounts** tab
5. Click **Generate New Private Key**
6. Save the downloaded file as `serviceAccountKey.json` in the `firebase/` folder

**File location should be:**
```
x:\Antigravity\Projects\field-service-mgmt\firebase\serviceAccountKey.json
```

⚠️ **Important:** Never commit this file to Git! It contains sensitive credentials.

## 💾 How to Create a Backup

### Option 1: Double-click (Easy)

Simply double-click: **`run-backup.bat`**

### Option 2: Command Line

```bash
python backup-antigravity.py
```

### What Happens

The script will:
1. Create a timestamped folder: `antigravity-backup-YYYY-MM-DD_HH-MM-SS/`
2. Copy your SQLite database
3. Export all Firestore collections to JSON files
4. Download Firebase Storage files (if any)
5. Copy configuration files
6. Generate a README with restore instructions

**Example output:**
```
antigravity-backup-2025-12-05_14-30-00/
├── README.md                    # Restore instructions
├── backup-manifest.json         # Backup metadata
├── db.sqlite3                   # SQLite database
├── firestore_jobs.json          # Jobs collection
├── firestore_invoices.json      # Invoices collection
├── firestore_users.json         # Technician profiles
├── firestore_organizations.json # Organizations
├── firestore_notifications.json # Notifications
├── firestore_sent_emails.json   # Email logs
├── firebase-storage/            # Job photos (if any)
└── config/                      # Configuration files
    ├── functions.env
    ├── firestore.rules
    └── firestore.indexes.json
```

## 🔄 How to Restore from Backup

### Option 1: Using the Restore Script (Recommended)

```bash
python restore-antigravity.py antigravity-backup-2025-12-05_14-30-00
```

The script will:
1. Verify the backup contents
2. Ask for confirmation (since it overwrites data)
3. Restore SQLite database
4. Restore all Firestore collections
5. Restore configuration files

### Option 2: Manual Restore

If you prefer to restore manually:

#### Step 1: Restore SQLite Database

```bash
copy antigravity-backup-2025-12-05_14-30-00\db.sqlite3 backend\db.sqlite3
cd backend
python manage.py migrate
```

#### Step 2: Restore Firestore Data

Use the restore script for this:
```bash
python restore-antigravity.py antigravity-backup-2025-12-05_14-30-00
```

Or use Firebase Console:
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select project: maintenancemanager-c5533
3. Firestore Database → Settings → Import/Export → Import
4. Upload each `firestore_*.json` file

#### Step 3: Restore Configuration

```bash
copy antigravity-backup-2025-12-05_14-30-00\config\functions.env firebase\functions\.env
copy antigravity-backup-2025-12-05_14-30-00\config\firestore.rules firebase\firestore.rules
copy antigravity-backup-2025-12-05_14-30-00\config\firestore.indexes.json firebase\firestore.indexes.json
```

Then redeploy Firebase rules:
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

#### Step 4: Verify

1. Start the application
2. Log in with your user account
3. Check that jobs and invoices appear
4. Verify technician data is intact

## ⚠️ Important Notes

### Security

- **Never commit backups to Git** - They contain sensitive data and API keys
- Store backups in a secure location (encrypted drive, secure cloud storage)
- The `.env` file contains your SendGrid, Twilio, and Google Maps API keys
- Treat `serviceAccountKey.json` as highly sensitive

### Before Reinstalling

1. ✅ Run the backup script
2. ✅ Verify the backup folder was created
3. ✅ Check that backup-manifest.json shows all components backed up
4. ✅ Copy the backup folder to a safe location (external drive, cloud storage)
5. ✅ Test restore in a development environment if possible

### After Restoring

1. ✅ Run database migrations: `python manage.py migrate`
2. ✅ Redeploy Firebase rules: `firebase deploy --only firestore:rules`
3. ✅ Test user login
4. ✅ Verify all data appears correctly
5. ✅ Check that new jobs/invoices can be created

## 🐛 Troubleshooting

### "firebase-admin package not found"

Install it:
```bash
pip install firebase-admin
```

### "Error initializing Firebase"

You need to set up the service account key:
1. Download from Firebase Console (see Setup section above)
2. Save as `firebase/serviceAccountKey.json`
3. Run the backup script again

### "SQLite database not found"

Make sure you're running the script from the project root:
```bash
cd x:\Antigravity\Projects\field-service-mgmt
python backup-antigravity.py
```

### Backup succeeds but Firestore export shows 0 documents

This is normal if you haven't created any data yet. The script will still create the JSON files (they'll just be empty arrays).

### "Permission denied" errors

Make sure:
- The service account key has Firestore read/write permissions
- You have write permissions to the project directory
- No other process is using the database file

## 📞 Support

If you encounter issues:

1. Check the error messages - they often explain what's wrong
2. Verify Firebase credentials are set up correctly
3. Make sure you're running Python 3.6 or later
4. Check that all dependencies are installed: `pip install firebase-admin`

## 🔐 Backup Storage Recommendations

Store your backups in multiple locations:

- ✅ External hard drive (offline backup)
- ✅ Secure cloud storage (Google Drive, Dropbox, OneDrive) in a private folder
- ✅ Network attached storage (NAS) if available

**Never:**
- ❌ Commit backups to Git repositories
- ❌ Store in public cloud folders
- ❌ Email backups (contains sensitive credentials)
- ❌ Leave only one copy (always have 2+ backup locations)

## 📅 Recommended Backup Schedule

- **Daily**: If actively using the system
- **Before updates**: Always backup before updating Antigravity
- **Before reinstalls**: Run backup before any system changes
- **Weekly**: Minimum for production systems
- **After major data entry**: Backup after adding many jobs/invoices

Consider setting up a scheduled task (Windows Task Scheduler) to run backups automatically.
