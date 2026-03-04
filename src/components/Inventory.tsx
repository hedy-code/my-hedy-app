import { useState } from 'react';
import { useInventory } from '../hooks/useInventory';
import type { InventoryItem } from '../types';
import { CATEGORY_HIERARCHY } from '../types';
import { Plus, Search, Filter, Minus, Edit, Trash2, AlertCircle } from 'lucide-react';
import { isBefore, addDays, parseISO } from 'date-fns';
import './Inventory.css';

const MAIN_CATEGORIES: string[] = Object.keys(CATEGORY_HIERARCHY);

export function Inventory() {
    const { items, addItem, updateItem, deleteItem, consumeItem, stockUpItem, updateBatchQuantity } = useInventory();

    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState<string>('All');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

    const [editingBatch, setEditingBatch] = useState<{ itemId: string, batchId: string } | null>(null);
    const [tempBatchQty, setTempBatchQty] = useState<number>(0);

    const toggleExpand = (id: string) => {
        const next = new Set(expandedItems);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedItems(next);
    };

    // Stock up state
    const [isStockUpModalOpen, setIsStockUpModalOpen] = useState(false);
    const [stockUpItemData, setStockUpItemData] = useState<InventoryItem | null>(null);
    const [stockUpFormData, setStockUpFormData] = useState({
        quantity: 1,
        expiryDate: ''
    });

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        specification: '默认规格',
        mainCategory: MAIN_CATEGORIES[0],
        subCategory: Object.keys(CATEGORY_HIERARCHY[MAIN_CATEGORIES[0]])[0],
        unit: CATEGORY_HIERARCHY[MAIN_CATEGORIES[0]][Object.keys(CATEGORY_HIERARCHY[MAIN_CATEGORIES[0]])[0]],
        lowStockThreshold: 1 as number | undefined,
        batches: [{ id: crypto.randomUUID(), quantity: 1, expiryDate: '' }]
    });

    const filteredItems = items.filter(item => {
        const specText = item.specification || '默认规格';
        const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) || specText.toLowerCase().includes(search.toLowerCase());
        // Split legacy categories for backwards compatibility search
        const itemMainCategory = item.category.includes('-') ? item.category.split('-')[0] : item.category;
        const matchesCategory = filterCategory === 'All' || itemMainCategory === filterCategory;
        return matchesSearch && matchesCategory;
    });

    const handleOpenAdd = () => {
        setEditingItem(null);
        setFormData({
            name: '',
            specification: '默认规格',
            mainCategory: MAIN_CATEGORIES[0],
            subCategory: Object.keys(CATEGORY_HIERARCHY[MAIN_CATEGORIES[0]])[0],
            unit: CATEGORY_HIERARCHY[MAIN_CATEGORIES[0]][Object.keys(CATEGORY_HIERARCHY[MAIN_CATEGORIES[0]])[0]],
            lowStockThreshold: 1,
            batches: [{ id: crypto.randomUUID(), quantity: 1, expiryDate: '' }]
        });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (item: InventoryItem) => {
        setEditingItem(item);

        let initialMain = MAIN_CATEGORIES[0];
        let initialSub = Object.keys(CATEGORY_HIERARCHY[MAIN_CATEGORIES[0]])[0];

        if (item.category.includes('-')) {
            const parts = item.category.split('-');
            if (MAIN_CATEGORIES.includes(parts[0]) && CATEGORY_HIERARCHY[parts[0]]?.[parts[1]]) {
                initialMain = parts[0];
                initialSub = parts[1];
            }
        } else { // Handle legacy plain categories
            // Try to find a main category that matches the legacy category
            const matchingMain = MAIN_CATEGORIES.find(cat => cat === item.category);
            if (matchingMain) {
                initialMain = matchingMain;
                initialSub = Object.keys(CATEGORY_HIERARCHY[matchingMain])[0]; // Pick first sub-category
            } else {
                // If no direct main category match, try to find it as a sub-category
                for (const mainCat of MAIN_CATEGORIES) {
                    if (Object.keys(CATEGORY_HIERARCHY[mainCat]).includes(item.category)) {
                        initialMain = mainCat;
                        initialSub = item.category;
                        break;
                    }
                }
            }
        }

        setFormData({
            name: item.name,
            specification: item.specification || '默认规格',
            mainCategory: initialMain,
            subCategory: initialSub,
            unit: item.unit,
            lowStockThreshold: item.lowStockThreshold,
            batches: [] // Editing batches is not supported in the basic edit form
        });
        setIsModalOpen(true);
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();

        // Validation for new item
        if (!editingItem) {
            const specToSave = formData.specification || '默认规格';
            const exactMatch = items.find(i => i.name === formData.name && (i.specification || '默认规格') === specToSave);
            if (exactMatch) {
                alert(`保存失败！此【名称】${formData.name} + 【规格】${specToSave} 已经存在！\n请通过卡片上的[进货]功能来增加数量。`);
                return;
            }
            const nameMatch = items.find(i => i.name === formData.name);
            if (nameMatch) {
                const existingSpecs = items.filter(i => i.name === formData.name).map(i => i.specification || '默认规格').join('、');
                if (!window.confirm(`此【${formData.name}】已记录过以下规格：\n${existingSpecs}\n\n请确认是否为您所要添加的全新规格？`)) {
                    return; // clicked cancel, stop.
                }
                // If clicked yes, continue to the save logic below.
            }
        }

        if (editingItem) {
            updateItem(editingItem.id, {
                name: formData.name,
                specification: formData.specification || '默认规格',
                category: `${formData.mainCategory}-${formData.subCategory}`,
                unit: formData.unit,
                lowStockThreshold: formData.lowStockThreshold || 0,
            });
        } else {
            const totalQuantity = formData.batches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
            const validBatches = formData.batches.map(b => ({
                id: crypto.randomUUID(),
                quantity: Number(b.quantity) || 0,
                ...(b.expiryDate ? { expiryDate: b.expiryDate } : {}),
                addedAt: new Date().toISOString()
            }));

            addItem({
                name: formData.name,
                specification: formData.specification || '默认规格',
                category: `${formData.mainCategory}-${formData.subCategory}`,
                totalQuantity,
                unit: formData.unit,
                lowStockThreshold: formData.lowStockThreshold || 0,
                batches: validBatches
            });
        }
        setIsModalOpen(false);
    };

    const isExpiringSoon = (item: InventoryItem) => {
        if (!item.batches) return false;
        return item.batches.some(b => {
            if (!b.expiryDate) return false;
            return isBefore(parseISO(b.expiryDate), addDays(new Date(), 30));
        });
    };

    return (
        <div className="inventory-page">
            <header className="page-header flex-between">
                <div>
                    <h1 className="title">库存管理</h1>
                    <p className="subtitle">管理您家中的所有物品</p>
                </div>
                <button className="btn-primary" onClick={handleOpenAdd}>
                    <Plus size={20} /> 新增物品
                </button>
            </header>

            <div className="filters-bar glass">
                <div className="search-box">
                    <Search size={20} className="icon" />
                    <input
                        type="text"
                        placeholder="搜索物品..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="filter-box">
                    <Filter size={20} className="icon" />
                    <div className="categories-list">
                        <button
                            className={`category-btn ${filterCategory === 'All' ? 'active' : ''}`}
                            onClick={() => setFilterCategory('All')}
                        >
                            全部 ({items.length})
                        </button>
                        {MAIN_CATEGORIES.map(cat => {
                            const count = items.filter(i => {
                                const mainStr = i.category.includes('-') ? i.category.split('-')[0] : i.category;
                                return mainStr === cat;
                            }).length;
                            if (count === 0 && filterCategory !== cat) return null;

                            let totalQty = 0;
                            if (filterCategory === cat || filterCategory === 'All') {
                                totalQty = count;
                            }
                            return (
                                <button
                                    key={cat}
                                    className={`category-btn ${filterCategory === cat ? 'active' : ''}`}
                                    onClick={() => setFilterCategory(cat)}
                                >
                                    {cat}
                                    <span className={`category-badge ${totalQty === 0 ? 'empty' : ''}`}>
                                        {totalQty}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="items-grid">
                {filteredItems.map(item => {
                    const hasLowStock = item.totalQuantity <= (item.lowStockThreshold || 0);
                    return (
                        <div key={item.id} className={`glass item-card ${hasLowStock ? 'low-stock' : ''}`}>
                            <div className="item-card-header">
                                <span className="category-tag">{item.category.replace('-', ' → ')}</span>
                                {isExpiringSoon(item) && (
                                    <span className="warning-tag" title="30天内过期">
                                        <AlertCircle size={14} /> 即将过期
                                    </span>
                                )}
                            </div>

                            <h3 className="item-name">
                                {item.name}
                                <span style={{ fontSize: '0.75em', color: 'var(--text-secondary)', marginLeft: '8px', fontWeight: 'normal' }}>
                                    [{item.specification || '默认规格'}]
                                </span>
                            </h3>

                            <div className="item-qty-display">
                                <span className="qty-value">{item.totalQuantity}</span>
                                <span className="qty-unit">{item.unit}</span>
                            </div>
                            <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '-8px', marginBottom: '12px' }}>
                                警报线: {item.lowStockThreshold || 0}
                            </div>

                            {item.totalQuantity <= (item.lowStockThreshold || 0) && (
                                <p className="low-stock-msg">库存不足！</p>
                            )}

                            <div className="item-actions">
                                <button
                                    className="btn-consume"
                                    onClick={() => consumeItem(item.id, 1)}
                                    disabled={item.totalQuantity === 0}
                                >
                                    <Minus size={16} /> 快捷消耗
                                </button>

                                <button
                                    className="btn-primary"
                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                                    onClick={() => {
                                        setStockUpItemData(item);
                                        setStockUpFormData({ quantity: 1, expiryDate: '' });
                                        setIsStockUpModalOpen(true);
                                    }}
                                >
                                    <Plus size={16} /> 进货
                                </button>

                                <button className="btn-secondary" onClick={() => toggleExpand(item.id)}>
                                    详情
                                </button>

                                <div className="secondary-actions">
                                    <button className="icon-btn edit-btn" onClick={() => handleOpenEdit(item)}>
                                        <Edit size={16} />
                                    </button>
                                    <button className="icon-btn delete-btn" onClick={() => deleteItem(item.id)}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                            {expandedItems.has(item.id) && (
                                <div className="batches-panel">
                                    <h4>批次详情</h4>
                                    {(!item.batches || item.batches.length === 0) ? (
                                        <div className="batch-row flex-between" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                            <span>🗓️ {(item as any).expiryDate || '暂无'}</span>
                                            <span>{item.totalQuantity || (item as any).quantity} {item.unit}</span>
                                        </div>
                                    ) : (
                                        item.batches.map(b => (
                                            <div key={b.id} className="batch-row flex-between" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px', alignItems: 'center' }}>
                                                <span>🗓️ {b.expiryDate || '暂无'}</span>
                                                {editingBatch?.itemId === item.id && editingBatch?.batchId === b.id ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.1"
                                                            style={{ width: '70px', padding: '0.2rem', fontSize: '0.9rem' }}
                                                            value={tempBatchQty === 0 && tempBatchQty.toString() !== "0" ? "" : tempBatchQty}
                                                            onChange={e => setTempBatchQty(parseFloat(e.target.value) || 0)}
                                                        />
                                                        <button className="icon-btn" onClick={() => {
                                                            updateBatchQuantity(item.id, b.id, tempBatchQty);
                                                            setEditingBatch(null);
                                                        }} style={{ color: 'var(--brand-primary)', padding: '4px' }}>✓</button>
                                                        <button className="icon-btn delete-btn" onClick={() => setEditingBatch(null)} style={{ padding: '4px' }}>✕</button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span>{b.quantity} {item.unit}</span>
                                                        <button className="icon-btn" onClick={() => {
                                                            setEditingBatch({ itemId: item.id, batchId: b.id });
                                                            setTempBatchQty(b.quantity);
                                                        }} style={{ padding: '2px', color: 'var(--text-secondary)' }}><Edit size={14} /></button>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
                {filteredItems.length === 0 && (
                    <div className="empty-state glass">
                        <p>未找到任何物品。</p>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="glass modal-content" onClick={e => e.stopPropagation()}>
                        <h2 className="modal-title">{editingItem ? '编辑物品' : '新增物品'}</h2>
                        <form onSubmit={handleSave} className="item-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label>名称</label>
                                    <input required type="text" value={formData.name} onChange={e => {
                                        const newName = e.target.value;
                                        const existing = items.find(i => i.name === newName);
                                        setFormData({
                                            ...formData,
                                            name: newName,
                                            lowStockThreshold: (!editingItem && existing) ? existing.lowStockThreshold : formData.lowStockThreshold
                                        });
                                    }} />
                                </div>
                                <div className="form-group">
                                    <label>规格 (必填)</label>
                                    <input required type="text" value={formData.specification} onChange={e => setFormData({ ...formData, specification: e.target.value })} />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>一级类别</label>
                                    <select value={formData.mainCategory} onChange={e => {
                                        const mainCat = e.target.value;
                                        const subCat = Object.keys(CATEGORY_HIERARCHY[mainCat])[0];
                                        setFormData({
                                            ...formData,
                                            mainCategory: mainCat,
                                            subCategory: subCat,
                                            unit: CATEGORY_HIERARCHY[mainCat][subCat]
                                        });
                                    }}>
                                        {MAIN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>二级类别</label>
                                    <select value={formData.subCategory} onChange={e => {
                                        const subCat = e.target.value;
                                        setFormData({
                                            ...formData,
                                            subCategory: subCat,
                                            unit: CATEGORY_HIERARCHY[formData.mainCategory][subCat]
                                        });
                                    }}>
                                        {Object.keys(CATEGORY_HIERARCHY[formData.mainCategory] || {}).map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="form-row">
                                {editingItem && (
                                    <div className="form-group">
                                        <label>当前总数量</label>
                                        <input type="number" value={editingItem.totalQuantity} disabled />
                                    </div>
                                )}
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>管理单位 (根据分类自动带出)</label>
                                    <input required type="text" value={formData.unit} disabled={true} onChange={e => setFormData({ ...formData, unit: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>低库存警报线 {(!editingItem && items.some(i => i.name === formData.name)) ? '(跟随同名已有设置)' : ''}</label>
                                    <input
                                        required
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={formData.lowStockThreshold === undefined ? '' : formData.lowStockThreshold}
                                        disabled={!editingItem && items.some(i => i.name === formData.name)}
                                        onChange={e => setFormData({ ...formData, lowStockThreshold: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>

                            {!editingItem && (
                                <div className="form-group batches-group">
                                    <label>录入批次 (数量 & 保质期)</label>
                                    {formData.batches.map((batch, index) => (
                                        <div key={batch.id} className="batch-input-row flex-between" style={{ marginBottom: '8px', gap: '8px' }}>
                                            <input
                                                type="number"
                                                min="0.1"
                                                step="0.1"
                                                required
                                                value={batch.quantity || ''}
                                                onChange={e => {
                                                    const newBatches = [...formData.batches];
                                                    newBatches[index].quantity = parseFloat(e.target.value) || 0;
                                                    setFormData({ ...formData, batches: newBatches });
                                                }}
                                                style={{ width: '80px' }}
                                                placeholder="数量"
                                            />
                                            <input
                                                type="date"
                                                value={batch.expiryDate}
                                                onChange={e => {
                                                    const newBatches = [...formData.batches];
                                                    newBatches[index].expiryDate = e.target.value;
                                                    setFormData({ ...formData, batches: newBatches });
                                                }}
                                                style={{ flex: 1 }}
                                            />
                                            {formData.batches.length > 1 && (
                                                <button
                                                    type="button"
                                                    className="icon-btn delete-btn"
                                                    onClick={() => {
                                                        const newBatches = formData.batches.filter((_, i) => i !== index);
                                                        setFormData({ ...formData, batches: newBatches });
                                                    }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        style={{ width: '100%', marginTop: '8px', fontSize: '0.9rem', padding: '0.5rem' }}
                                        onClick={() => {
                                            setFormData({
                                                ...formData,
                                                batches: [...formData.batches, { id: crypto.randomUUID(), quantity: 1, expiryDate: '' }]
                                            });
                                        }}
                                    >
                                        + 添加另一批次
                                    </button>
                                    <div style={{ marginTop: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                        总计入库数量: {formData.batches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0)} {formData.unit}
                                    </div>
                                </div>
                            )}

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsModalOpen(false)}>取消</button>
                                <button type="submit" className="btn-primary">保存物品</button>
                            </div>
                        </form>
                    </div>
                </div >
            )
            }
            {
                isStockUpModalOpen && stockUpItemData && (
                    <div className="modal-overlay" onClick={() => setIsStockUpModalOpen(false)}>
                        <div className="glass modal-content" onClick={e => e.stopPropagation()}>
                            <h2 className="modal-title">进货: {stockUpItemData.name}</h2>
                            <form onSubmit={(e) => {
                                e.preventDefault();
                                stockUpItem(stockUpItemData.id, stockUpFormData.quantity, stockUpFormData.expiryDate || undefined);
                                setIsStockUpModalOpen(false);
                            }} className="item-form">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>新增数量 ({stockUpItemData.unit})</label>
                                        <input required type="number" min="0.1" step="0.1" value={stockUpFormData.quantity || ''} onChange={e => setStockUpFormData({ ...stockUpFormData, quantity: parseFloat(e.target.value) || 0 })} />
                                    </div>
                                    <div className="form-group">
                                        <label>此批次保质期 (可选)</label>
                                        <input type="date" value={stockUpFormData.expiryDate} onChange={e => setStockUpFormData({ ...stockUpFormData, expiryDate: e.target.value })} />
                                    </div>
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn-cancel" onClick={() => setIsStockUpModalOpen(false)}>取消</button>
                                    <button type="submit" className="btn-primary">确认进货</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
