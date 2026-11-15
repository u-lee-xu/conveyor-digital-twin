import ReactDOM from 'react-dom/client'
// 走子路径而非 shared barrel：barrel 静态导出 PhysicsScene，会把 Rapier 拉回首屏
import { isViewerRuntime } from '@digital-twin/shared/runtime/runtimeRole'
import { App } from './App.tsx'
import { AppErrorBoundary } from './AppErrorBoundary.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary autoReload={isViewerRuntime()}>
    <App />
  </AppErrorBoundary>
)
