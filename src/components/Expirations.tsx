import { useInventory } from '../hooks/useInventory';
import { CalendarOff, AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import { differenceInDays, parseISO, isBefore, addDays } from 'date-fns';
import { useState } from 'react';
import { CATEGORY_HIERARCHY } from '../types';
import './Expirations.css';

export function Expirations() {
    const { items, consumeItem } = useInventory();

    const allExpiryBatches = items.flatMap(item =>
        (item.batches || [])
            .filter(b => !!b.expiryDate)
            .map(b => ({
                ...b,
                itemId: item.id,
                itemName: item.name,
                itemUnit: item.unit,
                category: item.category,
                specification: item.specification
            }))
    ).sort((a, b) => new Date(a.expiryDate!).getTime() - new Date(b.expiryDate!).getTime());

    const [filterStart, setFilterStart] = useState('');
    const [filterEnd, setFilterEnd] = useState('');

    const [filterMainCategory, setFilterMainCategory] = useState<string>('All');
    const [filterSubCategory, setFilterSubCategory] = useState<string>('All');
    const [searchName, setSearchName] = useState('');
    const [searchSpec, setSearchSpec] = useState('');

    const MAIN_CATEGORIES = Object.keys(CATEGORY_HIERARCHY);

    const filteredBatches = allExpiryBatches.filter(batch => {
        let match = true;

        const [mainCat, subCat] = (batch.category || '').split('-');
        if (filterMainCategory !== 'All' && mainCat !== filterMainCategory) match = false;
        if (filterSubCategory !== 'All' && subCat !== filterSubCategory) match = false;
        
        if (searchName && !String(batch.itemName || '').toLowerCase().includes(searchName.toLowerCase())) match = false;
        
        const specStr = String(batch.specification || '默认规格');
        if (searchSpec && !specStr.toLowerCase().includes(searchSpec.toLowerCase())) match = false;

        if (batch.expiryDate) {
            const batchDate = batch.expiryDate;
            if (filterStart && batchDate < filterStart) match = false;
            if (filterEnd && batchDate > filterEnd) match = false;
        }

        return match;
    });

    const getExpiryStatus = (dateStr: string) => {
        const expiryDate = parseISO(dateStr);
        const today = new Date();

        if (isBefore(expiryDate, today)) {
            return { label: 'Expired', colorClass: 'expired', days: differenceInDays(expiryDate, today) };
        } else if (isBefore(expiryDate, addDays(today, 7))) {
            return { label: 'Critical', colorClass: 'critical', days: differenceInDays(expiryDate, today) };
        } else if (isBefore(expiryDate, addDays(today, 30))) {
            return { label: 'Warning', colorClass: 'warning', days: differenceInDays(expiryDate, today) };
        }
        return { label: 'Good', colorClass: 'good', days: differenceInDays(expiryDate, today) };
    };

    return (
        <div className="expirations-page">
            <header className="page-header">
                <h1 className="title">保质期追踪</h1>
                <p className="subtitle">在物品过期前及时了解掌握</p>
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

            <div className="glass expirations-container" style={{ marginTop: '1rem' }}>
                <div className="filters-bar" style={{ marginBottom: '1.5rem', background: 'transparent', padding: 0, boxShadow: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div className="search-box glass" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '12px' }}>
                        <Search size={18} className="icon" style={{ color: 'var(--text-secondary)' }} />
                        <input
                            type="text"
                            placeholder="按名称搜索..."
                            value={searchName}
                            onChange={(e) => setSearchName(e.target.value)}
                            style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, color: 'var(--text-primary)' }}
                        />
                    </div>
                    <div className="search-box glass" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '12px' }}>
                        <Search size={18} className="icon" style={{ color: 'var(--text-secondary)' }} />
                        <input
                            type="text"
                            placeholder="按规格搜索..."
                            value={searchSpec}
                            onChange={(e) => setSearchSpec(e.target.value)}
                            style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, color: 'var(--text-primary)' }}
                        />
                    </div>
                    <div className="filter-group glass" style={{ padding: '0.5rem 1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>最早保质期</label>
                        <input
                            type="date"
                            value={filterStart}
                            onChange={e => setFilterStart(e.target.value)}
                            style={{ border: 'none', background: 'transparent', flex: 1, outline: 'none', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                        />
                    </div>
                    <div className="filter-group glass" style={{ padding: '0.5rem 1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>最晚保质期</label>
                        <input
                            type="date"
                            value={filterEnd}
                            onChange={e => setFilterEnd(e.target.value)}
                            style={{ border: 'none', background: 'transparent', flex: 1, outline: 'none', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                        />
                    </div>
                </div>

                {filteredBatches.length === 0 ? (
                    <div className="empty-state">
                        <CalendarOff size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                        <p>没有找到符合条件的保质期批次。</p>
                    </div>
                ) : (
                    <div className="expiry-list">
                        {filteredBatches.map(batch => {
                            const status = getExpiryStatus(batch.expiryDate!);
                            return (
                                <div key={batch.id} className={`expiry-item ${status.colorClass}`}>
                                    <div className="status-indicator">
                                        {status.colorClass === 'good' ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
                                    </div>

                                    <div className="expiry-details">
                                        <h3 className="item-name">
                                            {batch.itemName}
                                            <span style={{ fontSize: '0.85rem', opacity: 0.7, marginLeft: '8px', fontWeight: 'normal' }}>
                                                ({batch.quantity} {batch.itemUnit})
                                            </span>
                                        </h3>
                                        <p className="expiry-date">过期: {new Date(batch.expiryDate!).toLocaleDateString()}</p>
                                    </div>

                                    <div className="expiry-days">
                                        {status.days < 0
                                            ? `已过期 ${Math.abs(status.days)} 天`
                                            : status.days === 0
                                                ? '今天过期!'
                                                : `剩余 ${status.days} 天`}
                                    </div>

                                    <button className="btn-consume-small" onClick={() => consumeItem(batch.itemId, batch.quantity)}>
                                        消耗此批次
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
