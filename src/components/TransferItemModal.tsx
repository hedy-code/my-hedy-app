import React, { useState, useEffect } from 'react';
import { X, Send, Copy } from 'lucide-react';
import type { InventoryItem, Warehouse } from '../types';
import './TransferItemModal.css';

interface TransferItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: InventoryItem;
    warehouses: Warehouse[];
    currentWarehouseId: string;
    checkItemExists: (warehouseId: string, name: string, specification: string) => Promise<{ exists: boolean, sameSpec: boolean, existingSpecs: string[], matchingItem?: InventoryItem }>;
    onCopy: (targetWarehouseId: string, targetItemId?: string) => Promise<void>;
    onMove: (targetWarehouseId: string, selectedBatches: { id: string; quantity: number; expiryDate?: string; addedAt: string }[], targetItemId?: string) => Promise<void>;
}

export const TransferItemModal: React.FC<TransferItemModalProps> = ({
    isOpen,
    onClose,
    item,
    warehouses,
    currentWarehouseId,
    checkItemExists,
    onCopy,
    onMove
}) => {
    const [mode, setMode] = useState<'copy' | 'move'>('move');
    const [targetWarehouseId, setTargetWarehouseId] = useState<string>('');
    const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
    const [moveQuantities, setMoveQuantities] = useState<Record<string, number>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string>('');

    useEffect(() => {
        if (isOpen && item) {
            setMode('move');
            setTargetWarehouseId('');
            setSelectedBatchIds(new Set(item.batches.map(b => b.id)));
            const initialQtys: Record<string, number> = {};
            item.batches.forEach(b => initialQtys[b.id] = b.quantity);
            setMoveQuantities(initialQtys);
            setSuccessMessage('');
            setIsSubmitting(false);
        }
    }, [isOpen, item]);

    if (!isOpen) return null;

    const otherWarehouses = warehouses.filter(w => w.id !== currentWarehouseId);

    const handleBatchToggle = (batchId: string, maxQty: number) => {
        const next = new Set(selectedBatchIds);
        if (next.has(batchId)) {
            next.delete(batchId);
            const nextQuantities = { ...moveQuantities };
            delete nextQuantities[batchId];
            setMoveQuantities(nextQuantities);
        } else {
            next.add(batchId);
            setMoveQuantities({ ...moveQuantities, [batchId]: maxQty });
        }
        setSelectedBatchIds(next);
    };

    const handleQtyChange = (batchId: string, val: number, maxQty: number) => {
        const qty = Math.min(maxQty, Math.max(1, val));
        setMoveQuantities({ ...moveQuantities, [batchId]: qty });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetWarehouseId) {
            alert('请选择目标库房');
            return;
        }

        setIsSubmitting(true);
        try {
            const spec = item.specification || '默认规格';
            const { exists, sameSpec, existingSpecs, matchingItem } = await checkItemExists(targetWarehouseId, item.name, spec);

            let targetItemIdForMerge: string | undefined = undefined;

            if (sameSpec && matchingItem) {
                console.log('Transfer merge checking thresholds:', { 
                    source: item.lowStockThreshold, 
                    sourceType: typeof item.lowStockThreshold,
                    target: matchingItem.lowStockThreshold,
                    targetType: typeof matchingItem.lowStockThreshold
                });
                if (Number(matchingItem.lowStockThreshold) !== Number(item.lowStockThreshold)) {
                    const message = `目标库别存在相同名称+规格、不同警戒线，是否继续${mode === 'copy' ? '复制' : '移动'}？`;
                    const confirmed = window.confirm(message);
                    if (!confirmed) {
                        setIsSubmitting(false);
                        return;
                    }
                }
                targetItemIdForMerge = matchingItem.id;
            } else if (exists) {
                const confirmed = window.confirm(`此【${item.name}】已存在规格：\n${existingSpecs.join('、')}\n\n请确认是否继续${mode === 'copy' ? '复制' : '移动'}？`);
                if (!confirmed) {
                    setIsSubmitting(false);
                    return;
                }
            }

            if (mode === 'copy') {
                onCopy(targetWarehouseId, targetItemIdForMerge).catch(console.error);
                setSuccessMessage(`已成功复制到“${warehouses.find(w => w.id === targetWarehouseId)?.name}”`);
                setTimeout(() => onClose(), 800);
            } else {
                if (selectedBatchIds.size === 0) {
                    alert('请至少选择一个要移动的批次');
                    setIsSubmitting(false);
                    return;
                }
                const batchesToMove = item.batches
                    .filter(b => selectedBatchIds.has(b.id))
                    .map(b => ({
                        ...b,
                        quantity: moveQuantities[b.id] || b.quantity
                    }));
                
                onMove(targetWarehouseId, batchesToMove, targetItemIdForMerge).catch(console.error);
                setSuccessMessage(`已成功移动到“${warehouses.find(w => w.id === targetWarehouseId)?.name}”`);
                setTimeout(() => onClose(), 800);
            }
        } catch (error) {
            console.error('Transfer error:', error);
            alert('操作失败，请重试');
            setIsSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay transfer-modal-overlay" onClick={onClose}>
            <div className="glass modal-content transfer-modal-content" onClick={e => e.stopPropagation()}>
                <div className="transfer-modal-header">
                    <h2>转移物品: {item.name}</h2>
                    <button className="icon-btn close-btn" onClick={onClose}><X size={20} /></button>
                </div>

                {successMessage ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                        <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>{successMessage}</h3>
                    </div>
                ) : (
                    <>
                        <div className="transfer-mode-selector">
                            <button 
                                className={`mode-btn ${mode === 'copy' ? 'active' : ''}`}
                                onClick={() => setMode('copy')}
                            >
                                <Copy size={18} />
                                <span>复制</span>
                            </button>
                            <button 
                                className={`mode-btn ${mode === 'move' ? 'active' : ''}`}
                                onClick={() => setMode('move')}
                            >
                                <Send size={18} />
                                <span>移动</span>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="transfer-form">
                            <div className="form-group">
                                <label>选择目标库房</label>
                                <select 
                                    required 
                                    value={targetWarehouseId} 
                                    onChange={e => setTargetWarehouseId(e.target.value)}
                                >
                                    <option value="">-- 请选择 --</option>
                                    {otherWarehouses.map(w => (
                                        <option key={w.id} value={w.id}>{w.name}</option>
                                    ))}
                                </select>
                            </div>

                            {mode === 'move' && (
                                <div className="batches-transfer-section">
                                    <label>选择要移动的批次及数量</label>
                                    <div className="transfer-batches-list">
                                        {item.batches.map(batch => (
                                            <div key={batch.id} className={`transfer-batch-row ${selectedBatchIds.has(batch.id) ? 'selected' : ''}`}>
                                                <div className="batch-info" onClick={() => handleBatchToggle(batch.id, batch.quantity)}>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedBatchIds.has(batch.id)}
                                                        readOnly
                                                    />
                                                    <div className="batch-details">
                                                        <span className="expiry">🗓️ {batch.expiryDate || '无保质期'}</span>
                                                        <span className="stock">当前存量: {batch.quantity} {item.unit}</span>
                                                    </div>
                                                </div>
                                                {selectedBatchIds.has(batch.id) && (
                                                    <div className="batch-qty-input">
                                                        <label>移动数量:</label>
                                                        <input 
                                                            type="number" 
                                                            min="1" 
                                                            max={batch.quantity}
                                                            value={moveQuantities[batch.id] || ''}
                                                            onChange={e => handleQtyChange(batch.id, parseInt(e.target.value) || 0, batch.quantity)}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="transfer-modal-footer">
                                <p className="hint text-secondary">
                                    {mode === 'copy' ? '提示: 复制会保留原物品，并在目标库房创建副本。' : '提示: 移动会从原物品中扣除对应数量。若全部移走，原系统记录将直接删除。'}
                                </p>
                                <div className="actions">
                                    <button type="button" className="btn-cancel" onClick={onClose}>取消</button>
                                    <button type="submit" className="btn-primary" disabled={isSubmitting || !targetWarehouseId}>
                                        {isSubmitting ? '处理中...' : (mode === 'copy' ? '确认复制' : '确认移动')}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
};
