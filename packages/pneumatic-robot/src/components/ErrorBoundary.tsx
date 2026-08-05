import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: string; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: '100vw', height: '100vh', background: '#0f172a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#f87171', fontFamily: 'monospace', fontSize: '0.875rem',
          flexDirection: 'column', gap: '1rem',
        }}>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>加载出错</div>
          <div style={{ color: '#94a3b8', maxWidth: '30rem', textAlign: 'center' }}>
            {this.state.error}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1.5rem', borderRadius: '0.375rem',
              background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer',
            }}
          >
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}