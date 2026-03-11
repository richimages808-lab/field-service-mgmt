import React, { createContext, useContext, useState, useEffect } from 'react';
import { signInWithCustomToken, signInAnonymously, User as FirebaseUser, signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '../firebase';
import axios from 'axios';

export interface User extends FirebaseUser {
    role?: string;
    techType?: string;
    org_id?: string;
    plan?: string;
    site_admin?: boolean;
}

export interface Organization {
    id: string;
    name: string;
    plan: 'trial' | 'individual' | 'small_business' | 'enterprise';
    trialEndsAt?: Date;
    maxTechs?: number;
}

interface AuthContextType {
    user: User | null;
    organization: Organization | null;
    djangoToken: string | null;
    login: (email: string, pass: string) => Promise<void>;
    logout: () => Promise<void>;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [djangoToken, setDjangoToken] = useState<string | null>(localStorage.getItem('djangoToken'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (u) => {
            if (u) {
                try {
                    const { doc, getDoc, collection, query, where, getDocs } = await import('firebase/firestore');
                    const { db } = await import('../firebase');

                    let userData: any = null;
                    const demoEmail = localStorage.getItem('demoEmail');
                    console.log("[AuthProvider] Auth State Changed:", u.uid, "DemoEmail:", demoEmail);

                    // Retry logic for loading Firestore user document (3 attempts with delay)
                    const maxRetries = 3;
                    for (let attempt = 1; attempt <= maxRetries; attempt++) {
                        // 1. Try to find user by Auth UID (Standard Flow)
                        console.log(`[AuthProvider] Attempt ${attempt}/${maxRetries} - Looking for user doc with UID:`, u.uid);
                        const userDocRef = doc(db, 'users', u.uid);
                        const userDoc = await getDoc(userDocRef);

                        console.log(`[AuthProvider] Attempt ${attempt}/${maxRetries} - userDoc.exists():`, userDoc.exists());

                        if (userDoc.exists()) {
                            console.log(`[AuthProvider] Found user by UID (attempt ${attempt}):`, userDoc.data());
                            userData = userDoc.data();
                            break; // Success, exit retry loop
                        }
                        // 2. If not found, and we have a demo email, try to find by Email (Demo Flow)
                        else if (demoEmail) {
                            console.log(`[AuthProvider] Attempt ${attempt}/${maxRetries} - User doc NOT found for UID:`, u.uid);
                            console.log(`[AuthProvider] User not found by UID, trying Demo Email (attempt ${attempt}):`, demoEmail);
                            const usersRef = collection(db, 'users');
                            const q = query(usersRef, where('email', '==', demoEmail));
                            const snapshot = await getDocs(q);
                            if (!snapshot.empty) {
                                userData = snapshot.docs[0].data();
                                console.log("[AuthProvider] Found user by Email:", userData);
                                break; // Success, exit retry loop
                            } else {
                                console.warn("[AuthProvider] User NOT found by Email:", demoEmail);
                            }
                        }

                        // If not found and not last attempt, wait before retrying
                        if (attempt < maxRetries) {
                            console.log(`[AuthProvider] Retrying in 500ms... (attempt ${attempt + 1}/${maxRetries})`);
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }

                    if (userData) {
                        const enhancedUser = {
                            ...u,
                            role: userData.role,
                            techType: userData.techType,
                            org_id: userData.org_id,
                            site_admin: userData.site_admin || false,
                            email: userData.email || u.email // Ensure email is set from DB if missing in Auth
                        };
                        console.log("[AuthProvider] Setting Enhanced User:", enhancedUser);
                        console.log("[AuthProvider] User role:", userData.role, "techType:", userData.techType);

                        // Warn if techType is missing for technicians
                        if (userData.role === 'technician' && !userData.techType) {
                            console.error("[AuthProvider] ⚠️ WARNING: Technician missing techType field! Will default to corporate dashboard.");
                        }

                        setUser(enhancedUser as any);

                        // Fetch organization data
                        if (userData.org_id) {
                            try {
                                const orgDocRef = doc(db, 'organizations', userData.org_id);
                                const orgDoc = await getDoc(orgDocRef);
                                if (orgDoc.exists()) {
                                    const orgData = orgDoc.data();
                                    setOrganization({
                                        id: orgDoc.id,
                                        name: orgData.name,
                                        plan: orgData.plan || 'trial',
                                        trialEndsAt: orgData.trialEndsAt?.toDate(),
                                        maxTechs: orgData.maxTechs
                                    });
                                    console.log("[AuthProvider] Loaded organization:", orgData);
                                }
                            } catch (error) {
                                console.error("Error fetching organization:", error);
                            }
                        }
                    } else {
                        console.warn("[AuthProvider] No user data found, falling back to basic auth user.");
                        setUser(u);
                    }
                } catch (error) {
                    console.error("Error fetching user profile:", error);
                    setUser(u);
                }
            } else {
                console.log("[AuthProvider] User signed out.");
                setUser(null);
                setOrganization(null);
            }
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const login = async (email: string, pass: string) => {
        // DEMO BYPASS - Commented out to use real Firebase auth for test@example.com
        // This was causing UID mismatches and preventing user document lookup
        /*
        if (email.endsWith('@example.com')) {
            console.log("Demo login detected for:", email);
            try {
                // Store email for persistence across reloads
                localStorage.setItem('demoEmail', email);

                // Sign in anonymously to satisfy security rules
                await signInAnonymously(auth);

                // Set Mock Token for ProtectedRoute
                localStorage.setItem('djangoToken', 'demo-token');
                setDjangoToken('demo-token');

                return;
            } catch (error) {
                console.error("Demo login failed:", error);
                throw error;
            }
        }
        */

        try {
            // Clear demo email on real login
            localStorage.removeItem('demoEmail');

            // Try Firebase-only login first (for production without Django backend)
            try {
                const { signInWithEmailAndPassword } = await import('firebase/auth');
                await signInWithEmailAndPassword(auth, email, pass);

                // Set a mock Django token for ProtectedRoute
                localStorage.setItem('djangoToken', 'firebase-auth-token');
                setDjangoToken('firebase-auth-token');

                console.log("Firebase-only login successful");
                return;
            } catch (firebaseError: any) {
                console.error("Firebase-only login failed:", firebaseError);
                throw firebaseError;
            }
        } catch (error) {
            console.error("Login Failed:", error);
            throw error;
        }

    };

    const logout = async () => {
        localStorage.removeItem('demoEmail'); // Clear demo persistence
        await firebaseSignOut(auth);
        localStorage.removeItem('djangoToken');
        setDjangoToken(null);
    };

    return (
        <AuthContext.Provider value={{ user, organization, djangoToken, login, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
