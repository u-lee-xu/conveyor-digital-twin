# Rapier.js 物理引擎升级 - 需要重新设计的部分

## 一、当前架构分析

### 当前物理实现方式

| 组件 | 物理实现方式 | 说明 |
|------|-------------|------|
| **usePhysics.ts** | 手动 `requestAnimationFrame` + 坐标计算 | 负责所有物理逻辑：物料运动、气缸碰撞、传感器检测、边界清理 |
| **ConveyorBelt.tsx** | 纯视觉组件，无物理属性 | 只有滚筒动画，没有物理碰撞体 |
| **Cylinder.tsx** | 纯视觉组件，只有动画 | 推板移动通过手动位置更新实现，没有物理碰撞体 |
| **Sensor.tsx** | 纯视觉组件 | 传感器触发由 `usePhysics` 中的 X 坐标范围判断 |
| **Material.tsx** | 纯视觉组件 | 位置由 `usePhysics` 手动更新 |

### 当前问题

1. **手动坐标计算复杂且脆弱**
   - 传送带运动：手动 X += speed
   - 气缸碰撞：手动计算 Z 轴位置比较
   - 传感器检测：手动 X 坐标范围判断
   - 边界清理：手动 X/Z 坐标判断

2. **单物料限制**
   - 系统只能同时存在一个物料

3. **没有真实的物理碰撞**
   - 气缸推物料只是位置同步，没有碰撞反应
   - 物料不会因为碰撞而改变速度或方向

---

## 二、Rapier.js 升级后需要重新设计的部分

### 2.1 整体架构对比

| 方面 | 当前 | Rapier.js 后 |
|------|------|-------------|
| **物理计算** | `usePhysics.ts` 手动计算 | Rapier 引擎自动计算 |
| **场景根组件** | `<Scene>` (纯 Three.js) | `<Physics>` + `<Scene>` |
| **设备组件** | 纯视觉 | 视觉 + 物理组件（`RigidBody`, `Collider`） |
| **传感器检测** | 坐标范围判断 | 物理碰撞事件（`sensor` collider） |
| **气缸推动** | 手动位置同步 | 运动学刚体（`kinematicPosition`）碰撞 |
| **传送带** | 无物理 | 固定刚体 + 摩擦力/表面速度 |
| **物料** | 单对象，手动更新 | 动态刚体，物理引擎控制 |

---

### 2.2 详细重新设计清单

#### 🔴 高优先级 - 核心组件

| 组件/文件 | 需要改什么 | 为什么 | 新设计方案 |
|----------|-----------|--------|----------|
| **Scene.tsx** | 场景根组件改造 | 当前 `useScene` 是自定义 Context，需要改为 `<Physics>` 包裹 | 添加双场景支持：旧 Scene（兼容）+ 新 PhysicsScene |
| **usePhysics.ts** | 重写或条件禁用 | Rapier 接管物理计算，不再需要手动坐标计算 | 条件判断：`if (useNewPhysics) return null; else 执行旧逻辑` |
| **ConveyorBelt.tsx** | 完全重写 | 需要物理碰撞体，传送带表面带动物料 | 用 `RigidBody(fixed)` + `CuboidCollider` + 摩擦力/表面速度模拟 |
| **Cylinder.tsx** | 完全重写 | 需要物理碰撞体，推板要能推动物料 | 用 `RigidBody(kinematicPosition)` + `CuboidCollider`，`setNextKinematicTranslation` 驱动 |
| **Sensor.tsx** | 完全重写 | 传感器由碰撞事件触发，不是坐标判断 | 用 `CuboidCollider(sensor)` + `onIntersectionEnter/Exit` 事件 |
| **Material.tsx** | 完全重写 | 物料是动态刚体，由物理引擎控制位置 | 用 `RigidBody(dynamic)` + `CuboidCollider`，物理引擎自动更新位置 |
| **useDeviceStore.ts** | 扩展 | 单物料改为多物料数组，添加新物理引擎状态 | `materials: MaterialItem[]`，而不是单个 `material` 对象 |
| **App.tsx** | 添加切换 UI | 用户需要能在新旧物理引擎间切换 | 添加"物理引擎"切换面板 |

