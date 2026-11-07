import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  AXIS_R, FRAME, FRAME_LEN, FRAME_CX, FRAME_DETAIL, DRIVE_STATIONS,
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
 * 驱动端整条安装链（全部在机架局部坐标，轴线 y=FRAME.SCREW_H、z=0）。
 *
 * 沿 +X 依次为：编码器后罩 → 伺服电机机身（同色散热筋）→ 前端法兰/止口
 * → 电机安装支架（联轴器罩）→ 三段式梅花联轴器 → 固定端方形支撑单元
 * → 丝杆轴端。编码器是电机尾部集成件，不再是独立悬空黑圆柱；
 * 散热筋与机身同色系，不再是「黑底 + 灰条纹」的斑马外观。
 */
function DriveEnd() {
  const bodyCx = (ST.BODY_MIN + ST.BODY_MAX) / 2;
  const encCx = (ST.ENCODER_MIN + ST.ENCODER_MAX) / 2;
  return (
    <group position={[0, FRAME.SCREW_H, 0]}>
      {/* —— 1. 编码器后罩：集成在电机尾部，与机身同轴 —— */}
      <mesh position={[encCx, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={materials.encoderCap}>
        <cylinderGeometry args={[D.ENCODER_R, D.ENCODER_R, D.ENCODER_LEN, 20]} />
      </mesh>
      {/* 动力 / 编码器两根线缆：从后罩径向外伸，不把 MOTOR_MIN_X 再往外推 */}
      {[-1, 1].map((s) => (
        <group key={`enc-conn-${s}`} position={[encCx + s * D.ENCODER_CONN_D, 0, D.ENCODER_CONN_Z]}>
          <mesh material={materials.encoderCap}>
            <boxGeometry args={[D.ENCODER_CONN_W, D.ENCODER_CONN_H, D.ENCODER_CONN_D]} />
          </mesh>
          <mesh position={[0, 0, D.ENCODER_CONN_D / 2 + D.ENCODER_CABLE_LEN / 2]} rotation={[Math.PI / 2, 0, 0]} material={materials.magSwitch}>
            <cylinderGeometry args={[D.ENCODER_CABLE_R, D.ENCODER_CABLE_R, D.ENCODER_CABLE_LEN, 8]} />
          </mesh>
        </group>
      ))}

      {/* —— 2. 伺服电机机身 + 同色散热筋 —— */}
      <mesh position={[bodyCx, 0, 0]} castShadow material={materials.motorBody}>
        <boxGeometry args={[D.MOTOR_BODY_LEN, D.MOTOR_BODY_W, D.MOTOR_BODY_W]} />
      </mesh>
      {Array.from({ length: D.MOTOR_RIB_N }, (_, i) => (
        <mesh
          key={`rib-${i}`}
          position={[ST.BODY_MIN + D.MOTOR_RIB_PITCH * (i + 0.5), 0, 0]}
          material={materials.motorRib}
        >
          <boxGeometry args={[
            D.MOTOR_RIB_T,
            D.MOTOR_BODY_W + 2 * D.MOTOR_RIB_OUT,
            D.MOTOR_BODY_W + 2 * D.MOTOR_RIB_OUT,
          ]} />
        </mesh>
      ))}

      {/* —— 3. 前端安装法兰 + 四角螺栓 + 定位止口凸环 —— */}
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
      <mesh position={[ST.FLANGE_MAX + SURFACE_GAP, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={materials.brightSilver}>
        <torusGeometry args={[D.MOTOR_PILOT_R, 0.0025, 8, 28]} />
      </mesh>

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
          固定端支撑单元外侧的六角锁紧螺母拧在丝杆上，随丝杆一起转。
          旧的「同步带轮」属于上一版皮带传动模型，直连伺服后已删除。 */}
      <group ref={screwRef} position={[0, FRAME.SCREW_H, 0]}>
        <BallScrew from={from} to={to} lead={K.LEAD} y={0} />
        <mesh
          position={[ST.SUPPORT_MAX + D.LOCK_NUT_LEN / 2, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
          material={materials.brightSilver}
        >
          <cylinderGeometry args={[D.LOCK_NUT_R, D.LOCK_NUT_R, D.LOCK_NUT_LEN, 6]} />
        </mesh>
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

      {/* 驱动端：编码器 → 伺服电机 → 电机座 → 梅花联轴器 → 固定端支撑单元 */}
      <DriveEnd />

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
