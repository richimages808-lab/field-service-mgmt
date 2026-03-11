#!/usr/bin/env python3
"""
Antigravity Data Restore Script
================================
Restores Antigravity data from a backup created by backup-antigravity.py

Usage:
    python restore-antigravity.py <backup-folder>

Example:
    python restore-antigravity.py antigravity-backup-2025-12-05_14-30-00
"""

import os
import sys
import json
import shutil
from pathlib import Path

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("❌ Error: firebase-admin package not found")
    print("\nPlease install it with:")
    print("  pip install firebase-admin")
    sys.exit(1)


class AntigravityRestore:
    def __init__(self, backup_dir):
        self.project_root = Path(__file__).parent.absolute()
        self.backup_dir = Path(backup_dir)
        self.firebase_config = {
            "projectId": "maintenancemanager-c5533",
            "storageBucket": "maintenancemanager-c5533.firebasestorage.app"
        }

        if not self.backup_dir.exists():
            print(f"❌ Error: Backup directory not found: {backup_dir}")
            sys.exit(1)

    def verify_backup(self):
        """Verify backup contents"""
        print("🔍 Verifying backup contents...")

        manifest_path = self.backup_dir / "backup-manifest.json"
        if manifest_path.exists():
            with open(manifest_path, 'r') as f:
                manifest = json.load(f)
            print(f"✅ Backup created: {manifest['backup_date']}")
        else:
            print("⚠️  No manifest found - proceeding anyway")

        # Check for key files
        has_sqlite = (self.backup_dir / "db.sqlite3").exists()
        firestore_files = list(self.backup_dir.glob("firestore_*.json"))
        has_config = (self.backup_dir / "config").exists()

        print(f"  SQLite database: {'✅' if has_sqlite else '❌'}")
        print(f"  Firestore collections: {len(firestore_files)} files")
        print(f"  Config files: {'✅' if has_config else '❌'}")

        if not has_sqlite and not firestore_files:
            print("\n❌ Error: Backup appears to be empty or corrupted")
            return False

        return True

    def restore_sqlite(self):
        """Restore SQLite database"""
        print("\n🗄️  Restoring SQLite database...")

        source = self.backup_dir / "db.sqlite3"
        if not source.exists():
            print("⚠️  SQLite backup not found - skipping")
            return False

        dest = self.project_root / "backend" / "db.sqlite3"

        # Backup existing database if it exists
        if dest.exists():
            backup_existing = dest.parent / f"db.sqlite3.backup-{int(os.path.getmtime(dest))}"
            print(f"  📦 Backing up existing database to: {backup_existing.name}")
            shutil.copy2(dest, backup_existing)

        # Copy restored database
        shutil.copy2(source, dest)
        size_mb = dest.stat().st_size / (1024 * 1024)
        print(f"✅ SQLite database restored ({size_mb:.2f} MB)")
        print("⚠️  Remember to run: python manage.py migrate")

        return True

    def initialize_firebase(self):
        """Initialize Firebase Admin SDK"""
        print("\n🔥 Initializing Firebase connection...")

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
                print("📝 Using application default credentials")
                firebase_admin.initialize_app(options=self.firebase_config)

            print("✅ Firebase initialized successfully")
            return True

        except Exception as e:
            print(f"❌ Error initializing Firebase: {e}")
            return False

    def restore_firestore_collection(self, json_file):
        """Restore a Firestore collection from JSON"""
        collection_name = json_file.stem.replace("firestore_", "")
        print(f"  📦 Restoring collection: {collection_name}...")

        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            db = firestore.client()
            batch = db.batch()
            count = 0
            batch_size = 500  # Firestore batch limit

            for doc in data:
                doc_id = doc.pop('_id', None)
                if not doc_id:
                    print(f"    ⚠️  Skipping document without ID")
                    continue

                doc_ref = db.collection(collection_name).document(doc_id)
                batch.set(doc_ref, doc)
                count += 1

                # Commit batch every 500 documents
                if count % batch_size == 0:
                    batch.commit()
                    batch = db.batch()
                    print(f"    ⏳ Committed {count} documents...")

            # Commit remaining documents
            if count % batch_size != 0:
                batch.commit()

            print(f"  ✅ Restored {count} documents to '{collection_name}'")
            return True

        except Exception as e:
            print(f"  ❌ Error restoring {collection_name}: {e}")
            return False

    def restore_firestore(self):
        """Restore all Firestore collections"""
        print("\n☁️  Restoring Firestore collections...")

        firestore_files = list(self.backup_dir.glob("firestore_*.json"))
        if not firestore_files:
            print("⚠️  No Firestore backups found - skipping")
            return False

        print(f"  Found {len(firestore_files)} collections to restore")
        print("\n⚠️  WARNING: This will overwrite existing data in Firestore!")
        response = input("  Continue? (yes/no): ").strip().lower()

        if response not in ['yes', 'y']:
            print("❌ Restore cancelled by user")
            return False

        success_count = 0
        for json_file in firestore_files:
            if self.restore_firestore_collection(json_file):
                success_count += 1

        print(f"\n✅ Restored {success_count}/{len(firestore_files)} collections")
        return success_count > 0

    def restore_config(self):
        """Restore configuration files"""
        print("\n⚙️  Restoring configuration files...")

        config_dir = self.backup_dir / "config"
        if not config_dir.exists():
            print("⚠️  No config backup found - skipping")
            return False

        files_to_restore = [
            ("functions.env", "firebase/functions/.env"),
            ("firestore.rules", "firebase/firestore.rules"),
            ("firestore.indexes.json", "firebase/firestore.indexes.json"),
            ("firebase.json", "firebase/firebase.json"),
            ("storage.rules", "firebase/storage.rules"),
        ]

        restored = 0
        for source_name, dest_path in files_to_restore:
            source = config_dir / source_name
            if source.exists():
                dest = self.project_root / dest_path
                dest.parent.mkdir(parents=True, exist_ok=True)

                # Backup existing file
                if dest.exists():
                    backup = dest.parent / f"{dest.name}.backup"
                    shutil.copy2(dest, backup)

                shutil.copy2(source, dest)
                print(f"  ✅ Restored: {dest_path}")
                restored += 1
            else:
                print(f"  ⚠️  Not in backup: {source_name}")

        if restored > 0:
            print(f"\n✅ Restored {restored} configuration files")
            print("⚠️  Remember to redeploy Firebase rules:")
            print("    firebase deploy --only firestore:rules,firestore:indexes")

        return restored > 0

    def run(self):
        """Execute restore process"""
        print("=" * 60)
        print("🔄 ANTIGRAVITY RESTORE TOOL")
        print("=" * 60)
        print(f"Backup source: {self.backup_dir}")
        print("=" * 60)

        # Verify backup
        if not self.verify_backup():
            return False

        print("\n⚠️  WARNING: This will overwrite your current Antigravity data!")
        print("Make sure you have backed up your current data if needed.")
        response = input("\nProceed with restore? (yes/no): ").strip().lower()

        if response not in ['yes', 'y']:
            print("❌ Restore cancelled by user")
            return False

        # Restore SQLite
        sqlite_success = self.restore_sqlite()

        # Restore Firestore
        firestore_success = False
        if self.initialize_firebase():
            firestore_success = self.restore_firestore()

        # Restore config
        config_success = self.restore_config()

        # Summary
        print("\n" + "=" * 60)
        print("📊 RESTORE SUMMARY")
        print("=" * 60)
        print(f"SQLite Database:      {'✅ Success' if sqlite_success else '❌ Failed/Skipped'}")
        print(f"Firestore Data:       {'✅ Success' if firestore_success else '❌ Failed/Skipped'}")
        print(f"Configuration Files:  {'✅ Success' if config_success else '❌ Failed/Skipped'}")
        print("=" * 60)

        if sqlite_success or firestore_success:
            print("\n✅ Restore completed!")
            print("\nNext steps:")
            print("1. Run database migrations: cd backend && python manage.py migrate")
            print("2. Redeploy Firebase rules: firebase deploy --only firestore:rules")
            print("3. Start the application and verify data")
            return True
        else:
            print("\n⚠️  Restore completed with errors. Check messages above.")
            return False


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python restore-antigravity.py <backup-folder>")
        print("\nExample:")
        print("  python restore-antigravity.py antigravity-backup-2025-12-05_14-30-00")
        sys.exit(1)

    restore = AntigravityRestore(sys.argv[1])
    success = restore.run()
    sys.exit(0 if success else 1)
