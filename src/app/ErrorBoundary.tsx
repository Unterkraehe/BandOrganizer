import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import i18n from '@/core/i18n';
import { Button, EmptyState } from '@/ui';

interface State {
  hasError: boolean;
}

/** Last line of defence: never show a blank screen (R-UX-03). */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ padding: 'var(--space-6)', maxWidth: 'var(--content-max)', margin: '0 auto' }}>
        <EmptyState
          icon={<AlertTriangle size={28} />}
          title={i18n.t('error.title')}
          text={i18n.t('error.text')}
          action={
            <Button variant="primary" onClick={() => window.location.reload()}>
              {i18n.t('error.reload')}
            </Button>
          }
        />
      </div>
    );
  }
}
