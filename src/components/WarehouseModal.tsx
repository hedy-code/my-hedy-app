import React, { useState } from 'react';
import { X, Plus, Trash2, Edit2, Check } from 'lucide-react';
import { useWarehouse } from '../contexts/WarehouseContext';
import './WarehouseModal.css';

interface WarehouseModalProps {
    onClose: () => void;
}

export function WarehouseModal({ onClose }: WarehouseModalProps) {
    const { warehouses, addWarehouse, deleteWarehouse, renameWarehouse } = useWarehouse();
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = newName.trim();
        if (!trimmedName) return;

        if (warehouses.some(w => w.name.toLowerCase() === trimmedName.toLowerCase())) {
            alert(`库别名称 "${trimmedName}" 已存在，请使用其他名称！`);
            return;
        }

        try {
            await addWarehouse(trimmedName);
            setNewName('');
        } catch (error) {
            console.error("Error adding warehouse:", error);
        }
    };

    const handleRename = async (id: string) => {
        const trimmedName = editValue.trim();
        if (!trimmedName) return;

        if (warehouses.some(w => w.id !== id && w.name.toLowerCase() === trimmedName.toLowerCase())) {
            alert(`库别名称 "${trimmedName}" 已存在，请使用其他名称！`);
            return;
        }

        try {
            await renameWarehouse(id, trimmedName);
            setEditingId(null);
        } catch (error) {
            console.error("Error renaming warehouse:", error);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="warehouse-management-modal glass">
                <div className="modal-header">
                    <h3>库别管理</h3>
                    <button className="close-btn" onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>

                <div className="modal-body">
                    <form className="add-warehouse-form" onSubmit={handleAdd}>
                        <input 
                            type="text" 
                            placeholder="输入新库别名称..." 
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                        />
                        <button type="submit" className="btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', flexShrink: 0, whiteSpace: 'nowrap', borderRadius: '8px' }}>
                            <Plus size={14} />
                            <span>添加</span>
                        </button>
                    </form>

                    <div className="warehouse-manage-list">
                        {warehouses.map(w => (
                            <div key={w.id} className="manage-item">
                                {editingId === w.id ? (
                                    <div className="add-warehouse-form" style={{ marginBottom: 0, flex: 1, padding: '0.1rem 0', gap: '0.3rem' }}>
                                        <input 
                                            type="text" 
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            autoFocus
                                            style={{ flex: 1, minWidth: 0 }}
                                        />
                                        <button className="btn-primary" onClick={() => handleRename(w.id)} title="确认" style={{ padding: '0.2rem 0.4rem', flexShrink: 0, borderRadius: '6px' }}>
                                            <Check size={14} />
                                        </button>
                                        <button onClick={() => setEditingId(null)} title="取消" style={{ padding: '0.2rem 0.4rem', flexShrink: 0, background: 'rgba(255, 255, 255, 0.05)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="name">{w.name}</span>
                                        <div className="actions">
                                            <button className="action-btn" onClick={() => {
                                                setEditingId(w.id);
                                                setEditValue(w.name);
                                            }}>
                                                <Edit2 size={16} />
                                            </button>
                                            <button 
                                                className="action-btn delete" 
                                                onClick={() => deleteWarehouse(w.id)}
                                                disabled={warehouses.length <= 1}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
