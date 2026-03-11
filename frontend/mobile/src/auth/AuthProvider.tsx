import React, { createContext, useContext, useState, useEffect } from 'react';
import { signInWithCustomToken, User as FirebaseUser, signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '../firebase';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

interface AuthContextType {
    user: FirebaseUser | null;
    djangoToken: string | null;
    login: (email: string, pass: string) => Promise<void>;
    logout: () => Promise<void>;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [djangoToken, setDjangoToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Load Django Token from Storage
        AsyncStorage.getItem('djangoToken').then(token => {
            setDjangoToken(token);
        });

        const unsubscribe = auth.onAuthStateChanged((u) => {
            setUser(u);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const login = async (email: string, pass: string) => {
        try {
            // 1. Login to Django (Use 10.0.2.2 for Android Emulator to access host localhost)
            // For iOS Simulator, localhost works. For physical device, use LAN IP.
            const API_URL = 'http://10.0.2.2:8000/api/login/';

            const response = await axios.post(API_URL, {
                username: email,
                password: pass
            });

            const { token, firebase_token } = response.data;

            // 2. Save Django Token
            await AsyncStorage.setItem('djangoToken', token);
            setDjangoToken(token);

            // 3. Login to Firebase
            if (firebase_token && firebase_token !== "MOCK_FIREBASE_TOKEN_FOR_DEV") {
                await signInWithCustomToken(auth, firebase_token);
            } else {
                console.warn("Using Mock Token - Firebase Auth skipped (Dev Mode)");
            }

            router.replace('/dashboard');

        } catch (error) {
            console.error("Login Failed:", error);
            throw error;
        }
    };

    const logout = async () => {
        await firebaseSignOut(auth);
        await AsyncStorage.removeItem('djangoToken');
        setDjangoToken(null);
        router.replace('/');
    };

    return (
        <AuthContext.Provider value={{ user, djangoToken, login, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
