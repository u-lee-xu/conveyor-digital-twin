/**
 * 平台壳顶层错误边界：任一设备场景 / 观众镜像渲染抛错时保留可读界面，
 * 不让 React 卸载整棵树变成白屏。观众大屏无人操作，出错后自动重载，
 * 但用 sessionStorage 做指数退避与次数上限，避免确定性错误造成 5s 重载风暴。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

const RELOAD_STATE_KEY = 'dt-viewer-reload-state';
const RELOAD_DELAYS = [5000, 15000, 60000];
const RELOAD_MAX = 3;
/** 距上次重载超过 2 分钟视为新故障，重新计数 */
const RELOAD_RESET_MS = 120000;

interface Props {
  children: ReactNode;
  /** 观众端自动重载；主控保留手动刷新，避免打断正在进行的 PLC 演示 */
  autoReload?: boolean;
}
interface State { error: Error | null; exhausted: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, exhausted: false };
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): State {
    return { error, exhausted: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[platform] 渲染异常:', error, info.componentStack);
    if (!this.props.autoReload || this.reloadTimer) return;

    let count = 0;
    let at = 0;
    try {
      const raw = sessionStorage.getItem(RELOAD_STATE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { count?: number; at?: number };
        count = Number(saved.count) || 0;
        at = Number(saved.at) || 0;
      }
    } catch { /* 隐私模式 / 存储被禁用时从 0 开始 */ }
    const now = Date.now();
    count = now - at > RELOAD_RESET_MS ? 1 : count + 1;
    try { sessionStorage.setItem(RELOAD_STATE_KEY, JSON.stringify({ count, at: now })); } catch { /* 隐私模式下存储不可用，忽略 */ }

    if (count > RELOAD_MAX) {
      console.error(`[platform] 自动重载已达 ${RELOAD_MAX} 次上限，停止刷新以免反复冲击服务`);
      this.setState({ exhausted: true });
      return;
    }
    const delay = RELOAD_DELAYS[Math.min(count - 1, RELOAD_DELAYS.length - 1)];
    console.warn(`[platform] 观众端将在 ${delay}ms 后重载（${count}/${RELOAD_MAX}）`);
    this.reloadTimer = setTimeout(() => window.location.reload(), delay);
  }

  componentWillUnmount(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0b1220', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', padding: 24,
      }}>
        <div style={{
          maxWidth: 520, padding: 24, borderRadius: 12, border: '1px solid #334155', background: '#111c2e',
        }}>
          <b style={{ fontSize: 18 }}>画面加载失败</b>
          <p style={{ margin: '12px 0', fontSize: 14 }}>
            {this.state.exhausted
              ? '自动重载已达上限，请手动刷新或联系教师机'
              : this.props.autoReload ? '即将自动重载，连续失败会逐步延长间隔' : '请刷新页面重试'}
          </p>
          <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#94a3b8', wordBreak: 'break-all' }}>
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 12, padding: '8px 16px', borderRadius: 6, border: '1px solid #475569',
              background: '#1d4ed8', color: '#fff', cursor: 'pointer',
            }}
          >刷新页面</button>
        </div>
      </div>
    );
  }
}
