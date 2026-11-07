import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  AXIS_R, FRAME, FRAME_LEN, FRAME_CX, FRAME_DETAIL, DRIVE_STATIONS,
  SHAFT_END_ENCODER, ENCODER_STATIONS,
  SCREW_DETAIL, SENSOR, VISUAL, SURFACE_GAP, FOOT_RISE,
} from '../constants';
import { materials } from '../../../components/scene/shared/materials';
import { useDispensingStore } from '../../../stores/useDispensingStore';

const D = FRAME_DETAIL;
const K = SCREW_DETAIL;
const ST = DRIVE_STATIONS;

/** 原点/终点接近开关 LED 材质：触发时亮（原点绿 / 终点黄），未触发为灭态 */
const SENSOR_LED = {
  origin: new THREE.MeshStandardMaterial({
    color: VISUAL.LAMP_GREEN, emissive: VISUAL.LAMP_GREEN, emissiveIntensity: 1.8, roughness: 0.35,
  }),
  end: new THREE.MeshStandardMaterial({
    color: VISUAL.LAMP_YELLOW, emissive: VISUAL.LAMP_YELLOW, emissiveIntensity: 1.8, roughness: 0.35,
  }),
  off: new THREE.MeshStandardMaterial({
    color: VISUAL.LAMP_DARK, emissive: 0x000000, roughness: 0.6, metalness: 0.4,
  }),
};

/**
 * 单个接近开关：局部坐标全部取自 SENSOR，用 L 形吊架固定到 +Z 侧导轨下沿，
 * 装在滑块 +Z 外侧，探头朝上对着滑块底面；滑块到位时对应 LED 亮起。
 */
function LimitSensor({ kind, at, on }: { kind: 'origin' | 'end'; at: number; on: boolean }) {
  const {
    Y, Z, BODY_W, BODY_H, BODY_D, LED_R,
    BRACKET_TOP_Y, BRACKET_RAIL_Z, BRACKET_W, BRACKET_T,
  } = SENSOR;

  // 组原点在开关本体中心；以下都是相对本体中心的局部量
  const armY = BRACKET_TOP_Y - Y;          // 导轨下沿相对本体的高度（>0）
  const armZ0 = BRACKET_RAIL_Z - Z;        // 导轨轴心相对本体的 Z（<0）
  const armLen = -armZ0 + BRACKET_T;       // 水平托臂长度：从导轨伸到开关正上方
  const strapH = armY - BODY_H / 2;        // 竖直吊板高度：从本体顶面接到托臂

  return (
    <group position={[at, Y, Z]}>
      {/* L 形安装支架：水平托臂夹在导轨下沿 + 竖直吊板连接开关背面 */}
      <mesh position={[0, armY, armZ0 / 2]} material={materials.darkMetal}>
        <boxGeometry args={[BRACKET_W, BRACKET_T, armLen]} />
      </mesh>
      <mesh
        position={[0, (armY + BODY_H / 2) / 2, -BODY_D / 2 - BRACKET_T / 2]}
        material={materials.darkMetal}
      >
        <boxGeometry args={[BRACKET_W, strapH, BRACKET_T]} />
      </mesh>
      {/* 开关本体 */}
      <mesh castShadow material={materials.sleeve}>
        <boxGeometry args={[BODY_W, BODY_H, BODY_D]} />
      </mesh>
      {/* 感应面：底边嵌进本体内部（朝内的面不可见），只露出一条台阶，不与本体顶面共面 */}
      <mesh position={[0, BODY_H / 2 + 0.0015 - SURFACE_GAP / 2, 0]} material={materials.decal}>
        <boxGeometry args={[BODY_W * 0.8, 0.003, BODY_D * 0.8]} />
      </mesh>
      {/* 状态 LED */}
      <mesh position={[0, 0, BODY_D / 2 + 0.002]} material={on ? SENSOR_LED[kind] : SENSOR_LED.off}>
        <sphereGeometry args={[LED_R, 12, 12]} />
      </mesh>
    </group>
  );
}

