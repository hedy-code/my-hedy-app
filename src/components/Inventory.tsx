import { useState } from 'react';
import { useInventory } from '../hooks/useInventory';
import type { InventoryItem } from '../types';
import { CATEGORY_HIERARCHY } from '../types';
import { Plus, Search, Filter, Minus, Edit, Trash2, AlertCircle } from 'lucide-react';
import { isBefore, addDays, parseISO } from 'date-fns';
import './Inventory.css';

const MAIN_CATEGORIES: string[] = Object.keys(CATEGORY_HIERARCHY);

export function Inventory() {
    const { items, addItem, updateItem, deleteItem, deleteItems, consumeItem } = useInventory();

    const [searchName, setSearchName] = useState('');
    const [searchSpec, setSearchSpec] = useState('');
    const [filterMainCategory, setFilterMainCategory] = useState<string>('All');
    const [filterSubCategory, setFilterSubCategory] = useState<string>('All');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

    const [isBatchMode, setIsBatchMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());


    const toggleExpand = (id: string) => {
        const next = new Set(expandedItems);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedItems(next);
    };

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        specification: '默认规格',
        mainCategory: MAIN_CATEGORIES[0],
        subCategory: Object.keys(CATEGORY_HIERARCHY[MAIN_CATEGORIES[0]])[0],
        unit: CATEGORY_HIERARCHY[MAIN_CATEGORIES[0]][Object.keys(CATEGORY_HIERARCHY[MAIN_CATEGORIES[0]])[0]],
        lowStockThreshold: 1 as number | undefined,
        batches: [{ id: crypto.randomUUID(), quantity: 1, expiryDate: '' }] as any[]
    });

    const filteredItems = items.filter(item => {
        const itemSpec = item.specification || '默认规格';

        const matchesName = searchName === '' || item.name.toLowerCase().includes(searchName.toLowerCase());
        const matchesSpec = searchSpec === '' || itemSpec.toLowerCase().includes(searchSpec.toLowerCase());

        // Split legacy categories for backwards compatibility search
        const itemMainCategory = item.category.includes('-') ? item.category.split('-')[0] : item.category;
        const itemSubCategory = item.category.includes('-') ? item.category.split('-')[1] || '' : '';

        const matchesMainCategory = filterMainCategory === 'All' || itemMainCategory === filterMainCategory;
        const matchesSubCategory = filterSubCategory === 'All' || itemSubCategory === filterSubCategory;

        return matchesName && matchesSpec && matchesMainCategory && matchesSubCategory;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
            lowStockThreshold: item.lowStockThreshold || 0,
            batches: item.batches ? [...item.batches] : []
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
                alert(`保存失败！此【名称】${formData.name} + 【规格】${specToSave} 已经存在！\n请在列表中找到该物品，点击[编辑]来修改数量。`);
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

        // Check for duplicate expiry dates
        const expiryDates = formData.batches.map((b: any) => b.expiryDate || '暂无');
        const uniqueDates = new Set(expiryDates);
        if (uniqueDates.size !== expiryDates.length) {
            alert("同一物品不允许包含完全相同保质期的批次！\n请将同保质期的数量合并，或修改为不同的保质期。");
            return;
        }

        const totalQuantity = formData.batches.reduce((sum: number, b: any) => sum + (Number(b.quantity) || 0), 0);
        const validBatches = formData.batches.map((b: any) => ({
            id: b.id || crypto.randomUUID(),
            quantity: Number(b.quantity) || 0,
            ...(b.expiryDate ? { expiryDate: b.expiryDate } : {}),
            addedAt: b.addedAt || new Date().toISOString()
        }));

        if (editingItem) {
            updateItem(editingItem.id, {
                name: formData.name,
                specification: formData.specification || '默认规格',
                category: `${formData.mainCategory}-${formData.subCategory}`,
                unit: formData.unit,
                lowStockThreshold: formData.lowStockThreshold || 0,
                batches: validBatches,
                totalQuantity,
            });
        } else {
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
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        className={isBatchMode ? "btn-primary" : "btn-secondary"}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                        onClick={() => {
                            setIsBatchMode(!isBatchMode);
                            setSelectedItems(new Set());
                        }}>
                        {isBatchMode ? '取消选择' : '批量操作'}
                    </button>
                    {!isBatchMode && (
                        <button className="btn-primary" onClick={handleOpenAdd} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
                            <Plus size={16} /> 新增物品
                        </button>
                    )}
                    {isBatchMode && (
                        <>
                            <button
                                className="btn-secondary"
                                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                                onClick={() => {
                                    if (selectedItems.size === filteredItems.length && filteredItems.length > 0) {
                                        setSelectedItems(new Set()); // Deselect all
                                    } else {
                                        const allIds = filteredItems.map(i => i.id);
                                        setSelectedItems(new Set(allIds)); // Select all filtered
                                    }
                                }}
                            >
                                {selectedItems.size === filteredItems.length && filteredItems.length > 0 ? '取消全选' : '全选'}
                            </button>
                            <button
                                className="btn-primary"
                                style={{ backgroundColor: 'var(--danger-color)', opacity: selectedItems.size === 0 ? 0.5 : 1, padding: '0.5rem 1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                onClick={() => {
                                    if (selectedItems.size === 0) return;
                                    if (window.confirm(`确定要彻底删除选中的 ${selectedItems.size} 个物品吗？操作不可恢复。`)) {
                                        deleteItems(Array.from(selectedItems));
                                        setIsBatchMode(false);
                                        setSelectedItems(new Set());
                                    }
                                }}
                                disabled={selectedItems.size === 0}
                            >
                                <Trash2 size={16} /> 删除所选 ({selectedItems.size})
                            </button>
                        </>
                    )}
                </div>
            </header>

            <div className="category-tabs">
                <button
                    className={`tab-item ${filterMainCategory === 'All' ? 'active' : ''}`}
                    onClick={() => {
                        setFilterMainCategory('All');
                        setFilterSubCategory('All');
                    }}
                >
                    全部
                </button>
                {MAIN_CATEGORIES.map(cat => (
                    <button
                        key={cat}
                        className={`tab-item ${filterMainCategory === cat ? 'active' : ''}`}
                        onClick={() => {
                            setFilterMainCategory(cat);
                            setFilterSubCategory('All');
                        }}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            <div className="filters-bar glass" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', padding: '1rem 1.5rem', marginBottom: '2rem' }}>
                <div className="search-box">
                    <Search size={18} className="icon" />
                    <input
                        type="text"
                        placeholder="按名称搜索..."
                        value={searchName}
                        onChange={(e) => setSearchName(e.target.value)}
                    />
                </div>
                <div className="search-box">
                    <Search size={18} className="icon" />
                    <input
                        type="text"
                        placeholder="按规格搜索..."
                        value={searchSpec}
                        onChange={(e) => setSearchSpec(e.target.value)}
                    />
                </div>
                {/* Secondary category filter remains as a dropdown, but only shows if a main category is selected */}
                <div className="filter-box">
                    <Filter size={18} className="icon" />
                    <select
                        value={filterSubCategory}
                        onChange={(e) => setFilterSubCategory(e.target.value)}
                        disabled={filterMainCategory === 'All'}
                    >
                        <option value="All">所有二级分类</option>
                        {filterMainCategory !== 'All' && Object.keys(CATEGORY_HIERARCHY[filterMainCategory] || {}).map(subCat => (
                            <option key={subCat} value={subCat}>{subCat}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="items-grid">
                {filteredItems.map(item => {
                    const hasLowStock = item.totalQuantity <= (item.lowStockThreshold || 0);
                    return (
                        <div
                            key={item.id}
                            className={`glass item-card ${hasLowStock ? 'low-stock' : ''}`}
                            onClick={() => {
                                if (!isBatchMode) return;
                                const next = new Set(selectedItems);
                                if (next.has(item.id)) next.delete(item.id);
                                else next.add(item.id);
                                setSelectedItems(next);
                            }}
                            style={isBatchMode ? {
                                cursor: 'pointer',
                                border: selectedItems.has(item.id) ? '2px solid var(--primary-color)' : '2px solid transparent',
                                transform: selectedItems.has(item.id) ? 'translateY(-2px)' : 'none',
                                transition: 'all 0.2s ease',
                                boxShadow: selectedItems.has(item.id) ? '0 8px 24px rgba(0, 122, 255, 0.2)' : 'var(--shadow-sm)'
                            } : {}}
                        >
                            <div className="item-card-header">
                                <span className="category-tag">{item.category.replace('-', ' → ')}</span>
                                {isBatchMode ? (
                                    <input
                                        type="checkbox"
                                        checked={selectedItems.has(item.id)}
                                        readOnly
                                        style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)' }}
                                    />
                                ) : isExpiringSoon(item) && (
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

                            {!isBatchMode && (
                                <div className="item-actions">
                                    <button
                                        className="btn-consume"
                                        onClick={() => consumeItem(item.id, 1)}
                                        disabled={item.totalQuantity === 0}
                                    >
                                        <Minus size={16} /> 快捷消耗
                                    </button>

                                    <button className="btn-details" onClick={() => toggleExpand(item.id)}>
                                        库存详情
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
                            )}
                            {expandedItems.has(item.id) && !isBatchMode && (
                                <div className="batches-panel">
                                    {(!item.batches || item.batches.length === 0) ? (
                                        <div className="batch-row flex-between" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                            <span>🗓️ {(item as any).expiryDate || '暂无'}</span>
                                            <span>{item.totalQuantity || (item as any).quantity} {item.unit}</span>
                                        </div>
                                    ) : (
                                        <div className="batches-scroll-area">
                                            {item.batches.map((b, index) => (
                                                <div key={b.id || `batch-${index}`} className="batch-row flex-between" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '6px', alignItems: 'center' }}>
                                                    <span>🗓️ {b.expiryDate || '暂无'}</span>
                                                    <span>{b.quantity} {item.unit}</span>
                                                </div>
                                            ))}
                                        </div>
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
                <div className="modal-overlay">
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
                                        step="1"
                                        value={formData.lowStockThreshold === undefined ? '' : formData.lowStockThreshold}
                                        disabled={!editingItem && items.some(i => i.name === formData.name)}
                                        onChange={e => setFormData({ ...formData, lowStockThreshold: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
                                    />
                                </div>
                            </div>

                            <div className="form-group batches-group">
                                <label>录入批次 (数量 & 保质期)</label>
                                <div className="modal-batches-scroll-area">
                                    {formData.batches.map((batch, index) => (
                                        <div key={batch.id} className="batch-input-row flex-between" style={{ marginBottom: '8px', gap: '8px' }}>
                                            <input
                                                type="number"
                                                min="1"
                                                step="1"
                                                required
                                                value={batch.quantity || ''}
                                                onChange={e => {
                                                    const newBatches = [...formData.batches];
                                                    newBatches[index].quantity = parseInt(e.target.value, 10) || 0;
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
                                </div>
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

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsModalOpen(false)}>取消</button>
                                <button type="submit" className="btn-primary">保存物品</button>
                            </div>
                        </form>
                    </div>
                </div >
            )}
        </div>
    );
}
