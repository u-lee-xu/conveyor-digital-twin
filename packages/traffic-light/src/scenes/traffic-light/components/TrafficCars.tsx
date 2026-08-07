import { memo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTrafficStore, type LampKey } from '../useTrafficStore';
import { ROAD_LENGTH, INTERSECTION_HALF } from '../constants';
import type { Group } from 'three';

/**
 * 交通灯场景车辆：
 * - 四个进口道按靠右行驶规则生成车辆（由西向东走南侧车道 / 由东向西走北侧车道 /
 *   由南向北走东侧车道 / 由北向南走西侧车道），每个方向固定 2 列车道
 * - 行驶规则：进入路口前遇红灯（含黄灯）停在斑马线外（停止线前）；前方车辆停止时
 *   保持车距跟随；绿灯通行，越过停止线后即使中途转红也继续行驶
 * - 同车道前车保持车距；驶出道路（到达灰色地面）即回收
 */

type Dir = 'w2e' | 'e2w' | 's2n' | 'n2s';

interface Car {
  id: number;
  dir: Dir;
  /** 车道列索引（0/1，固定两列，靠右一侧） */
  col: number;
  /** 行驶速度 */
  speed: number;
  /** 沿行驶方向位置（0 = 入口远端，向出口递增） */
  pos: number;
  color: string;
}

const CAR_LEN = 0.5;
const CAR_WID = 0.24;
const HALF_ROAD = ROAD_LENGTH / 2;
/** 停止线世界坐标（本进口侧，灯杆连线位置：西北-西南角连线 / 东北-东南角连线） */
const STOP_LINE = INTERSECTION_HALF + 0.05;
/** 车头对齐停止线时车中心的位置（pos 坐标，四个方向对称） */
const STOP_AT = HALF_ROAD - STOP_LINE - CAR_LEN / 2;
/** 出道路（到达灰色地面）回收位置 */
const EXIT_POS = ROAD_LENGTH + 0.3;
/** 同车道最小车距 */
const GAP = 0.75;
/** 车辆数量上限 / 生成间隔范围（秒） */
const MAX_CARS = 6;
const SPAWN_MIN = 2.0;
const SPAWN_MAX = 4.0;
/** 两列车道距道路中心线的偏移（道路半宽 1.5 均分 2 列） */
const COL_OFFSETS = [0.375, 1.125];

const BODY_COLORS = ['#c0392b', '#2980b9', '#f1c40f', '#ecf0f1', '#2c3e50', '#e67e22', '#8e44ad', '#16a085'];
const DIRS: Dir[] = ['w2e', 'e2w', 's2n', 'n2s'];

let nextId = 1;

function createCar(): Car {
  const dir = DIRS[Math.floor(Math.random() * DIRS.length)];
  return {
    id: nextId++,
    dir,
    col: Math.floor(Math.random() * COL_OFFSETS.length),
    speed: 0.7 + Math.random() * 0.5,
    pos: 0,
    color: BODY_COLORS[Math.floor(Math.random() * BODY_COLORS.length)],
  };
}

/** 车辆世界坐标与朝向（车头为本地 +X 方向），col 固定两列 */
function carWorld(c: Car): { x: number; z: number; rotY: number } {
  const lane = COL_OFFSETS[c.col];
  switch (c.dir) {
    case 'w2e': return { x: -HALF_ROAD + c.pos, z: lane, rotY: 0 };
    case 'e2w': return { x: HALF_ROAD - c.pos, z: -lane, rotY: Math.PI };
    case 's2n': return { x: lane, z: HALF_ROAD - c.pos, rotY: Math.PI / 2 };
    case 'n2s': return { x: -lane, z: -HALF_ROAD + c.pos, rotY: -Math.PI / 2 };
  }
}

/** 该方向车辆是否可通行（仅绿灯通行，红/黄灯停车） */
function carCanGo(dir: Dir, lamps: Record<LampKey, boolean>): boolean {
  return dir === 'w2e' || dir === 'e2w' ? lamps.ew_green : lamps.ns_green;
}