---

#### 🟡 中优先级 - 业务逻辑

| Hook/文件 | 需要改什么 | 为什么 | 新设计方案 |
|----------|-----------|--------|----------|
| **useSimMode.ts** | 适配新物理引擎 | 通信逻辑可能需要调整 | 保持 PLC 通信逻辑，物理事件驱动状态更新 |
| **useConveyorScoring.ts** | 适配多物料 | 当前只处理单个物料 | 评分逻辑按物料 ID 跟踪 |
| **useDemoMode.ts** | 适配新物理引擎 | 物料生成逻辑可能需要调整 | `spawnMaterial` 创建物料实体，物理引擎接管运动 |

---

#### 🟢 低优先级 - 兼容与优化

| 方面 | 需要改什么 | 为什么 |
|------|-----------|--------|
| **向后兼容** | 保留旧场景作为 fallback | 确保现有功能不受影响，用户可以选择切换 |
| **性能优化** | 可能需要调整物理参数 | Rapier 物理引擎可能需要调优 |
| **测试** | 新增物理引擎相关测试 | 确保新功能正常 |

---

## 三、新组件设计方案

### 3.1 PhysicsScene.tsx（新增）

```tsx
import { Physics } from '@react-three/rapier';
import { PhysicsConveyorBelt } from './PhysicsConveyorBelt';
import { PhysicsCylinder } from './PhysicsCylinder';
import { PhysicsSensor } from './PhysicsSensor';
import { PhysicsMaterial } from './PhysicsMaterial';
// ... 其他组件

export const PhysicsScene: React.FC = () => {
  return (
    <Physics gravity={[0, -9.8, 0]}>
      {/* 地面 */}
      <RigidBody type="fixed">
        <CuboidCollider args={[10, 0.1, 10]} />
      </RigidBody>
      
      {/* 传送带 */}
      <PhysicsConveyorBelt position={[0, 0, 0]} />
      
      {/* 气缸 */}
      <PhysicsCylinder name="feed" position={[-1.3, 1.12, 1.2]} />
      <PhysicsCylinder name="sorting1" position={[-0.2, 1.12, 0.8]} />
      <PhysicsCylinder name="sorting2" position={[0.9, 1.12, 0.8]} />
      
      {/* 传感器 */}
      <PhysicsSensor name="feed" position={[-1.3, 1.45, 0]} />
      <PhysicsSensor name="color" position={[-0.2, 1.45, 0]} />
      <PhysicsSensor name="material" position={[0.9, 1.45, 0]} />
      
      {/* 物料（动态渲染） */}
      <PhysicsMaterials />
    </Physics>
  );
};
```

---

### 3.2 PhysicsConveyorBelt.tsx（新增 - 替代 ConveyorBelt.tsx）

```tsx
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useDeviceStore } from '../../stores';

export const PhysicsConveyorBelt: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const conveyorRunning = useDeviceStore(s => s.conveyorRunning);
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  
  useEffect(() => {
    if (rigidBodyRef.current) {
      // 方案1: 用摩擦力模拟传送带
      // 或者方案2: 每一帧设置表面速度
      
      // 注意: Rapier 可能没有直接的 setSurfaceVelocity，需要看文档
      // 替代方案: 用固定刚体 + 摩擦力 + 物料接触时施加力
    }
  }, [conveyorRunning]);
  
  return (
    <group position={position}>
      <RigidBody ref={rigidBodyRef} type="fixed" colliders="cuboid">
        {/* 传送带物理体 */}
        <mesh>
          <boxGeometry args={[4, 0.2, 1]} />
          <meshStandardMaterial color="#333" />
        </mesh>
      </RigidBody>
      
      {/* 传送带视觉（独立于物理） */}
      {/* ... 滚筒、导轨等视觉组件 ... */}
    </group>
  );
};
```

---