/** 滚珠丝杆（螺旋管 + 主轴）：沿局部 X 从 from 到 to，轴高 y */
function BallScrew({ from, to, lead, y }: { from: number; to: number; lead: number; y: number }) {
  const { curve, steps } = useMemo(() => {
    const len = to - from;
    const turns = len / lead;
    const s = Math.max(64, Math.round(turns * K.SEGMENTS_PER_TURN));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= s; i += 1) {
      const t = i / s;
      const a = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(from + t * len, Math.sin(a) * K.THREAD_R, Math.cos(a) * K.THREAD_R));
    }
    return { curve: new THREE.CatmullRomCurve3(pts), steps: s };
  }, [from, to, lead]);

  return (
    <group>
      {/* 螺旋牙（curve 已沿 X 生成，无需旋转；内缘嵌入轴面、牙顶略小于螺母内孔） */}
      <mesh position={[0, y, 0]} material={materials.endCap}>
        <tubeGeometry args={[curve, steps, K.THREAD_TUBE_R, K.THREAD_RADIAL_SEGMENTS, false]} />
      </mesh>
      {/* 主轴（与螺旋牙同区间：from ~ to） */}
      <mesh position={[(from + to) / 2, y, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.axle}>
        <cylinderGeometry args={[AXIS_R, AXIS_R, to - from, 16]} />
      </mesh>
    </group>
  );
}

