import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// Your web app's Firebase configuration
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
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

