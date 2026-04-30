import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWarehouse } from '../contexts/WarehouseContext';
import type { InventoryItem } from '../types';
import { CATEGORY_HIERARCHY, CATEGORY_ORDER } from '../types';
import { 
  Plus, Edit, Trash2, Search, LayoutGrid, List, 
  Upload, FileSpreadsheet, Minus, Send, AlertCircle, X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { addDays, parseISO, isBefore } from 'date-fns';
import { TransferItemModal } from './TransferItemModal';
import { useInventory } from '../hooks/useInventory';
import './Inventory.css';

const MAIN_CATEGORIES: string[] = Object.keys(CATEGORY_HIERARCHY);

export function Inventory() {
    const { 
        items, addItem, updateItem, deleteItem, deleteItems, consumeItem, 
        copyItemToWarehouse, moveItemBatchesToWarehouse, checkItemExists 
    } = useInventory();
    const { warehouses, currentWarehouseId } = useWarehouse();
    const location = useLocation();
    const navigate = useNavigate();

    const [searchName, setSearchName] = useState('');
    const [searchSpec, setSearchSpec] = useState('');
    const [filterMainCategory, setFilterMainCategory] = useState<string>('All');
    const [filterSubCategory, setFilterSubCategory] = useState<string>('All');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
    const [expandedRemarks, setExpandedRemarks] = useState<Set<string>>(new Set());

    const [isBatchMode, setIsBatchMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [transferringItem, setTransferringItem] = useState<InventoryItem | null>(null);

    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [tableFilters, setTableFilters] = useState<Record<string, string>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);

// ... exportToExcel moved down to use fully sorted filteredItems directly ...

    const toggleExpand = (id: string) => {
        const next = new Set(expandedItems);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedItems(next);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws) as any[];

                if (data.length === 0) {
                    alert('未解析到有效数据，请检查文件格式。');
                    return;
                }

                const itemsToAdd: any[] = [];
                for (const row of data) {
                    const name = row['物品名称'];
                    if (!name) continue;
                    
                    const spec = row['规格'] || '默认规格';
                    const catStr = row['分类'] || '';
                    const category = catStr.replace(' → ', '-');
                    const unit = row['管理单位'] || '个';
                    const lowStock = parseInt(row['警报线']) || 0;
                    const remarks = row['备注'] || '';
                    const batchesStr = row['保质期明细'] || '';
                    
                    const batches: any[] = [];
                    const batchParts = batchesStr.split(';');
                    for (let part of batchParts) {
                        part = part.trim();
                        if (!part) continue;
                        const match = part.match(/(.*?)\((\d+)\)/);
                        if (match) {
                            const dateStr = match[1].trim();
                            const qty = parseInt(match[2], 10);
                            batches.push({
                                id: crypto.randomUUID(),
                                quantity: qty,
                                expiryDate: dateStr === '暂无' ? '' : dateStr,
                                addedAt: new Date().toISOString()
                            });
                        }
                    }
                    
                    if (batches.length === 0) {
                        batches.push({
                            id: crypto.randomUUID(),
                            quantity: parseInt(row['当前总数量']) || 0,
                            expiryDate: '',
                            addedAt: new Date().toISOString()
                        });
                    }
                    
                    const totalQuantity = batches.reduce((sum, b) => sum + b.quantity, 0);
                    
                    itemsToAdd.push({
                        name,
                        specification: spec,
                        category,
                        unit,
                        lowStockThreshold: lowStock,
                        remarks,
                        totalQuantity,
                        batches
                    });
                }
                
                if (itemsToAdd.length > 0) {
                    if (window.confirm(`即将导入 ${itemsToAdd.length} 条数据，是否继续？（建议不要重复导入已存在的物品）`)) {
                        for (const item of itemsToAdd) {
                            await addItem(item);
                        }
                        alert('导入完成！');
                    }
                } else {
                    alert('未解析到有效数据，请检查文件格式。');
                }
            } catch (error: any) {
                alert('读取文件出错: ' + error.message);
            } finally {
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const getSortDescription = (key: string, direction: 'asc' | 'desc') => {
        if (key === 'category') return direction === 'asc' ? '预设分类顺序' : '预设分类逆序';
        if (['lowStockThreshold', 'totalQuantity', 'quantity'].includes(key)) return direction === 'asc' ? '数值从小到大' : '数值从大到小';
        if (['name', 'specification', 'remarks'].includes(key)) return direction === 'asc' ? '符号 → 数字 → 字母 → 中文 (空值底)' : '中文 → 字母 → 数字 → 符号 (空值顶)';
        return '默认';
    };

    const getSortTitle = (key: string) => {
        const titles: Record<string, string> = {
            name: '物品名称',
            specification: '规格',
            category: '分类',
            totalQuantity: '保质期与数量',
            lowStockThreshold: '警报线',
            remarks: '备注'
        };
        return titles[key] || '未知字段';
    };

    const renderSortableHeader = (title: string, sortKey: string, filterKey: string) => {
        const isSorted = sortConfig?.key === sortKey;
        
        return (
            <th style={{ padding: '12px 16px', fontWeight: 'bold' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div 
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            cursor: 'pointer', 
                            userSelect: 'none',
                            width: '100%'
                        }}
                        onClick={() => {
                            let direction: 'asc' | 'desc' = 'asc';
                            if (sortConfig && sortConfig.key === sortKey && sortConfig.direction === 'asc') direction = 'desc';
                            if (sortConfig && sortConfig.key === sortKey && sortConfig.direction === 'desc') {
                                setSortConfig(null);
                                return;
                            }
                            setSortConfig({ key: sortKey, direction });
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isSorted ? 'var(--primary-color)' : 'inherit' }}>
                            <span>{title}{isSorted ? (sortConfig.direction === 'asc' ? ' (正序)' : ' (倒序)') : ''}</span>
                        </div>
                    </div>
                    {filterKey && (
                        <input 
                            type="text" 
                            placeholder={`筛选...`}
                            value={tableFilters[filterKey] || ''}
                            onChange={(e) => setTableFilters(prev => ({...prev, [filterKey]: e.target.value}))}
                            style={{ padding: '4px', fontSize: '0.8rem', width: '100%', boxSizing: 'border-box' }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    )}
                </div>
            </th>
        );
    };

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        specification: '默认规格',
        mainCategory: MAIN_CATEGORIES[0],
        subCategory: Object.keys(CATEGORY_HIERARCHY[MAIN_CATEGORIES[0]])[0],
        unit: CATEGORY_HIERARCHY[MAIN_CATEGORIES[0]][Object.keys(CATEGORY_HIERARCHY[MAIN_CATEGORIES[0]])[0]],
        lowStockThreshold: 1 as number | undefined,
        batches: [{ id: crypto.randomUUID(), quantity: 1, expiryDate: '' }] as any[],
        remarks: ''
    });

    useEffect(() => {
        if (location.state?.initialAddItemData) {
            const item = location.state.initialAddItemData;
            
            let initialMain = MAIN_CATEGORIES[0];
            let initialSub = Object.keys(CATEGORY_HIERARCHY[MAIN_CATEGORIES[0]])[0];
    
            if (item.category && item.category.includes('-')) {
                const parts = item.category.split('-');
                if (MAIN_CATEGORIES.includes(parts[0]) && CATEGORY_HIERARCHY[parts[0]]?.[parts[1]]) {
                    initialMain = parts[0];
                    initialSub = parts[1];
                }
            }

            setEditingItem(null);
            setFormData({
                name: item.name,
                specification: item.specification || '默认规格',
                mainCategory: initialMain,
                subCategory: initialSub,
                unit: item.unit,
                lowStockThreshold: item.lowStockThreshold || 0,
                batches: [{ id: crypto.randomUUID(), quantity: 1, expiryDate: '' }],
                remarks: item.remarks || ''
            });
            setIsModalOpen(true);
            
            // Clear the state so it doesn't trigger again on refresh
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, location.pathname, navigate]);

    const filteredItems = items.filter((item: InventoryItem) => {
        if (item.totalQuantity <= 0) return false;

        const itemSpec = item.specification || '默认规格';

        const matchesName = searchName === '' || item.name.toLowerCase().includes(searchName.toLowerCase());
        const matchesSpec = searchSpec === '' || itemSpec.toLowerCase().includes(searchSpec.toLowerCase());

        // Split legacy categories for backwards compatibility search
        const itemMainCategory = item.category.includes('-') ? item.category.split('-')[0] : item.category;
        const itemSubCategory = item.category.includes('-') ? item.category.split('-')[1] || '' : '';

        const matchesMainCategory = filterMainCategory === 'All' || itemMainCategory === filterMainCategory;
        const matchesSubCategory = filterSubCategory === 'All' || itemSubCategory === filterSubCategory;

        if (!(matchesName && matchesSpec && matchesMainCategory && matchesSubCategory)) return false;

        for (const key in tableFilters) {
            if (!tableFilters[key]) continue;
            const filterVal = tableFilters[key].toLowerCase();
            if (key === 'name' && !item.name.toLowerCase().includes(filterVal)) return false;
            if (key === 'specification' && !(item.specification || '默认规格').toLowerCase().includes(filterVal)) return false;
            if (key === 'category' && !item.category.replace('-', ' → ').toLowerCase().includes(filterVal)) return false;
            if (key === 'lowStockThreshold' && !String(item.lowStockThreshold || 0).includes(filterVal)) return false;
            if (key === 'remarks' && !(item.remarks || '').toLowerCase().includes(filterVal)) return false;
        }

        return true;
    });

    if (sortConfig) {
        filteredItems.sort((a, b) => {
            let aVal: any = a[sortConfig.key as keyof InventoryItem];
            let bVal: any = b[sortConfig.key as keyof InventoryItem];
            
            if (sortConfig.key === 'specification') {
                aVal = aVal || '默认规格'; bVal = bVal || '默认规格';
            } else if (sortConfig.key === 'lowStockThreshold') {
                aVal = aVal || 0; bVal = bVal || 0;
            } else if (sortConfig.key === 'remarks') {
                aVal = aVal || ''; bVal = bVal || '';
            } else if (sortConfig.key === 'totalQuantity') {
                aVal = a.totalQuantity; bVal = b.totalQuantity;
            }

            if (sortConfig.key === 'category') {
                const aIdx = CATEGORY_ORDER[a.category] ?? 9999;
                const bIdx = CATEGORY_ORDER[b.category] ?? 9999;
                if (aIdx !== bIdx) {
                    return sortConfig.direction === 'asc' ? aIdx - bIdx : bIdx - aIdx;
                }
            }

            if (['name', 'specification', 'remarks'].includes(sortConfig.key)) {
                const sA = String(aVal);
                const sB = String(bVal);
                
                const getPriority = (s: string) => {
                    if (!s) return 4;
                    const char = s[0];
                    if (/[0-9]/.test(char)) return 1; // Numbers
                    if (/[a-zA-Z]/.test(char)) return 2; // English
                    if (/[\u4e00-\u9fa5]/.test(char)) return 3; // Chinese
                    return 0; // Symbols
                };

                const pA = getPriority(sA);
                const pB = getPriority(sB);
                if (pA !== pB) return sortConfig.direction === 'asc' ? pA - pB : pB - pA;

                return sortConfig.direction === 'asc' 
                    ? sA.localeCompare(sB, 'zh-Hans-CN', { numeric: true })
                    : sB.localeCompare(sA, 'zh-Hans-CN', { numeric: true });
            }

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    } else {
        filteredItems.sort((a: InventoryItem, b: InventoryItem) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    const exportToExcel = () => {
        const headers = ['物品名称', '规格', '分类', '当前总数量', '管理单位', '警报线', '备注', '保质期明细'];
        
        const data = filteredItems.map((item: InventoryItem) => {
            const batchesStr = (item.batches || []).map((b: any) => `${b.expiryDate || '暂无'}(${b.quantity})`).join('; ');
            return [
                item.name || '',
                item.specification || '默认规格',
                (item.category || '').replace('-', ' → '),
                item.totalQuantity,
                item.unit || '',
                item.lowStockThreshold || 0,
                item.remarks || '',
                batchesStr
            ];
        });

        data.unshift(headers);
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "库存列表");
        const currentWarehouse = warehouses.find(w => w.id === currentWarehouseId);
        const warehouseName = currentWarehouse?.name || '所有仓库';
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const h = now.getHours().toString().padStart(2, '0');
        const m = now.getMinutes().toString().padStart(2, '0');
        const s = now.getSeconds().toString().padStart(2, '0');
        const timeStr = `${h}-${m}-${s}`;
        XLSX.writeFile(wb, `库存清单_${warehouseName}_${dateStr}_${timeStr}.xlsx`);
    };
    const handleOpenAdd = () => {
        setEditingItem(null);
        
        let initialMain = MAIN_CATEGORIES[0];
        let initialSub = Object.keys(CATEGORY_HIERARCHY[MAIN_CATEGORIES[0]])[0];
        
        if (filterMainCategory !== 'All') {
            initialMain = filterMainCategory;
            if (filterSubCategory !== 'All') {
                initialSub = filterSubCategory;
            } else {
                initialSub = Object.keys(CATEGORY_HIERARCHY[initialMain])[0];
            }
        }
        
        const initialUnit = CATEGORY_HIERARCHY[initialMain][initialSub] || '个';

        setFormData({
            name: '',
            specification: '默认规格',
            mainCategory: initialMain,
            subCategory: initialSub,
            unit: initialUnit,
            lowStockThreshold: 0,
            batches: [{ id: crypto.randomUUID(), quantity: 1, expiryDate: '' }],
            remarks: ''
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
            batches: item.batches ? JSON.parse(JSON.stringify(item.batches)) : [],
            remarks: item.remarks || ''
        });
        setIsModalOpen(true);
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();

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

        // Validation for new item
        if (!editingItem) {
            const specToSave = formData.specification || '默认规格';
            const exactMatch = items.find((i: InventoryItem) => i.name === formData.name && (i.specification || '默认规格') === specToSave);
            
            if (exactMatch) {
                if (exactMatch.totalQuantity <= 0) {
                    // Reactivate this hidden item
                    updateItem(exactMatch.id, {
                        name: formData.name,
                        specification: formData.specification || '默认规格',
                        category: `${formData.mainCategory}-${formData.subCategory}`,
                        unit: formData.unit,
                        lowStockThreshold: formData.lowStockThreshold || 0,
                        batches: validBatches,
                        totalQuantity,
                        remarks: formData.remarks
                    });
                    setIsModalOpen(false);
                    return;
                } else {
                    alert(`保存失败！此【名称】${formData.name} + 【规格】${specToSave} 已经存在！\n请在列表中找到该物品，点击[编辑]来修改数量。`);
                    return;
                }
            }
            
            const nameMatch = items.find((i: InventoryItem) => i.name === formData.name);
            if (nameMatch) {
                const existingSpecs = items.filter((i: InventoryItem) => i.name === formData.name).map((i: InventoryItem) => i.specification || '默认规格').join('、');
                if (!window.confirm(`此【${formData.name}】已记录过以下规格：\n${existingSpecs}\n\n请确认是否为您所要添加的全新规格？`)) {
                    return; // clicked cancel, stop.
                }
            }
        }

        if (editingItem) {
            updateItem(editingItem.id, {
                name: formData.name,
                specification: formData.specification || '默认规格',
                category: `${formData.mainCategory}-${formData.subCategory}`,
                unit: formData.unit,
                lowStockThreshold: formData.lowStockThreshold || 0,
                batches: validBatches,
                totalQuantity,
                remarks: formData.remarks
            });
        } else {
            addItem({
                name: formData.name,
                specification: formData.specification || '默认规格',
                category: `${formData.mainCategory}-${formData.subCategory}`,
                totalQuantity,
                unit: formData.unit,
                lowStockThreshold: formData.lowStockThreshold || 0,
                batches: validBatches,
                remarks: formData.remarks
            });
        }
        setIsModalOpen(false);
    };

    const getExpiryStats = (item: InventoryItem) => {
        if (!item.batches) return { expiredQty: 0, expiringSoonQty: 0 };
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const nextMonth = addDays(now, 30);
        
        let expiredQty = 0;
        let expiringSoonQty = 0;
        
        item.batches.forEach(b => {
            if (!b.expiryDate) return;
            const expiry = parseISO(b.expiryDate);
            if (isBefore(expiry, now)) {
                expiredQty += b.quantity;
            } else if (isBefore(expiry, nextMonth)) {
                expiringSoonQty += b.quantity;
            }
        });
        
        return { expiredQty, expiringSoonQty };
    };

    const handleOpenTransfer = (item: InventoryItem) => {
        setTransferringItem(item);
        setIsTransferModalOpen(true);
    };

    return (
        <div className="inventory-page">
            <header className="page-header flex-between">
                <div>
                    <h1 className="title">库存管理</h1>
                    <p className="subtitle">管理您家中的所有物品</p>
                </div>
                <div className="header-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div className="view-switcher glass" style={{ display: 'flex', borderRadius: '8px', padding: '4px', gap: '2px' }}>
                        <button 
                            className={`icon-btn form-group`} 
                            style={{ margin: 0, padding: '4px 8px', backgroundColor: viewMode === 'grid' ? 'var(--primary-color)' : 'transparent', color: viewMode === 'grid' ? 'white' : 'var(--text-color)' }}
                            onClick={() => setViewMode('grid')}
                            title="网格视图"
                        >
                            <LayoutGrid size={16} />
                        </button>
                        <button 
                            className={`icon-btn form-group`} 
                            style={{ margin: 0, padding: '4px 8px', backgroundColor: viewMode === 'table' ? 'var(--primary-color)' : 'transparent', color: viewMode === 'table' ? 'white' : 'var(--text-color)' }}
                            onClick={() => setViewMode('table')}
                            title="表格视图"
                        >
                            <List size={16} />
                        </button>
                    </div>
                    <input 
                        type="file" 
                        accept=".xlsx, .xls, .csv" 
                        ref={fileInputRef} 
                        style={{ display: 'none' }} 
                        onChange={handleImport} 
                    />
                    <button className="btn-secondary" onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
                        <Upload size={16} /> 导入 Excel
                    </button>
                    <button className="btn-secondary" onClick={exportToExcel} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
                        <FileSpreadsheet size={16} /> 导出 Excel
                    </button>
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
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn-primary" onClick={handleOpenAdd} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
                                <Plus size={16} /> 新增物品
                            </button>
                        </div>
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
                                        const allIds = filteredItems.map((i: InventoryItem) => i.id);
                                        setSelectedItems(new Set(allIds)); // Select all filtered
                                    }
                                }}
                            >
                                {selectedItems.size === filteredItems.length && filteredItems.length > 0 ? '取消全选' : '全选'}
                            </button>
                            <button
                                className="btn-primary"
                                style={{ backgroundColor: 'var(--danger)', opacity: selectedItems.size === 0 ? 0.5 : 1, padding: '0.5rem 1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
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

            {filterMainCategory !== 'All' && (
                <div className="category-tabs" style={{ marginTop: '0.5rem' }}>
                    <button
                        className={`tab-item ${filterSubCategory === 'All' ? 'active' : ''}`}
                        onClick={() => setFilterSubCategory('All')}
                    >
                        全部子分类
                    </button>
                    {Object.keys(CATEGORY_HIERARCHY[filterMainCategory] || {}).map(subCat => (
                        <button
                            key={subCat}
                            className={`tab-item ${filterSubCategory === subCat ? 'active' : ''}`}
                            onClick={() => setFilterSubCategory(subCat)}
                        >
                            {subCat}
                        </button>
                    ))}
                </div>
            )}
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
            </div>

            <div className="sort-indicator glass" style={{ 
                padding: '10px 16px', 
                marginBottom: '1.5rem', 
                fontSize: '0.9rem', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                color: 'var(--text-secondary)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'rgba(255, 255, 255, 0.5)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: '600', color: 'var(--text-color)' }}>当前排序依据：</span>
                    {sortConfig ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary-color)', fontWeight: '500' }}>
                            <span>{getSortTitle(sortConfig.key)} ({sortConfig.direction === 'asc' ? '正序' : '倒序'})</span>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary-color)', fontWeight: '500' }}>
                            <span>默认顺序 (最近添加优先)</span>
                        </div>
                    )}
                </div>
                <div style={{ marginLeft: 'auto', fontSize: '0.8rem', opacity: 0.8, fontStyle: 'italic' }}>
                    {sortConfig ? `* ${getSortDescription(sortConfig.key, sortConfig.direction)}` : '* 默认按照添加时间倒序排序'}
                </div>
            </div>

            {viewMode === 'grid' ? (
                <div className="items-grid">
                    {filteredItems.map((item, index) => {
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
                            style={{
                                ...(isBatchMode ? {
                                    cursor: 'pointer',
                                    border: selectedItems.has(item.id) ? '2px solid var(--primary-color)' : '2px solid transparent',
                                    transform: selectedItems.has(item.id) ? 'translateY(-2px)' : 'none',
                                    transition: 'all 0.2s ease',
                                    boxShadow: selectedItems.has(item.id) ? '0 8px 24px rgba(0, 122, 255, 0.2)' : 'var(--shadow-sm)'
                                } : {}),
                                '--index': index
                            } as React.CSSProperties}
                        >
                            <div className="item-card-header" style={{ rowGap: '8px', flexWrap: 'wrap' }}>
                                <span className="category-tag">{item.category.replace('-', ' → ')}</span>
                                {isBatchMode ? (
                                    <input
                                        type="checkbox"
                                        checked={selectedItems.has(item.id)}
                                        readOnly
                                        style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)' }}
                                    />
                                ) : (
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                        {getExpiryStats(item).expiredQty > 0 && (
                                            <span className="warning-tag" style={{ backgroundColor: '#ffcccc', color: '#ff0000', outline: '1px solid #ff000055' }} title="已过期">
                                                <AlertCircle size={14} /> 已过期: {getExpiryStats(item).expiredQty}
                                            </span>
                                        )}
                                        {getExpiryStats(item).expiringSoonQty > 0 && (
                                            <span className="warning-tag" style={{ backgroundColor: '#fff3cd', color: '#856404', outline: '1px solid #ffeeba' }} title="30天内过期">
                                                <AlertCircle size={14} /> 即将过期: {getExpiryStats(item).expiringSoonQty}
                                            </span>
                                        )}
                                    </div>
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
                            {item.remarks && (
                                <div 
                                    className={expandedRemarks.has(item.id) ? "remark-expanded" : "remark-truncate"}
                                    onClick={(e) => {
                                        if (!isBatchMode) {
                                            e.stopPropagation();
                                            const next = new Set(expandedRemarks);
                                            if (next.has(item.id)) next.delete(item.id);
                                            else next.add(item.id);
                                            setExpandedRemarks(next);
                                        }
                                    }}
                                    title={expandedRemarks.has(item.id) ? "点击收起" : "点击展开"}
                                    style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px', textAlign: 'center', backgroundColor: 'var(--background-secondary)', padding: '4px 8px', borderRadius: '4px' }}
                                >
                                    备注: {item.remarks}
                                </div>
                            )}

                            {item.totalQuantity <= (item.lowStockThreshold || 0) && (
                                <p className="low-stock-msg">库存不足！</p>
                            )}

                            {!isBatchMode && (
                                <div className="item-actions">
                                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                        <button
                                            className="btn-consume"
                                            onClick={() => consumeItem(item.id, 1)}
                                            disabled={item.totalQuantity === 0}
                                        >
                                            <Minus size={14} /> 快捷消耗
                                        </button>

                                        <button className="btn-details" onClick={() => toggleExpand(item.id)}>
                                            库存详情
                                        </button>
                                    </div>

                                    <div className="secondary-actions">
                                        <button className="icon-btn" onClick={() => handleOpenTransfer(item)} title="复制/移动到其他库房">
                                            <Send size={16} />
                                        </button>
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
                                            {item.batches.map((b: any, index: number) => (
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
            ) : (
                <div className="table-responsive glass">
                    <table className="inventory-table">
                        <thead>
                            <tr style={{ backgroundColor: 'var(--background-secondary)', borderBottom: '2px solid var(--border-color)', verticalAlign: 'middle' }}>
                                {isBatchMode && <th style={{ padding: '6px 8px', width: '30px' }}></th>}
                                {renderSortableHeader('物品名称', 'name', 'name')}
                                {renderSortableHeader('规格', 'specification', 'specification')}
                                {renderSortableHeader('分类', 'category', 'category')}
                                {renderSortableHeader('警报线', 'lowStockThreshold', 'lowStockThreshold')}
                                {renderSortableHeader('备注', 'remarks', 'remarks')}
                                <th style={{ padding: '6px 8px', fontWeight: 'bold', fontSize: '0.8rem' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div 
                                            style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '4px', 
                                                cursor: 'pointer', 
                                                userSelect: 'none',
                                                color: sortConfig?.key === 'totalQuantity' ? 'var(--primary-color)' : 'inherit'
                                            }} 
                                            onClick={() => {
                                                let direction: 'asc' | 'desc' = 'asc';
                                                if (sortConfig && sortConfig.key === 'totalQuantity' && sortConfig.direction === 'asc') direction = 'desc';
                                                if (sortConfig && sortConfig.key === 'totalQuantity' && sortConfig.direction === 'desc') {
                                                    setSortConfig(null);
                                                    return;
                                                }
                                                setSortConfig({ key: 'totalQuantity', direction });
                                            }}
                                        >
                                            <span>保质期与数量{sortConfig?.key === 'totalQuantity' ? (sortConfig.direction === 'asc' ? ' (正序)' : ' (倒序)') : ''}</span>
                                        </div>
                                    </div>
                                </th>
                                {!isBatchMode && <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', verticalAlign: 'middle', fontSize: '0.8rem' }}>操作</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.map((item: InventoryItem) => {
                                const hasLowStock = item.totalQuantity <= (item.lowStockThreshold || 0);
                                const stats = getExpiryStats(item);
                                return (
                                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s', backgroundColor: (isBatchMode && selectedItems.has(item.id)) ? 'rgba(0, 122, 255, 0.05)' : (hasLowStock ? 'rgba(255, 59, 48, 0.05)' : 'transparent') }}>
                                        {isBatchMode && (
                                            <td style={{ padding: '6px 8px', cursor: 'pointer' }} onClick={() => {
                                                const next = new Set(selectedItems);
                                                if (next.has(item.id)) next.delete(item.id);
                                                else next.add(item.id);
                                                setSelectedItems(next);
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedItems.has(item.id)}
                                                    readOnly
                                                    style={{ width: '14px', height: '14px', accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                                                />
                                            </td>
                                        )}
                                        <td style={{ padding: '6px 8px', fontWeight: '500', fontSize: '0.85rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                <span>{item.name}</span>
                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                    {stats.expiredQty > 0 && (
                                                        <span className="warning-tag" style={{ padding: '1px 4px', fontSize: '0.65rem', backgroundColor: '#ffcccc', color: '#ff0000', outline: '1px solid #ff000055' }} title="已过期">
                                                            已过期: {stats.expiredQty}
                                                        </span>
                                                    )}
                                                    {stats.expiringSoonQty > 0 && (
                                                        <span className="warning-tag" title="30天内过期" style={{ padding: '1px 4px', fontSize: '0.65rem', backgroundColor: '#fff3cd', color: '#856404', outline: '1px solid #ffeeba' }}>
                                                            即将: {stats.expiringSoonQty}
                                                        </span>
                                                    )}
                                                </div>
                                                {hasLowStock && <div style={{ fontSize: '0.65rem', color: 'var(--danger-color)' }}>库存不足</div>}
                                            </div>
                                        </td>
                                        <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>
                                            <div style={{ fontSize: '0.8rem' }}>{item.specification || '默认规格'}</div>
                                        </td>
                                        <td style={{ padding: '6px 8px' }}><span className="category-tag" style={{ border: 'none', padding: '0', background: 'none', fontSize: '0.75rem' }}>{item.category.replace('-', ' → ')}</span></td>
                                        <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{item.lowStockThreshold || 0}</td>
                                        <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontSize: '0.8rem', maxWidth: '120px', verticalAlign: 'top' }}>
                                            {item.remarks ? (
                                                <div 
                                                    className={expandedRemarks.has(item.id) ? "remark-expanded" : "remark-truncate"}
                                                    onClick={(e) => {
                                                        if (!isBatchMode) {
                                                            e.stopPropagation();
                                                            const next = new Set(expandedRemarks);
                                                            if (next.has(item.id)) next.delete(item.id);
                                                            else next.add(item.id);
                                                            setExpandedRemarks(next);
                                                        }
                                                    }}
                                                    title={expandedRemarks.has(item.id) ? "点击收起" : "点击展开"}
                                                    style={{ cursor: isBatchMode ? 'default' : 'pointer' }}
                                                >
                                                    {item.remarks}
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <div className="item-qty-display" style={{ margin: 0, padding: 0, background: 'none', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                                    <span className="qty-value" style={{ fontSize: '1rem', color: 'var(--text-color)' }}>{item.totalQuantity}</span>
                                                    <span className="qty-unit" style={{ fontSize: '0.75rem' }}>{item.unit}</span>
                                                    {!isBatchMode && (
                                                         <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', marginLeft: 'auto' }} onClick={() => toggleExpand(item.id)}>
                                                             {expandedItems.has(item.id) ? '收起' : '明细'}
                                                         </button>
                                                     )}
                                                </div>
                                                {expandedItems.has(item.id) && !isBatchMode && (
                                                    <div className="batches-panel" style={{ marginTop: '0', padding: '6px', backgroundColor: 'var(--background-secondary)', borderRadius: '6px' }}>
                                                        {(!item.batches || item.batches.length === 0) ? (
                                                            <div className="batch-row flex-between" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                                <span>🗓️ {(item as any).expiryDate || '暂无'}</span>
                                                                <span>{item.totalQuantity || (item as any).quantity} {item.unit}</span>
                                                            </div>
                                                        ) : (
                                                            <div className="batches-scroll-area" style={{ maxHeight: '100px', gap: '4px' }}>
                                                                {item.batches.map((b: any, index: number) => (
                                                                    <div key={b.id || `batch-${index}`} className="batch-row flex-between" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                                        <span>🗓️ {b.expiryDate || '暂无'}</span>
                                                                        <span>{b.quantity} {item.unit}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        {!isBatchMode && (
                                            <td style={{ padding: '6px 8px', verticalAlign: 'middle' }}>
                                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'center' }}>
                                                    <button className="icon-btn" style={{ color: 'var(--primary-color)', padding: '4px' }} onClick={() => handleOpenTransfer(item)} title="复制/移动到其他库房">
                                                        <Send size={12} />
                                                    </button>
                                                    <button className="icon-btn edit-btn" style={{ padding: '4px' }} title="编辑" onClick={() => handleOpenEdit(item)}>
                                                        <Edit size={12} />
                                                    </button>
                                                    <button className="icon-btn delete-btn" style={{ padding: '4px' }} title="删除" onClick={() => deleteItem(item.id)}>
                                                        <Trash2 size={12} />
                                                    </button>
                                                    <button
                                                        className="btn-consume"
                                                        style={{ padding: '2px 4px', fontSize: '0.7rem' }}
                                                        title="快捷消耗1个"
                                                        onClick={() => consumeItem(item.id, 1)}
                                                        disabled={item.totalQuantity === 0}
                                                    >
                                                        <Minus size={10} /> 1
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                )
                            })}
                            {filteredItems.length === 0 && (
                                <tr>
                                    <td colSpan={isBatchMode ? 8 : 9} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>未找到任何物品。</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="glass modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">{editingItem ? '编辑物品' : '新增物品'}</h2>
                            <button className="icon-btn close-btn" onClick={() => setIsModalOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="item-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label>名称</label>
                                    <input required type="text" value={formData.name} onChange={e => {
                                        const newName = e.target.value;
                                        setFormData({
                                            ...formData,
                                            name: newName,
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
                                    <label>低库存警报线</label>
                                    <input
                                        required
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={formData.lowStockThreshold === undefined ? '' : formData.lowStockThreshold}
                                        onChange={e => setFormData({ ...formData, lowStockThreshold: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
                                    />
                                </div>
                            </div>

                            <div className="form-group batches-group">
                                <label>录入批次 (数量 & 保质期)</label>
                                <div className="modal-batches-scroll-area">
                                    {formData.batches.map((batch, index) => (
                                        <div key={batch.id} className="batch-input-row flex-between" style={{ marginBottom: '4px', gap: '8px' }}>
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
                                                value={batch.expiryDate || ''}
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
                                    style={{ width: '100%', marginTop: '4px', fontSize: '0.8rem', padding: '0.3rem' }}
                                    onClick={() => {
                                        setFormData({
                                            ...formData,
                                            batches: [...formData.batches, { id: crypto.randomUUID(), quantity: 1, expiryDate: '' }]
                                        });
                                    }}
                                >
                                    + 添加另一批次
                                </button>
                                <div style={{ marginTop: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    总计入库数量: {formData.batches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0)} {formData.unit}
                                </div>
                            </div>
                            
                            <div className="form-row">
                                <div className="form-group" style={{ width: '100%' }}>
                                    <label>备注</label>
                                    <textarea
                                        value={formData.remarks || ''}
                                        onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                                        placeholder="记录购买来源、开封时间、特别说明等"
                                        rows={1}
                                        style={{ width: '100%', resize: 'vertical', minHeight: '30px', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                                    />
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsModalOpen(false)}>取消</button>
                                <button type="submit" className="btn-primary" style={{ padding: '0.35rem 1rem', fontSize: '0.85rem' }}>保存物品</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isTransferModalOpen && transferringItem && (
                <TransferItemModal
                    isOpen={isTransferModalOpen}
                    onClose={() => setIsTransferModalOpen(false)}
                    item={transferringItem}
                    warehouses={warehouses}
                    currentWarehouseId={currentWarehouseId || ''}
                    checkItemExists={checkItemExists}
                    onCopy={async (targetId, targetItemId) => {
                        await copyItemToWarehouse(transferringItem, targetId, targetItemId);
                    }}
                    onMove={async (targetId, batches, targetItemId) => {
                        await moveItemBatchesToWarehouse(transferringItem, targetId, batches, targetItemId);
                    }}
                />
            )}
        </div>
    );
}
