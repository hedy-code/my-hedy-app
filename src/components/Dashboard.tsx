import { useInventory } from '../hooks/useInventory';
import { PackagePlus, AlertTriangle, Clock, ShoppingCart, TrendingUp } from 'lucide-react';
import { isBefore, addDays, parseISO } from 'date-fns';
import { CategoryChart } from './CategoryChart';
import './Dashboard.css';

export function Dashboard() {
    const { items, logs, unboughtShoppingCount } = useInventory();

    const totalItems = items.length;
    const expiringSoon = items.filter(i => {
        if (!i.batches) return false;
        return i.batches.some(b => {
            if (!b.expiryDate) return false;
            const expiry = parseISO(b.expiryDate);
            const thirtyDaysFromNow = addDays(new Date(), 30);
            return isBefore(expiry, thirtyDaysFromNow);
        });
    }).length;

    return (
        <div className="dashboard animate-fade-in">
            <header className="page-header">
                <div className="header-badge">
                    <TrendingUp size={14} /> 核心指标
                </div>
                <h1 className="title">数据看板</h1>
                <p className="subtitle">总览您的家庭日用品库存与活动</p>
            </header>

            <div className="stats-grid">
                <div className="glass stat-card">
                    <div className="stat-icon-wrapper blue">
                        <PackagePlus size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>总物品数</h3>
                        <p className="stat-value">{totalItems}</p>
                        <span className="stat-trend">当前库存总量</span>
                    </div>
                </div>

                <div className="glass stat-card">
                    <div className="stat-icon-wrapper purple">
                        <ShoppingCart size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>需购买</h3>
                        <p className="stat-value">{unboughtShoppingCount}</p>
                        <span className="stat-trend">待采购清单项目</span>
                    </div>
                </div>

                <div className="glass stat-card">
                    <div className="stat-icon-wrapper red">
                        <AlertTriangle size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>即将过期</h3>
                        <p className="stat-value">{expiringSoon}</p>
                        <span className="stat-trend">30天内到期项目</span>
                    </div>
                </div>
            </div>

            <div className="dashboard-main-grid">
                <div className="glass panel chart-panel">
                    <div className="panel-header">
                        <h2><TrendingUp size={20} /> 分类统计</h2>
                    </div>
                    <div className="panel-content">
                        <CategoryChart items={items} />
                    </div>
                </div>

                <div className="glass panel activity-panel">
                    <div className="panel-header">
                        <h2><Clock size={20} /> 最近动态</h2>
                    </div>
                    <div className="activity-list">
                        {logs.length === 0 ? (
                            <p className="empty-state">暂无近期活动。</p>
                        ) : (
                            logs.slice(0, 8).map(log => (
                                <div key={log.id} className="activity-item">
                                    <div className={`activity-icon-bullet ${log.action}`}></div>
                                    <div className="activity-details">
                                        <div className="activity-main">
                                            <span className="item-name">{log.itemName}</span>
                                            <span className={`action-tag ${log.action}`}>
                                                {log.action === 'add' ? '新增' :
                                                    log.action === 'consume' ? '消耗' :
                                                        log.action === 'stock_up' ? '进货' :
                                                            log.action === 'delete' ? '删除' : '编辑'}
                                            </span>
                                        </div>
                                        <span className="timestamp">{new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <div className={`activity-qty ${log.quantityChange > 0 ? 'positive' : 'negative'}`}>
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
