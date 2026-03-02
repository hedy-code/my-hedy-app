import { NavLink, Outlet } from 'react-router-dom';
import { Package, LayoutDashboard, ShoppingCart, CalendarOff, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useInventory } from '../hooks/useInventory';
import { LoadingSpinner } from './LoadingSpinner';
import './Layout.css';

export function Layout() {
    const { user, signOut } = useAuth();
    const { loading } = useInventory();

    if (loading) {
        return <LoadingSpinner />;
    }
    return (
        <div className="layout-container">
            <nav className="glass sidebar">
                <div className="brand">
                    <Package className="brand-icon" size={28} />
                    <span className="brand-text">家用日用品追踪</span>
                </div>

                <div className="nav-links">
                    <NavLink to="/" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                        <LayoutDashboard size={20} />
                        <span>数据看板</span>
                    </NavLink>
                    <NavLink to="/inventory" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                        <Package size={20} />
                        <span>库存管理</span>
                    </NavLink>
                    <NavLink to="/shopping" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                        <ShoppingCart size={20} />
                        <span>购物清单</span>
                    </NavLink>
                    <NavLink to="/expirations" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                        <CalendarOff size={20} />
                        <span>保质期追踪</span>
                    </NavLink>
                </div>
                <div className="nav-profile-bottom" style={{
                    marginTop: 'auto',
                    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                    paddingTop: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                }}>
                    {user && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} alt="avatar" style={{ width: '36px', height: '36px', borderRadius: '50%' }} />
                            <div style={{ overflow: 'hidden' }}>
                                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{user.displayName}</p>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-light)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{user.email}</p>
                            </div>
                        </div>
                    )}
                    <button className="nav-item text-btn" onClick={signOut} style={{ padding: '0.75rem', justifyContent: 'flex-start', width: '100%', color: 'var(--text-light)' }}>
                        <LogOut size={20} />
                        <span>退出登录</span>
                    </button>
                </div>
            </nav>

            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
}