/** 铝挤型底座：主体 + 侧面/顶面 T 槽 + 两端端盖 + 安装螺栓 */
function ProfileBase() {
  const len = FRAME_LEN + FRAME.BASE_PAD;
  const left = -FRAME.BASE_PAD / 2;
  const right = FRAME_LEN + FRAME.BASE_PAD / 2;
  const boltCount = Math.floor(len / D.BOLT_PITCH);

  return (
    <group>
      <mesh position={[FRAME_CX, FRAME.BASE_H / 2, 0]} castShadow receiveShadow material={materials.base}>
        <boxGeometry args={[len, FRAME.BASE_H, FRAME.BASE_D]} />
      </mesh>
      {/* 两侧 T 槽（沿 X 通长）：贴面一律错开 SURFACE_GAP，不再用亚毫米级贴死 */}
      {[-1, 1].map((side) => (
        <group key={`slot-${side}`}>
          <mesh position={[FRAME_CX, FRAME.BASE_H - D.PROFILE_SLOT_INSET, side * (FRAME.BASE_D / 2 + SURFACE_GAP)]} material={materials.profileSlot}>
            <boxGeometry args={[len - 0.02, D.PROFILE_SLOT_H, 0.001]} />
          </mesh>
          {/* 顶面两条型材槽 */}
          <mesh position={[FRAME_CX, FRAME.BASE_H + SURFACE_GAP, side * (FRAME.BASE_D / 2 - 0.04)]} material={materials.profileSlot}>
            <boxGeometry args={[len - 0.02, 0.001, D.PROFILE_SLOT_W]} />
          </mesh>
        </group>
      ))}
      {/* 两端铝型材端盖 */}
      {[left, right].map((px) => (
        <mesh key={`cap-${px}`} position={[px, FRAME.BASE_H / 2, 0]} material={materials.darkMetal}>
          <boxGeometry args={[D.END_CAP_T, FRAME.BASE_H + 0.004, FRAME.BASE_D + 0.004]} />
        </mesh>
      ))}
      {/* 顶面安装螺栓（两排，沿 X 等距） */}
      {Array.from({ length: boltCount + 1 }, (_, i) => {
        const px = left + 0.04 + i * D.BOLT_PITCH;
        if (px > right - 0.02) return null;
        return (
          <group key={`bolt-${i}`}>
            {[-1, 1].map((side) => (
              <mesh
                key={side}
                position={[px, FRAME.BASE_H + D.BOLT_H / 2 + SURFACE_GAP, side * (FRAME.BASE_D / 2 - 0.012)]}
                material={materials.darkMetal}
              >
                <cylinderGeometry args={[D.BOLT_R, D.BOLT_R, D.BOLT_H, 8]} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

/**
 * 方形直线导轨（HIWIN/THK 式），替代原来的圆棒。
 * 半高严格取 TRACK_R，因此下沿仍是 FRAME.TRACK_H - TRACK_R，
 * 与 SENSOR.BRACKET_TOP_Y 的传感器吊架夹持面完全闭合。
 */
function LinearRail({ side }: { side: number }) {
  const boltCount = Math.floor(FRAME_LEN / D.RAIL_BOLT_PITCH);
  return (
    <group position={[FRAME_CX, FRAME.TRACK_H, side * FRAME.TRACK_Z]}>
      <mesh castShadow material={materials.brightSilver}>
        <boxGeometry args={[FRAME_LEN, 2 * D.RAIL_HALF, 2 * D.RAIL_HALF * 0.85]} />
      </mesh>
      {/* 顶面两条滚珠沟槽（深槽 + 亮银耐磨条）：两层各有独立错开量，不再互相穿插 */}
      {[-1, 1].map((s) => (
        <group key={`groove-${s}`}>
          <mesh position={[0, D.RAIL_HALF + SURFACE_GAP, s * D.RAIL_HALF * 0.45]} material={materials.profileSlot}>
            <boxGeometry args={[FRAME_LEN, 0.001, D.RAIL_GROOVE_W]} />
          </mesh>
          <mesh position={[0, D.RAIL_HALF + 2 * SURFACE_GAP, s * D.RAIL_HALF * 0.45]} material={materials.decal}>
            <boxGeometry args={[FRAME_LEN, 0.001, D.RAIL_GROOVE_W * 0.4]} />
          </mesh>
        </group>
      ))}
      {/* 沉头安装螺栓 */}
      {Array.from({ length: boltCount + 1 }, (_, i) => (
        <mesh
          key={`railbolt-${i}`}
          position={[-FRAME_LEN / 2 + i * D.RAIL_BOLT_PITCH, D.RAIL_HALF + SURFACE_GAP, 0]}
          material={materials.darkMetal}
        >
          <cylinderGeometry args={[D.RAIL_BOLT_R, D.RAIL_BOLT_R, 0.002, 8]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 支撑端（浮动端）轴承座：只承受径向力，真实模组这一端就是一个小圆筒 +
 * 端盖，比固定端简单得多，保留为圆柱体是刻意的区分。
 */
function FloatingBearing({ x }: { x: number }) {
  const L = D.SUPPORT_UNIT_LEN;
  return (
    <group position={[x, FRAME.SCREW_H, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]} material={materials.sleeve}>
        <cylinderGeometry args={[FRAME.BEARING_R, FRAME.BEARING_R, L, 16]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`flange-${s}`} position={[s * (L / 2 + 0.001), 0, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.endCap}>
          <cylinderGeometry args={[FRAME.BEARING_R * 0.9, FRAME.BEARING_R * 0.9, 0.006, 16]} />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <mesh
            key={`bb-${i}`}
            position={[L / 2 + 0.004, Math.cos(a) * D.BEARING_BOLT_OFFSET, Math.sin(a) * D.BEARING_BOLT_OFFSET]}
            rotation={[0, 0, Math.PI / 2]}
            material={materials.darkMetal}
          >
            <cylinderGeometry args={[D.BEARING_BOLT_R, D.BEARING_BOLT_R, 0.004, 8]} />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * 固定端方形支撑单元（BK / FK 型）。
 *
 * 真实滚珠丝杆模组的固定端不是一根孤立圆筒：一对角接触轴承被压盖锁进
 * 方形铸铁座体，丝杆由六角锁紧螺母轴向定位，座体再经底部法兰锁到型材。
 * 这里按这个顺序建模，方形座体 + 压盖螺栓 + 轴承外圈亮环 + 底座法兰。
 * 亮环整圈都放在座体 -X 面之外，内孔半径大于丝杆与联轴器铝毂，
 * 因此不会出现「环套进实体里」的体积穿插。
 */
function FixedSupportUnit({ x }: { x: number }) {
  const L = D.SUPPORT_UNIT_LEN;
  const W = D.SUPPORT_UNIT_W;
  const ringX = -L / 2 - D.SUPPORT_BORE_R * 0.22 - SURFACE_GAP;
  const boltX = -L / 2 - SURFACE_GAP;
  return (
    <group position={[x, FRAME.SCREW_H, 0]}>
      {/* 方形座体：内部装角接触轴承，外表面是平整铸件而非圆筒 */}
      <mesh castShadow material={materials.sleeve}>
        <boxGeometry args={[L, W, W]} />
      </mesh>
      {/* 底座安装法兰：把座体锁到下方型材支撑柱 */}
      <mesh
        position={[0, -W / 2 - D.SUPPORT_FOOT_T / 2 + SURFACE_GAP, 0]}
        material={materials.darkMetal}
      >
        <boxGeometry args={[L + 2 * SURFACE_GAP, D.SUPPORT_FOOT_T, D.SUPPORT_FOOT_W]} />
      </mesh>
      {/* 压盖中心轴承外圈：torus 法线转到 ±X，整圈在座体之外 */}
      <mesh position={[ringX, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={materials.brightSilver}>
        <torusGeometry args={[D.SUPPORT_RING_R, D.SUPPORT_BORE_R * 0.22, 8, 32]} />
      </mesh>
      {/* 压盖四角螺栓 */}
      {Array.from({ length: D.SUPPORT_BOLT_N }, (_, i) => {
        const a = (i / D.SUPPORT_BOLT_N) * Math.PI * 2 + Math.PI / 4;
        return (
          <mesh
            key={`su-bolt-${i}`}
            position={[boltX, Math.cos(a) * D.SUPPORT_BOLT_PITCH, Math.sin(a) * D.SUPPORT_BOLT_PITCH]}
            rotation={[0, 0, Math.PI / 2]}
            material={materials.darkMetal}
          >
            <cylinderGeometry args={[D.BEARING_BOLT_R, D.BEARING_BOLT_R, 0.004, 8]} />
          </mesh>
        );
      })}
      {/* 顶面两颗注油 / 紧固螺钉 */}
      {[-1, 1].map((s) => (
        <mesh key={`su-top-${s}`} position={[s * L * 0.28, W / 2 + SURFACE_GAP, 0]} material={materials.brass}>
          <cylinderGeometry args={[D.BEARING_BOLT_R, D.BEARING_BOLT_R, 0.003, 8]} />
        </mesh>
      ))}
    </group>
  );
}

function BearingHousing({ x, fixed }: { x: number; fixed: boolean }) {
  return fixed ? <FixedSupportUnit x={x} /> : <FloatingBearing x={x} />;
}

/**
 * 电机安装支架 / 联轴器保护罩。
 *
 * 真实模组里联轴器绝不裸露悬空：电机法兰锁在一只方形电机座上，座体把
 * 联轴器整个围住（通常带可拆检视窗）。这里用上下板 + 四角立柱做成开放
 * 框架，既表现出「被保护罩包住」，又能从 drive 近景机位看见里面的三段式
 * 联轴器。所有轴向站位读 DRIVE_STATIONS，组件不写死坐标。
 */
function CouplingGuard() {
  const len = ST.GUARD_MAX - ST.GUARD_MIN;
  const cx = (ST.GUARD_MIN + ST.GUARD_MAX) / 2;
  const postH = 2 * D.GUARD_HALF_H - 2 * D.GUARD_T;
  const plateY = D.GUARD_HALF_H - D.GUARD_T / 2;
  const postZ = D.GUARD_HALF_W - D.GUARD_T / 2;
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={`guard-plate-${s}`} position={[cx, s * plateY, 0]} castShadow material={materials.base}>
          <boxGeometry args={[len, D.GUARD_T, 2 * D.GUARD_HALF_W]} />
        </mesh>
      ))}
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <mesh
          key={`guard-post-${sx}-${sz}`}
          position={[
            sx > 0 ? ST.GUARD_MAX - D.GUARD_POST_W / 2 : ST.GUARD_MIN + D.GUARD_POST_W / 2,
            0,
            sz * postZ,
          ]}
          material={materials.base}
        >
          <boxGeometry args={[D.GUARD_POST_W, postH, D.GUARD_T]} />
        </mesh>
      )))}
    </group>
  );
}

/**
 * 三段式梅花联轴器：电机侧铝毂 → 六瓣聚氨酯弹性体 → 丝杆侧铝毂。
 * 旧版是「一根光轴 + 中间一圈黑箍」，既不像联轴器也没有弹性体。
 * 每个铝毂上还有一颗径向顶丝，这正是实物上锁紧轴的样子。
 */
function JawCoupling() {
  return (
    <group>
      {[ST.HUB_L, ST.HUB_R].map((cx, i) => (
        <mesh key={`hub-${i}`} position={[cx, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={materials.brightSilver}>
          <cylinderGeometry args={[D.COUPLING_R, D.COUPLING_R, D.COUPLING_HUB_LEN, 20]} />
        </mesh>
      ))}
      {/* 6 边柱体正好是梅花爪的外轮廓；非金属材质与两端铝毂明显分开 */}
      <mesh position={[ST.SPIDER, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.couplingSpider}>
        <cylinderGeometry args={[D.COUPLING_JAW_R, D.COUPLING_JAW_R, D.COUPLING_SPIDER_LEN, D.COUPLING_JAW_N]} />
      </mesh>
      {[ST.HUB_L, ST.HUB_R].map((cx, i) => (
        <mesh key={`set-${i}`} position={[cx, D.COUPLING_R + D.COUPLING_SET_R / 2, 0]} material={materials.darkMetal}>
          <cylinderGeometry args={[D.COUPLING_SET_R, D.COUPLING_SET_R, D.COUPLING_SET_R * 2, 8]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * -X 驱动端安装链（机架局部坐标，轴线 y=FRAME.SCREW_H、z=0）。
 *
 * 沿 +X 依次为：尾部风扇罩 → 普通正反转电机圆柱机身（同色散热筋 +
 * 顶部接线盒 + 底脚）→ 前端法兰 → 电机安装支架（联轴器罩）
 * → 三段式梅花联轴器 → 固定端方形支撑单元 → 丝杆轴端。
 *
 * 这里没有编码器：原始设计的增量式编码器是独立外置件，装在 +X 丝杆末端
 * （见 ShaftEndEncoder）。电机也没有伺服后罩 / 定位止口 / 速度给定，
 * PLC 只有 MOTOR_FWD / MOTOR_REV 两个布尔输出点。
 */
function DriveEnd() {
  const bodyCx = (ST.BODY_MIN + ST.BODY_MAX) / 2;
  const fanCx = (ST.FAN_MIN + ST.FAN_MAX) / 2;
  const bodyR = D.MOTOR_BODY_W / 2;
  const boxY = bodyR + D.TERMINAL_BOX_H / 2 - SURFACE_GAP;
  return (
    <group position={[0, FRAME.SCREW_H, 0]}>
      {/* —— 1. 尾部风扇罩：普通异步电机特征，端面带环向通风孔 —— */}
      <mesh position={[fanCx, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={materials.motorFan}>
        <cylinderGeometry args={[D.MOTOR_FAN_R, D.MOTOR_FAN_R, D.MOTOR_FAN_LEN, 24]} />
      </mesh>
      {Array.from({ length: D.FAN_VENT_N }, (_, i) => {
        const a = (i / D.FAN_VENT_N) * Math.PI * 2;
        return (
          <mesh
            key={`fan-vent-${i}`}
            position={[ST.FAN_MIN - 0.001, Math.cos(a) * D.MOTOR_FAN_R * 0.62, Math.sin(a) * D.MOTOR_FAN_R * 0.62]}
            rotation={[0, 0, Math.PI / 2]}
            material={materials.darkMetal}
          >
            <cylinderGeometry args={[D.FAN_VENT_R, D.FAN_VENT_R, 0.002, 8]} />
          </mesh>
        );
      })}

      {/* —— 2. 圆柱机身 + 环向散热筋 + 顶部接线盒 + 底脚 —— */}
      <mesh position={[bodyCx, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={materials.motorBody}>
        <cylinderGeometry args={[bodyR, bodyR, D.MOTOR_BODY_LEN, 24]} />
      </mesh>
      {Array.from({ length: D.MOTOR_RIB_N }, (_, i) => (
        <mesh
          key={`rib-${i}`}
          position={[ST.BODY_MIN + D.MOTOR_RIB_PITCH * (i + 0.5), 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
          material={materials.motorRib}
        >
          <cylinderGeometry args={[
            bodyR + D.MOTOR_RIB_OUT,
            bodyR + D.MOTOR_RIB_OUT,
            D.MOTOR_RIB_T,
            24,
          ]} />
        </mesh>
      ))}
      <mesh position={[bodyCx, boxY, 0]} castShadow material={materials.terminalBox}>
        <boxGeometry args={[D.TERMINAL_BOX_W, D.TERMINAL_BOX_H, D.TERMINAL_BOX_D]} />
      </mesh>
      <mesh
        position={[bodyCx, boxY + D.TERMINAL_BOX_H / 2 + D.TERMINAL_BOX_LID_T / 2 - SURFACE_GAP, 0]}
        material={materials.motorRib}
      >
        <boxGeometry args={[D.TERMINAL_BOX_W + 0.004, D.TERMINAL_BOX_LID_T, D.TERMINAL_BOX_D + 0.004]} />
      </mesh>
      <mesh
        position={[bodyCx, boxY, D.TERMINAL_BOX_D / 2 + D.CABLE_GLAND_LEN / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        material={materials.darkMetal}
      >
        <cylinderGeometry args={[D.CABLE_GLAND_R, D.CABLE_GLAND_R, D.CABLE_GLAND_LEN, 10]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={`motor-foot-${s}`}
          position={[bodyCx, -bodyR - D.MOTOR_FOOT_H / 2 + SURFACE_GAP, s * D.MOTOR_FOOT_Z]}
          material={materials.motorBody}
        >
          <boxGeometry args={[D.MOTOR_FOOT_W * 2, D.MOTOR_FOOT_H, D.MOTOR_FOOT_W]} />
        </mesh>
      ))}

      {/* —— 3. 前端安装法兰 + 四角螺栓（无伺服定位止口） —— */}
      <mesh position={[D.MOTOR_FLANGE_X, 0, 0]} castShadow material={materials.motorBody}>
        <boxGeometry args={[D.MOTOR_FLANGE_T, D.MOTOR_FLANGE_W, D.MOTOR_FLANGE_W]} />
      </mesh>
      {[-1, 1].flatMap((sy) => [-1, 1].map((sz) => (
        <mesh
          key={`mf-${sy}-${sz}`}
          position={[ST.FLANGE_MAX + SURFACE_GAP, sy * D.MOTOR_FLANGE_W * 0.36, sz * D.MOTOR_FLANGE_W * 0.36]}
          rotation={[0, 0, Math.PI / 2]}
          material={materials.endCap}
        >
          <cylinderGeometry args={[D.BEARING_BOLT_R, D.BEARING_BOLT_R, 0.004, 8]} />
        </mesh>
      )))}

      {/* —— 4. 电机安装支架 / 联轴器罩 —— */}
      <CouplingGuard />

      {/* —— 5. 三段式梅花联轴器 —— */}
      <JawCoupling />

      {/* —— 6. 联轴器到支撑单元之间的丝杆轴头 —— */}
      <mesh
        position={[(ST.COUPLING_MAX + ST.SUPPORT_MIN) / 2, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
        material={materials.axle}
      >
        <cylinderGeometry args={[D.MOTOR_SHAFT_R, D.MOTOR_SHAFT_R, ST.SUPPORT_MIN - ST.COUPLING_MAX, 12]} />
      </mesh>
    </group>
  );
}

/**
 * 随丝杆自转的部分：+X 轴伸 + 编码器侧弹性联轴器。
 * 放在 MachineFrame 的 screwRef 旋转组里，因此与丝杆严格同步；
 * 编码器本体是静止件，见 ShaftEndEncoder。
 */
function EncoderRotatingParts() {
  const E = SHAFT_END_ENCODER;
  const S = ENCODER_STATIONS;
  const couplingCx = (S.COUPLING_MIN + S.COUPLING_MAX) / 2;
  const third = E.COUPLING_LEN / 3;
  return (
    <group>
      <mesh
        position={[(S.SHAFT_MIN + S.SHAFT_MAX) / 2, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
        material={materials.axle}
      >
        <cylinderGeometry args={[E.SHAFT_STUB_R, E.SHAFT_STUB_R, E.SHAFT_STUB_LEN, 12]} />
      </mesh>
      {[-1, 0, 1].map((k) => (
        <mesh
          key={`enc-cpl-${k}`}
          position={[couplingCx + k * third, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
          material={k === 0 ? materials.couplingSpider : materials.brightSilver}
        >
          <cylinderGeometry args={[
            k === 0 ? E.SPIDER_R : E.COUPLING_R,
            k === 0 ? E.SPIDER_R : E.COUPLING_R,
            third - SURFACE_GAP / 2,
            k === 0 ? 6 : 16,
          ]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * +X 轴末端独立增量式编码器（需求原文：「安装于轴末端，连续检测料斗位置」）。
 *
 * 编码器本体由前端夹紧法兰锁在 L 型支架上，支架贴浮动轴承座端面，
 * 本体不随丝杆转；A/B 相出线 → PLC X0/X1 高速计数器 C0 → DINT 位置寄存器。
 * 与 -X 电机侧完全独立，不是伺服电机尾部集成件。
 */
function ShaftEndEncoder() {
  const E = SHAFT_END_ENCODER;
  const S = ENCODER_STATIONS;
  const bodyCx = (S.BODY_MIN + S.BODY_MAX) / 2;
  return (
    <group position={[0, FRAME.SCREW_H, 0]}>
      {/* L 型安装支架：立柱贴浮动轴承座端面下沿（不悬空），托板水平伸出托住法兰底面 */}
      <mesh
        position={[E.BEARING_FACE_X + E.BRACKET_T / 2, -E.BRACKET_DROP / 2, 0]}
        material={materials.base}
      >
        <boxGeometry args={[E.BRACKET_T, E.BRACKET_DROP, E.BRACKET_W]} />
      </mesh>
      <mesh
        position={[(E.BEARING_FACE_X + S.FLANGE_MAX) / 2, -E.FLANGE_R - E.BRACKET_T / 2, 0]}
        material={materials.base}
      >
        <boxGeometry args={[S.FLANGE_MAX - E.BEARING_FACE_X, E.BRACKET_T, E.BRACKET_W]} />
      </mesh>

      {/* 前端夹紧法兰 + 环向螺钉 */}
      <mesh
        position={[(S.FLANGE_MIN + S.FLANGE_MAX) / 2, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
        material={materials.brightSilver}
      >
        <cylinderGeometry args={[E.FLANGE_R, E.FLANGE_R, E.FLANGE_T, 24]} />
      </mesh>
      {Array.from({ length: E.FLANGE_BOLT_N }, (_, i) => {
        const a = (i / E.FLANGE_BOLT_N) * Math.PI * 2;
        return (
          <mesh
            key={`enc-flange-bolt-${i}`}
            position={[S.FLANGE_MIN - 0.001, Math.cos(a) * E.FLANGE_R * 0.82, Math.sin(a) * E.FLANGE_R * 0.82]}
            rotation={[0, 0, Math.PI / 2]}
            material={materials.darkMetal}
          >
            <cylinderGeometry args={[E.FLANGE_BOLT_R, E.FLANGE_BOLT_R, 0.003, 8]} />
          </mesh>
        );
      })}

      {/* 编码器本体（静止）：金属圆筒 + 尾部端盖 + 朝 +Z 的铭牌 */}
      <mesh position={[bodyCx, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={materials.encoderBody}>
        <cylinderGeometry args={[E.BODY_R, E.BODY_R, E.BODY_LEN, 24]} />
      </mesh>
      <mesh position={[S.BODY_MAX - 0.002, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.endCap}>
        <cylinderGeometry args={[E.BODY_R * 0.94, E.BODY_R * 0.94, 0.004, 24]} />
      </mesh>
      <mesh position={[bodyCx, 0, E.BODY_R + SURFACE_GAP]} material={materials.decal}>
        <boxGeometry args={[E.BODY_LEN * 0.6, E.BODY_R * 0.7, 0.001]} />
      </mesh>

      {/* 尾部出线插头 + 电缆（A/B 相 → X0/X1 → C0） */}
      <mesh
        position={[S.BODY_MAX + E.CONN_LEN / 2, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
        material={materials.magSwitch}
      >
        <cylinderGeometry args={[E.CONN_R, E.CONN_R, E.CONN_LEN, 12]} />
      </mesh>
      <mesh
        position={[S.CONN_MAX + E.CABLE_LEN / 2, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
        material={materials.darkMetal}
      >
        <cylinderGeometry args={[E.CABLE_R, E.CABLE_R, E.CABLE_LEN, 10]} />
      </mesh>
    </group>
  );
}

/** 侧面拖链铝槽（U 型槽 + 两端固定座；动态链带后续再接） */
function CableChannel() {
  return (
    <group position={[FRAME_CX, D.CARRIER_Y, D.CARRIER_Z]}>
      <mesh material={materials.base}>
        <boxGeometry args={[D.CARRIER_CHANNEL_LEN, 0.004, D.CARRIER_CHANNEL_W]} />
      </mesh>
      {/* 侧壁 / 端盖底边嵌进底板内部，避免与底板顶面共面 */}
      {[-1, 1].map((s) => (
        <mesh
          key={`wall-${s}`}
          position={[0, D.CARRIER_CHANNEL_H / 2 - SURFACE_GAP, s * (D.CARRIER_CHANNEL_W / 2 - 0.002)]}
          material={materials.base}
        >
          <boxGeometry args={[D.CARRIER_CHANNEL_LEN, D.CARRIER_CHANNEL_H, 0.003]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh
          key={`end-${s}`}
          position={[s * D.CARRIER_CHANNEL_LEN / 2, D.CARRIER_CHANNEL_H / 2 - SURFACE_GAP, 0]}
          material={materials.darkMetal}
        >
          <boxGeometry args={[D.CARRIER_END_T, D.CARRIER_CHANNEL_H + 0.006, D.CARRIER_CHANNEL_W + 0.004]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 部件：滚珠丝杆台机架。
 *
 * 局部原点 = 左端轴承位在地面（ASSEMBLY.frame.position 给出世界位姿）。
 * 局部 +X 沿丝杆，y=0 为地面，z=0 为丝杆轴线。组件内不含任何世界坐标。
 * 装配坐标一律沿用 FRAME / SENSOR，新增的都是表面细节，不改变任何接口面。
 */
export function MachineFrame() {
  const from = FRAME.AXLE_FROM;
  const to = FRAME.AXLE_TO;
  const limitStart = useDispensingStore((s) => s.sensors.limitStart);
  const limitEnd = useDispensingStore((s) => s.sensors.limitEnd);

  // 丝杆旋转：与滑块位移 1:1 绑定（每走一个导程 LEAD 转 360°）
  const screwRef = useRef<THREE.Group>(null);
  const prevSliderX = useRef(useDispensingStore.getState().sliderX);
  useFrame(() => {
    const x = useDispensingStore.getState().sliderX;
    const dx = x - prevSliderX.current;
    prevSliderX.current = x;
    if (dx !== 0 && screwRef.current) {
      screwRef.current.rotation.x -= (dx / K.LEAD) * Math.PI * 2;
    }
  });

  return (
    <group>
      <ProfileBase />

      {/* 旋转组：组原点放在丝杆轴线上，绕 X 旋转 = 丝杆原地自转。
          固定端锁紧螺母、+X 轴伸与编码器侧弹性联轴器都随丝杆一起转。
          轴末端编码器本体不转，由 L 型支架固定，放在本组之外。 */}
      <group ref={screwRef} position={[0, FRAME.SCREW_H, 0]}>
        <BallScrew from={from} to={to} lead={K.LEAD} y={0} />
        <mesh
          position={[ST.SUPPORT_MAX + D.LOCK_NUT_LEN / 2, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
          material={materials.brightSilver}
        >
          <cylinderGeometry args={[D.LOCK_NUT_R, D.LOCK_NUT_R, D.LOCK_NUT_LEN, 6]} />
        </mesh>
        <EncoderRotatingParts />
      </group>

      {/* 双方形直线导轨（顶面托滑块底面） */}
      {[-1, 1].map((side) => <LinearRail key={`rail-${side}`} side={side} />)}

      {/* 两端支撑柱（顶到丝杆轴承位）+ 型材加强条 */}
      {[from, to].map((px) => (
        <group key={`post-${px}`} position={[px, FRAME.SCREW_H / 2, 0]}>
          <mesh castShadow material={materials.base}>
            <boxGeometry args={[FRAME.SUPPORT_W, FRAME.SCREW_H, FRAME.SUPPORT_D]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, 0, s * (FRAME.SUPPORT_D / 2 + SURFACE_GAP)]} material={materials.sleeve}>
              <boxGeometry args={[FRAME.SUPPORT_W + 0.004, FRAME.SCREW_H * 0.94, 0.003]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* 轴承座：固定端 = 方形支撑单元（角接触轴承 + 锁紧螺母），浮动端 = 小圆筒 */}
      {[from, to].map((px) => (
        <BearingHousing key={`bearing-${px}`} x={px} fixed={px === from} />
      ))}

      {/* -X 驱动端：风扇罩 → 正反转电机 → 电机座 → 梅花联轴器 → 固定端支撑单元 */}
      <DriveEnd />

      {/* +X 轴末端：独立增量式编码器（静止件），与电机侧是两套安装链 */}
      <ShaftEndEncoder />

      {/* 接地垫脚 + 调节螺栓
          旧版垫脚与铝挤型底座 Y 范围完全相同（都是 0~BASE_H），两个顶面/底面
          又是不同材质（黑 vs 灰）→ 从上方看就是灰黑重叠闪烁。
          现在垫脚底边下探 SURFACE_GAP、顶面高出 FOOT_RISE，六面全部错开。 */}
      {[from - FRAME.FOOT_OFFSET, to + FRAME.FOOT_OFFSET].map((px) => (
        <group key={`foot-${px}`} position={[px, 0, 0]}>
          <mesh
            position={[0, (FRAME.BASE_H + FOOT_RISE - SURFACE_GAP) / 2, 0]}
            material={materials.darkMetal}
          >
            <boxGeometry
              args={[FRAME.FOOT_W, FRAME.BASE_H + FOOT_RISE + SURFACE_GAP, FRAME.FOOT_D]}
            />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, -0.004, s * FRAME.FOOT_D * 0.38]} material={materials.endCap}>
              <cylinderGeometry args={[0.008, 0.008, 0.008, 10]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* 侧面拖链槽 */}
      <CableChannel />

      {/* 原点 / 终点接近开关：滑块跑到对应位置触发信号，LED 同步亮灭 */}
      <LimitSensor kind="origin" at={SENSOR.ORIGIN_X} on={limitStart} />
      <LimitSensor kind="end" at={SENSOR.END_X} on={limitEnd} />
    </group>
  );
}
