import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
    collection,
    doc,
    onSnapshot,
    setDoc,
    updateDoc,
    query,
    orderBy,
    limit,
    writeBatch
} from 'firebase/firestore';
import type { InventoryItem, ActivityLog, ShoppingItem, ActivityAction } from '../types';

export function useInventory() {
    const { user } = useAuth();
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
    const [loading, setLoading] = useState(true);

    const generateId = () => crypto.randomUUID();

    useEffect(() => {
        if (!user) {
            setItems([]);
            setLogs([]);
            setShoppingList([]);
            setLoading(false);
            return;
        }

        setLoading(true);

        // References to user's subcollections
        const itemsRef = collection(db, 'users', user.uid, 'items');
        const logsRef = collection(db, 'users', user.uid, 'activities');
        const qLogs = query(logsRef, orderBy('timestamp', 'desc'), limit(50));
        const shoppingRef = collection(db, 'users', user.uid, 'shopping');

        // Setup real-time listeners
        const unsubItems = onSnapshot(itemsRef, (snapshot) => {
            const newItems: InventoryItem[] = [];
            snapshot.forEach(doc => newItems.push(doc.data() as InventoryItem));
            setItems(newItems);
        }, (error) => console.error("Error fetching items:", error));

        const unsubLogs = onSnapshot(qLogs, (snapshot) => {
            const newLogs: ActivityLog[] = [];
            snapshot.forEach(doc => newLogs.push(doc.data() as ActivityLog));
            setLogs(newLogs);
        }, (error) => console.error("Error fetching logs:", error));

        const unsubShopping = onSnapshot(shoppingRef, (snapshot) => {
            const newList: ShoppingItem[] = [];
            snapshot.forEach(doc => newList.push(doc.data() as ShoppingItem));
            setShoppingList(newList);
            setLoading(false);
        }, (error) => console.error("Error fetching shopping list:", error));

        return () => {
            unsubItems();
            unsubLogs();
            unsubShopping();
        };
    }, [user]);

    // ----------------------------
    // Data mutating helpers
    // ----------------------------

    const logActivity = async (itemId: string, itemName: string, action: ActivityAction, quantityChange: number) => {
        if (!user) return;
        const newLog: ActivityLog = {
            id: generateId(),
            itemId,
            itemName,
            action,
            quantityChange,
            timestamp: new Date().toISOString(),
        };
        const logDocRef = doc(db, 'users', user.uid, 'activities', newLog.id);
        await setDoc(logDocRef, newLog);
    };

    const addItem = async (itemData: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => {
        if (!user) return;
        const newItem: InventoryItem = {
            ...itemData,
            id: generateId(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        try {
            const docRef = doc(db, 'users', user.uid, 'items', newItem.id);
            await setDoc(docRef, newItem);
            await logActivity(newItem.id, newItem.name, 'add', newItem.totalQuantity);
        } catch (error) {
            console.error("Error adding item:", error);
        }
    };

    const updateItem = async (id: string, updates: Partial<Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>>) => {
        if (!user) return;
        try {
            const docRef = doc(db, 'users', user.uid, 'items', id);
            await updateDoc(docRef, { ...updates, updatedAt: new Date().toISOString() });
        } catch (error) {
            console.error("Error updating item:", error);
        }
    };

    const deleteItem = async (id: string) => {
        if (!user) return;
        const itemToDelete = items.find((i) => i.id === id);

        try {
            if (itemToDelete) {
                await logActivity(itemToDelete.id, itemToDelete.name, 'delete', 0);
            }

            const batch = writeBatch(db);
            const itemRef = doc(db, 'users', user.uid, 'items', id);
            batch.delete(itemRef);

            // Delete related unbought shopping list items
            const relatedShopping = shoppingList.find(s => s.itemId === id && !s.isBought);
            if (relatedShopping) {
                const shopRef = doc(db, 'users', user.uid, 'shopping', relatedShopping.id);
                batch.delete(shopRef);
            }

            await batch.commit();

        } catch (error) {
            console.error("Error deleting item:", error);
        }
    };

    const addToShoppingListIfMissing = async (item: InventoryItem) => {
        if (!user) return;
        const exists = shoppingList.find((s) => s.itemId === item.id && !s.isBought);
        if (exists) return; // Already on the list

        const newItem: ShoppingItem = {
            id: generateId(),
            itemId: item.id,
            customName: item.name,
            category: item.category,
            quantityNeeded: Math.max(1, item.lowStockThreshold * 2),
            isBought: false,
            createdAt: new Date().toISOString(),
        };

        try {
            const docRef = doc(db, 'users', user.uid, 'shopping', newItem.id);
            await setDoc(docRef, newItem);
        } catch (error) {
            console.error("Error adding to shopping list", error);
        }
    };

    const consumeItem = async (id: string, amount: number = 1) => {
        const item = items.find((i) => i.id === id);
        if (!item || item.totalQuantity <= 0) return;

        const actualAmount = Math.min(amount, item.totalQuantity);
        let amountRemaining = actualAmount;

        // Sort batches: earliest expiry first, then by addedAt
        const sortedBatches = [...item.batches].sort((a, b) => {
            if (a.expiryDate && b.expiryDate) {
                return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
            }
            if (a.expiryDate) return -1;
            if (b.expiryDate) return 1;
            return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
        });

        const newBatches = [];
        for (const batch of sortedBatches) {
            if (amountRemaining <= 0) {
                newBatches.push(batch);
                continue;
            }
            if (batch.quantity <= amountRemaining) {
                amountRemaining -= batch.quantity;
            } else {
                newBatches.push({ ...batch, quantity: batch.quantity - amountRemaining });
                amountRemaining = 0;
            }
        }

        const newTotalQuantity = item.totalQuantity - actualAmount;

        await updateItem(id, { totalQuantity: newTotalQuantity, batches: newBatches });
        await logActivity(id, item.name, 'consume', -actualAmount);

        if (newTotalQuantity <= item.lowStockThreshold) {
            await addToShoppingListIfMissing(item);
        }
    };

    const stockUpItem = async (id: string, amount: number, expiryDate?: string) => {
        const item = items.find((i) => i.id === id);
        if (!item) return;

        const newBatch = {
            id: generateId(),
            quantity: amount,
            expiryDate,
            addedAt: new Date().toISOString()
        };

        await updateItem(id, {
            totalQuantity: item.totalQuantity + amount,
            batches: [...item.batches, newBatch]
        });
        await logActivity(id, item.name, 'stock_up', amount);
    };

    const toggleShoppingItem = async (id: string) => {
        if (!user) return;
        const shopItem = shoppingList.find(s => s.id === id);
        if (!shopItem) return;

        const newBought = !shopItem.isBought;

        try {
            const batch = writeBatch(db);
            const docRef = doc(db, 'users', user.uid, 'shopping', id);
            batch.update(docRef, { isBought: newBought, updatedAt: new Date().toISOString() });

            if (newBought && shopItem.itemId) {
                const invItem = items.find((i) => i.id === shopItem.itemId);
                if (invItem) {
                    const itemRef = doc(db, 'users', user.uid, 'items', invItem.id);
                    const newBatch = {
                        id: generateId(),
                        quantity: shopItem.quantityNeeded,
                        addedAt: new Date().toISOString()
                    };
                    batch.update(itemRef, {
                        totalQuantity: invItem.totalQuantity + shopItem.quantityNeeded,
                        batches: [...invItem.batches, newBatch],
                        updatedAt: new Date().toISOString()
                    });
                }
            }

            await batch.commit();

            if (newBought && shopItem.itemId) {
                await logActivity(shopItem.itemId, shopItem.customName, 'stock_up', shopItem.quantityNeeded);
            }

        } catch (error) {
            console.error("Error toggling shopping item", error);
        }
    };

    return {
        items,
        logs,
        shoppingList,
        loading,
        addItem,
        updateItem,
        deleteItem,
        consumeItem,
        stockUpItem,
        toggleShoppingItem,
        unboughtShoppingCount: shoppingList.filter((s) => !s.isBought).length,
        lowStockItems: items.filter((i) => i.totalQuantity <= i.lowStockThreshold),
    };
}
