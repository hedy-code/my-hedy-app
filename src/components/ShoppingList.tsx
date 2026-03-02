import { useInventory } from '../hooks/useInventory';
import { ShoppingCart, CheckCircle, Circle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './ShoppingList.css';

export function ShoppingList() {
    const { shoppingList, toggleShoppingItem } = useInventory();
    const navigate = useNavigate();

    const toBuy = shoppingList.filter(s => !s.isBought);
    const bought = shoppingList.filter(s => s.isBought);

    return (
        <div className="shopping-page">
            <header className="page-header">
                <h1 className="title">购物清单</h1>
                <p className="subtitle">低于安全库存线的物品将自动添加至此</p>
            </header>

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
                                <div key={item.id} className="list-item" onClick={() => toggleShoppingItem(item.id)}>
                                    <button className="check-btn">
                                        <Circle size={24} />
                                    </button>
                                    <div className="list-item-content">
                                        <span className="item-name">{item.customName}</span>
                                        <span className="item-meta">类别: {item.category}</span>
                                    </div>
                                    <div className="item-qty">
                                        需买: <strong>{item.quantityNeeded}</strong>
                                    </div>
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
                                <div key={item.id} className="list-item bought" onClick={() => toggleShoppingItem(item.id)}>
                                    <button className="check-btn checked">
                                        <CheckCircle size={24} />
                                    </button>
                                    <div className="list-item-content">
                                        <span className="item-name">{item.customName}</span>
                                    </div>
                                    <div className="item-qty">
                                        收到: <strong>{item.quantityNeeded}</strong>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
