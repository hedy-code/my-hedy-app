import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import './Toast.css';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
    message: string;
    type: ToastType;
    onClose: () => void;
}

export function Toast({ message, type, onClose }: ToastProps) {
    const icons = {
        success: <CheckCircle size={20} />,
        error: <AlertCircle size={20} />,
        warning: <AlertCircle size={20} />,
        info: <Info size={20} />
    };

    return (
        <div className={`toast-container animate-slide-in-up`}>
            <div className={`toast-content ${type} glass`}>
                <div className="toast-icon">
                    {icons[type]}
                </div>
                <div className="toast-message">
                    {message}
                </div>
                <button className="toast-close" onClick={onClose}>
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
