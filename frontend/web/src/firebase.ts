import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, initializeAuth, inMemoryPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// Firebase configuration — resolved from environment variables.
// Vite injects VITE_* env vars at build time based on the --mode flag:
//   --mode production  → reads .env.production
//   --mode staging     → reads .env.staging
//   (no flag / dev)    → reads .env or falls back to hardcoded production values
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBbbbhn_DQd9LHO3Ii88-m3utdi4L9WTaM",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "dispatch-box.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "maintenancemanager-c5533",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "maintenancemanager-c5533.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "983488582142",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:983488582142:web:908e1b3029946e081230af",
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-FNG0EK2C6E"
};

// Log which project we're connecting to (development only)
if (import.meta.env.DEV) {
    console.log(`[Firebase] Connecting to project: ${firebaseConfig.projectId}`);
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

/**
 * A separate Firebase app instance used to create accounts for other people
 * (e.g. Add Technician). createUserWithEmailAndPassword signs in as the new
 * user — doing that on the main `auth` would log the dispatcher out.
 * Uses in-memory persistence so it never touches the main session.
 */
let secondaryApp: FirebaseApp | null = null;
export function getSecondaryFirebase() {
    if (!secondaryApp) {
        secondaryApp = getApps().find(a => a.name === 'secondary') || initializeApp(firebaseConfig, 'secondary');
        try { initializeAuth(secondaryApp, { persistence: inMemoryPersistence }); } catch { /* already initialized */ }
    }
    return {
        auth: getAuth(secondaryApp),
        db: getFirestore(secondaryApp),
        storage: getStorage(secondaryApp),
    };
}
