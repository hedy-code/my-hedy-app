export type ItemCategory = string;

export const CATEGORY_UNIT_MAP: Record<string, string> = {
    'A01 家具': '个',
    'A01-1 家具附件': '个',
    'A02 家用电器': '个',
    'A02-1 小型用电器': '个',
    'A02-2 电子产品': '个',
    'A03 微型置物架': '个',
    'A04 其他设备': '个',
    'A05 其他设施': '个',
    'B01 厨具': '个',
    'B02 餐具': '个',
    'B03 清洁工具': '个',
    'B04 容器类': '个',
    'B05 梳妆工具': '个',
    'B06 测量工具': '个',
    'B07 运动器械': '个',
    'B08 办公文具': '个',
    'B09 其他工具': '个',
    'C01 可循环-清洁工具': '个',
    'C02 可循环-梳妆工具': '个',
    'C03 其他可循环固体类耗材': '个',
    'D01 一次性-清洁工具': '包/盒',
    'D02 保健类': '包/盒',
    'D03 其他一次性固体类耗材': '包/盒',
    'E01 清洁剂（物体）': '瓶/个',
    'E02 清洁剂（身体）': '瓶/个',
    'E03 护肤品': '瓶/个',
    'E04 化妆品': '瓶/个',
    'E05 食品': '瓶/个',
    'E06 其他类流体类耗材': '瓶/个',
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
