import { useState } from 'react';
import { ChevronDown, Settings, Plus, Home } from 'lucide-react';
import { useWarehouse } from '../contexts/WarehouseContext';
import { WarehouseModal } from './WarehouseModal';
import './WarehouseSwitcher.css';

export function WarehouseSwitcher() {
    const { warehouses, currentWarehouse, setCurrentWarehouseId } = useWarehouse();
    const [isOpen, setIsOpen] = useState(false);
    const [showModal, setShowModal] = useState(false);

    if (!currentWarehouse) return null;

    return (
        <div className="warehouse-switcher-container">
            <div className="warehouse-selector" onClick={() => setIsOpen(!isOpen)}>
                <div className="current-warehouse-info">
                    <Home size={18} className="warehouse-icon" />
                    <span className="warehouse-name">{currentWarehouse.name}</span>
                </div>
                <ChevronDown size={16} className={`chevron ${isOpen ? 'open' : ''}`} />
            </div>

            {isOpen && (
                <>
                    <div className="dropdown-overlay" onClick={() => setIsOpen(false)} />
                    <div className="warehouse-dropdown glass">
                        <div className="dropdown-header">选择库别</div>
                        <div className="warehouse-list">
                            {warehouses.map(w => (
                                <div 
                                    key={w.id} 
                                    className={`warehouse-item ${w.id === currentWarehouse.id ? 'active' : ''}`}
                                    onClick={() => {
                                        setCurrentWarehouseId(w.id);
                                        setIsOpen(false);
                                    }}
                                >
                                    <span>{w.name}</span>
                                    {w.id === currentWarehouse.id && <div className="active-dot" />}
                                </div>
                            ))}
                        </div>
                        <div className="dropdown-footer">
                            <button className="manage-btn" onClick={() => {
                                setShowModal(true);
                                setIsOpen(false);
                            }}>
                                <Settings size={14} />
                                <span>管理库别</span>
                            </button>
                            <button className="add-warehouse-btn" onClick={() => {
                                // Logic for quick add could go here or just open modal
                                setShowModal(true);
                                setIsOpen(false);
                            }}>
                                <Plus size={14} />
                                <span>新建库别</span>
                            </button>
                        </div>
                    </div>
                </>
            )}

            {showModal && <WarehouseModal onClose={() => setShowModal(false)} />}
        </div>
    );
}
