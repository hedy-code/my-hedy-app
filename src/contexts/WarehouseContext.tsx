import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import {
    collection,
    onSnapshot,
    doc,
    setDoc,
    deleteDoc,
    query,
    orderBy
} from 'firebase/firestore';
import type { Warehouse } from '../types';

interface WarehouseContextType {
    warehouses: Warehouse[];
    currentWarehouseId: string | null;
    currentWarehouse: Warehouse | null;
    loading: boolean;
    setCurrentWarehouseId: (id: string) => void;
    addWarehouse: (name: string) => Promise<string>;
    deleteWarehouse: (id: string) => Promise<void>;
    renameWarehouse: (id: string, newName: string) => Promise<void>;
}

const WarehouseContext = createContext<WarehouseContextType | undefined>(undefined);

export const WarehouseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [currentWarehouseId, _setCurrentWarehouseId] = useState<string | null>(localStorage.getItem('currentWarehouseId'));
    const [loading, setLoading] = useState(true);

    const setCurrentWarehouseId = (id: string) => {
        _setCurrentWarehouseId(id);
        localStorage.setItem('currentWarehouseId', id);
    };

    useEffect(() => {
        if (!user) {
            setWarehouses([]);
            setLoading(false);
            return;
        }

        const warehousesRef = collection(db, 'users', user.uid, 'warehouses');
        const q = query(warehousesRef, orderBy('createdAt', 'asc'));

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const list: Warehouse[] = [];
            snapshot.forEach(doc => list.push(doc.data() as Warehouse));
            
            // If no warehouses exist, create a default one
            if (list.length === 0) {
                const defaultId = crypto.randomUUID();
                const defaultWarehouse: Warehouse = {
                    id: defaultId,
                    name: '默认库房',
                    createdAt: new Date().toISOString()
                };
                await setDoc(doc(db, 'users', user.uid, 'warehouses', defaultId), defaultWarehouse);
                return;
            }

            setWarehouses(list);
            
            // Ensure currentWarehouseId is valid
            if (!currentWarehouseId || !list.find(w => w.id === currentWarehouseId)) {
                setCurrentWarehouseId(list[0].id);
            }
            
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, currentWarehouseId]);

    const addWarehouse = async (name: string) => {
        if (!user) throw new Error('User not authenticated');
        const id = crypto.randomUUID();
        const newWarehouse: Warehouse = {
            id,
            name,
            createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'users', user.uid, 'warehouses', id), newWarehouse);
        return id;
    };

    const deleteWarehouse = async (id: string) => {
        if (!user) return;
        if (warehouses.length <= 1) {
            alert('至少需要保留一个库房');
            return;
        }
        await deleteDoc(doc(db, 'users', user.uid, 'warehouses', id));
        if (currentWarehouseId === id) {
            const remaining = warehouses.filter(w => w.id !== id);
            if (remaining.length > 0) {
                setCurrentWarehouseId(remaining[0].id);
            }
        }
    };

    const renameWarehouse = async (id: string, newName: string) => {
        if (!user) return;
        await setDoc(doc(db, 'users', user.uid, 'warehouses', id), { name: newName }, { merge: true });
    };

    const currentWarehouse = warehouses.find(w => w.id === currentWarehouseId) || null;

    return (
        <WarehouseContext.Provider value={{
            warehouses,
            currentWarehouseId,
            currentWarehouse,
            loading,
            setCurrentWarehouseId,
            addWarehouse,
            deleteWarehouse,
            renameWarehouse
        }}>
            {children}
        </WarehouseContext.Provider>
    );
};

export const useWarehouse = () => {
    const context = useContext(WarehouseContext);
    if (context === undefined) {
        throw new Error('useWarehouse must be used within a WarehouseProvider');
    }
    return context;
};
