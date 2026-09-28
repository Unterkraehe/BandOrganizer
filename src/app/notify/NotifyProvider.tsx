import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Toast } from '@/ui';

interface Notice {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

type Notify = (notice: Omit<Notice, 'id'>) => void;

const NotifyContext = createContext<Notify>(() => undefined);

/** Short confirmation toasts with optional undo (R-UX-04). */
export function NotifyProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const counter = useRef(0);

  const notify = useCallback<Notify>((next) => {
    counter.current += 1;
    setNotice({ ...next, id: counter.current });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <NotifyContext.Provider value={notify}>
      {children}
      {notice && (
        <Toast key={notice.id} message={notice.message}>
          {notice.actionLabel && notice.onAction && (
            <Button
              variant="primary"
              onClick={() => {
                notice.onAction?.();
                setNotice(null);
              }}
            >
              {notice.actionLabel}
            </Button>
          )}
        </Toast>
      )}
    </NotifyContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useNotify = () => useContext(NotifyContext);
