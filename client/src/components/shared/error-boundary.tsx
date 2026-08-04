import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * React Error Boundary — catches runtime errors in child components
 * and displays them instead of showing a blank white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, errorInfo } = this.state;

    return (
      <div style={{
        padding: 24,
        margin: 24,
        background: '#fef2f2',
        border: '2px solid #ef4444',
        borderRadius: 8,
        fontFamily: 'monospace',
        fontSize: 13,
        maxHeight: '90vh',
        overflow: 'auto',
      }}>
        <h2 style={{ color: '#dc2626', marginBottom: 8, fontSize: 18 }}>
          Application Error
        </h2>
        <p style={{ color: '#991b1b', marginBottom: 12 }}>
          Kuch ghalat ho gaya — ye screen develop ko bata dein:
        </p>
        <div style={{
          background: '#fff',
          padding: 12,
          borderRadius: 4,
          border: '1px solid #fca5a5',
          marginBottom: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          <strong style={{ color: '#dc2626' }}>{error?.toString()}</strong>
        </div>
        {errorInfo?.componentStack && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer', color: '#dc2626', marginBottom: 4 }}>
              Component Stack (click to expand)
            </summary>
            <pre style={{
              background: '#1e1e1e',
              color: '#f87171',
              padding: 12,
              borderRadius: 4,
              overflow: 'auto',
              fontSize: 11,
            }}>
              {errorInfo.componentStack}
            </pre>
          </details>
        )}
        <button
          onClick={() => window.location.assign('/login')}
          style={{
            marginTop: 16,
            padding: '8px 20px',
            background: '#dc2626',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Back to Login
        </button>
      </div>
    );
  }
}
