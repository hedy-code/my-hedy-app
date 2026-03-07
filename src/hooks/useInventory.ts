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
    getDocs,
    where,
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
            specification: itemData.specification || '默认规格',
            id: generateId(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        try {
            const docRef = doc(db, 'users', user.uid, 'items', newItem.id);
            await setDoc(docRef, newItem);
            await logActivity(newItem.id, newItem.name, 'add', newItem.totalQuantity);

            await evaluateShoppingList(newItem, newItem.totalQuantity, newItem.lowStockThreshold || 0);
        } catch (error) {
            console.error("Error adding item:", error);
        }
    };

    const updateItem = async (id: string, updates: Partial<Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>>) => {
        if (!user) return;
        try {
            const docRef = doc(db, 'users', user.uid, 'items', id);
            await updateDoc(docRef, { ...updates, updatedAt: new Date().toISOString() });

            // Re-evaluate shopping list status after update
            const item = items.find((i) => i.id === id);
            if (item) {
                const updatedItem = { ...item, ...updates } as InventoryItem;
                await evaluateShoppingList(updatedItem, updatedItem.totalQuantity, updatedItem.lowStockThreshold || 0);
            }
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

    const deleteItems = async (ids: string[]) => {
        if (!user || ids.length === 0) return;

        try {
            const batch = writeBatch(db);

            for (const id of ids) {
                const itemToDelete = items.find((i) => i.id === id);
                if (itemToDelete) {
                    const newLog: ActivityLog = {
                        id: generateId(),
                        itemId: itemToDelete.id,
                        itemName: itemToDelete.name,
                        action: 'delete',
                        quantityChange: 0,
                        timestamp: new Date().toISOString(),
                    };
                    const logDocRef = doc(db, 'users', user.uid, 'activities', newLog.id);
                    batch.set(logDocRef, newLog);
                }

                const itemRef = doc(db, 'users', user.uid, 'items', id);
                batch.delete(itemRef);

                const relatedShopping = shoppingList.find(s => s.itemId === id && !s.isBought);
                if (relatedShopping) {
                    const shopRef = doc(db, 'users', user.uid, 'shopping', relatedShopping.id);
                    batch.delete(shopRef);
                }
            }

            await batch.commit();

        } catch (error) {
            console.error("Error deleting items:", error);
        }
    };

    const evaluateShoppingList = async (item: InventoryItem, newTotalQuantity: number, newThreshold: number) => {
        if (!user) return;

        try {
            const shoppingRef = collection(db, 'users', user.uid, 'shopping');
            const q = query(shoppingRef, where('itemId', '==', item.id), where('isBought', '==', false));
            const snapshot = await getDocs(q);

            if (newTotalQuantity <= newThreshold) {
                // Item is at or below threshold: check if it needs to be added to shopping list
                if (snapshot.empty) {
                    const newItem: ShoppingItem = {
                        id: generateId(),
                        itemId: item.id,
                        customName: item.name,
                        specification: item.specification || '默认规格',
                        category: item.category,
                        quantityNeeded: Math.max(1, newThreshold * 2), // Default logic for how much to buy
                        isBought: false,
                        createdAt: new Date().toISOString(),
                    };
                    await setDoc(doc(shoppingRef, newItem.id), newItem);
                }
            } else {
                // Item is above threshold: remove any unbought matching items from shopping list
                if (!snapshot.empty) {
                    const batch = writeBatch(db);
                    snapshot.forEach(docSnap => batch.delete(docSnap.ref));
                    await batch.commit();
                }
            }
        } catch (error) {
            console.error("Error evaluating shopping list", error);
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
    };

    const updateBatchQuantity = async (id: string, batchId: string, newQuantity: number) => {
        const item = items.find((i) => i.id === id);
        if (!item || !item.batches) return;

        let newBatches = [...item.batches];
        const oldBatch = newBatches.find(b => b.id === batchId);
        const oldQuantity = oldBatch ? oldBatch.quantity : 0;

        if (newQuantity <= 0) {
            newBatches = newBatches.filter(b => b.id !== batchId);
        } else {
            newBatches = newBatches.map(b =>
                b.id === batchId ? { ...b, quantity: newQuantity } : b
            );
        }

        const newTotalQuantity = newBatches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);

        await updateItem(id, {
            totalQuantity: newTotalQuantity,
            batches: newBatches
        });

        const diff = newQuantity - oldQuantity;
        await logActivity(id, item.name, 'edit', diff);
    };

    const toggleShoppingItem = async (id: string, customQuantity?: number, expiryDate?: string) => {
        if (!user) return;
        const shopItem = shoppingList.find(s => s.id === id);
        if (!shopItem) return;

        const newBought = !shopItem.isBought;

        try {
            const batch = writeBatch(db);
            const docRef = doc(db, 'users', user.uid, 'shopping', id);

            let addedAmount = 0;

            if (newBought && shopItem.itemId) {
                const invItem = items.find((i) => i.id === shopItem.itemId);
                if (invItem) {
                    let fallbackAdded = customQuantity !== undefined ? customQuantity : shopItem.quantityNeeded;
                    if (Number.isNaN(fallbackAdded)) fallbackAdded = 1;

                    addedAmount = fallbackAdded;
                    const itemRef = doc(db, 'users', user.uid, 'items', invItem.id);
                    const targetExpiry = expiryDate || '';
                    let updatedBatches = [...(invItem.batches || [])];
                    const existingBatchIndex = updatedBatches.findIndex(b => (b.expiryDate || '') === targetExpiry);

                    if (existingBatchIndex >= 0) {
                        updatedBatches[existingBatchIndex] = {
                            ...updatedBatches[existingBatchIndex],
                            quantity: Number(updatedBatches[existingBatchIndex].quantity) + addedAmount
                        };
                    } else {
                        updatedBatches.push({
                            id: generateId(),
                            quantity: addedAmount,
                            ...(targetExpiry ? { expiryDate: targetExpiry } : {}),
                            addedAt: new Date().toISOString()
                        });
                    }

                    batch.update(itemRef, {
                        totalQuantity: Number(invItem.totalQuantity || 0) + addedAmount,
                        batches: updatedBatches,
                        updatedAt: new Date().toISOString()
                    });

                }
            }

            const updatePayload: Partial<ShoppingItem> & { updatedAt: string } = {
                isBought: newBought,
                updatedAt: new Date().toISOString()
            };

            if (newBought) {
                updatePayload.purchasedQuantity = addedAmount || shopItem.quantityNeeded;
                updatePayload.purchasedAt = new Date().toISOString();
            }

            batch.update(docRef, updatePayload);

            await batch.commit();

            if (newBought && shopItem.itemId && addedAmount > 0) {
                await logActivity(shopItem.itemId, shopItem.customName, 'stock_up', addedAmount);
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
        deleteItems,
        consumeItem,
        updateBatchQuantity,
        toggleShoppingItem,
        unboughtShoppingCount: shoppingList.filter((s) => !s.isBought).length,
        lowStockItems: items.filter((i) => i.totalQuantity <= i.lowStockThreshold),
    };
}
