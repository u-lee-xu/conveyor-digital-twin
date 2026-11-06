import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  AXIS_R, FRAME, FRAME_LEN, FRAME_CX, FRAME_DETAIL, SCREW_DETAIL, SENSOR, VISUAL,
  SURFACE_GAP, FOOT_RISE,
} from '../constants';
import { materials } from '../../../components/scene/shared/materials';
import { useDispensingStore } from '../../../stores/useDispensingStore';

const D = FRAME_DETAIL;
const K = SCREW_DETAIL;

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

/** 固定端 / 支撑端轴承座：端盖法兰 + 四颗周向螺栓 */
function BearingHousing({ x }: { x: number }) {
  return (
    <group position={[x, FRAME.SCREW_H, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]} material={materials.sleeve}>
        <cylinderGeometry args={[FRAME.BEARING_R, FRAME.BEARING_R, 0.08, 16]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`flange-${s}`} position={[s * 0.041, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.endCap}>
          <cylinderGeometry args={[FRAME.BEARING_R * 0.9, FRAME.BEARING_R * 0.9, 0.006, 16]} />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <mesh
            key={`bb-${i}`}
            position={[0.044, Math.cos(a) * D.BEARING_BOLT_OFFSET, Math.sin(a) * D.BEARING_BOLT_OFFSET]}
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
 * 伺服电机 + 梅花联轴器（装在固定端轴承座外侧，沿 -X 伸出）。
 * 真实模组这一端必有驱动源，旧模型只有两个小「同步带轮」圆柱，一眼就假。
 */
function ServoMotor() {
  const bodyCx = D.MOTOR_X0 - D.MOTOR_BODY_LEN / 2;
  return (
    <group position={[0, FRAME.SCREW_H, 0]}>
      {/* 梅花联轴器：两端铝毂 + 中间弹性体 */}
      <mesh position={[D.COUPLING_X, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.brightSilver}>
        <cylinderGeometry args={[D.COUPLING_R, D.COUPLING_R, D.COUPLING_LEN, 16]} />
      </mesh>
      <mesh position={[D.COUPLING_X, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.magSwitch}>
        <cylinderGeometry args={[D.COUPLING_JAW_R, D.COUPLING_JAW_R, D.COUPLING_LEN * 0.34, 12]} />
      </mesh>
      {/* 电机安装法兰板 + 四角螺栓 */}
      <mesh position={[D.MOTOR_FLANGE_X, 0, 0]} material={materials.darkMetal}>
        <boxGeometry args={[D.MOTOR_FLANGE_T, D.MOTOR_FLANGE_W, D.MOTOR_FLANGE_W]} />
      </mesh>
      {[-1, 1].flatMap((sy) => [-1, 1].map((sz) => (
        <mesh
          key={`mf-${sy}-${sz}`}
          position={[D.MOTOR_FLANGE_X - 0.005, sy * D.MOTOR_FLANGE_W * 0.36, sz * D.MOTOR_FLANGE_W * 0.36]}
          rotation={[0, 0, Math.PI / 2]}
          material={materials.endCap}
        >
          <cylinderGeometry args={[0.004, 0.004, 0.004, 8]} />
        </mesh>
      )))}
      {/* 电机本体（方形伺服） + 散热筋 */}
      <mesh position={[bodyCx, 0, 0]} castShadow material={materials.darkMetal}>
        <boxGeometry args={[D.MOTOR_BODY_LEN, D.MOTOR_BODY_W, D.MOTOR_BODY_W]} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh
          key={`fin-${i}`}
          position={[D.MOTOR_X0 - 0.008 - i * 0.009, 0, 0]}
          material={materials.sleeve}
        >
          <boxGeometry args={[0.002, D.MOTOR_BODY_W + 0.004, D.MOTOR_BODY_W + 0.004]} />
        </mesh>
      ))}
      {/* 前端圆形法兰 */}
      <mesh position={[D.MOTOR_X0 + 0.003, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.endCap}>
        <cylinderGeometry args={[D.MOTOR_BODY_W * 0.48, D.MOTOR_BODY_W * 0.48, 0.008, 20]} />
      </mesh>
      {/* 编码器后罩 */}
      <mesh
        position={[D.MOTOR_MIN_X + D.ENCODER_LEN / 2, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
        material={materials.magSwitch}
      >
        <cylinderGeometry args={[D.ENCODER_R, D.ENCODER_R, D.ENCODER_LEN, 16]} />
      </mesh>
      {/* 动力 / 编码器线缆插头 */}
      {[-1, 1].map((s) => (
        <group key={`conn-${s}`} position={[bodyCx - 0.006, s * D.MOTOR_BODY_W * 0.42, D.MOTOR_BODY_W * 0.34]}>
          <mesh material={materials.magSwitch}>
            <boxGeometry args={[0.018, 0.012, 0.012]} />
          </mesh>
          <mesh position={[0, s * 0.008, 0]} material={materials.sleeve}>
            <cylinderGeometry args={[0.004, 0.004, 0.014, 8]} />
          </mesh>
        </group>
      ))}
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

      {/* 旋转组：组原点放在丝杆轴线上，绕 X 旋转 = 丝杆原地自转 */}
      <group ref={screwRef} position={[0, FRAME.SCREW_H, 0]}>
        <BallScrew from={from} to={to} lead={K.LEAD} y={0} />
        {/* 同步带轮（套在丝杆端头轴线上） */}
        {[from, to].map((px) => (
          <mesh key={px} position={[px, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.darkMetal}>
            <cylinderGeometry args={[0.035, 0.035, 0.05, 16]} />
          </mesh>
        ))}
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
      {/* 轴承座（支撑柱顶，穿丝杆） */}
      {[from, to].map((px) => <BearingHousing key={`bearing-${px}`} x={px} />)}

      {/* 驱动端：伺服电机 + 联轴器 */}
      <ServoMotor />

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
