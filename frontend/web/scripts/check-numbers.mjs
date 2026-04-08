import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyBbbbhn_DQd9LHO3Ii88-m3utdi4L9WTaM",
    authDomain: "maintenancemanager-c5533.firebaseapp.com",
    projectId: "maintenancemanager-c5533",
    storageBucket: "maintenancemanager-c5533.firebasestorage.app",
    messagingSenderId: "983488582142",
    appId: "1:983488582142:web:908e1b3029946e081230af",
    measurementId: "G-FNG0EK2C6E"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function checkSiteConfig() {
    try {
        console.log("Signing in...");
        await signInWithEmailAndPassword(auth, "test@example.com", "test123456");
        
        console.log("Fetching site_config...");
        const snapshot = await getDocs(collection(db, 'site_config'));
        snapshot.forEach(doc => {
            console.log("Config:", doc.id, JSON.stringify(doc.data(), null, 2));
        });

    } catch (e) {
        console.error("Error:", e.message || e);
    } finally {
        process.exit(0);
    }
}

checkSiteConfig();
