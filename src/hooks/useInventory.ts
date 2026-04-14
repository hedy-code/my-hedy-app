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
    getDoc,
    where,
    writeBatch,
    deleteDoc
} from 'firebase/firestore';
import { useWarehouse } from '../contexts/WarehouseContext';
import { useUndoRedo } from '../contexts/UndoRedoContext';
import type { InventoryItem, ActivityLog, ShoppingItem, ActivityAction, HistoricalItem } from '../types';

export function useInventory() {
    const { user } = useAuth();
    const { currentWarehouseId } = useWarehouse();
    const { pushCommand } = useUndoRedo();
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
    const [loading, setLoading] = useState(true);

    const generateId = () => crypto.randomUUID();

    useEffect(() => {
        if (!user || !currentWarehouseId) {
            setItems([]);
            setLogs([]);
            setShoppingList([]);
            setLoading(false);
            return;
        }

        const activeWarehouseId = currentWarehouseId;
        setLoading(true);

        // References to user's subcollections
        const itemsRef = collection(db, 'users', user.uid, 'items');
        const logsRef = collection(db, 'users', user.uid, 'activities');
        const shoppingRef = collection(db, 'users', user.uid, 'shopping');

        // Queries filtered by current warehouse
        const qItems = query(itemsRef, where('warehouseId', '==', activeWarehouseId));
        const qLogs = query(
            logsRef, 
            where('warehouseId', '==', activeWarehouseId),
            orderBy('timestamp', 'desc'), 
            limit(50)
        );
        const qShopping = query(shoppingRef, where('warehouseId', '==', activeWarehouseId));

        // Setup real-time listeners
        const unsubItems = onSnapshot(qItems, (snapshot) => {
            const newItems: InventoryItem[] = [];
            snapshot.forEach(doc => newItems.push(doc.data() as InventoryItem));
            setItems(newItems);
        }, (error) => console.error("Error fetching items:", error));

        const unsubLogs = onSnapshot(qLogs, (snapshot) => {
            const newLogs: ActivityLog[] = [];
            snapshot.forEach(doc => newLogs.push(doc.data() as ActivityLog));
            setLogs(newLogs);
        }, (error) => console.error("Error fetching logs:", error));

        const unsubShopping = onSnapshot(qShopping, (snapshot) => {
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
    }, [user, currentWarehouseId]);

    // ----------------------------
    // Data mutating helpers
    // ----------------------------

    useEffect(() => {
        if (!user || !currentWarehouseId || loading) return;

        const migrateData = async () => {
            const activeWarehouseId = currentWarehouseId;
            
            // Migrate Items
            const itemsRef = collection(db, 'users', user.uid, 'items');
            const itemsSnapshot = await getDocs(itemsRef);
            let itemsToMigrate = itemsSnapshot.docs.filter(docSnap => !docSnap.data().warehouseId);
            if (itemsToMigrate.length > 0) {
                await Promise.all(itemsToMigrate.map(docSnap => 
                    updateDoc(docSnap.ref, { warehouseId: activeWarehouseId })
                ));
            }

            // Migrate Activities
            const logsRef = collection(db, 'users', user.uid, 'activities');
            const logsSnapshot = await getDocs(logsRef);
            let logsToMigrate = logsSnapshot.docs.filter(docSnap => !docSnap.data().warehouseId);
            if (logsToMigrate.length > 0) {
                // Chunk the promises to avoid overwhelming the network
                const chunkSize = 100;
                for (let i = 0; i < logsToMigrate.length; i += chunkSize) {
                    const chunk = logsToMigrate.slice(i, i + chunkSize);
                    await Promise.all(chunk.map(docSnap => 
                        updateDoc(docSnap.ref, { warehouseId: activeWarehouseId })
                    ));
                }
            }

            // Migrate Shopping
            const shoppingRef = collection(db, 'users', user.uid, 'shopping');
            const shoppingSnapshot = await getDocs(shoppingRef);
            let shoppingToMigrate = shoppingSnapshot.docs.filter(docSnap => !docSnap.data().warehouseId);
            if (shoppingToMigrate.length > 0) {
                await Promise.all(shoppingToMigrate.map(docSnap => 
                    updateDoc(docSnap.ref, { warehouseId: activeWarehouseId })
                ));
            }

            // Migrate Historical Items (seeding)
            const historicalRef = collection(db, 'users', user.uid, 'historicalItems');
            const historicalSnapshot = await getDocs(historicalRef);
            if (historicalSnapshot.empty) {
                const allItemsRef = collection(db, 'users', user.uid, 'items');
                const allItemsSnapshot = await getDocs(allItemsRef);
                
                if (!allItemsSnapshot.empty) {
                    const uniqueItems = new Map<string, any>();
                    allItemsSnapshot.forEach(docSnap => {
                        const data = docSnap.data();
                        const spec = data.specification || '默认规格';
                        // Sanitize ID to prevent invalid-argument (e.g., from slashes)
                        const rawId = `${data.name}_${spec}`;
                        const id = rawId.replace(/[\/\\. ]/g, '_');
                        if (!uniqueItems.has(id)) {
                            uniqueItems.set(id, {
                                id,
                                name: data.name || '未知物品',
                                specification: spec,
                                category: data.category || '未分类',
                                unit: data.unit || '个',
                                lowStockThreshold: data.lowStockThreshold || 0,
                                remarks: data.remarks || '',
                                updatedAt: new Date().toISOString()
                            });
                        }
                    });
                    
                    let count = 0;
                    let currentBatch = writeBatch(db);
                    for (const historicalItem of uniqueItems.values()) {
                        const hRef = doc(db, 'users', user.uid, 'historicalItems', historicalItem.id);
                        currentBatch.set(hRef, historicalItem);
                        count++;
                        if (count % 400 === 0) {
                            await currentBatch.commit();
                            currentBatch = writeBatch(db);
                        }
                    }
                    if (count % 400 !== 0) {
                        await currentBatch.commit();
                    }
                }
            }
        };

        migrateData().catch(err => console.error("Migration error:", err));
    }, [user, currentWarehouseId, loading]);

    const logActivity = async (itemId: string, itemName: string, action: ActivityAction, quantityChange: number) => {
        if (!user || !currentWarehouseId) return;
        const newLog: ActivityLog = {
            id: generateId(),
            itemId,
            itemName,
            action,
            warehouseId: currentWarehouseId,
            quantityChange,
            timestamp: new Date().toISOString(),
        };
        const logDocRef = doc(db, 'users', user.uid, 'activities', newLog.id);
        await setDoc(logDocRef, newLog);
    };

    const upsertHistoricalItem = async (item: Pick<HistoricalItem, 'name' | 'category' | 'unit' | 'lowStockThreshold' | 'remarks'> & { specification?: string }) => {
        if (!user) return;
        const spec = item.specification || '默认规格';
        // Sanitize ID to prevent invalid-argument (e.g., from slashes)
        const rawId = `${item.name}_${spec}`;
        const id = rawId.replace(/[\/\\. ]/g, '_');
        const historicalRef = doc(db, 'users', user.uid, 'historicalItems', id);
        try {
            await setDoc(historicalRef, {
                id,
                name: item.name || '未知物品',
                specification: spec,
                category: item.category || '未分类',
                unit: item.unit || '个',
                lowStockThreshold: item.lowStockThreshold || 0,
                remarks: item.remarks || '',
                updatedAt: new Date().toISOString()
            }, { merge: true });
        } catch (error) {
            console.error("Error upserting historical item:", error);
        }
    };

    const addItem = async (itemData: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'warehouseId'>) => {
        if (!user || !currentWarehouseId) return;
        const newItem: InventoryItem = {
            ...itemData,
            specification: itemData.specification || '默认规格',
            id: generateId(),
            warehouseId: currentWarehouseId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        try {
            const docRef = doc(db, 'users', user.uid, 'items', newItem.id);
            await setDoc(docRef, newItem);
            await logActivity(newItem.id, newItem.name, 'add', newItem.totalQuantity);

            await evaluateShoppingList(newItem, newItem.totalQuantity, newItem.lowStockThreshold || 0);
            await upsertHistoricalItem(newItem);

            pushCommand({
                actionName: `新增物品: ${newItem.name}`,
                undo: async () => {
                    await deleteDoc(doc(db, 'users', user!.uid, 'items', newItem.id));
                },
                redo: async () => {
                    await setDoc(doc(db, 'users', user!.uid, 'items', newItem.id), newItem);
                }
            });
        } catch (error) {
            console.error("Error adding item:", error);
        }
    };

    const updateItem = async (id: string, updates: Partial<Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>>, skipCommand?: boolean) => {
        if (!user) return;
        const found = items.find(i => i.id === id);
        const previousItem = found ? JSON.parse(JSON.stringify(found)) : null;
        try {
            const batch = writeBatch(db);
            const docRef = doc(db, 'users', user.uid, 'items', id);
            batch.update(docRef, { ...updates, updatedAt: new Date().toISOString() });

            if (updates.name !== undefined || updates.specification !== undefined || updates.category !== undefined) {
                const shopUpdates: any = { updatedAt: new Date().toISOString() };
                if (updates.name !== undefined) shopUpdates.customName = updates.name;
                if (updates.specification !== undefined) shopUpdates.specification = updates.specification;
                if (updates.category !== undefined) shopUpdates.category = updates.category;

                const matchingShopping = shoppingList.filter(s => s.itemId === id && !s.isBought);
                matchingShopping.forEach(shopItem => {
                    const shopRef = doc(db, 'users', user.uid, 'shopping', shopItem.id);
                    batch.update(shopRef, shopUpdates);
                });
            }

            await batch.commit();

            // Re-evaluate shopping list status after update
            const item = items.find((i) => i.id === id);
            if (item) {
                const updatedItem = { ...item, ...updates } as InventoryItem;
                
                // If name or spec changes, delete the old historical item ID to prevent duplicates
                const oldSpec = item.specification || '默认规格';
                const newSpec = updatedItem.specification || '默认规格';
                const oldRawId = `${item.name}_${oldSpec}`;
                const newRawId = `${updatedItem.name}_${newSpec}`;
                const oldHId = oldRawId.replace(/[\/\\. ]/g, '_');
                const newHId = newRawId.replace(/[\/\\. ]/g, '_');

                if (oldHId !== newHId) {
                    try {
                        const oldHRef = doc(db, 'users', user.uid, 'historicalItems', oldHId);
                        const fbBatch = writeBatch(db);
                        fbBatch.delete(oldHRef);
                        await fbBatch.commit();
                    } catch (err) {
                        console.error("Failed to delete old historical record on rename:", err);
                    }
                }

                await evaluateShoppingList(updatedItem, updatedItem.totalQuantity, updatedItem.lowStockThreshold || 0);
                await upsertHistoricalItem(updatedItem);
                
                if (previousItem && !skipCommand) {
                    pushCommand({
                        actionName: `更新物品: ${previousItem.name}`,
                        undo: async () => {
                            await updateDoc(doc(db, 'users', user!.uid, 'items', id), {
                                ...previousItem,
                                updatedAt: new Date().toISOString()
                            });
                        },
                        redo: async () => {
                            await updateDoc(doc(db, 'users', user!.uid, 'items', id), {
                                ...updates,
                                updatedAt: new Date().toISOString()
                            });
                        }
                    });
                }
            }
        } catch (error) {
            console.error("Error updating item:", error);
        }
    };

    const deleteItem = async (id: string) => {
        if (!user) return;
        const found = items.find((i) => i.id === id);
        const itemToDelete = found ? JSON.parse(JSON.stringify(found)) : null;

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

            if (itemToDelete) {
                pushCommand({
                    actionName: `删除物品: ${itemToDelete.name}`,
                    undo: async () => {
                        await setDoc(doc(db, 'users', user!.uid, 'items', id), itemToDelete);
                    },
                    redo: async () => {
                        await deleteDoc(doc(db, 'users', user!.uid, 'items', id));
                    }
                });
            }

        } catch (error) {
            console.error("Error deleting item:", error);
        }
    };

    const deleteItems = async (ids: string[]) => {
        if (!user || ids.length === 0) return;
        const itemsToDelete = JSON.parse(JSON.stringify(items.filter(i => ids.includes(i.id))));

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
                        warehouseId: currentWarehouseId!,
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

            if (itemsToDelete.length > 0) {
                pushCommand({
                    actionName: `批量删除 ${itemsToDelete.length} 个物品`,
                    undo: async () => {
                        const undoBatch = writeBatch(db);
                        itemsToDelete.forEach((item: any) => {
                            undoBatch.set(doc(db, 'users', user!.uid, 'items', item.id), item);
                        });
                        await undoBatch.commit();
                    },
                    redo: async () => {
                        const redoBatch = writeBatch(db);
                        ids.forEach(delId => {
                            redoBatch.delete(doc(db, 'users', user!.uid, 'items', delId));
                        });
                        await redoBatch.commit();
                    }
                });
            }

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

            const shouldBeInList = (newTotalQuantity <= newThreshold) && !(newTotalQuantity === 0 && newThreshold === 0);

            if (shouldBeInList) {
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
                        warehouseId: currentWarehouseId!,
                        createdAt: new Date().toISOString(),
                    };
                    await setDoc(doc(shoppingRef, newItem.id), newItem);
                }
            } else {
                // Item is above threshold or hit the (0,0) exception: remove any unbought matching items from shopping list
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

    const deleteShoppingItem = async (shoppingId: string) => {
        if (!user) return;
        try {
            await deleteDoc(doc(db, 'users', user.uid, 'shopping', shoppingId));
        } catch (error) {
            console.error("Error deleting shopping item:", error);
        }
    };

    const consumeItem = async (id: string, amount: number = 1) => {
        const item = items.find((i) => i.id === id);
        if (!item || item.totalQuantity <= 0) return;
        const previousItem = JSON.parse(JSON.stringify(item));

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

        const newBatches: any[] = [];
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

        await updateItem(id, { totalQuantity: newTotalQuantity, batches: newBatches }, true);
        await logActivity(id, item.name, 'consume', -actualAmount);

        pushCommand({
            actionName: `消耗物品: ${item.name}`,
            undo: async () => {
                await updateDoc(doc(db, 'users', user!.uid, 'items', id), {
                    totalQuantity: previousItem.totalQuantity,
                    batches: previousItem.batches
                });
            },
            redo: async () => {
                await updateDoc(doc(db, 'users', user!.uid, 'items', id), {
                    totalQuantity: newTotalQuantity,
                    batches: newBatches
                });
            }
        });
    };

    const updateBatchQuantity = async (id: string, batchId: string, newQuantity: number) => {
        const item = items.find((i) => i.id === id);
        if (!item || !item.batches) return;
        
        const previousItem = JSON.parse(JSON.stringify(item));

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
        }, true);

        const diff = newQuantity - oldQuantity;
        await logActivity(id, item.name, 'edit', diff);

        pushCommand({
            actionName: `修改物品明细: ${item.name}`,
            undo: async () => {
                await updateDoc(doc(db, 'users', user!.uid, 'items', id), {
                    totalQuantity: previousItem.totalQuantity,
                    batches: previousItem.batches
                });
            },
            redo: async () => {
                await updateDoc(doc(db, 'users', user!.uid, 'items', id), {
                    totalQuantity: newTotalQuantity,
                    batches: newBatches
                });
            }
        });
    };

    const toggleShoppingItem = async (id: string, customQuantity?: number, expiryDate?: string) => {
        if (!user) return;
        const shopItemText = shoppingList.find(s => s.id === id);
        if (!shopItemText) return;
        const previousShoppingItem = JSON.parse(JSON.stringify(shopItemText));

        const newBought = !shopItemText.isBought;

        try {
            const batch = writeBatch(db);
            const docRef = doc(db, 'users', user.uid, 'shopping', id);

            let addedAmount = 0;
            let previousInvItem: any = null;
            let updatedInvItemData: any = null;

            if (newBought && shopItemText.itemId) {
                const invItemText = items.find((i) => i.id === shopItemText.itemId);
                if (invItemText) {
                    previousInvItem = JSON.parse(JSON.stringify(invItemText));
                    let fallbackAdded = customQuantity !== undefined ? customQuantity : shopItemText.quantityNeeded;
                    if (Number.isNaN(fallbackAdded)) fallbackAdded = 1;

                    addedAmount = fallbackAdded;
                    const itemRef = doc(db, 'users', user.uid, 'items', invItemText.id);
                    const targetExpiry = expiryDate || '';
                    let updatedBatches = [...(invItemText.batches || [])];
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

                    updatedInvItemData = {
                        totalQuantity: Number(invItemText.totalQuantity || 0) + addedAmount,
                        batches: updatedBatches,
                        updatedAt: new Date().toISOString()
                    };
                    batch.update(itemRef, updatedInvItemData);
                }
            }

            const updatePayload: Partial<ShoppingItem> & { updatedAt: string } = {
                isBought: newBought,
                updatedAt: new Date().toISOString()
            };

            if (newBought) {
                updatePayload.purchasedQuantity = addedAmount || shopItemText.quantityNeeded;
                updatePayload.purchasedAt = new Date().toISOString();
            }

            batch.update(docRef, updatePayload);
            await batch.commit();

            if (newBought && shopItemText.itemId && addedAmount > 0) {
                await logActivity(shopItemText.itemId, shopItemText.customName, 'stock_up', addedAmount);
            }

            pushCommand({
                actionName: `购物状态变更: ${shopItemText.customName}`,
                undo: async () => {
                    await setDoc(doc(db, 'users', user!.uid, 'shopping', id), previousShoppingItem);
                    if (previousInvItem) {
                        await updateDoc(doc(db, 'users', user!.uid, 'items', previousInvItem.id), {
                            totalQuantity: previousInvItem.totalQuantity,
                            batches: previousInvItem.batches,
                        });
                    }
                },
                redo: async () => {
                    await updateDoc(doc(db, 'users', user!.uid, 'shopping', id), updatePayload);
                    if (updatedInvItemData && previousInvItem) {
                        await updateDoc(doc(db, 'users', user!.uid, 'items', previousInvItem.id), updatedInvItemData);
                    }
                }
            });

        } catch (error) {
            console.error("Error toggling shopping item", error);
        }
    };

    const copyItemToWarehouse = async (item: InventoryItem, targetWarehouseId: string, targetItemId?: string) => {
        if (!user) return;

        try {
            const batch = writeBatch(db);
            let finalTargetItemId = targetItemId;
            let targetItemData: InventoryItem;
            let previousTargetItem: InventoryItem | null = null;

            if (targetItemId) {
                // Merging into existing item
                const targetRef = doc(db, 'users', user.uid, 'items', targetItemId);
                const targetSnap = await getDoc(targetRef);
                
                if (!targetSnap.exists()) throw new Error("Target item not found for merge");
                const existingItem = targetSnap.data() as InventoryItem;
                previousTargetItem = { ...existingItem };

                const newBatches = [
                    ...(existingItem.batches || []),
                    ...item.batches.map(b => ({
                        ...b,
                        id: generateId(),
                        addedAt: new Date().toISOString()
                    }))
                ];

                targetItemData = {
                    ...existingItem,
                    totalQuantity: existingItem.totalQuantity + item.totalQuantity,
                    batches: newBatches,
                    updatedAt: new Date().toISOString()
                };
                batch.update(doc(db, 'users', user.uid, 'items', targetItemId), {
                    totalQuantity: targetItemData.totalQuantity,
                    batches: targetItemData.batches,
                    updatedAt: targetItemData.updatedAt
                });
            } else {
                // Creating new item
                finalTargetItemId = generateId();
                targetItemData = {
                    ...item,
                    id: finalTargetItemId,
                    warehouseId: targetWarehouseId,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };
                batch.set(doc(db, 'users', user.uid, 'items', finalTargetItemId), targetItemData);
            }
            
            const newLog: ActivityLog = {
                id: generateId(),
                itemId: finalTargetItemId!,
                itemName: item.name,
                action: 'add',
                warehouseId: targetWarehouseId,
                quantityChange: item.totalQuantity,
                timestamp: new Date().toISOString(),
            };
            batch.set(doc(db, 'users', user.uid, 'activities', newLog.id), newLog);

            await batch.commit();

            pushCommand({
                actionName: `复制物品: ${item.name}`,
                undo: async () => {
                    if (targetItemId && previousTargetItem) {
                        await updateDoc(doc(db, 'users', user!.uid, 'items', targetItemId), {
                            totalQuantity: previousTargetItem.totalQuantity,
                            batches: previousTargetItem.batches,
                            updatedAt: previousTargetItem.updatedAt
                        });
                    } else if (finalTargetItemId) {
                        await deleteDoc(doc(db, 'users', user!.uid, 'items', finalTargetItemId));
                    }
                },
                redo: async () => {
                    if (targetItemId && targetItemData) {
                        await updateDoc(doc(db, 'users', user!.uid, 'items', targetItemId), {
                            totalQuantity: targetItemData.totalQuantity,
                            batches: targetItemData.batches,
                            updatedAt: targetItemData.updatedAt
                        });
                    } else if (finalTargetItemId && targetItemData) {
                        await setDoc(doc(db, 'users', user!.uid, 'items', finalTargetItemId), targetItemData);
                    }
                }
            });

        } catch (error) {
            console.error("Error copying item:", error);
        }
    };

    const moveItemBatchesToWarehouse = async (
        item: InventoryItem,
        targetWarehouseId: string,
        batchesToMove: { id: string; quantity: number; expiryDate?: string; addedAt: string }[],
        targetItemId?: string
    ) => {
        if (!user || !currentWarehouseId) return;

        try {
            const batch = writeBatch(db);
            const totalMoved = batchesToMove.reduce((sum, b) => sum + b.quantity, 0);

            let newSourceTotal = item.totalQuantity;
            let newSourceBatches = [...item.batches];
            
            for (const moveBatch of batchesToMove) {
                const sourceBatchIndex = newSourceBatches.findIndex(b => b.id === moveBatch.id);
                if (sourceBatchIndex !== -1) {
                    const sourceBatch = newSourceBatches[sourceBatchIndex];
                    if (sourceBatch.quantity <= moveBatch.quantity) {
                        newSourceBatches.splice(sourceBatchIndex, 1);
                    } else {
                        newSourceBatches[sourceBatchIndex] = {
                            ...sourceBatch,
                            quantity: sourceBatch.quantity - moveBatch.quantity
                        };
                    }
                }
            }
            
            newSourceTotal = newSourceBatches.reduce((sum, b) => sum + b.quantity, 0);
            const sourceItemRef = doc(db, 'users', user.uid, 'items', item.id);

            if (newSourceTotal <= 0) {
                batch.delete(sourceItemRef);
            } else {
                batch.update(sourceItemRef, {
                    totalQuantity: newSourceTotal,
                    batches: newSourceBatches,
                    updatedAt: new Date().toISOString()
                });
            }

            const sourceLog: ActivityLog = {
                id: generateId(),
                itemId: item.id,
                itemName: item.name,
                action: 'edit',
                warehouseId: currentWarehouseId,
                quantityChange: -totalMoved,
                timestamp: new Date().toISOString(),
            };
            batch.set(doc(db, 'users', user.uid, 'activities', sourceLog.id), sourceLog);

            const newBatchesForTarget = batchesToMove.map(b => ({
                id: generateId(),
                quantity: b.quantity,
                ...(b.expiryDate !== undefined ? { expiryDate: b.expiryDate } : {}),
                addedAt: b.addedAt
            }));

            let finalTargetItemId = targetItemId;
            let targetItemDataToSave: any = null;
            let previousTargetItem: InventoryItem | null = null;

            if (targetItemId) {
                // Merging into existing item
                const targetRef = doc(db, 'users', user.uid, 'items', targetItemId);
                const targetSnap = await getDoc(targetRef);
                
                if (!targetSnap.exists()) throw new Error("Target item not found for merge");
                const existingItem = targetSnap.data() as InventoryItem;
                previousTargetItem = JSON.parse(JSON.stringify(existingItem));

                const updatedBatches = [...(existingItem.batches || []), ...newBatchesForTarget];
                const updatedTotalQuantity = existingItem.totalQuantity + totalMoved;

                targetItemDataToSave = {
                    totalQuantity: updatedTotalQuantity,
                    batches: updatedBatches,
                    updatedAt: new Date().toISOString()
                };

                batch.update(doc(db, 'users', user.uid, 'items', targetItemId), targetItemDataToSave);
            } else {
                // Creating new item
                finalTargetItemId = generateId();
                const targetItemRef = doc(db, 'users', user.uid, 'items', finalTargetItemId);
                
                targetItemDataToSave = {
                    ...item,
                    id: finalTargetItemId,
                    warehouseId: targetWarehouseId,
                    totalQuantity: totalMoved,
                    batches: newBatchesForTarget,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };
                batch.set(targetItemRef, targetItemDataToSave);
            }

            const targetLog: ActivityLog = {
                id: generateId(),
                itemId: finalTargetItemId!,
                itemName: item.name,
                action: 'add',
                warehouseId: targetWarehouseId,
                quantityChange: totalMoved,
                timestamp: new Date().toISOString(),
            };
            batch.set(doc(db, 'users', user.uid, 'activities', targetLog.id), targetLog);

            await batch.commit();

            const previousSourceItem = JSON.parse(JSON.stringify(item));
            pushCommand({
                actionName: `移动物品: ${item.name}`,
                undo: async () => {
                    // Restore source
                    if (newSourceTotal <= 0) {
                        await setDoc(doc(db, 'users', user!.uid, 'items', item.id), previousSourceItem);
                    } else {
                        await updateDoc(doc(db, 'users', user!.uid, 'items', item.id), {
                            totalQuantity: previousSourceItem.totalQuantity,
                            batches: previousSourceItem.batches,
                            updatedAt: previousSourceItem.updatedAt
                        });
                    }
                    
                    // Restore target
                    if (targetItemId && previousTargetItem) {
                        await updateDoc(doc(db, 'users', user!.uid, 'items', targetItemId), {
                            totalQuantity: previousTargetItem.totalQuantity,
                            batches: previousTargetItem.batches,
                            updatedAt: previousTargetItem.updatedAt
                        });
                    } else if (finalTargetItemId) {
                        await deleteDoc(doc(db, 'users', user!.uid, 'items', finalTargetItemId));
                    }
                },
                redo: async () => {
                    // Redo source
                    if (newSourceTotal <= 0) {
                        await deleteDoc(doc(db, 'users', user!.uid, 'items', item.id));
                    } else {
                        await updateDoc(doc(db, 'users', user!.uid, 'items', item.id), {
                            totalQuantity: newSourceTotal,
                            batches: newSourceBatches,
                            updatedAt: new Date().toISOString()
                        });
                    }
                    
                    // Redo target
                    if (targetItemId && targetItemDataToSave) {
                        await updateDoc(doc(db, 'users', user!.uid, 'items', targetItemId), targetItemDataToSave);
                    } else if (finalTargetItemId && targetItemDataToSave) {
                        await setDoc(doc(db, 'users', user!.uid, 'items', finalTargetItemId), targetItemDataToSave);
                    }
                }
            });

        } catch (error) {
            console.error("Error moving items:", error);
        }
    };

    const checkItemExists = async (warehouseId: string, name: string, specification: string) => {
        if (!user) return { exists: false, sameSpec: false, existingSpecs: [], matchingItem: undefined };
        
        try {
            const itemsRef = collection(db, 'users', user.uid, 'items');
            const q = query(itemsRef, where('warehouseId', '==', warehouseId), where('name', '==', name));
            const snapshot = await getDocs(q);
            
            if (snapshot.empty) {
                return { exists: false, sameSpec: false, existingSpecs: [], matchingItem: undefined };
            }
            
            const existingItems = snapshot.docs.map(doc => doc.data() as InventoryItem);
            const specToCompare = specification || '默认规格';
            const matchingItem = existingItems.find(i => (i.specification || '默认规格') === specToCompare);
            const sameSpec = !!matchingItem;
            const existingSpecs = Array.from(new Set(existingItems.map(i => i.specification || '默认规格')));
            
            return { exists: true, sameSpec, existingSpecs, matchingItem };
        } catch (error) {
            console.error("Error checking item existence:", error);
            return { exists: false, sameSpec: false, existingSpecs: [], matchingItem: undefined };
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
        deleteShoppingItem,
        copyItemToWarehouse,
        moveItemBatchesToWarehouse,
        checkItemExists,
        unboughtShoppingCount: shoppingList.filter((s) => !s.isBought).length,
        lowStockItems: items.filter((i) => i.totalQuantity <= i.lowStockThreshold),
    };
}
