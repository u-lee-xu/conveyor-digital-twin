import { useEffect, useState } from 'react';

/**
 * 紧凑布局判据（2026-11-08 多分辨率适配）。
 *
 * 旧断点 640 会把 768（平板竖屏）、844（手机横屏）、1024（平板横屏）误判成
 * 桌面，于是 320px 固定左栏挡住近半台设备，矮屏下还要在 358px 高的滚动区里
 * 找按钮。现在：宽度 < 1024 或高度 < 620 一律走底部抽屉，把 3D 视口留完整。
 * 桌面（≥1024 且高度足够）保持原左侧面板布局，观感零回退。
 *
 * 平台壳工作区与 5 个独立 App 共用这个判据，避免各入口断点漂移。
 */
export function useMobile(breakpoint = 1024): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(
      window.innerWidth < breakpoint || window.innerHeight < 620,
    );
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);

  return isMobile;
}
