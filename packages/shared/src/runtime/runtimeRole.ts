/**
 * 运行角色唯一判据（软件 = 主控，浏览器 + IP + 端口 = 观众）。
 *
 * - 装了软件的机器：Electron 打包版 file:// 加载，或开发态用 localhost / 127.0.0.1
 *   打开，一律直接进主控流程（选设备 → 工作区），不显示角色选择页。
 * - 其余设备（智能电视 / 手机 / 学生机浏览器）：通过局域网 IP 或主机名访问
 *   http://<教师机>:5201/，打开就直接是只读跟随的观众，不需要任何参数或点击。
 *
 * 判据刻意只看协议与主机名，与 history.state / 路由解耦：
 * 旧版 App.tsx 与 DispensingSceneWrapper 各读一次 history.state，导致
 * 用 URL 直接打开时落到角色选择页，智能电视遥控器根本无法操作。
 */
export type RuntimeRole = 'teacher' | 'viewer';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function detectRuntimeRole(): RuntimeRole {
  if (typeof window === 'undefined') return 'teacher';
  const { protocol, hostname } = window.location;
  if (protocol === 'file:') return 'teacher';
  if (LOCAL_HOSTS.has(hostname)) return 'teacher';
  return 'viewer';
}

export function isTeacherRuntime(): boolean {
  return detectRuntimeRole() === 'teacher';
}

export function isViewerRuntime(): boolean {
  return detectRuntimeRole() === 'viewer';
}
