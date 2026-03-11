#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Antigravity Data Backup Script
===============================
Exports all Antigravity data for safe reinstallation.

Backs up:
- SQLite database (users, organizations)
- Firestore collections (jobs, invoices, users, organizations, notifications, sent_emails)
- Firebase Storage files (job photos)
- Configuration files (.env, firestore.rules, etc.)

Usage:
    python backup-antigravity.py

The script will create a timestamped backup folder with all your data.
"""

import sys
import json
import shutil
from datetime import datetime
from pathlib import Path

# Set UTF-8 encoding for Windows console
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Check if firebase-admin is installed
try:
    import firebase_admin
    from firebase_admin import credentials, firestore, storage
except ImportError:
    print("❌ Error: firebase-admin package not found")
    print("\nPlease install it with:")
    print("  pip install firebase-admin")
    sys.exit(1)


class AntigravityBackup:
    def __init__(self):
        self.project_root = Path(__file__).parent.absolute()
        self.timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        self.backup_dir = self.project_root / f"antigravity-backup-{self.timestamp}"
        self.firebase_config = {
            "projectId": "maintenancemanager-c5533",
            "storageBucket": "maintenancemanager-c5533.firebasestorage.app"
        }

    def create_backup_directory(self):
        """Create timestamped backup directory"""
        print(f"📁 Creating backup directory: {self.backup_dir}")
        self.backup_dir.mkdir(exist_ok=True)
        return True

    def backup_sqlite_database(self):
        """Copy SQLite database file"""
        print("\n🗄️  Backing up SQLite database...")

        db_path = self.project_root / "backend" / "db.sqlite3"

        if not db_path.exists():
            print(f"⚠️  Warning: SQLite database not found at {db_path}")
            return False

        dest_path = self.backup_dir / "db.sqlite3"
        shutil.copy2(db_path, dest_path)

        size_mb = dest_path.stat().st_size / (1024 * 1024)
        print(f"✅ SQLite database backed up ({size_mb:.2f} MB)")
        return True

    def initialize_firebase(self):
        """Initialize Firebase Admin SDK"""
        print("\n🔥 Initializing Firebase connection...")

        # Try to find service account key
        possible_keys = [
            self.project_root / "firebase" / "serviceAccountKey.json",
            self.project_root / "serviceAccountKey.json",
            Path.home() / ".firebase" / "maintenancemanager-c5533.json"
        ]

        service_account_path = None
        for key_path in possible_keys:
            if key_path.exists():
                service_account_path = key_path
                break

        try:
            if service_account_path:
                print(f"📝 Using service account: {service_account_path}")
                cred = credentials.Certificate(str(service_account_path))
                firebase_admin.initialize_app(cred, self.firebase_config)
            else:
                # Try to use application default credentials
                print("📝 Using application default credentials")
                firebase_admin.initialize_app(options=self.firebase_config)

            print("✅ Firebase initialized successfully")
            return True

        except Exception as e:
            print(f"❌ Error initializing Firebase: {e}")
            print("\n⚠️  To backup Firestore data, you need Firebase credentials:")
            print("1. Go to: https://console.firebase.google.com")
            print("2. Select project: maintenancemanager-c5533")
            print("3. Project Settings → Service Accounts")
            print("4. Click 'Generate New Private Key'")
            print("5. Save as 'serviceAccountKey.json' in the firebase/ folder")
            return False

    def backup_firestore_collection(self, collection_name):
        """Export a Firestore collection to JSON"""
        print(f"  📦 Exporting collection: {collection_name}...")

        try:
            db = firestore.client()
            docs = db.collection(collection_name).stream()

            data = []
            count = 0
            for doc in docs:
                doc_data = doc.to_dict()
                doc_data['_id'] = doc.id  # Preserve document ID

                # Convert Firestore timestamps to ISO strings for JSON serialization
                for key, value in doc_data.items():
                    if hasattr(value, 'timestamp'):  # Firestore Timestamp
                        doc_data[key] = value.isoformat() if hasattr(value, 'isoformat') else str(value)

                data.append(doc_data)
                count += 1

            # Save to JSON file
            output_file = self.backup_dir / f"firestore_{collection_name}.json"
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, default=str)

            print(f"  ✅ Exported {count} documents from '{collection_name}'")
            return True

        except Exception as e:
            print(f"  ❌ Error exporting {collection_name}: {e}")
            return False

    def backup_firestore_data(self):
        """Backup all Firestore collections"""
        print("\n☁️  Backing up Firestore collections...")

        collections = [
            'jobs',
            'invoices',
            'users',
            'organizations',
            'notifications',
            'sent_emails'
        ]

        success_count = 0
        for collection in collections:
            if self.backup_firestore_collection(collection):
                success_count += 1

        print(f"\n✅ Backed up {success_count}/{len(collections)} Firestore collections")
        return success_count > 0

    def backup_firebase_storage(self):
        """Download all files from Firebase Storage"""
        print("\n📸 Backing up Firebase Storage...")

        try:
            bucket = storage.bucket()
            blobs = bucket.list_blobs()

            storage_dir = self.backup_dir / "firebase-storage"
            storage_dir.mkdir(exist_ok=True)

            count = 0
            total_size = 0

            for blob in blobs:
                # Create subdirectories as needed
                file_path = storage_dir / blob.name
                file_path.parent.mkdir(parents=True, exist_ok=True)

                # Download file
                blob.download_to_filename(str(file_path))
                count += 1
                total_size += blob.size

                print(f"  ⬇️  Downloaded: {blob.name}")

            if count > 0:
                size_mb = total_size / (1024 * 1024)
                print(f"\n✅ Downloaded {count} files ({size_mb:.2f} MB)")
            else:
                print("  ℹ️  No files found in Firebase Storage")

            return True

        except Exception as e:
            print(f"❌ Error backing up storage: {e}")
            print("⚠️  Storage backup skipped - files may not be critical")
            return False

    def backup_config_files(self):
        """Copy important configuration files"""
        print("\n⚙️  Backing up configuration files...")

        config_dir = self.backup_dir / "config"
        config_dir.mkdir(exist_ok=True)

        files_to_backup = [
            ("firebase/functions/.env", "functions.env"),
            ("firebase/firestore.rules", "firestore.rules"),
            ("firebase/firestore.indexes.json", "firestore.indexes.json"),
            ("firebase/firebase.json", "firebase.json"),
            ("firebase/storage.rules", "storage.rules"),
        ]

        backed_up = 0
        for source, dest_name in files_to_backup:
            source_path = self.project_root / source
            if source_path.exists():
                dest_path = config_dir / dest_name
                shutil.copy2(source_path, dest_path)
                print(f"  ✅ Backed up: {source}")
                backed_up += 1
            else:
                print(f"  ⚠️  Not found: {source}")

        print(f"\n✅ Backed up {backed_up} configuration files")
        return backed_up > 0

    def create_restore_instructions(self):
        """Create README with restore instructions"""
        print("\n📝 Creating restore instructions...")

        readme = f"""# Antigravity Backup - {self.timestamp}

