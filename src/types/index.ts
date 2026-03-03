export type ItemCategory = '食品' | '清洁用品' | '个人护理' | '卫浴用品' | '其他';

export interface InventoryBatch {
    id: string;
    quantity: number;
    expiryDate?: string;       // ISO format YYYY-MM-DD
    addedAt: string;           // ISO timestamp
}

export interface InventoryItem {
    id: string;
    name: string;
    category: ItemCategory;
    totalQuantity: number;     // Changed from 'quantity'
    unit: string;              // e.g., 'pcs', 'ml', 'g', 'rolls'
    lowStockThreshold: number; // Alert when totalQuantity <= this
    batches: InventoryBatch[]; // Replaces 'expiryDate'
    createdAt: string;         // ISO timestamp
    updatedAt: string;         // ISO timestamp
}

export type ActivityAction = 'add' | 'consume' | 'edit' | 'stock_up' | 'delete';

export interface ActivityLog {
    id: string;
    itemId: string;
    itemName: string;          // Denormalized for easier display if item deleted
    action: ActivityAction;
    quantityChange: number;    // e.g., -1 for consume, +2 for stock_up
    timestamp: string;         // ISO timestamp
}

export interface ShoppingItem {
    id: string;
    itemId?: string;           // Optional link to inventory item
    customName: string;
    category: ItemCategory | 'Other';
    quantityNeeded: number;
    isBought: boolean;
    createdAt: string;         // ISO timestamp
}