### 3.3 PhysicsCylinder.tsx（新增 - 替代 Cylinder.tsx）

```tsx
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useDeviceStore } from '../../stores';
import { CYLINDER_EXTEND_POS_FEED, CYLINDER_EXTEND_POS_SORT, CYLINDER_RETRACT_POS } from './shared';

export const PhysicsCylinder: React.FC<{ name: CylinderName; position: [number, number, number] }> = ({ name, position }) => {
  const { cylinders, updateCylinderExtension } = useDeviceStore();
  const cylinder = cylinders[name];
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const isFeed = name === 'feed';
  
  const targetExtension = cylinder.extended 
    ? (isFeed ? CYLINDER_EXTEND_POS_FEED : CYLINDER_EXTEND_POS_SORT)
    : CYLINDER_RETRACT_POS;
  
  useEffect(() => {
    if (rigidBodyRef.current) {
      // 运动学刚体：用 setNextKinematicTranslation 驱动
      rigidBodyRef.current.setNextKinematicTranslation({
        x: position[0],
        y: position[1],
        z: position[2] - targetExtension
      });
      updateCylinderExtension(name, targetExtension);
    }
  }, [cylinder.extended, name, position, targetExtension, updateCylinderExtension]);
  
  return (
    <group position={position}>
      {/* 缸体（固定） */}
      <RigidBody type="fixed">
        {/* ... 缸体视觉组件 ... */}
      </RigidBody>
      
      {/* 推板（运动学刚体，用于碰撞） */}
      <RigidBody 
        ref={rigidBodyRef} 
        type="kinematicPosition" 
        colliders="cuboid"
      >
        {/* ... 推板视觉组件 ... */}
      </RigidBody>
    </group>
  );
};
```

---

### 3.4 PhysicsSensor.tsx（新增 - 替代 Sensor.tsx）

```tsx
import { CuboidCollider } from '@react-three/rapier';
import { useDeviceStore } from '../../stores';

export const PhysicsSensor: React.FC<{ name: SensorName; position: [number, number, number] }> = ({ name, position }) => {
  const { setSensor, material } = useDeviceStore();
  const [active, setActive] = useState(false);
  
  return (
    <group position={position}>
      {/* 传感器视觉组件 */}
      <mesh>
        {/* ... 传感器外观 ... */}
      </mesh>
      
      {/* 传感器碰撞体（sensor 模式，不产生物理反应，只触发事件） */}
      <CuboidCollider
        sensor
        args={[0.25, 0.5, 0.25]}
        onIntersectionEnter={() => {
          setActive(true);
          // 色标传感器需要额外判断颜色
          if (name === 'color') {
            if (material.color === 'black') {
              setSensor(name, true);
            }
          } else {
            setSensor(name, true);
          }
        }}
        onIntersectionExit={() => {
          setActive(false);
          setSensor(name, false);
        }}
      />
    </group>
  );
};
```

---

### 3.5 PhysicsMaterial.tsx（新增 - 替代 Material.tsx）

```tsx
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useDeviceStore } from '../../stores';

interface MaterialItem {
  id: string;
  color: 'blue' | 'black';
  position: [number, number, number];
}

// 单个物料组件
export const PhysicsMaterial: React.FC<{ item: MaterialItem }> = ({ item }) => {
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  
  // 物料出现时设置初始位置
  useEffect(() => {
    if (rigidBodyRef.current) {
      rigidBodyRef.current.setTranslation({
        x: item.position[0],
        y: item.position[1],
        z: item.position[2]
      }, true);
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rigidBodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }, [item.position]);
  
  return (
    <RigidBody ref={rigidBodyRef} colliders="cuboid">
      <mesh castShadow>
        <boxGeometry args={[0.15, 0.15, 0.15]} />
        <meshStandardMaterial 
          color={item.color === 'blue' ? '#2563EB' : '#000000'} 
        />
      </mesh>
    </RigidBody>
  );
};

// 渲染所有物料
export const PhysicsMaterials: React.FC = () => {
  const { materials } = useDeviceStore(); // 注意：store 需要改为数组
  
  return (
    <group>
      {materials.map(item => (
        <PhysicsMaterial key={item.id} item={item} />
      ))}
    </group>
  );
};
```

