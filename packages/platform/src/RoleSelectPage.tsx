interface RoleSelectPageProps {
  onSelect: (role: 'teacher' | 'viewer') => void;
}

/** 统一入口页：主控（教师操作端）与观众（学生只读端）两个入口 */
export function RoleSelectPage({ onSelect }: RoleSelectPageProps) {
  return (
    <div className="w-screen h-screen bg-dark-900 overflow-hidden relative flex flex-col items-center justify-center">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-blue-600/10 blur-3xl rounded-full" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[300px] bg-purple-600/10 blur-3xl rounded-full" />
      </div>

      <div className="relative z-10 text-center mb-12 px-6">
        <h1 className="text-4xl font-bold text-white tracking-wide">
          数字孪生<span className="text-gradient">仿真平台</span>
        </h1>
        <p className="mt-3 text-sm text-gray-400">选择进入角色 · 主控连接 PLC 教学演示，观众端只读跟随 · © 2026 老徐</p>
      </div>

      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-6 px-6 max-w-3xl w-full">
        <button
          onClick={() => onSelect('teacher')}
          className="device-card text-left group"
        >
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shrink-0">
              <span className="text-2xl">🎓</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">主控模式</h2>
              <p className="text-xs text-gray-500 mt-0.5">教师 · 操作端</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-400 leading-relaxed">
            选择教学设备，连接 PLC 进行演示、仿真与评分；学生观众端将自动跟随本端选择的场景。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="status-badge status-badge-active">选择设备</span>
            <span className="status-badge status-badge-active">连接 PLC</span>
            <span className="status-badge status-badge-active">评分</span>
          </div>
        </button>

        <button
          onClick={() => onSelect('viewer')}
          className="device-card text-left group"
        >
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg shrink-0">
              <span className="text-2xl">👀</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white group-hover:text-purple-400 transition-colors">观众模式</h2>
              <p className="text-xs text-gray-500 mt-0.5">学生 · 只读端</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-400 leading-relaxed">
            只读观看 3D 场景：主控进入设备后自动跟随，也可自行选择设备查看；自由旋转视角。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="status-badge status-badge-inactive">跟随主控</span>
            <span className="status-badge status-badge-inactive">自选设备</span>
            <span className="status-badge status-badge-inactive">自由视角</span>
          </div>
        </button>
      </div>
    </div>
  );
}
