import React from 'react';
import { useDemoSim, STEP_LABELS, type DemoStep } from '../hooks/useDemoSim';

/** 流程指示步骤序列 */
const FLOW: { key: DemoStep; label: string }[] = [
  { key: 'LOWER', label: '取料' },
  { key: 'ADVANCE', label: '放料' },
  { key: 'RETURN', label: '回位' },
];

/** 当前所处流程阶段（取料/放料/回位） */
function flowIndex(step: DemoStep): number {
  if (['LOWER', 'GRAB', 'RAISE'].includes(step)) return 0;
  if (['ADVANCE', 'LOWER_PLACE', 'OPEN', 'RAISE_BACK'].includes(step)) return 1;
  if (step === 'RETURN') return 2;
  return -1;
}

export function DemoPanel() {
  const { running, paused, step, start, stop, pause, resume } = useDemoSim();
  const current = flowIndex(step);

  return (
    <div className="space-y-3">
      {/* 状态机状态 */}
      <div className="device-card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-200">状态机</span>
          <span className={`status-badge ${
            !running ? 'status-badge-inactive' :
            paused ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
            'status-badge-active'
          }`}>
            <span className="mr-1">{running && !paused ? '▶' : paused ? '⏸' : '⏹'}</span>
            {STEP_LABELS[step]}
          </span>
        </div>

        {/* 流程指示 */}
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          {FLOW.map((f, i) => (
            <React.Fragment key={f.key}>
              {i > 0 && <span>→</span>}
              <span className={current === i ? 'text-white' : ''}>{f.label}</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* 控制按钮 */}
      <div className="device-card">
        <div className="flex gap-2">
          <button
            onClick={start}
            disabled={running && !paused}
            className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all btn ${
              running && !paused
                ? 'bg-gray-600/30 text-gray-500 cursor-not-allowed'
                : 'btn-success'
            }`}
          >
            ▶ 启动演示
          </button>
          {running && (
            <button
              onClick={paused ? resume : pause}
              className="flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all btn btn-warning"
            >
              {paused ? '▶ 继续' : '⏸ 暂停'}
            </button>
          )}
          {running && (
            <button
              onClick={stop}
              className="flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all btn btn-danger"
            >
              ⏹ 停止
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default DemoPanel;
