import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
    signInWithPopup,
    signOut as firebaseSignOut,
    onAuthStateChanged
} from 'firebase/auth';
import { auth, googleProvider, db } from '../firebase';
import { doc, writeBatch } from 'firebase/firestore';
import type { InventoryItem, ActivityLog, ShoppingItem } from '../types';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, []);

    const signInWithGoogle = async () => {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;

            // Perform silent migration if local data exists
            await migrateLocalDataToFirebase(user.uid);

        } catch (error) {
            console.error("Error signing in with Google:", error);
            throw error;
        }
    };

    const migrateLocalDataToFirebase = async (uid: string) => {
        try {
            const localItemsStr = localStorage.getItem('ht_inventory');
            const localLogsStr = localStorage.getItem('ht_logs');
            const localShoppingStr = localStorage.getItem('ht_shopping_list');

            if (!localItemsStr && !localLogsStr && !localShoppingStr) {
                return; // Nothing to migrate
            }

            console.log("Migrating local data to Firebase...");
            const batch = writeBatch(db);

            if (localItemsStr) {
                const items: InventoryItem[] = JSON.parse(localItemsStr);
                items.forEach(item => {
                    const docRef = doc(db, 'users', uid, 'items', item.id);
                    batch.set(docRef, item);
                });
            }

            if (localLogsStr) {
                const logs: ActivityLog[] = JSON.parse(localLogsStr);
                logs.forEach(log => {
                    const docRef = doc(db, 'users', uid, 'activities', log.id);
                    batch.set(docRef, log);
                });
            }

            if (localShoppingStr) {
                const shopList: ShoppingItem[] = JSON.parse(localShoppingStr);
                shopList.forEach(shopItem => {
                    const docRef = doc(db, 'users', uid, 'shopping', shopItem.id);
                    batch.set(docRef, shopItem);
                });
            }

            await batch.commit();

            // Clear local storage to prevent duplicate migration operations
            localStorage.removeItem('ht_inventory');
            localStorage.removeItem('ht_logs');
            localStorage.removeItem('ht_shopping_list');

            console.log("Migration complete!");

        } catch (error) {
            console.error("Error migrating data:", error);
        }
    };

    const signOut = async () => {
        try {
            await firebaseSignOut(auth);
        } catch (error) {
            console.error("Error signing out:", error);
            throw error;
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
