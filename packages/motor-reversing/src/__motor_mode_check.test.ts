/** S4 / S5 自检：模式边界（本地零帧、仿真只受 PLC 帧驱动）、清理与三模式声明 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MOTOR_ACTION, encodeMotorAction } from './constants/motorVariables';
import { MOTOR_LAMP_COLORS, MOTOR_VISUAL } from './constants/motorConstants';
import { useMotorStore } from './stores/useMotorStore';

const fs = process.getBuiltinModule('fs')!;
const read = (rel: string) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8') as string;

function advance(seconds: number, step = 0.05) {
  const n = Math.ceil(seconds / step);
  for (let i = 0; i < n; i += 1) useMotorStore.getState().tick(step);
}

beforeEach(() => {
  useMotorStore.getState().resetAll();
  useMotorStore.getState().setQf(true);
});

it('默认分断：resetAll 后 QF 断开、推杆在下方，点击才上电', () => {
  const st = useMotorStore.getState();
  st.resetAll();
  expect(useMotorStore.getState().qfClosed).toBe(false);
  st.setQf(true);
  expect(useMotorStore.getState().qfClosed).toBe(true);
});

describe('仿真模式：按钮只作设备→PLC 输入', () => {
  it('PLC 来源下按按钮不直接吸合接触器', () => {
    useMotorStore.getState().setControlSource('plc');
    useMotorStore.getState().setButton('fwdJog', true);
    advance(0.5);
    const st = useMotorStore.getState();
    expect(st.buttons.fwdJog).toBe(true);
    expect(st.km1Cmd).toBe(false);
    expect(st.km1On).toBe(false);
  });

  it('PLC 输出 KM 线圈是唯一驱动源，硬件互锁仍然生效', () => {
    useMotorStore.getState().setControlSource('plc');
    useMotorStore.getState().setPlcFrame({ km1: true, km2: false });
    advance(0.6);
    expect(useMotorStore.getState().km1On).toBe(true);
    expect(useMotorStore.getState().direction).toBe(1);

    useMotorStore.getState().setPlcFrame({ km1: true, km2: true });
    advance(0.1);
    const st = useMotorStore.getState();
    expect(st.forbidden).toBe(true);
    expect(st.km1On && st.km2On).toBe(false);
  });

  it('仿真模式 KM 直控开关不生效', () => {
    useMotorStore.getState().setControlSource('plc');
    useMotorStore.getState().setDirectCoil('km1', true);
    advance(0.2);
    expect(useMotorStore.getState().kmDirect.km1).toBe(false);
    expect(useMotorStore.getState().km1Cmd).toBe(false);
  });

  it('显式动作字按 seq 变化沿触发 FR 复位，重复同 seq 不重复触发', () => {
    useMotorStore.getState().triggerOverload();
    useMotorStore.getState().tick(0.05);
    expect(useMotorStore.getState().frTripped).toBe(true);
    useMotorStore.getState().setPlcFrame({
      actionWord: encodeMotorAction(MOTOR_ACTION.FR_RESET, 42),
    });
    expect(useMotorStore.getState().frTripped).toBe(false);
    useMotorStore.getState().triggerOverload();
    useMotorStore.getState().tick(0.05);
    expect(useMotorStore.getState().frTripped).toBe(true);
    useMotorStore.getState().setPlcFrame({
      actionWord: encodeMotorAction(MOTOR_ACTION.FR_RESET, 42),
    });
    expect(useMotorStore.getState().frTripped).toBe(true);
  });
});

describe('本地模式与切换清理', () => {
  it('切到 PLC 时清掉本地锁存 / 直控 / 演示，避免残留覆盖外部帧', () => {
    const s = useMotorStore.getState();
    s.setButton('fwdStart', true);
    s.setButton('fwdStart', false);
    s.setDirectCoil('km2', true);
    useMotorStore.getState().startDemo();
    useMotorStore.getState().setControlSource('plc');
    const st = useMotorStore.getState();
    expect(st.runLatch).toBeNull();
    expect(st.kmDirect.km1 || st.kmDirect.km2).toBe(false);
    expect(st.demoRunning).toBe(false);
    expect(st.km1Cmd).toBe(false);
    expect(st.km2Cmd).toBe(false);
  });

  it('stopDemo 与 resetAll 清干净演示与线圈', () => {
    useMotorStore.getState().startDemo();
    advance(0.3);
    useMotorStore.getState().stopDemo();
    expect(useMotorStore.getState().demoRunning).toBe(false);
    expect(useMotorStore.getState().demoCoils.km1).toBe(false);
    useMotorStore.getState().resetAll();
    const st = useMotorStore.getState();
    expect(st.speedRpm).toBe(0);
    expect(st.beltDisplacement).toBe(0);
    expect(st.frTripped).toBe(false);
    expect(st.controlSource).toBe('local');
    expect(st.connected).toBe(false);
  });
});

describe('源码级防回退断言', () => {
  it('effects 只在 connected 时读写，观众端不挂副作用', () => {
    const src = read('src/platform/MotorDeviceEffects.tsx');
    expect(src).toContain('isViewerRuntime()');
    expect(src).toContain('if (!st.connected)');
    expect(src).toContain("writeWords(['MOTOR_DISPLACEMENT'], [displacement])");
    expect(src).toContain('lastSensorMask');
  });

  it('手动 / 演示面板不写 PLC，连接只在仿真模式建立', () => {
    const manual = read('src/platform/MotorManualPanel.tsx');
    const demo = read('src/platform/MotorDemoPanel.tsx');
    const sim = read('src/platform/MotorSimPanel.tsx');
    expect(manual).not.toContain('modbusService');
    expect(demo).not.toContain('modbusService');
    expect(sim).toContain('MotorPlcConnection');
    expect(sim).toContain('MotorButtonPad');
  });

  it('三模式声明齐全且无评分模式', () => {
    const idx = read('src/index.ts');
    expect(idx).toContain("id: 'manual'");
    expect(idx).toContain("id: 'auto'");
    expect(idx).toContain("id: 'sim'");
    expect(idx).not.toContain("id: 'scoring'");
    expect(idx).toContain('exportSnapshot: () => exportMotorSnapshot()');
    expect(idx).toContain('applyBroadcast:');
  });

  it('连接预设不列本机练习靶机、不固化 IP', () => {
    const conn = read('src/platform/MotorPlcConnection.tsx');
    expect(conn).toContain('wordVariables: MOTOR_WORD_VARIABLES');
    expect(conn).toContain('motorBoolVarsFor');
    expect(conn).not.toContain('1503');
    expect(conn).not.toContain('1505');
    expect(conn).not.toContain('1507');
    expect(conn).not.toContain('1508');
    expect(conn).not.toContain('1509');
  });

  it('3D 操作台按钮可按：与 UI 面板共用 setButton，观众只读端不响应', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    expect(src).toContain('function use3dButtonHandlers()');
    expect(src).toContain('useMotorStore.getState().setButton(key, true)');
    expect(src).toContain('useMotorStore.getState().setButton(key, false)');
    expect(src).toContain('onPointerDown={(e) => { e.stopPropagation(); press(key); }}');
    expect(src).toContain('onPointerUp={(e) => { e.stopPropagation(); release(key); }}');
    expect(src).toContain('isViewerRuntime()');
    expect(src).toContain("'data-dt-3d-button': dataKey");
  });

  it('柜内按实物三层 DIN 导轨分区，含横向与竖向走线槽', () => {
    const consts = read('src/constants/motorConstants.ts');
    expect(consts).toContain('upperY: 1.16');
    expect(consts).toContain('middleY: 0.76');
    expect(consts).toContain('lowerY: 0.4');
    expect(consts).toContain("level: 'upper'");
    expect(consts).toContain("level: 'middle'");
    expect(consts).toContain('rows: [1.38, 1.05, 0.6, 0.22]');
    const src = read('src/scenes/components/MotorParts.tsx');
    expect(src).toContain('G.DUCT.rows.map');
    expect(src).toContain('verticalX');
    expect(src).toContain('<DinRail y={G.DIN.middleY} />');
  });

  it('QF 照 NXB-63G 实物程序化重画：三极白壳 + 上下端子 + 可推蓝推杆，点击上电', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const qf = src.split('export function Breaker(')[1].split('export function FuseBank(')[0];
    expect(qf).toContain('M.handleBlue');
    expect(qf).toContain('TerminalRow');
    expect(qf).toContain('Q.h * (closed ? 0.58 : 0.3)');         // OFF 在下、推上去 ON
    expect(qf).not.toContain('M.stopRed');                        // 每极状态窗不画
    expect(qf).not.toContain('motorLampMaterial');
    expect(qf).not.toContain('sphereGeometry');
    // 3D 点击直接切 QF，与 UI 面板同源，观众只读端不响应
    expect(qf).toContain('store.setQf(!store.qfClosed)');
    expect(qf).toContain('isViewerRuntime()');
    expect(qf).toContain('onPointerDown={(e) => { e.stopPropagation(); toggleQf(); }}');
    expect(qf).toContain("dataKey=\"qf\"");
  });

  it('去掉方向圆锥 / 规则横纹 / 悬浮大标题，改用纸箱与地坪光影', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    expect(src).not.toContain('coneGeometry');
    expect(src).not.toContain('方向箭头');
    expect(src).not.toContain('rubberStripe');
    expect(src).not.toContain('stripeCount');
    expect(src).not.toContain('text="滚筒传送带"');
    expect(src).not.toContain('text="M 三相电机"');
    expect(src).not.toContain('text="控制柜"');
    expect(src).toContain('M.beltJoint');
    expect(src).toContain('M.carton');
    expect(src).toContain('castShadow');
    const scene = read('src/scenes/MotorSceneContent.tsx');
    expect(scene).toContain('receiveShadow');
    expect(scene).toContain('shadow-mapSize');
    expect(scene).not.toContain('cellSize={0.1}');
  });

  it('柜内四元件照实物程序化重画：GLB / 连杆 / 穿模配线全部撤掉，动画保留（QF 推杆 / KM 吸合灯 / FR 脱扣）', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const consts = read('src/constants/motorConstants.ts');
    expect(consts).not.toContain('MOTOR_SHELL_MODELS');
    expect(consts).not.toContain('MOTOR_HANDLE_ANCHOR');
    expect(src).not.toContain('useGLTF');
    expect(src).not.toContain('function CadShell(');
    expect(src).not.toContain('Suspense');
    expect(src).not.toContain('MechanicalInterlock');              // 两台接触器之间连杆已删
    expect(src).not.toContain('<Wire from=');                      // 穿过元件的配线已删
    expect(src).toContain('function TerminalRow(');
    expect(src).toContain('function DinClips(');
    expect(src).toContain('function Screw(');
    expect(src).toContain('M.handleBlue');                        // 可推蓝色推杆
    expect(src).toContain('Q.h * (closed ? 0.58 : 0.3)');
    expect(src).toContain('store.setQf(!store.qfClosed)');       // QF 点击上电
    expect(src).toContain('onPointerDown={(e) => { e.stopPropagation(); toggleQf(); }}');
    expect(src).not.toContain('K.h * (on ? 0.5 : 0.56)');        // 衔铁横条已删
    // 第十五轮新增的继电器触点也会用 M.contactClosed，故按 KM 切片判定
    const km = src.split('export function Contactor(')[1].split('export function ThermalRelay(')[0];
    expect(km).not.toContain('M.contactClosed');                  // KM 三组主触点已删
    expect(src).toContain("motorLampMaterial('forward', on)");    // 吸合灯保留
    expect(src).toContain('tripped ? M.frTripped : M.thermalFace'); // FR 脱扣指示窗
    expect(src).toContain("text={tripped ? 'FR 跳闸' : 'FR'}");
  });

  it('全场景可见面按 GAP 错开，消除共面闪烁源', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const scene = read('src/scenes/MotorSceneContent.tsx');
    const consts = read('src/constants/motorConstants.ts');
    expect(consts).toContain('rows: [1.38, 1.05, 0.6, 0.22]');
    expect(src).toContain('face + GAP');                          // 端子孔与贴面错开
    expect(src).toContain('C.depth / 2 + GAP]} material={M.cabinet}'); // 门框改薄边外贴
    expect(src).toContain('bodyStart = gearStart + T.gearboxLen + GAP'); // 电机段间留缝
    expect(src).toContain('D.depth / 2 + GAP * 4');               // 线槽黄条与梳齿错开
    expect(src).toContain('const horizontalLen = DUCT_INNER_SPAN'); // 横竖交汇与导轨共用净长
    expect(src).toContain('Q.h * (closed ? 0.58 : 0.3)');         // QF 推杆 OFF 在下、ON 在上
    expect(src).toContain('y + 0.015, C.lampRowZ');                // 灯透镜与灯圈错开
    expect(scene).toContain('G.SKID.beamGap - G.SKID.beamWidth - GAP * 2');
  });

  it('电机按 MD520 范式做尾端外露风扇，扇叶可见且随轴自转', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const motor = src.split('export function MotorUnit(')[1].split('export function ConveyorAssembly(')[0];
    expect(motor).toContain('torusGeometry args={[T.finR');      // 环形散热筋
    expect(motor).toContain('24, 1, true');                       // openEnded 风罩筒，不封端面
    expect(motor).toContain('torusGeometry args={[T.fanCoverR');  // 不转的护圈
    expect(motor).toContain('rotation={[0, 0, shaftAngle]}');     // 整组绕 Z 自转
    expect(motor).toContain('a + Math.PI / 6');                   // 叶片攻角
    expect(motor).toContain('T.fanBladeL');
    expect(motor).not.toContain('grill-');                        // 旧的遮挡栅格已删
    expect(motor).not.toContain('T.endCapR');                     // 旧的实心端盖已删
    const consts = read('src/constants/motorConstants.ts');
    expect(consts).toContain('fanHubR');
    expect(consts).toContain('fanBladeW');
  });

  it('FR 照 JR36-63 照片程序化重画：黑色主体正面朝柜门、并排同层，无 GLB / 插接件', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const consts = read('src/constants/motorConstants.ts');
    const fr = src.split('export function ThermalRelay(')[1].split('export function TerminalStrip(')[0];
    expect(fr).toContain('M.darkMetal');                   // 黑色主体
    expect(fr).not.toContain('TerminalRow');               // 第三十二轮起端子块直排顶面
    expect(fr).toContain('M.stopRed');                    // 红色复位 STOP
    expect(fr).toContain('tripped ? M.frTripped : M.thermalFace'); // 脱扣指示窗
    expect(fr).toContain("text={tripped ? 'FR 跳闸' : 'FR'}");
    expect(fr).not.toContain('MOTOR_SHELL_MODELS');
    expect(fr).not.toContain('pinH');                     // 三针已删
    expect(consts).toContain("x: 0.082, label: 'FR'");   // 第三十五轮：第二排 KM2 与 PLC 之间
    expect(consts).not.toContain("mount: 'belowKm'");
    expect(consts).toContain('rows: [1.38, 1.05, 0.6, 0.22]');
  });

  it('第十二轮 KM / FR 实物细节 + 第十三轮 KM 做减法后的最终形态', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const consts = read('src/constants/motorConstants.ts');
    expect(src).toContain('function CrossScrew(');
    expect(src).toContain('cross?: boolean');
    expect(src).toContain('offsetX?: number');
    expect(src).not.toContain('useGLTF');
    const km = src.split('export function Contactor(')[1].split('export function ThermalRelay(')[0];
    expect(km).toContain('K.backPlateH');                    // 顶部深灰 DIN 背板
    expect(km).toContain('well-${bi}-${hi}');                // 六个真凹孔的深色孔底
    expect(km).toContain('K.recessDepth');                    // 本体前脸挖孔深度
    expect(km).toContain('K.terminalPortR');                 // 十字槽螺钉 / 导线圆孔
    expect(km).not.toContain('K.coilCoverD');                   // 前盖已删
    expect(km).not.toContain('M.contactorLower');                // 深灰衔铁已删
    expect(km).not.toContain('M.nameplateBlue');                 // 铭牌已删
    expect(km).not.toContain('K.h * (on ? 0.5 : 0.56)');       // 衔铁横条已删
    expect(km).not.toContain('M.contactOpen');                   // 三组主触点已删
    expect(km).toContain("motorLampMaterial('forward', on)");   // 吸合灯保留
    expect(km).toContain('faceDetailZ');                         // 剩余贴面直接贴壳体
    const fr = src.split('export function ThermalRelay(')[1].split('export function TerminalStrip(')[0];
    expect(fr).toContain('F.padW');                          // 第三十轮：每极一块端子块
    expect(fr).toContain('F.tickCount');                     // 白色旋钮刻度
    expect(fr).toContain('F.dialFaceR');
    expect(fr).toContain('M.stopRed');
    expect(fr).not.toContain('M.testTeal');                  // 蓝色 TEST 已按照片删除
    expect(fr).toContain('tripped ? M.frTripped : M.thermalFace');
    expect(fr).toContain("text={tripped ? 'FR 跳闸' : 'FR'}");
    expect(fr).not.toContain('pinH');                        // 三针插接件不回来
    expect(consts).toContain('backPlateH: 0.014');
    expect(consts).toContain('padW: 0.020');
    expect(consts).not.toContain('ribCount: 4');             // 旧四道凸筋已按照片删除
    expect(consts).toContain('rows: [1.38, 1.05, 0.6, 0.22]');
  });

  it('第三十轮：FR 照用户实物正面照重修——绿铜大螺钉 / 顶铜带 / 无蓝 TEST / 无凸筋', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const consts = read('src/constants/motorConstants.ts');
    const fr = src.split('export function ThermalRelay(')[1].split('export function TerminalStrip(')[0];
    // 照片特征 1：每极一块深色端子块，块间凹缝（旧四道凸筋删除）
    expect(fr).toContain('fr-cell-');                      // 上下分体银色螺钉框（原贯通 pad 删除）
    expect(fr).toContain('F.padW');
    expect(fr).not.toContain('F.ribCount');
    expect(fr).not.toContain('F.ribD');
    expect(fr).not.toContain('F.labelW');                    // 左侧白色标签块已删
    // 照片特征 2：六颗大绿铜组合槽螺钉（CrossScrew 换色，KM / QF 默认仍银色）
    expect(fr).toContain('mat={M.terminalSilver} recessed');     // 第四十八轮：改 KM 同款银白十字
    expect(consts).toContain('poleRegionW: 0.129, poleRegionX: -0.032');
    expect(consts).toContain('frameW: 0.030, frameH: 0.028');
    expect(src).toContain('mat = M.terminalSilver');          // CrossScrew 默认材质不变
    expect(consts).toContain('TERMINAL_SCREW_GREEN: ');          // 令牌仍在，但主螺钉不再用它
    // 照片特征 3：顶部黄铜色横带
    expect(fr).not.toContain('material={M.brass}');             // 第五十一轮：顶部铜带已删
    expect(fr).not.toContain('F.capBandH');                    // 第五十一轮：铜带与 STOP 旧定位都删
    // 照片特征 4：红色 STOP 移到右上角、蓝色 TEST 删除
    expect(fr).toContain('F.stopW');                      // 红 STOP 方钮（第三十二轮起在顶面靠背缘）
    expect(fr).not.toContain('M.testTeal');
    // 教学功能保留：脱扣指示窗跳闸转红
    expect(fr).toContain('tripped ? M.frTripped : M.thermalFace');
  });

  it('第三十三轮：FR 照本地 STEP 改朝向与比例——螺钉 / 旋钮面朝屏幕、矮身', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const consts = read('src/constants/motorConstants.ts');
    const fr = src.split('export function ThermalRelay(')[1].split('export function TerminalStrip(')[0];
    // 立地矮身主体、操作面在前脸朝屏幕（前脸层次由 face = F.d / 2 派生）
    expect(fr).toContain('[F.w, F.h, F.d]');
    expect(fr).toContain('[0, F.h / 2, 0]');
    expect(fr).toContain('const face = F.d / 2;');
    // 竖直两排螺钉头对头相切、十字槽朝屏幕（CrossScrew 默认朝 +z，无额外旋转）
    expect(fr).toContain('const screwR = F.terminalPortR;');     // 螺钉放大
    expect(fr).toContain('padCY + s * screwRowStep');
    expect(fr).toContain('screwLayerZ(s)');                    // 上凸下凹分两层
    expect(consts).toContain('screwRowGap: GAP * 11');
    expect(consts).toContain('screwUpperOut: GAP * 6');
    expect(consts).toContain('screwLowerIn: GAP,');
    // 第四十七轮：分体银框 / 立筋 / 辅助螺钉 / 刻度数字
    expect(consts).toContain('frameW: 0.030, frameH: 0.028');
    expect(consts).toContain('ribOut: GAP * 2,');
    expect(consts).toContain('ribWidthRatio: 0.8');
    expect(fr).toContain('(F.poleRegionW / 3 - F.frameW) * F.ribWidthRatio');
    expect(fr).toContain('fr-cross-rib-${i}');               // 横向格栅每极一段，非贯通整条
    expect(fr).toContain('2 * screwRowStep - F.frameH - F.crossRibGap * 2');
    expect(consts).toContain('crossRibGap: GAP * 0.5');
    expect(fr).not.toContain('material={M.brass}');              // 顶部棕带已删
    expect(fr).toContain('const padTop = F.h - GAP;');           // 座顶到壳顶
    expect(fr).toContain('material={M.poleLip}');               // 中灰隔离带
    expect(consts).toContain('screwRowGap: GAP * 11');
    expect(consts).toContain('auxScrewR: 0.005, auxSpacing: 0.014');
    expect(consts).toContain("dialNumbers: ['14', '18', '22']");
    expect(fr).toContain("text={num}");
    expect(fr).toContain('fr-rib-${i}');
    expect(fr).toContain('fr-aux-${s}');
    expect(fr).not.toContain('rotation={[-Math.PI / 2, 0, 0]}');   // 顶面朝上写法废弃
    // 旋钮轴沿 z 朝屏幕
    expect(fr).toContain('cylinderGeometry args={[F.dialFaceR, F.dialFaceR, 0.012, 24]}');
    expect(fr).toContain('rotation={[Math.PI / 2, 0, 0]}');
    // 第五十一轮：铜带删除、红钮贴壳顶，观察窗靠脸底
    expect(fr).toContain('const stopY = F.h - GAP - F.stopH / 2;');
    expect(fr).toContain('const windowY = F.h * 0.36;');
    expect(fr).not.toContain('const stopZ');
    expect(fr).not.toContain('const windowZ');
    // 矮身比例：第三十四轮前脸压到 0.095，第四十六轮进深压到 0.05
    expect(consts).toContain('w: 0.185, h: 0.095, d: 0.05');
  });

  it('第十三轮：QF 合闸行程翻倍、FR 侧面变薄、KM 正面做减法', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const consts = read('src/constants/motorConstants.ts');
    expect(src).toContain('Q.h * (closed ? 0.58 : 0.3)');
    expect(src).not.toContain('Q.h * (closed ? 0.44 : 0.3)');
    expect(src).toContain('Q.h * 0.76');                        // 印字窄条让到蓝杆上方
    expect(consts).not.toContain('d: 0.072');                   // 第三十一轮起 FR 已再压薄到 0.044
    expect(consts).not.toContain('coilCoverD');                  // 前盖常量已删
    const km = src.split('export function Contactor(')[1].split('export function ThermalRelay(')[0];
    expect(km).not.toContain('M.nameplateBlue');
    expect(km).not.toContain('M.contactClosed');
    expect(km).not.toContain('M.silver');
    expect(km).toContain('faceDetailZ');
    expect(km).toContain("motorLampMaterial('forward', on)");
  });

  it('第十四轮：FR 再压薄，KM 中部衔铁件第四十五轮改为 z 向进出动作指示', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const consts = read('src/constants/motorConstants.ts');
    expect(consts).not.toContain('d: 0.072');                    // 第三十一轮起 FR 已再压薄到 0.044
    const km = src.split('export function Contactor(')[1].split('export function ThermalRelay(')[0];
    expect(km).not.toContain('K.h * (on ? 0.4 : 0.46)');        // 不再沿 y 下沉
    expect(km).toContain('K.h * 0.46');                          // 方块固定在滑槽中部
    expect(km).toContain('K.h * 0.24');                          // 深色滑槽
    expect(km).toContain('M.poleLip');                           // 灰色方块
    expect(km).toContain('K.h * 0.65');                          // 黑色圆柱仍在滑槽之上
    expect(km).toContain("motorLampMaterial('forward', on)");    // 绿光交给右侧小方立柱
    expect(km).toContain('faceDetailZ + K.actionBlockBase - (on ? K.actionTravel : 0)');
    expect(km).toContain('faceDetailZ + K.actionPinBase - (on ? K.actionTravel : 0)');
    expect(km).toContain('rotation={[Math.PI / 2, 0, 0]} material={M.cavityDark}'); // 圆柱恒黑
    expect(consts).toContain('actionTravel: GAP * 3');             // 进出量由 GAP 派生
    expect(km).not.toContain('M.contactClosed');                 // 三组主触点不回来
    expect(km).not.toContain('M.nameplateBlue');                 // 铭牌不回来
  });

  it('第十五轮：24V 控制侧三件套进柜，纯视觉件不碰 PLC 契约 / 地址表', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const consts = read('src/constants/motorConstants.ts');
    expect(src).toContain('export function SwitchingPowerSupply(');
    expect(src).toContain('export function PlcUnit(');
    expect(src).toContain('export function RelayUnit(');
    expect(src).toContain("part.kind === 'psu'");
    expect(src).toContain("part.kind === 'plc'");
    expect(src).toContain("part.kind === 'relay'");
    expect(src).toContain("part.label === 'KM1' ? km1On : km2On"); // 不再按数组下标串状态
    expect(src).toContain("case 'psu':");
    expect(src).toContain("case 'plc':");
    expect(src).toContain("case 'relay':");
    expect(consts).toContain('PSU: {');
    expect(consts).toContain('PLC: {');
    expect(consts).toContain('RELAY: {');
    expect(consts).toContain("label: 'PSU'");
    expect(consts).toContain("label: '开关电源'");
    expect(consts).toContain("label: '中间继电器'");
    // 第三十五轮：第一排 QF → FU → 开关电源 → KA1 / KA2 居中铺开
    expect(consts).toContain("x: 0.115, label: 'PSU'");
    expect(consts).toContain("label: 'KA1'");
    expect(consts).toContain("label: 'KA2'");
    // PLC 第三十六轮按 H5U 参考图简化：方块 LED + 两个网口 + 两条异色 IO 条
    expect(consts).toContain('ledCount: 2');
    expect(src).toContain('run={plcRun}');                       // 第三十七轮：RUN 是 PLC 自身开关
    expect(src).toContain("case 'plc': return <PlcUnit />;"); // 展台裸件不传快照 props
    const plc = src.split('export function PlcUnit(')[1].split('export function RelayUnit(')[0];
    expect(plc).toContain('M.plcBody');
    expect(plc).toContain('plc-silk-');                          // POW / RUN 丝印名
    expect(plc).toContain('plc-port-');                          // 两个方块网口
    expect(plc).toContain('plc-strip-');                          // 两条异色 IO 条
    expect(plc).not.toContain('plc-vent-');                     // 散热格栅不画
    // 继电器动作只靠中间灰色小方块变色，不再有顶灯 / 触点片位移
    const relay = src.split('export function RelayUnit(')[1].split('/** 端子排：')[0];
    expect(relay).toContain('on ? M.contactorOn : M.contactorIdle');
    expect(relay).not.toContain('M.lamp.power');
    expect(relay).not.toContain('M.contactClosed');
    // 三件套只读 store 做灯效，不写状态、不发帧、不碰保持寄存器
    const visual = src.split('24V 控制侧三件套')[1].split('/** 端子排：')[0];
    expect(visual).not.toContain('setQf');
    expect(visual).not.toContain('setButton');
    expect(visual).not.toContain('writeFeedbackBatch');
    expect(visual).not.toContain('HOLDING_REGISTERS');
    expect(src).not.toContain('useGLTF');                         // 仍是运行时零 GLB
  });

  it('第十六轮：两台 24V 继电器各自随 KM1 / KM2（朝向由第二十轮结构重画取代）', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const consts = read('src/constants/motorConstants.ts');
    expect(consts).toContain("kind: 'relay', level: 'upper', x: 0.223, label: 'KA1'");
    expect(consts).toContain("kind: 'relay', level: 'upper', x: 0.323, label: 'KA2'");
    expect(src).toContain("part.label === 'KA1' ? km1On : km2On");
    expect(src).toContain('label="KA1"');
    const relay = src.split('export function RelayUnit(')[1].split('/** 端子排：')[0];
    expect(relay).toContain('on ? M.contactorOn : M.contactorIdle'); // 变色反馈保留
    expect(relay).toContain('text={label}');
  });

  it('第十七轮（第三十六轮跟进）：PLC 深灰黑机身保留，两台 KA 与它分排不挤', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const mats = read('src/scenes/shared/motorMaterials.ts');
    const consts = read('src/constants/motorConstants.ts');
    expect(mats).toContain('plcBody: mat(P.CAVITY_DARK');         // 深灰黑机身
    const plc = src.split('export function PlcUnit(')[1].split('export function RelayUnit(')[0];
    expect(plc).toContain('plc-led-');                            // 两个方块 LED
    expect(plc).toContain("material={led.on ? M.lamp.device : M.cavityDark}");
    expect(plc).not.toContain('plc-band-');                       // 旧蓝灰盒子两条横带已废弃
    expect(consts).toContain("x: 0.223, label: 'KA1'");
    expect(consts).toContain("x: 0.323, label: 'KA2'");
    expect(consts).not.toContain("x: 0.105, label: 'KA1'");        // 挤在一起的位置已弃用
  });

  it('第三十六轮：PLC 照 H5U 参考图简化——两个方块 LED / 两个网口 / 两条异色 IO 条', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const consts = read('src/constants/motorConstants.ts');
    const plc = src.split('export function PlcUnit(')[1].split('export function RelayUnit(')[0];
    // 左上角 POW / RUN 两个方块 LED，灯色二选一
    expect(plc).toContain("name: 'POW'");
    expect(plc).toContain("name: 'RUN'");
    expect(plc).toContain('boxGeometry args={[P.ledSize, P.ledSize, 0.003]}');
    expect(plc).toContain('P.h * 0.86');                          // 贴左上角
    // 中部两个方块网口：浅灰底板 + 前凸深色方孔
    expect(plc).toContain('[P.portW, P.portH, 0.003]');
    expect(plc).toContain('P.portW * 0.72, P.portH * 0.66');
    // 右侧两条异色细长条：绿 = X 输入、黄 = Y 输出
    expect(plc).toContain('M.contactorOn');
    expect(plc).toContain('M.dial');
    expect(plc).toContain('P.h * 0.66');
    // 删除项：I/O 状态点 / 栅栏端子 / 盖板 / 型号丝印块 / 散热格栅都不回来
    expect(plc).not.toContain('plc-io-');
    expect(plc).not.toContain('plc-term-');
    expect(plc).not.toContain('plc-vent-');
    expect(plc).not.toContain('RUN/STOP');
    expect(plc).not.toContain('Barrier');
    expect(plc).not.toContain('M.poleWhite');
    expect(consts).toContain('ledSize: 0.013');
    expect(consts).toContain('portW: 0.03, portH: 0.024, stripW: 0.009');
  });

  it('第三十七轮：PLC RUN 是自身运行开关——上电 + RUN 才亮灯，点击切换且 STOP 不执行程序', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const store = read('src/stores/useMotorStore.ts');
    const plc = src.split('export function PlcUnit(')[1].split('export function RelayUnit(')[0];
    // RUN 灯 = 上电 && RUN，不再跟随继电器动作；展台无 props 时内部订阅 store
    expect(plc).toContain("on: isPowered && isRun, name: 'RUN'");
    expect(plc).toContain('const liveRun = useMotorStore((s) => s.plcRun);');
    expect(plc).not.toContain('running={km1On || km2On}');
    // 点击机身热区切 RUN / STOP，观众端只读不响应
    expect(plc).toContain('togglePlcRun()');
    expect(plc).toContain('if (isViewerRuntime()) return;');
    // 热区必须带不可见材质，否则默认白材质会把整块机身盖住
    expect(plc).toContain('colorWrite={false}');
    // 程序门控：STOP 时本地模式线圈全放、演示状态机冻结
    expect(store).toContain('plcRun: boolean;');
    expect(store).toContain('togglePlcRun: () => set((s) => ({ plcRun: !s.plcRun }))');
    expect(store).toContain("s.controlSource === 'local' && !s.plcRun");
    expect(store).toContain('s.demoRunning && !s.demoPaused && s.plcRun');
    // 观众镜像键成对（只进快照，不进 PLC 地址表）
    expect(store).toContain('MOTOR_PLC_RUN: s.plcRun ? 1 : 0');
    expect(store).toContain("num('MOTOR_PLC_RUN')");
  });

  it('第十八轮：去掉 FR 下方下层内背板，露出柜体后板深灰', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    expect(src).toContain('const backMinY = G.DUCT.rows[2] + G.DUCT.height / 2');
    expect(src).toContain('const backH = backTopY - backMinY');
    expect(src).toContain('boxGeometry args={[C.width - C.wall * 2, backH, 0.006]}');
    expect(src).not.toContain('C.width - C.wall * 2, H - 0.02');   // 整块通高背板已删
  });

  it('第十九 / 二十轮：KA 按底板→导轨→器件层次做成单个样板', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const relay = src.split('export function RelayUnit(')[1].split('/** 端子排：')[0];
    expect(relay).toContain('on ? M.contactorOn : M.contactorIdle'); // 中间方块变色
    expect(relay).toContain('M.fuseGlass');                          // 透明壳罩最外
    expect(relay).toContain('R.baseT');                              // ① 扁方底座
    expect(relay).toContain('R.coverT');                             // ② 透明壳
    expect(relay).toContain('R.blockT');                             // ③ 壳内方块
    expect(relay).toContain('rotation={[0, 0, Math.PI / 2]}');      // 屏幕平面内转 90°
    expect(relay).not.toContain('Math.PI / 2, 0, 0');               // 不再绕 X 改朝向
    expect(relay).toContain('① 大黑块：靠 DIN');                   // 两级底座靠导轨那块
    expect(relay).toContain('② 小黑块：靠屏幕');                   // 两级底座靠屏幕那块
    expect(relay).toContain('material={M.darkMetal}');              // 小黑块实体
    expect(relay).not.toContain('DinClips');                         // 不再用竖立件的下方卡子
    expect(relay).not.toContain('relay-screw-');                     // 螺钉已删
    expect(relay).not.toContain('M.contactorLower');                 // 线圈骨架已删
    expect(relay).not.toContain('测试按钮');                          // 顶面凹点已删
    expect((relay.match(/<mesh/g) || []).length).toBe(4);
  });

  it('第二十轮：只重画 KA 单个样板，其余元件与装配表保持不变', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const consts = read('src/constants/motorConstants.ts');
    expect(consts).toContain('baseT: 0.012, coverT: 0.032, blockT: 0.012');
    expect(consts).toContain('按用户指认的安装结构');
    expect(src).toContain('<DinRail y={G.DIN.middleY} />');         // 柜内 DIN 导轨仍在
    expect(consts).toContain('DIN 导轨装在底板上');                  // 层次约定写进常量注释
    // 其余元件仍是原来的竖立组件，等用户确认样板后一个一个修
    for (const fn of ['Breaker', 'Contactor', 'ThermalRelay', 'PlcUnit', 'SwitchingPowerSupply']) {
      expect(src).toContain(`export function ${fn}(`);
    }
    expect(consts).toContain("kind: 'relay', level: 'upper', x: 0.223, label: 'KA1'");
    expect(consts).toContain("kind: 'relay', level: 'upper', x: 0.323, label: 'KA2'");
  });

  it('第二十一轮：展台朝向与柜内一致，并带一小段 DIN 导轨参照', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    expect(src).toContain('function RelayStageRail(');
    expect(src).toContain('<RelayStageRail />');
    expect(src).toContain("case 'relay': return (");
    expect(src).toContain('position={[0, D.height / 2, -D.depth / 2 - GAP * 3]}'); // 导轨底边落地、在器件底部背面
    const stage = src.split('function RelayStageRail(')[1].split('/** 部件展台：')[0];
    expect(stage).toContain('M.silver');                  // 与柜内 DinRail 同材质
    expect(stage).toContain('G.DIN');
    const relay = src.split('export function RelayUnit(')[1].split('/** 端子排：')[0];
    expect(relay).not.toContain('RelayStageRail');       // 柜内器件本身不带导轨，避免重复
    expect(src).toContain('<DinRail y={G.DIN.middleY} />');
  });

  it('第二十二轮：展台 DIN 导轨是方向标识，不是安装参照装饰', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    expect(src).toContain('加 DIN 的目的是为了更容易辨别方向');
    const stage = src.split('function RelayStageRail(')[1].split('/** 部件展台：')[0];
    expect(stage).toContain('stage-rail-lip-');           // 帽形槽上下翻边，有立体正反
    expect(stage).toContain('D.height / 2 + GAP');        // 上沿方向标记
    expect(stage).toContain('M.profileSlot');
    expect(stage).not.toContain('stage-rail-slot-');      // 旧的左右对称扁横条已弃
    expect(stage).not.toContain('D.height, D.depth]');    // 不再是实心扁条
  });

  it('第二十三轮：黑色底座两级方块，靠 DIN 大、靠屏幕小', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const relay = src.split('export function RelayUnit(')[1].split('/** 端子排：')[0];
    expect(relay).toContain('bigW = R.w * 1.5');
    expect(relay).toContain('bigH = R.w * 0.8');
    expect(relay).toContain('smallW = R.w * 1.1');
    expect(relay).toContain('smallH = R.w * 0.6');
    expect(relay).toContain('args={[bigW, bigH, R.baseT]}');
    expect(relay).toContain('args={[smallW, smallH, smallT]}');
    expect(relay).toContain('bigBack = -GAP * 2');          // 沿 z 顺序排列的起点
    expect(relay).toContain('bigFront = bigBack + R.baseT');
    expect(relay).toContain('smallBack = bigFront');        // 两级底座贴合，消除侧视缝隙
    expect(relay).toContain('blockBack = smallFront');
    expect(relay).toContain('shellBack = smallFront - GAP');
    expect((relay.match(/<mesh/g) || []).length).toBe(4);  // 结构没有变复杂
  });

  it('第二十四轮：DIN 不变、器件绕 Z 转 90° 成左右窄上下宽，朝屏幕面不变', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const relay = src.split('export function RelayUnit(')[1].split('/** 端子排：')[0];
    expect(relay).toContain('rotation={[0, 0, Math.PI / 2]}');
    expect(relay).not.toContain('rotation={[Math.PI / 2, 0, 0]}');
    expect(relay).toContain('bigW = R.w * 1.5');      // 局部左右宽
    expect(relay).toContain('bigH = R.w * 0.8');      // 局部上下窄 → 转后左右窄
    // 标签留在外层，不能跟着转成竖排
    const rotated = relay.split('rotation={[0, 0, Math.PI / 2]}')[1].split('</group>')[0];
    expect(rotated).not.toContain('MotorLabel');
    // DIN 导轨保持第二十二轮的帽形槽 + 上沿方向标记，且自身不旋转
    expect(src).toContain('function RelayStageRail(');
    expect(src).toContain('stage-rail-lip-');
    expect(src).toContain('D.height / 2 + GAP');
    const stage = src.split('function RelayStageRail(')[1].split('/** 部件展台：')[0];
    expect(stage).not.toContain('rotation=');
  });

  it('第二十五轮：灰色方块贴底座不悬空，透明壳罩住（对齐语义已由第二十九轮改写）', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const relay = src.split('export function RelayUnit(')[1].split('/** 端子排：')[0];
    expect(relay).toContain('position={[blockX, 0, blockBack + R.blockT / 2]}');
    expect(relay).toContain('position={[shellX, 0, shellBack + R.coverT / 2]}');
    expect(relay).not.toContain('coverZ + R.coverT * 0.6');    // 旧悬空位置已弃
    expect(relay).toContain('blockBack = smallFront');         // 方块贴底座，无缝隙
    expect((relay.match(/<mesh/g) || []).length).toBe(4);      // 结构没有变复杂
  });

  it('第二十七轮：不做同心重叠，沿 z 顺序排列 + 朝向正确（对齐语义见第二十九轮）', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const relay = src.split('export function RelayUnit(')[1].split('/** 端子排：')[0];
    // 顺序排列：贴合共享端面（第二十九轮消缝隙），不再留 GAP
    expect(relay).toContain('bigBack = -GAP * 2');
    expect(relay).toContain('bigFront = bigBack + R.baseT');
    expect(relay).toContain('smallBack = bigFront');
    expect(relay).toContain('blockBack = smallFront');
    expect(relay).toContain('shellBack = smallFront - GAP');
    expect(relay).not.toContain('const zC = shellT / 2');      // 第二十六轮同心重叠已弃
    expect(relay).not.toContain('blockFront = smallFront + GAP');
    expect(relay).not.toContain('smallBack = bigFront + GAP'); // 旧留缝写法已弃
    expect(relay).not.toContain('blockBack = smallFront + GAP');
    // 朝向：绕 Z 竖长不变，DIN 帽形槽仍不转
    expect(relay).toContain('rotation={[0, 0, Math.PI / 2]}');
    expect(src).toContain('stage-rail-lip-');
  });

  it('第二十九轮：几个方块底部都落在地面上——底边共面对齐、展台整组立地', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const consts = read('src/constants/motorConstants.ts');
    const relay = src.split('export function RelayUnit(')[1].split('/** 端子排：')[0];
    // 画面竖直方向（绕 Z 转后的局部 x）四层底边一律落在局部 0，从地面线向上立
    expect(relay).toContain('const bigX = bigW / 2');
    expect(relay).toContain('const smallX = smallW / 2');
    expect(relay).toContain('const blockX = blockW / 2');
    expect(relay).toContain('const shellX = shellW / 2');
    expect(relay).toContain('position={[bigX, 0, bigBack + R.baseT / 2]}');
    expect(relay).toContain('position={[smallX, 0, smallBack + smallT / 2]}');
    expect(relay).toContain('position={[blockX, 0, blockBack + R.blockT / 2]}');
    expect(relay).toContain('position={[shellX, 0, shellBack + R.coverT / 2]}');
    expect(relay).not.toContain('position={[0, 0, ');          // 中心同轴旧写法已弃
    // 展台 DIN 导轨底边同样落地；机位目标抬到立地后的本体高度
    expect(src).toContain('position={[0, D.height / 2, -D.depth / 2 - GAP * 3]}');
    expect(consts).toContain('relay: { position: [0.04, 0.05, 0.26], target: [0, 0.02, 0.02]');
  });
});

describe('第三十八轮：柜内 LED 统一绿灯 + PLC 默认 RUN', () => {
  it('开关电源 DC OK 与 PLC 的 POW / RUN 都用绿灯，操作台电源灯保持银白', () => {
    expect(MOTOR_LAMP_COLORS.device).toBe(MOTOR_VISUAL.LAMP_GREEN);
    expect(MOTOR_LAMP_COLORS.power).toBe(MOTOR_VISUAL.LAMP_POWER);          // 操作台电源灯不变
    expect(MOTOR_LAMP_COLORS.off).toBe(MOTOR_VISUAL.LAMP_DARK);
    const consts = read('src/constants/motorConstants.ts');
    expect(consts).toContain('LAMP_DEVICE: INDUSTRIAL_VISUAL.LAMP_GREEN');
  });

  it('两处 LED 共用同一个绿灯材质，灭态各自保底（不改共享材质）', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const mats = read('src/scenes/shared/motorMaterials.ts');
    expect(src).toContain('material={powered ? M.lamp.device : M.lamp.off}');       // 开关电源 DC OK
    expect(src).toContain('material={led.on ? M.lamp.device : M.cavityDark}');      // PLC POW / RUN
    expect(mats).toContain('device: glow(MOTOR_LAMP_COLORS.device, LAMP_LED_GLOW)'); // 光晕仍由 glow() 统一给
    expect(mats).not.toContain('device: mat(MOTOR_LAMP_COLORS.device');               // 不许绕开 glow 单独上色
    // 柜内小方块 LED 自发光低一档，避免色调映射把绿推成近白；操作台大灯罩保持默认
    expect(mats).toContain('export const LAMP_LED_GLOW = 0.42;');
    expect(mats).toContain('function glow(color: string, emissiveIntensity = 0.95)');
  });

  it('PLC 默认 RUN：合闸上电后 POW 与 RUN 两个 LED 同时亮', () => {
    const st = useMotorStore.getState();   // beforeEach 已 resetAll + setQf(true)
    expect(st.qfClosed).toBe(true);
    expect(st.plcRun).toBe(true);          // 默认 RUN，不是等继电器动作
    const src = read('src/scenes/components/MotorParts.tsx');
    expect(src).toContain("{ x: -P.w * 0.33, on: isPowered, name: 'POW' }");
    expect(src).toContain("on: isPowered && isRun, name: 'RUN'");   // 上电 + RUN 两点与
    // 切 STOP 只熄 RUN，POW 仍亮
    useMotorStore.getState().togglePlcRun();
    expect(useMotorStore.getState().plcRun).toBe(false);
    expect(useMotorStore.getState().qfClosed).toBe(true);
  });

  it('第四十三轮：六个端子孔真凹进本体，螺钉与圆孔全沉在孔底', () => {
    const src = read('src/scenes/components/MotorParts.tsx');
    const consts = read('src/constants/motorConstants.ts');
    expect(consts).toContain('recessDepth: 0.012');
    expect(consts).toContain('export const KM_SCREW_RECESS');
    expect(src).toContain('function CrossScrew({ position, r = 0.011, mat = M.terminalSilver, recessed = false }');
    expect(src).toContain('if (recessed) {');
    // 本体拆成后段实心 + 前脸框架，前脸只在六个端子位置留孔
    expect(src).toContain('<boxGeometry args={[K.w, K.h, K.d - K.recessDepth]} />');
    // 第四十四轮：上/下靠边横带已删，只剩中间横带 + 灭弧格栅竖条，槽口延伸到壳体边缘
    expect(src).toContain('const slotCenterY = (f: number) =>');
    expect(src).toContain('K.h * (f + (f > 0.5 ? K.frameEdgeH / 2 : -K.frameEdgeH / 2))');
    expect(src).toContain('K.h * (1 - 2 * K.bandH - 2 * K.frameEdgeH)');
    expect(src).toContain('face-strip-${bi}-${si}');
    expect(src).toContain('well-${bi}-${hi}');
    expect(src).not.toContain('term-band-');                   // 前凸的白色端子块彻底删除
    // 端子行以孔底为 face，螺钉与圆孔都传 recessed
    expect(src).toContain('face={wellFloor}');
    expect(src).toContain('cross={row.cross} recessed />');
    expect(src).toContain('face + (recessed ? 0 : GAP * 4)');   // FR 凸头仍前移，KM 沉孔从孔底起
    // 十字槽由四块扇形片之间的真缝形成，白框与孔底都不再叠在螺钉里
    expect(src).toContain('cylinderGeometry args={[half, half, headThickness, 10, 1, false,');
    expect(src).toContain('Math.PI / 2 - KM_SCREW_RECESS.slotAngle');
    expect(src).not.toContain('KM_SCREW_RECESS.floorFront');
    expect(src).not.toContain('KM_SCREW_RECESS.rimRatio');
    expect(src).toContain('{KM_TERMINAL_ROWS.map((row) => (');  // 上下排同表派生
    expect(src).not.toContain('y={K.h * 0.91}');
    expect(src).not.toContain('y={K.h * 0.09}');
    expect(src).toContain('<CrossScrew position={[0, 0, GAP]} r={F.auxScrewR} mat={M.terminalSilver} recessed />');
    expect(src).toContain('r={screwR} mat={M.terminalSilver} recessed'); // 主螺钉同款
  });
});
