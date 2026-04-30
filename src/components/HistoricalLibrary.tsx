import { useState, useMemo } from 'react';
import { useHistoricalItems } from '../hooks/useHistoricalItems';
import { Search, Archive, LayoutGrid, List, Plus, X, Trash2 } from 'lucide-react';
import { CATEGORY_HIERARCHY, CATEGORY_ORDER } from '../types';
import './HistoricalLibrary.css';
import { LoadingSpinner } from './LoadingSpinner';
import { useWarehouse } from '../contexts/WarehouseContext';
import { useNavigate } from 'react-router-dom';

export function HistoricalLibrary() {
    const { historicalItems, loading, deleteHistoricalItems } = useHistoricalItems();
    const { warehouses, currentWarehouseId, setCurrentWarehouseId } = useWarehouse();
    const navigate = useNavigate();

    const [searchName, setSearchName] = useState('');
    const [searchSpec, setSearchSpec] = useState('');
    const [filterMainCategory, setFilterMainCategory] = useState<string>('All');
    const [filterSubCategory, setFilterSubCategory] = useState<string>('All');
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
    const [expandedRemarks, setExpandedRemarks] = useState<Set<string>>(new Set());
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [tableFilters, setTableFilters] = useState<Record<string, string>>({});

    const toggleRemark = (id: string) => {
        setExpandedRemarks(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const [isWarehouseSelectOpen, setIsWarehouseSelectOpen] = useState(false);
    const [targetWarehouseId, setTargetWarehouseId] = useState<string>('');
    const [copyingItem, setCopyingItem] = useState<any>(null);

    const handleCopyClick = (item: any) => {
        setCopyingItem(item);
        setTargetWarehouseId(currentWarehouseId || warehouses[0]?.id || '');
        setIsWarehouseSelectOpen(true);
    };

    const handleConfirmCopy = () => {
        if (!targetWarehouseId || !copyingItem) return;
        setCurrentWarehouseId(targetWarehouseId);
        setIsWarehouseSelectOpen(false);
        navigate('/inventory', { state: { initialAddItemData: copyingItem } });
    };

    const filteredItems = useMemo(() => {
        let result = historicalItems.filter(item => {
            const matchesName = String(item.name || '').toLowerCase().includes(searchName.toLowerCase());
            const matchesSpec = String(item.specification || '').toLowerCase().includes(searchSpec.toLowerCase());
            
            const itemMainCat = Object.keys(CATEGORY_HIERARCHY).find(main => 
                Object.keys(CATEGORY_HIERARCHY[main]).includes(item.category)
            );
            
            const matchesMainCat = filterMainCategory === 'All' || itemMainCat === filterMainCategory;
            const matchesSubCat = filterSubCategory === 'All' || item.category === filterSubCategory;

            const matchesTableName = !tableFilters.name || String(item.name || '').toLowerCase().includes(tableFilters.name.toLowerCase());
            const matchesTableSpec = !tableFilters.specification || String(item.specification || '').toLowerCase().includes(tableFilters.specification.toLowerCase());
            const matchesTableCategory = !tableFilters.category || String(item.category || '').toLowerCase().includes(tableFilters.category.toLowerCase());
            const matchesTableRemarks = !tableFilters.remarks || String(item.remarks || '').toLowerCase().includes(tableFilters.remarks.toLowerCase());
            const matchesTableThreshold = !tableFilters.lowStockThreshold || String(item.lowStockThreshold || '').includes(tableFilters.lowStockThreshold);

            return matchesName && matchesSpec && matchesMainCat && matchesSubCat &&
                   matchesTableName && matchesTableSpec && matchesTableCategory && matchesTableRemarks && matchesTableThreshold;
        });

        if (sortConfig) {
            result.sort((a, b) => {
                let aVal: any = a[sortConfig.key as keyof typeof a];
                let bVal: any = b[sortConfig.key as keyof typeof b];

                if (sortConfig.key === 'lowStockThreshold') {
                    aVal = Number(aVal) || 0;
                    bVal = Number(bVal) || 0;
                    if (aVal !== bVal) {
                        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
                    }
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
        }

        return result;
    }, [historicalItems, searchName, searchSpec, filterMainCategory, filterSubCategory, tableFilters, sortConfig]);

    const getSortDescription = (key: string, direction: 'asc' | 'desc') => {
        if (key === 'category') return direction === 'asc' ? '预设分类顺序' : '预设分类逆序';
        if (['lowStockThreshold'].includes(key)) return direction === 'asc' ? '数值从小到大' : '数值从大到小';
        if (['name', 'specification', 'remarks'].includes(key)) return direction === 'asc' ? '符号 → 数字 → 字母 → 中文 (空值底)' : '中文 → 字母 → 数字 → 符号 (空值顶)';
        return '默认';
    };

    const getSortTitle = (key: string) => {
        const titles: Record<string, string> = {
            name: '物品名称',
            specification: '规格',
            category: '分类',
            lowStockThreshold: '警戒线',
            remarks: '备注'
        };
        return titles[key] || '未知字段';
    };

    const renderSortableHeader = (title: string, sortKey: string, filterKey: string) => {
        const isSorted = sortConfig?.key === sortKey;

        return (
            <th style={{ padding: '12px 16px', fontWeight: 'bold', verticalAlign: 'top' }}>
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

    if (loading) {
        return <LoadingSpinner />;
    }

    return (
        <div className="historical-container fade-in">
            <div className="historical-header">
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Archive size={32} style={{ color: 'var(--primary-color)' }} />
                        历史物品库
                    </h1>
                    <p style={{ color: 'var(--text-light)', margin: 0 }}>
                        存放所有添加过的物品档案，共 {historicalItems.length} 条记录
                    </p>
                </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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
                </div>
            </div>

            <div className="filters-bar glass" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', padding: '1rem 1.5rem', marginBottom: '1rem', marginTop: '1.5rem' }}>
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

            <div className="category-tabs" style={{ marginBottom: '0.5rem' }}>
                <button
                    className={`tab-item ${filterMainCategory === 'All' ? 'active' : ''}`}
                    onClick={() => {
                        setFilterMainCategory('All');
                        setFilterSubCategory('All');
                    }}
                >
                    全部
                </button>
                {Object.keys(CATEGORY_HIERARCHY).map(cat => (
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
                <div className="sub-category-tabs" style={{ marginBottom: '1rem' }}>
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
                            <span>默认顺序</span>
                        </div>
                    )}
                </div>
                <div style={{ marginLeft: 'auto', fontSize: '0.8rem', opacity: 0.8, fontStyle: 'italic' }}>
                    {sortConfig ? `* ${getSortDescription(sortConfig.key, sortConfig.direction)}` : ''}
                </div>
            </div>

            {viewMode === 'grid' ? (
                <div className="historical-grid">
                    {filteredItems.map(item => (
                        <div key={item.id} className="historical-card">
                            <div className="historical-card-header">
                                <div>
                                    <h3 className="historical-card-title">{item.name}</h3>
                                    <p className="historical-card-spec">{item.specification !== '默认规格' ? item.specification : '未指定规格'}</p>
                                </div>
                                <span className="historical-card-category">{item.category}</span>
                            </div>
                            <div className="historical-card-details">
                                <div className="historical-detail-row">
                                    <span className="historical-detail-label">警戒线</span>
                                    <span className="historical-detail-value">{item.lowStockThreshold} {item.unit}</span>
                                </div>
                                {item.remarks && (
                                    <div className="historical-detail-row" style={{ flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
                                        <span className="historical-detail-label">备注</span>
                                        <div 
                                            className={`historical-detail-value ${expandedRemarks.has(item.id) ? 'remark-expanded' : 'remark-truncate'}`}
                                            style={{ fontSize: '0.85rem', color: 'var(--text-light)', whiteSpace: 'pre-wrap', fontWeight: 'normal', lineHeight: '1.4' }}
                                            onClick={() => toggleRemark(item.id)}
                                        >
                                            {item.remarks}
                                        </div>
                                    </div>
                                )}
                                <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', gap: '0.5rem' }}>
                                    <button className="btn-primary" onClick={() => handleCopyClick(item)} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
                                        <Plus size={14} /> 一键复制添加
                                    </button>
                                    <button 
                                        className="btn-primary" 
                                        style={{ backgroundColor: 'var(--danger)', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                        onClick={() => {
                                            if (window.confirm('确定要彻底删除这条历史记录吗？操作不可恢复。')) {
                                                deleteHistoricalItems([item.id]);
                                            }
                                        }}
                                        title="删除记录"
                                    >
                                        <Trash2 size={14} /> 删除
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="historical-table-container fade-in" style={{ marginTop: '1.5rem' }}>
                    <table className="inventory-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                        <thead>
                            <tr className="historical-table-header">
                                {renderSortableHeader('物品名称', 'name', 'name')}
                                {renderSortableHeader('规格', 'specification', 'specification')}
                                {renderSortableHeader('分类', 'category', 'category')}
                                {renderSortableHeader('警戒线', 'lowStockThreshold', 'lowStockThreshold')}
                                {renderSortableHeader('备注', 'remarks', 'remarks')}
                                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 'bold', verticalAlign: 'top' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', height: '21px' }}> {/* matching the height of sortable text + arrow */}
                                            操作
                                        </div>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.map(item => (
                                <tr key={item.id} className="historical-table-row">
                                    <td style={{ padding: '12px 16px', fontWeight: '500' }}>{item.name}</td>
                                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{item.specification || '默认规格'}</td>
                                    <td style={{ padding: '12px 16px' }}><span className="category-tag" style={{ margin: 0 }}>{item.category.replace('-', ' → ')}</span></td>
                                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{item.lowStockThreshold} {item.unit}</td>
                                    <td 
                                        style={{ padding: '12px 16px', color: 'var(--text-secondary)', maxWidth: '200px', cursor: 'pointer' }} 
                                        title={item.remarks}
                                        onClick={() => toggleRemark(item.id)}
                                    >
                                        <div className={expandedRemarks.has(item.id) ? '' : 'remark-truncate'}>
                                            {item.remarks}
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                            <button className="btn-primary" onClick={() => handleCopyClick(item)} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', fontSize: '0.85rem' }}>
                                                <Plus size={14} /> 复制
                                            </button>
                                            <button 
                                                className="btn-primary" 
                                                style={{ backgroundColor: 'var(--danger)', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', fontSize: '0.85rem' }}
                                                onClick={() => {
                                                    if (window.confirm('确定要彻底删除这条历史记录吗？操作不可恢复。')) {
                                                        deleteHistoricalItems([item.id]);
                                                    }
                                                }}
                                                title="删除记录"
                                            >
                                                <Trash2 size={14} /> 删除
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {filteredItems.length === 0 && (
                <div className="empty-state glass" style={{ padding: '4rem', textAlign: 'center', borderRadius: '16px', marginTop: '2rem' }}>
                    <Archive size={48} style={{ color: 'var(--text-light)', opacity: 0.5, margin: '0 auto 1rem' }} />
                    <h3 style={{ margin: '0 0 0.5rem 0' }}>暂无历史记录</h3>
                    <p style={{ color: 'var(--text-light)', margin: 0 }}>
                        {(searchName || searchSpec || filterMainCategory !== 'All' || filterSubCategory !== 'All') ? '没有找到匹配的物品' : '您还没有添加过任何物品。'}
                    </p>
                </div>
            )}

            {isWarehouseSelectOpen && (
                <div className="modal-overlay">
                    <div className="modal-content glass fade-in" style={{ maxWidth: '400px', padding: '1.5rem' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">选择目标库别</h2>
                            <button className="icon-btn" onClick={() => setIsWarehouseSelectOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div style={{ padding: '1rem 0' }}>
                            <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                                请选择将此物品存放至哪个库：
                            </p>
                            <select 
                                value={targetWarehouseId} 
                                onChange={e => setTargetWarehouseId(e.target.value)}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--background-color)', color: 'var(--text-color)', fontSize: '1rem' }}
                            >
                                {warehouses.map(w => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                            <button className="btn-secondary" onClick={() => setIsWarehouseSelectOpen(false)}>
                                取消
                            </button>
                            <button className="btn-primary" onClick={handleConfirmCopy}>
                                确认并继续
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
