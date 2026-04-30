import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { collection, onSnapshot, query, orderBy, writeBatch, doc } from 'firebase/firestore';
import type { HistoricalItem } from '../types';

export function useHistoricalItems() {
    const { user } = useAuth();
    const [historicalItems, setHistoricalItems] = useState<HistoricalItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setHistoricalItems([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        const ref = collection(db, 'users', user.uid, 'historicalItems');
        const q = query(ref, orderBy('updatedAt', 'desc'));

        const unsub = onSnapshot(q, (snapshot) => {
            const items: HistoricalItem[] = [];
            snapshot.forEach(doc => items.push(doc.data() as HistoricalItem));
            setHistoricalItems(items);
            setLoading(false);
        }, (error) => console.error("Error fetching historical items:", error));

        return () => unsub();
    }, [user]);

    const deleteHistoricalItems = async (ids: string[]) => {
        if (!user || ids.length === 0) return;
        try {
            const batch = writeBatch(db);
            for (const id of ids) {
                const itemRef = doc(db, 'users', user.uid, 'historicalItems', id);
                batch.delete(itemRef);
            }
            await batch.commit();
        } catch (error) {
            console.error("Error deleting historical items:", error);
        }
    };

    return {
        historicalItems,
        loading,
        deleteHistoricalItems
    };
}
