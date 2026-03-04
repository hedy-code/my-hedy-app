export type ItemCategory = string;

export const CATEGORY_HIERARCHY: Record<string, Record<string, string>> = {
    '设备设施': {
        '家具': '个',
        '家具附件': '个',
        '家用电器': '个',
        '小型用电器': '个',
        '电子产品': '个',
        '微型置物架': '个',
        '其他设备': '个',
        '其他设施': '个',
    },
    '非耗材类工具': {
        '厨具': '个',
        '餐具': '个',
        '清洁工具': '个',
        '容器类': '个',
        '梳妆工具': '个',
        '测量工具': '个',
        '运动器械': '个',
        '办公文具': '个',
        '其他工具': '个',
    },
    '可循环固体类耗材': {
        '清洁工具': '个',
        '梳妆工具': '个',
        '其他可循环固体类耗材': '个',
    },
    '一次性固体类耗材': {
        '清洁工具': '包/盒',
        '保健类': '包/盒',
        '其他一次性固体类耗材': '包/盒',
    },
    '类流体类耗材': {
        '清洁剂（物体）': '瓶/个',
        '清洁剂（身体）': '瓶/个',
        '护肤品': '瓶/个',
        '化妆品': '瓶/个',
        '食品': '瓶/个',
        '其他类流体类耗材': '瓶/个',
    }
};

export interface InventoryBatch {
    id: string;
    quantity: number;
    expiryDate?: string;       // ISO format YYYY-MM-DD
    addedAt: string;           // ISO timestamp
}

export interface InventoryItem {
    id: string;
    name: string;
    specification?: string;    // Optional for backwards compatibility, defaults to "默认规格" in UI
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
    specification?: string;
    category: ItemCategory | 'Other';
    quantityNeeded: number;
    isBought: boolean;
    createdAt: string;         // ISO timestamp
}