const CarMesh = memo(function CarMesh({ car }: { car: Car }) {
  const groupRef = useRef<Group>(null!);
  // 位置/朝向直接更新 three 对象，不触发 React 重渲染
  useFrame(() => {
    const { x, z, rotY } = carWorld(car);
    groupRef.current.position.set(x, 0, z);
    groupRef.current.rotation.y = rotY;
  });
  return (
    <group ref={groupRef}>
      {/* 车身 */}
      <mesh position={[0, 0.09, 0]}>
        <boxGeometry args={[CAR_LEN, 0.16, CAR_WID]} />
        <meshStandardMaterial color={car.color} roughness={0.4} metalness={0.2} />
      </mesh>
      {/* 车顶 */}
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.28, 0.1, 0.16]} />
        <meshStandardMaterial color={car.color} roughness={0.4} metalness={0.2} />
      </mesh>
      {/* 前后挡风玻璃 */}
      <mesh position={[0.13, 0.17, 0]}>
        <boxGeometry args={[0.05, 0.1, CAR_WID - 0.04]} />
        <meshStandardMaterial color="#1c2733" roughness={0.2} />
      </mesh>
      <mesh position={[-0.13, 0.17, 0]}>
        <boxGeometry args={[0.05, 0.1, CAR_WID - 0.04]} />
        <meshStandardMaterial color="#1c2733" roughness={0.2} />
      </mesh>
      {/* 四个车轮 */}
      {[
        [-0.17, 0.05, 0.095],
        [-0.17, 0.05, -0.095],
        [0.17, 0.05, 0.095],
        [0.17, 0.05, -0.095],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <boxGeometry args={[0.06, 0.1, 0.06]} />
          <meshStandardMaterial color="#0d0f12" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
});

export function TrafficCars() {
  const carsRef = useRef<Car[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const spawnTimer = useRef(1.5);

  useFrame((_, delta) => {
    const cars = carsRef.current;

    // 定时生成车辆
    let changed = false;
    spawnTimer.current -= delta;
    if (spawnTimer.current <= 0) {
      if (cars.length < MAX_CARS) {
        cars.push(createCar());
        changed = true;
      }
      spawnTimer.current = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
    }

    const lamps = useTrafficStore.getState().lamps;
    // 按位置从出口到入口排序，前车先结算（跟随判定依赖前车结果）
    const order = [...cars].sort((a, b) => b.pos - a.pos);
    const speedState = new Map<number, number>();

    for (const c of order) {
      let sp = c.speed;
      // 行驶规则：红灯时车头到达本进口侧停止线即停车（所有车停在同一位置，不越线）；
      // 绿灯时不停车直接通过，越过停止线后即使中途转红也继续行驶
      const front = c.pos + CAR_LEN / 2;
      if (front >= STOP_AT && front < STOP_AT + 0.06 && !carCanGo(c.dir, lamps)) {
        sp = 0;
      }
      // 同列车道前车：过近时停车或跟速（保持车距）
      for (const o of order) {
        if (o === c || o.dir !== c.dir || o.col !== c.col) continue;
        if (o.pos <= c.pos) continue;
        const gap = o.pos - c.pos;
        if (gap < GAP + CAR_LEN) {
          const leadSp = speedState.get(o.id) ?? o.speed;
          if (leadSp <= 0.001) sp = 0;
          else sp = Math.min(sp, leadSp);
        }
      }
      if (sp > 0) c.pos += sp * delta;
      speedState.set(c.id, sp);
    }

    // 出道路（到达灰色地面）回收；仅在增删车辆时才触发 React 重渲染
    const kept = cars.filter((c) => c.pos < EXIT_POS);
    if (kept.length !== cars.length) changed = true;
    carsRef.current = kept;
    if (changed) setCars(kept);
  });

  return (
    <group>
      {cars.map((c) => (
        <CarMesh key={c.id} car={c} />
      ))}
    </group>
  );
}
