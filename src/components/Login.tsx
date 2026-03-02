import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Package, LogIn, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Login: React.FC = () => {
    const { signInWithGoogle, user } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (user) {
            navigate('/dashboard');
        }
    }, [user, navigate]);

    const handleLogin = async () => {
        try {
            setError(null);
            await signInWithGoogle();
            navigate('/dashboard');
        } catch (err: any) {
            console.error("Failed to log in", err);
            setError("登录失败，请重试。" + (err.message || ""));
        }
    };

    return (
        <div style={{
            display: 'flex',
            height: '100vh',
            width: '100vw',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-color)'
        }}>
            <div className="glass" style={{
                padding: '3rem',
                borderRadius: 'var(--border-radius)',
                textAlign: 'center',
                maxWidth: '400px',
                width: '90%'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    marginBottom: '2rem',
                    color: 'var(--primary-color)'
                }}>
                    <Package size={48} />
                    <h1 style={{ fontSize: '2rem', margin: 0, fontWeight: 700 }}>家用跟踪</h1>
                </div>

                <p style={{ color: 'var(--text-light)', marginBottom: '2.5rem', lineHeight: 1.6 }}>
                    掌握家中物品储备，及时补货不遗忘。使用 Firebase 云端同步您的数据。
                </p>

                {error && (
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: 'var(--danger-color)',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        marginBottom: '1.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        textAlign: 'left',
                        fontSize: '0.9rem'
                    }}>
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                <button
                    className="btn-primary"
                    onClick={handleLogin}
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        padding: '1rem'
                    }}
                >
                    <LogIn size={20} />
                    使用 Google 账号登录
                </button>
            </div>
        </div>
    );
};

export default Login;