## What's in this backup?

- **db.sqlite3** - SQLite database (users, organizations, Django data)
- **firestore_*.json** - Firestore collections (jobs, invoices, etc.)
- **firebase-storage/** - Job photos and attachments
- **config/** - Firebase configuration files

## How to restore after reinstalling Antigravity

### Step 1: Restore SQLite Database

1. Copy `db.sqlite3` to the backend folder:
   ```
   copy db.sqlite3 "x:\\Antigravity\\Projects\\field-service-mgmt\\backend\\db.sqlite3"
   ```

2. Run database migrations:
   ```
   cd backend
   python manage.py migrate
   ```

### Step 2: Restore Firestore Data

Option A: Use the restore script (recommended)
```
python restore-antigravity.py
```

Option B: Manual restore via Firebase Console
1. Go to https://console.firebase.google.com
2. Select project: maintenancemanager-c5533
3. Firestore Database → Settings → Import/Export → Import
4. Upload each firestore_*.json file

Option C: Use Firebase CLI
```
firebase firestore:import ./firestore-backup
```

### Step 3: Restore Firebase Storage

Upload files from `firebase-storage/` folder:
1. Via Firebase Console: Storage → Upload Files
2. Or use gsutil:
   ```
   gsutil -m cp -r firebase-storage/* gs://maintenancemanager-c5533.firebasestorage.app/
   ```

### Step 4: Restore Configuration

1. Copy config files back:
   ```
   copy config\\functions.env "firebase\\functions\\.env"
   copy config\\firestore.rules "firebase\\firestore.rules"
   copy config\\firestore.indexes.json "firebase\\firestore.indexes.json"
   ```

2. Redeploy Firebase rules and indexes:
   ```
   firebase deploy --only firestore:rules,firestore:indexes
   ```

### Step 5: Verify

1. Start the application
2. Log in with your user account
3. Check that all jobs and invoices appear
4. Verify technician profiles are intact

## Backup Details

- **Created:** {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
- **Firebase Project:** maintenancemanager-c5533
- **Backup Location:** {self.backup_dir}

## Important Notes

- Keep the `.env` file secure - it contains API keys
- Do not commit this backup to version control
- Test the restore process in a development environment first

## Need Help?

If you encounter issues during restore, check:
1. Firebase permissions are correct
2. Service account credentials are valid
3. Database migrations completed without errors
4. All Python dependencies are installed
"""

        readme_path = self.backup_dir / "README.md"
        with open(readme_path, 'w', encoding='utf-8') as f:
            f.write(readme)

        print(f"✅ Restore instructions saved to README.md")
        return True

    def create_backup_manifest(self):
        """Create JSON manifest of backup contents"""
        manifest = {
            "backup_date": datetime.now().isoformat(),
            "project": "Antigravity Field Service Management",
            "firebase_project": self.firebase_config["projectId"],
            "components": {
                "sqlite_database": (self.backup_dir / "db.sqlite3").exists(),
                "firestore_collections": list((self.backup_dir).glob("firestore_*.json")),
                "firebase_storage": (self.backup_dir / "firebase-storage").exists(),
                "config_files": (self.backup_dir / "config").exists()
            },
            "backup_location": str(self.backup_dir)
        }

        # Convert Path objects to strings for JSON serialization
        manifest["components"]["firestore_collections"] = [
            f.name for f in manifest["components"]["firestore_collections"]
        ]

        manifest_path = self.backup_dir / "backup-manifest.json"
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2)

        return True

    def run(self):
        """Execute complete backup process"""
        print("=" * 60)
        print("🚀 ANTIGRAVITY BACKUP TOOL")
        print("=" * 60)
        print(f"Project: {self.project_root}")
        print(f"Timestamp: {self.timestamp}")
        print("=" * 60)

        # Create backup directory
        if not self.create_backup_directory():
            print("\n❌ Failed to create backup directory")
            return False

        # Backup SQLite
        sqlite_success = self.backup_sqlite_database()

        # Initialize Firebase and backup cloud data
        firebase_success = False
        if self.initialize_firebase():
            firestore_success = self.backup_firestore_data()
            storage_success = self.backup_firebase_storage()
            firebase_success = firestore_success  # Storage is optional

        # Backup config files
        config_success = self.backup_config_files()

        # Create documentation
        self.create_restore_instructions()
        self.create_backup_manifest()

        # Summary
        print("\n" + "=" * 60)
        print("📊 BACKUP SUMMARY")
        print("=" * 60)
        print(f"SQLite Database:      {'✅ Success' if sqlite_success else '❌ Failed'}")
        print(f"Firestore Data:       {'✅ Success' if firebase_success else '❌ Failed/Skipped'}")
        print(f"Configuration Files:  {'✅ Success' if config_success else '❌ Failed'}")
        print(f"\nBackup Location: {self.backup_dir}")
        print("=" * 60)

        if sqlite_success or firebase_success:
            print("\n✅ Backup completed! Check README.md for restore instructions.")
            return True
        else:
            print("\n⚠️  Backup completed with errors. Check messages above.")
            return False


if __name__ == "__main__":
    backup = AntigravityBackup()
    success = backup.run()
    sys.exit(0 if success else 1)
