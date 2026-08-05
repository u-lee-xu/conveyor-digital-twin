import { useEffect, useRef, useCallback, useState } from 'react';
import { useRobotStore, type CylinderName } from '../useRobotStore';

const SEQUENCE = [
  { name: '升降下降', cylinders: { lift: true } as Partial<Record<CylinderName, boolean>>, delay: 1.5 },
  { name: '夹爪张开', cylinders: { clamp: true }, delay: 0.5 },
  { name: '前后伸出', cylinders: { forward: true }, delay: 1.0 },
  { name: '夹爪夹紧', cylinders: { clamp: false }, delay: 0.5 },
  { name: '前后缩回', cylinders: { forward: false }, delay: 1.0 },
  { name: '升降上升', cylinders: { lift: false }, delay: 1.5 },
  { name: '夹爪放松', cylinders: { clamp: true }, delay: 0.5 },
];

export function AutoPanel() {
  const setCylinder = useRobotStore((s) => s.setCylinder);
  const setIndicator = useRobotStore((s) => s.setIndicator);
  const [running, setRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeStep = useCallback((index: number) => {
    const i = index % SEQUENCE.length;
    const step = SEQUENCE[i];
    setStepIndex(i);
    Object.entries(step.cylinders).forEach(([name, val]) => {
      setCylinder(name as CylinderName, val);
    });
    setIndicator('processing', true);
    setIndicator('running', true);
    setIndicator('home', false);
    timerRef.current = setTimeout(() => executeStep(i + 1), step.delay * 1000);
  }, [setCylinder, setIndicator]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const start = () => {
    useRobotStore.getState().resetAll();
    setRunning(true);
    setStepIndex(0);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => executeStep(0), 300);
  };
  const stop = () => {
    setRunning(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    useRobotStore.getState().resetAll();
    setIndicator('running', false);
    setIndicator('processing', false);
    setIndicator('home', true);
    setIndicator('alarm', false);
  };

  return (
    <div className="card">
      <div className="section-title !mb-2">自动演示</div>
      <div className="flex gap-1.5 mb-2">
        <button className="btn btn-xs btn-success flex-1 touch-manipulation" style={{ fontSize: '0.6rem' }}
          onClick={start} disabled={running} aria-label="启动自动演示">&#9654; 启动</button>
        <button className="btn btn-xs btn-danger flex-1 touch-manipulation" style={{ fontSize: '0.6rem' }}
          onClick={stop} disabled={!running} aria-label="停止自动演示">&#9632; 停止</button>
      </div>
      <div className="flex flex-wrap gap-0.5 mb-2">
        {SEQUENCE.map((s, i) => (
          <span key={i} className={`step-item ${running && i === stepIndex ? 'step-item-active' : ''}`}>
            <span className={`step-dot ${running && i === stepIndex ? 'step-dot-active' : ''}`} />
            {s.name}
          </span>
        ))}
      </div>
      <div className="divider !my-1.5" />
      {running ? (
        <span className="text-[0.65rem] text-cyan-400 font-semibold">
          {stepIndex + 1}/{SEQUENCE.length} &mdash; {SEQUENCE[stepIndex].name}
        </span>
      ) : (
        <span className="badge badge-slate">
          <span className="badge-dot badge-dot-slate" />待机
        </span>
      )}
    </div>
  );
}