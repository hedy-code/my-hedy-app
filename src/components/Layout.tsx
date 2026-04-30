import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Package, LayoutDashboard, ShoppingCart, CalendarOff, LogOut, Archive, Settings as SettingsIcon, Menu, X, Undo2, Redo2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useInventory } from '../hooks/useInventory';
import { useUndoRedo } from '../contexts/UndoRedoContext';
import { LoadingSpinner } from './LoadingSpinner';
import { WarehouseSwitcher } from './WarehouseSwitcher';
import './Layout.css';

export function Layout() {
    const { user, signOut } = useAuth();
    const { loading } = useInventory();
    const { undo, redo, canUndo, canRedo } = useUndoRedo();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    if (loading) {
        return <LoadingSpinner />;
    }

    const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
    const closeMobileMenu = () => setIsMobileMenuOpen(false);

    return (
        <div className="layout-container">
            {/* Mobile Header */}
            <header className="mobile-header glass">
                <div className="brand">
                    <Package className="brand-icon" size={24} />
                    <span className="brand-text">家用日用品</span>
                </div>
                <button className="menu-toggle" onClick={toggleMobileMenu}>
                    {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </header>

            {/* Sidebar Navigation */}
            <nav className={`glass sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <div className="brand">
                        <Package className="brand-icon" size={28} />
                        <span className="brand-text">家用日用品追踪</span>
                    </div>
                </div>

                <div className="sidebar-content">
                    <WarehouseSwitcher />

                    <div className="nav-links">
                        <NavLink to="/" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={closeMobileMenu}>
                            <LayoutDashboard size={20} />
                            <span>数据看板</span>
                        </NavLink>
                        <NavLink to="/inventory" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={closeMobileMenu}>
                            <Package size={20} />
                            <span>库存管理</span>
                        </NavLink>
                        <NavLink to="/shopping" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={closeMobileMenu}>
                            <ShoppingCart size={20} />
                            <span>购物清单</span>
                        </NavLink>
                        <NavLink to="/expirations" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={closeMobileMenu}>
                            <CalendarOff size={20} />
                            <span>保质期追踪</span>
                        </NavLink>
                        <NavLink to="/historical" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={closeMobileMenu}>
                            <Archive size={20} />
                            <span>历史物品库</span>
                        </NavLink>
                        <NavLink to="/settings" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={closeMobileMenu}>
                            <SettingsIcon size={20} />
                            <span>设置</span>
                        </NavLink>
                    </div>
                </div>

                <div className="sidebar-footer">
                    {user && (
                        <div className="user-profile">
                            <img 
                                src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || user.email}&background=0D8ABC&color=fff`} 
                                alt="avatar" 
                                className="user-avatar" 
                            />
                            <div className="user-info">
                                <p className="user-name">{user.displayName || '用户'}</p>
                                <p className="user-email">{user.email}</p>
                            </div>
                        </div>
                    )}
                    <button className="logout-btn" onClick={signOut}>
                        <LogOut size={20} />
                        <span>退出登录</span>
                    </button>
                </div>
            </nav>

            {/* Overlay for mobile menu */}
            <div 
                className={`sidebar-overlay ${isMobileMenuOpen ? 'active' : ''}`} 
                onClick={closeMobileMenu} 
            />

            <main className="main-content">
                <Outlet />
                
                {/* Global Undo/Redo Floating Widget */}
                {user && (
                    <div className="undo-redo-widget" style={{ position: 'fixed', bottom: '28px', right: '28px', display: 'flex', gap: '8px', padding: '6px 10px', borderRadius: '22px', zIndex: 1000, boxShadow: '0 4px 20px rgba(0,0,0,0.25)', backgroundColor: 'rgba(30, 30, 40, 0.92)', backdropFilter: 'blur(12px)' }}>
                        <button 
                            onClick={undo}
                            disabled={!canUndo}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '50%', backgroundColor: canUndo ? '#f59e0b' : 'rgba(255,255,255,0.08)', color: canUndo ? '#fff' : 'rgba(255,255,255,0.3)', border: 'none', cursor: canUndo ? 'pointer' : 'not-allowed', opacity: canUndo ? 1 : 0.4, transition: 'all 0.2s', boxShadow: canUndo ? '0 2px 8px rgba(245,158,11,0.4)' : 'none' }}
                            title="撤销"
                        >
                            <Undo2 size={17} />
                        </button>
                        <button 
                            onClick={redo}
                            disabled={!canRedo}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '50%', backgroundColor: canRedo ? '#22c55e' : 'rgba(255,255,255,0.08)', color: canRedo ? '#fff' : 'rgba(255,255,255,0.3)', border: 'none', cursor: canRedo ? 'pointer' : 'not-allowed', opacity: canRedo ? 1 : 0.4, transition: 'all 0.2s', boxShadow: canRedo ? '0 2px 8px rgba(34,197,94,0.4)' : 'none' }}
                            title="重做"
                        >
                            <Redo2 size={17} />
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}