---

### 3.6 Store 更新方案

```typescript
// useDeviceStore.ts 改动

// 之前（单物料）
interface DeviceStore {
  material: {
    visible: boolean;
    color: MaterialColor;
    position: [number, number, number];
    // ...
  };
  spawnMaterial: () => void;
  clearMaterial: () => void;
  updateMaterialPosition: (pos: [number, number, number]) => void;
}

// 之后（多物料）
interface MaterialItem {
  id: string;
  visible: boolean;
  color: MaterialColor;
  position: [number, number, number];
}

interface DeviceStore {
  // 新增：物理引擎选择状态
  useNewPhysics: boolean;
  setUseNewPhysics: (v: boolean) => void;
  
  // 改动：单物料改为多物料数组
  materials: MaterialItem[];
  spawnMaterial: () => void; // 创建新物料并加入数组
  clearMaterial: (id?: string) => void; // 清除指定物料或全部
  updateMaterialPosition: (id: string, pos: [number, number, number]) => void;
  
  // 保留旧接口作为兼容（但内部代理到新接口）
  material: MaterialItem; // 取第一个物料（兼容旧代码）
  // ...
}
```

---

## 四、开发步骤建议

### 阶段 1: 基础框架（向后兼容）
1. 安装 `@react-three/rapier`
2. 添加 `useNewPhysics` 状态到 store
3. 在 App.tsx 中添加物理引擎切换 UI
4. 创建空的 `PhysicsScene.tsx`
5. 验证：切换引擎不影响旧功能

### 阶段 2: 逐个迁移组件
1. 先迁移 **Material**（最简单）
2. 再迁移 **Sensor**（验证碰撞事件）
3. 再迁移 **Conveyor**（验证表面运动）
4. 最后迁移 **Cylinder**（最复杂的运动学+碰撞）

### 阶段 3: 多物料支持
1. 把 store 从单物料改为数组
2. 更新所有相关 hooks
3. 测试多物料并发场景

### 阶段 4: 优化与测试
1. 调优物理参数
2. 性能测试
3. 完整功能测试

---

## 五、潜在风险与注意事项

### ⚠️ 风险点

1. **Rapier API 差异**
   - 不同版本的 `@react-three/rapier` API 可能不同
   - 需要先看文档确认：是否有 `setSurfaceVelocity`，还是需要用别的方式模拟传送带

2. **传送带实现方案选择**
   - 方案 A: 固定刚体 + 高摩擦力，物料靠摩擦力带动
   - 方案 B: 每一帧给接触到的物料施加力
   - 方案 C: 用 `setLinvel` 但刚体是固定的（可能无效）
   - 需要测试哪个方案效果最好

3. **性能问题**
   - 物理引擎比手动计算更耗性能
   - 多物料时可能需要限制数量或优化

4. **向后兼容**
   - 确保旧场景完全可用
   - 用户可以随时切换回旧物理引擎

### ✅ 缓解措施

1. **保留旧代码** - 不删除旧组件，作为 fallback
2. **渐进式迁移** - 一个组件一个组件迁移，每个阶段都可测试
3. **功能开关** - `useNewPhysics` 状态控制用新引擎还是旧引擎
4. **充分测试** - 每个阶段都要完整测试所有模式（manual/auto/sim/scoring）

---

## 六、总结

| 方面 | 改动程度 |
|------|---------|
| **场景组件** | 🔴 全部重写（新增 Physics* 组件） |
| **物理 Hook** | 🟡 条件禁用旧逻辑 |
| **Store** | 🟡 扩展（单物料→多物料，添加引擎状态） |
| **业务 Hooks** | 🟡 适配调整 |
| **App.tsx** | 🟢 添加切换 UI |
| **向后兼容** | ✅ 完全保留旧功能 |
