import { useInventory } from '../hooks/useInventory';
import { CalendarOff, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { differenceInDays, parseISO, isBefore, addDays } from 'date-fns';
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
                itemUnit: item.unit
            }))
    ).sort((a, b) => new Date(a.expiryDate!).getTime() - new Date(b.expiryDate!).getTime());

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

            <div className="glass expirations-container">
                {allExpiryBatches.length === 0 ? (
                    <div className="empty-state">
                        <CalendarOff size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                        <p>没有正在追踪含保质期的物品批次。</p>
                    </div>
                ) : (
                    <div className="expiry-list">
                        {allExpiryBatches.map(batch => {
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
