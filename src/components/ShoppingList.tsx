import { useInventory } from '../hooks/useInventory';
import { ShoppingCart, CheckCircle, Circle, ArrowRight, Search, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { CATEGORY_HIERARCHY, type ShoppingItem } from '../types';
import './ShoppingList.css';

export function ShoppingList() {
    const { shoppingList, toggleShoppingItem, deleteShoppingItem } = useInventory();
    const navigate = useNavigate();

    const [checkingOutItem, setCheckingOutItem] = useState<ShoppingItem | null>(null);
    const [checkoutForm, setCheckoutForm] = useState({ quantity: 1, expiryDate: '' });

    const [filterMainCategory, setFilterMainCategory] = useState<string>('All');
    const [filterSubCategory, setFilterSubCategory] = useState<string>('All');
    const [searchName, setSearchName] = useState('');
    const [searchSpec, setSearchSpec] = useState('');

    const MAIN_CATEGORIES = Object.keys(CATEGORY_HIERARCHY);

    const filteredShoppingList = shoppingList.filter(item => {
        let match = true;
        const [mainCat, subCat] = (item.category || '').split('-');

        if (filterMainCategory !== 'All' && mainCat !== filterMainCategory) match = false;
        if (filterSubCategory !== 'All' && subCat !== filterSubCategory) match = false;
        
        if (searchName && !String(item.customName || '').toLowerCase().includes(searchName.toLowerCase())) match = false;
        
        const specStr = String(item.specification || '默认规格');
        if (searchSpec && !specStr.toLowerCase().includes(searchSpec.toLowerCase())) match = false;
        
        return match;
    });

    const toBuy = filteredShoppingList.filter(s => !s.isBought);
    const bought = filteredShoppingList
        .filter(s => s.isBought)
        .sort((a, b) => {
            const timeA = new Date(a.purchasedAt || a.createdAt).getTime();
            const timeB = new Date(b.purchasedAt || b.createdAt).getTime();
            return timeB - timeA;
        });

    const handleToggle = (item: ShoppingItem) => {
        if (!item.isBought) {
            setCheckingOutItem(item);
            setCheckoutForm({ quantity: item.quantityNeeded, expiryDate: '' });
        } else {
            toggleShoppingItem(item.id);
        }
    };

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (window.confirm('确定要从购物清单中删除此项吗？')) {
            deleteShoppingItem(id);
        }
    };

    const handleCheckoutSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (checkingOutItem) {
            toggleShoppingItem(checkingOutItem.id, checkoutForm.quantity, checkoutForm.expiryDate);
            setCheckingOutItem(null);
        }
    };

    return (
        <div className="shopping-page">
            <header className="page-header">
                <h1 className="title">购物清单</h1>
                <p className="subtitle">低于安全库存线的物品将自动添加至此</p>
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

            <div className="filters-bar glass" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', padding: '1rem 1.5rem', marginBottom: '2rem', marginTop: '1rem' }}>
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

            <div className="shopping-container glass">
                <div className="shopping-section">
                    <h2><ShoppingCart size={20} /> 待购物品 ({toBuy.length})</h2>

                    {toBuy.length === 0 ? (
                        <div className="empty-state">
                            <p>您的购物清单是空的！</p>
                            <button className="text-btn" onClick={() => navigate('/inventory')}>
                                返回库存 <ArrowRight size={16} />
                            </button>
                        </div>
                    ) : (
                        <div className="list-group">
                            {toBuy.map(item => (
                                <div key={item.id} className="list-item" onClick={() => handleToggle(item)}>
                                    <button className="check-btn">
                                        <Circle size={24} />
                                    </button>
                                    <div className="list-item-content">
                                        <span className="item-name">
                                            {item.customName}
                                            <span style={{ fontSize: '0.75em', color: 'var(--text-secondary)', marginLeft: '8px', fontWeight: 'normal' }}>
                                                [{item.specification || '默认规格'}]
                                            </span>
                                        </span>
                                        <span className="item-meta">类别: {item.category.replace('-', ' → ')}</span>
                                    </div>
                                    <button 
                                        className="icon-btn delete-btn" 
                                        style={{ marginLeft: 'auto', color: 'var(--danger-color)', padding: '8px' }}
                                        onClick={(e) => handleDelete(e, item.id)}
                                        title="从清单删除"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {bought.length > 0 && (
                    <div className="shopping-section bought-section">
                        <h2><CheckCircle size={20} /> 最近购买</h2>
                        <p className="section-note">这些物品已重新补充到您的库存中。</p>

                        <div className="list-group">
                            {bought.map(item => (
                                <div key={item.id} className="list-item bought" onClick={() => handleToggle(item)}>
                                    <button className="check-btn checked">
                                        <CheckCircle size={24} />
                                    </button>
                                    <div className="list-item-content">
                                        <div className="item-name">
                                            {item.customName}
                                            <span style={{ fontSize: '0.75em', color: 'var(--text-secondary)', marginLeft: '8px', fontWeight: 'normal' }}>
                                                [{item.specification || '默认规格'}]
                                            </span>
                                        </div>
                                        <div className="item-meta" style={{ marginTop: '4px', display: 'flex', gap: '16px', fontSize: '0.85rem' }}>
                                            <span>数量: {item.purchasedQuantity || item.quantityNeeded}</span>
                                            {item.purchasedAt && <span>日期: {new Date(item.purchasedAt).toLocaleDateString()}</span>}
                                        </div>
                                    </div>
                                    <button 
                                        className="icon-btn delete-btn" 
                                        style={{ marginLeft: 'auto', color: 'var(--danger-color)', padding: '8px', opacity: 0.6 }}
                                        onClick={(e) => handleDelete(e, item.id)}
                                        title="从记录删除"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {checkingOutItem && (
                <div className="modal-overlay" onClick={() => setCheckingOutItem(null)}>
                    <div className="glass modal-content" onClick={e => e.stopPropagation()}>
                        <h2 className="modal-title">结算入库: {checkingOutItem.customName}</h2>
                        <form onSubmit={handleCheckoutSubmit} className="item-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label>实际购买数量</label>
                                    <input
                                        required
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={checkoutForm.quantity || ''}
                                        onChange={e => setCheckoutForm({ ...checkoutForm, quantity: parseInt(e.target.value, 10) || 0 })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>此批次保质期 (可选)</label>
                                    <input
                                        type="date"
                                        value={checkoutForm.expiryDate}
                                        onChange={e => setCheckoutForm({ ...checkoutForm, expiryDate: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setCheckingOutItem(null)}>取消</button>
                                <button type="submit" className="btn-primary">确认入库</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
