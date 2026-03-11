import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from '@react-native-async-storage/async-storage';

// TODO: Replace with your actual Firebase project config
const firebaseConfig = {
    apiKey: "AIzaSyDOCAbC123456789-MOCK-KEY",
    authDomain: "field-service-mgmt.firebaseapp.com",
    projectId: "field-service-mgmt",
    storageBucket: "field-service-mgmt.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};

const app = initializeApp(firebaseConfig);

// Initialize Auth with AsyncStorage persistence
const auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
});

export { auth };
export const db = getFirestore(app);
