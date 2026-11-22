import React from 'react';
import { X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title?: string;
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const ACCENT: Record<ToastMessage['type'], string> = {
  success: '#2f7d4f',
  error: '#d6345f',
  info: '#141414',
};

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-[calc(100%-2.5rem)] pointer-events-none" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.type === 'error' ? 'alert' : 'status'}
          className="pointer-events-auto relative flex items-start gap-3 p-4 bg-paper-2 border border-ink shadow-lift animate-slide-up"
        >
          <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: ACCENT[toast.type] }} />
          <div className="flex-1 text-sm">
            {toast.title && <div className="label mb-1" style={{ color: ACCENT[toast.type] }}>{toast.title}</div>}
            <p className="leading-snug">{toast.message}</p>
          </div>
          <button onClick={() => onDismiss(toast.id)} className="text-ink-dim hover:text-ink p-1 -mr-1 -mt-1" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
