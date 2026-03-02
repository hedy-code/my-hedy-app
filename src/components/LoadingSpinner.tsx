import React from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingSpinner: React.FC = () => {
    return (
        <div style={{
            display: 'flex',
            height: '100vh',
            width: '100vw',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '1rem',
            color: 'var(--text-color)'
        }}>
            <Loader2 className="animate-spin" size={48} style={{ color: 'var(--primary-color)' }} />
            <p>正在加载...</p>
        </div>
    );
};
