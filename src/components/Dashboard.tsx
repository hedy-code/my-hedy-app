import { useInventory } from '../hooks/useInventory';
import { PackagePlus, ArrowDownToLine, AlertTriangle, Clock, ShoppingCart } from 'lucide-react';
import { isBefore, addDays, parseISO } from 'date-fns';
import './Dashboard.css';

export function Dashboard() {
    const { items, logs, unboughtShoppingCount, lowStockItems } = useInventory();

    const totalItems = items.length;
    const expiringSoon = items.filter(i => {
        if (!i.expiryDate) return false;
        const expiry = parseISO(i.expiryDate);
        const thirtyDaysFromNow = addDays(new Date(), 30);
        return isBefore(expiry, thirtyDaysFromNow);
    }).length;

    return (
        <div className="dashboard">
            <header className="page-header">
                <h1 className="title">数据看板</h1>
                <p className="subtitle">总览您的家庭日用品库存</p>
            </header>

            <div className="stats-grid">
                <div className="glass stat-card">
                    <div className="stat-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--brand-primary)' }}>
                        <PackagePlus size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>总物品数</h3>
                        <p className="stat-value">{totalItems}</p>
                    </div>
                </div>

                <div className="glass stat-card">
                    <div className="stat-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)' }}>
                        <ArrowDownToLine size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>低库存</h3>
                        <p className="stat-value">{lowStockItems.length}</p>
                    </div>
                </div>

                <div className="glass stat-card">
                    <div className="stat-icon" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', color: 'var(--brand-secondary)' }}>
                        <ShoppingCart size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>需购买</h3>
                        <p className="stat-value">{unboughtShoppingCount}</p>
                    </div>
                </div>

                <div className="glass stat-card">
                    <div className="stat-icon" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' }}>
                        <AlertTriangle size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>即将过期</h3>
                        <p className="stat-value">{expiringSoon}</p>
                    </div>
                </div>
            </div>

            <div className="dashboard-content">
                <div className="glass panel">
                    <div className="panel-header">
                        <h2><Clock size={20} /> 近期活动</h2>
                    </div>
                    <div className="activity-list">
                        {logs.length === 0 ? (
                            <p className="empty-state">暂无近期活动。</p>
                        ) : (
                            logs.slice(0, 10).map(log => (
                                <div key={log.id} className="activity-item">
                                    <div className={`activity-badge ${log.action}`}>
                                        {log.action === 'add' ? '新增' :
                                            log.action === 'consume' ? '消耗' :
                                                log.action === 'stock_up' ? '进货' :
                                                    log.action === 'delete' ? '删除' : '编辑'}
                                    </div>
                                    <div className="activity-details">
                                        <span className="item-name">{log.itemName}</span>
                                        <span className="timestamp">{new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <div className="activity-qty">
                                        {log.quantityChange > 0 ? '+' : ''}{log.quantityChange !== 0 ? log.quantityChange : ''}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
