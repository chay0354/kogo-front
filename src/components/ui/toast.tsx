'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import motion from './motion.module.css';
import { DIALOG_EXIT_MS, prefersReducedMotion } from './motion';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  /** Set while the message is playing its exit and is no longer to be pressed. */
  leaving?: boolean;
}

interface ToastContextType {
  showToast: (message: string, type: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  /**
   * A message leaves the stack only once its exit has played. Dropping it on
   * the click, or on the tick of its own timer, is what made it vanish between
   * two frames. Reduced motion has no exit to wait for.
   */
  const dismissToast = useCallback((id: string) => {
    if (prefersReducedMotion()) {
      setToasts(prev => prev.filter(t => t.id !== id));
      return;
    }
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, DIALOG_EXIT_MS);
  }, []);

  const showToast = useCallback((message: string, type: ToastType, duration: number = 4000) => {
    const id = Math.random().toString(36).substring(7);
    const newToast: Toast = { id, message, type, duration };
    
    setToasts(prev => [...prev, newToast]);
    
    // Auto dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        dismissToast(id);
      }, duration);
    }
  }, [dismissToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] space-y-2 pointer-events-none">
        {toasts.map(toast => (
          <ToastNotification
            key={toast.id}
            toast={toast}
            onDismiss={() => dismissToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastNotification({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const icons = {
    success: <CheckCircle className="h-5 w-5 text-green-600" />,
    error: <AlertCircle className="h-5 w-5 text-red-600" />,
    info: <Info className="h-5 w-5 text-blue-600" />
  };

  const styles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  return (
    <div 
      className={`
        ${styles[toast.type]}
        pointer-events-auto
        min-w-[320px] max-w-[500px]
        border-2 rounded-lg shadow-lg
        p-4 pr-12
        relative
        ${motion.toast} ${toast.leaving ? motion.toastLeaving : ''}
      `}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {icons[toast.type]}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium leading-relaxed whitespace-pre-line">
            {toast.message}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="absolute top-3 left-3 p-1 rounded-md hover:bg-white/50 transition-colors"
          aria-label="סגור"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

