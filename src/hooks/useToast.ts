import { useCallback, useState } from 'react';

export interface ToastState {
  message: string;
  tone: 'success' | 'error';
}

/** Tiny toast used for save/delete/export feedback. */
export function useToast(): {
  toast: ToastState | null;
  show: (message: string, tone?: 'success' | 'error') => void;
  clear: () => void;
} {
  const [toast, setToast] = useState<ToastState | null>(null);

  const show = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3600);
  }, []);

  const clear = useCallback(() => setToast(null), []);

  return { toast, show, clear };
}
