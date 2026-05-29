# 场景配置化架构设计

> 本文档详细说明 V3 优化中场景配置化的具体架构设计，确保 JSON 配置能真正驱动功能，而不只是代码层面的配置。

---

## 一、整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        App.tsx                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          SceneManager (新增)                           │  │
│  │  - 场景选择 UI                                         │  │
│  │  - 场景加载器                                          │  │
│  │  - 场景状态管理                                        │  │
│  └──────────────────┬────────────────────────────────────┘  │
│                     │                                        │
│                     │ 加载配置                                │
│                     ▼                                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              SceneRenderer (新增)                      │  │
│  │  - 根据配置创建组件实例                                 │  │
│  │  - 组件通信总线                                         │  │
│  │  - 事件分发                                             │  │
│  └──────────┬───────────────────────┬─────────────────────┘  │
│             │                       │                        │
│             ▼                       ▼                        │
│  ┌──────────────────┐   ┌──────────────────┐               │
│  │  旧 Scene 组件   │   │  PhysicsScene     │               │
│  │  (保留兼容)      │   │  (Rapier 物理)    │               │
│  └──────────────────┘   └──────────────────┘               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               src/config/scenes/                           │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  conveyor-sorting.json                                │ │
│  │  {                                                    │ │
│  │    "id": "conveyor-sorting",                          │ │
│  │    "name": "传送带分拣",                              │ │
│  │    "devices": { ... },                                │ │
│  │    "behavior": { ... },                               │ │
│  │    "scoring": { ... }                                 │ │
│  │  }                                                    │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              src/scenes/ (新增目录)                         │
│  ┌──────────────────┐  ┌──────────────────┐              │
│  │  conveyor/       │  │  robot-arm/      │  (待开发)    │
│  │  - index.ts      │  │  - index.ts      │              │
│  │  - devices.ts    │  │  - devices.ts    │              │
│  │  - behavior.ts   │  │  - behavior.ts   │              │
│  │  - scoring.ts    │  │  - scoring.ts    │              │
│  └──────────────────┘  └──────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、核心模块设计

### 2.1 SceneConfig 完整类型定义

```typescript
// src/types/scene.ts

// ---------------------------
// 基础设备配置类型
// ---------------------------
export interface DeviceConfig {
  id: string;                      // 设备唯一 ID
  name: string;                    // 设备名称（用于 UI 显示）
  type: string;                    // 设备类型（如 "conveyor"、"cylinder"、"sensor"）
  position: [number, number, number];  // 3D 位置
  rotation?: [number, number, number]; // 3D 旋转（默认 [0,0,0]）
  scale?: [number, number, number];    // 3D 缩放（默认 [1,1,1]）
  config?: Record<string, any>;    // 设备特定配置
}

export interface ConveyorConfig extends DeviceConfig {
  type: "conveyor";
  config: {
    speed: number;                  // 传送带速度
    length: number;                 // 传送带长度
    width: number;                  // 传送带宽度
  };
}

export interface CylinderConfig extends DeviceConfig {
  type: "cylinder";
  config: {
    direction: "x" | "y" | "z";     // 气缸运动方向
    stroke: number;                 // 气缸行程
    speed: number;                  // 气缸运动速度
    limitZone: number;              // 限位触发区域宽度
  };
  plcMapping: {
    valve: string;                  // 电磁阀控制信号（设备信号名）
    limitRetract: string;           // 缩回限位反馈（设备信号名）
    limitExtend: string;            // 伸出限位反馈（设备信号名）
  };
}

export interface SensorConfig extends DeviceConfig {
  type: "sensor";
  config: {
    detectionRange: number;         // 检测范围半径
    triggerCondition?: string;      // 触发条件（可选，如 "material.color === 'black'"）
  };
  plcMapping: {
    output: string;                 // PLC 输出信号名
  };
}

export interface MaterialTableConfig extends DeviceConfig {
  type: "materialTable";
  config: {
    spawnPosition: [number, number, number];  // 物料生成位置
  };
}

export interface SignalTowerConfig extends DeviceConfig {
  type: "signalTower";
  config: {
    lights: ("red" | "green" | "yellow")[];  // 灯塔包含的灯
  };
  plcMapping: {
    [key in "red" | "green" | "yellow"]?: string;
  };
}

export type DeviceConfigUnion =
  | ConveyorConfig
  | CylinderConfig
  | SensorConfig
  | MaterialTableConfig
  | SignalTowerConfig;

// ---------------------------
// 行为逻辑配置类型
// ---------------------------
export interface BehaviorRule {
  id: string;
  name: string;
  description?: string;
  trigger: {
    type: "signal" | "timer" | "condition";
    condition?: string;  // 触发条件表达式
    signal?: string;     // 触发信号名
  };
  actions: {
    type: "controlDevice" | "spawnMaterial" | "clearMaterial" | "custom";
    deviceId?: string;
    action?: string;
    params?: Record<string, any>;
  }[];
}

// ---------------------------
// 评分配置类型
// ---------------------------
export interface ScoringItemConfig {
  id: string;
  name: string;
  points: number;
  condition: string;  // 判断条件表达式
  timeout?: number;   // 超时时间（毫秒）
}

export interface ScoringSubModuleConfig {
  id: string;
  name: string;
  isPrerequisite: boolean;
  items: ScoringItemConfig[];
}

export interface ScoringConfig {
  modules: {
    id: string;
    name: string;
    maxPoints: number;
    subModules: ScoringSubModuleConfig[];
  }[];
}

// ---------------------------
// PLC 映射配置类型
// ---------------------------
export interface PlcMappingConfig {
  modbus: Record<string, number>;  // 设备信号名 → Modbus 地址
  s7: Record<string, string>;      // 设备信号名 → S7 变量名
}

// ---------------------------
// 完整场景配置类型
// ---------------------------
export interface SceneConfig {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;

  // 设备配置
  devices: DeviceConfigUnion[];

  // 物理参数
  physics: {
    gravity: [number, number, number];
    defaultMaterialFriction: number;
    defaultMaterialRestitution: number;
  };

  // 行为逻辑
  behaviors?: BehaviorRule[];

  // 评分配置
  scoring?: ScoringConfig;

  // PLC 信号映射
  plcMapping?: PlcMappingConfig;

  // UI 配置
  ui?: {
    showLabels?: boolean;
    defaultCameraPosition?: [number, number, number];
  };
}
```

---

### 2.2 场景目录结构（每个场景分别开发）

每个场景是一个独立模块，放在 `src/scenes/{scene-id}/` 目录下：

```
src/scenes/
└── conveyor-sorting/
    ├── index.ts              # 场景入口
    ├── devices.ts            # 场景特定设备组件
    ├── behavior.ts           # 场景行为逻辑
    ├── scoring.ts            # 场景评分逻辑
    └── preset-configs/       # 预设配置（可选）
        └── default.json
```

#### 场景入口文件（index.ts）

```typescript
// src/scenes/conveyor-sorting/index.ts
import { SceneModule } from "../../core/scene-manager";
import devices from "./devices";
import behaviors from "./behavior";
import scoring from "./scoring";
import defaultConfig from "./preset-configs/default.json";

export const conveyorSortingScene: SceneModule = {
  id: "conveyor-sorting",
  name: "传送带分拣",
  description: "经典的传送带物料分拣场景",
  defaultConfig: defaultConfig as SceneConfig,
  devices,
  behaviors,
  scoring,
};
```

#### 设备组件注册（devices.ts）

每个场景可以注册自己的特定设备组件，或使用通用组件：

```typescript
// src/scenes/conveyor-sorting/devices.ts
import { DeviceComponentRegistry } from "../../core/scene-manager";
import { GenericConveyor } from "../../components/scene/GenericConveyor";
import { GenericCylinder } from "../../components/scene/GenericCylinder";
import { GenericSensor } from "../../components/scene/GenericSensor";
import { ConveyorSortingMaterialTable } from "./ConveyorSortingMaterialTable";
import { ConveyorSortingSignalTower } from "./ConveyorSortingSignalTower";

export const deviceRegistry: DeviceComponentRegistry = {
  conveyor: GenericConveyor,       // 通用传送带组件
  cylinder: GenericCylinder,       // 通用气缸组件
  sensor: GenericSensor,           // 通用传感器组件
  materialTable: ConveyorSortingMaterialTable,  // 场景特定组件
  signalTower: ConveyorSortingSignalTower,      // 场景特定组件
};
```

#### 行为逻辑（behavior.ts）

```typescript
// src/scenes/conveyor-sorting/behavior.ts
import { BehaviorModule } from "../../core/scene-manager";
import { useDeviceStore } from "../../stores";

export const behaviorModule: BehaviorModule = {
  // 场景初始化时调用
  onSceneLoad: (config) => {
    console.log("传送带分拣场景加载", config);
  },

  // 自定义行为处理器
  handlers: {
    // 例如：传感器触发时的自定义逻辑
    "sensor.feed.triggered": (deviceId, data) => {
      // 自定义处理
    },
  },
};
```

---

### 2.3 通用设备组件（共享组件库）

在 `src/components/scene/generic/` 下创建通用设备组件，各场景可复用：

```
src/components/scene/generic/
├── GenericConveyor.tsx       # 通用传送带
├── GenericCylinder.tsx       # 通用气缸
├── GenericSensor.tsx         # 通用传感器
├── GenericMaterialTable.tsx  # 通用物料台
└── GenericSignalTower.tsx    # 通用信号塔
```

#### 通用组件示例（GenericConveyor.tsx）

```typescript
// src/components/scene/generic/GenericConveyor.tsx
import React, { useRef, useEffect } from "react";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import { useSceneContext } from "../../core/scene-manager";
import { ConveyorConfig } from "../../types/scene";

interface GenericConveyorProps {
  config: ConveyorConfig;
}

export const GenericConveyor: React.FC<GenericConveyorProps> = ({ config }) => {
  const { registerDevice, getDeviceState, setDeviceState } = useSceneContext();
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const deviceId = config.id;

  // 注册设备
  useEffect(() => {
    registerDevice(deviceId, {
      type: "conveyor",
      config,
      getState: () => getDeviceState(deviceId),
      setState: (state) => setDeviceState(deviceId, state),
    });
  }, [deviceId, config]);

  // 监听运行状态
  const deviceState = getDeviceState(deviceId);
  const isRunning = deviceState?.running || false;

  useEffect(() => {
    if (rigidBodyRef.current) {
      // 设置传送带速度
      const speed = isRunning ? config.config.speed : 0;
      rigidBodyRef.current.setLinvel({ x: speed, y: 0, z: 0 }, true);
    }
  }, [isRunning, config.config.speed]);

  return (
    <group position={config.position} rotation={config.rotation || [0, 0, 0]}>
      <RigidBody
        ref={rigidBodyRef}
        type="fixed"
        colliders="cuboid"
        friction={0.8}
      >
        {/* 传送带物理体 */}
        <mesh receiveShadow>
          <boxGeometry
            args={[config.config.length, 0.2, config.config.width]}
          />
          <meshStandardMaterial color="#333" />
        </mesh>
      </RigidBody>

      {/* 传送带外观（独立于物理） */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry
          args={[config.config.length + 0.1, 0.05, config.config.width + 0.1]}
        />
        <meshStandardMaterial color="#555" wireframe />
      </mesh>
    </group>
  );
};
```

---

### 2.4 SceneManager 核心模块（新增）

```typescript
// src/core/scene-manager/index.ts
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import { SceneConfig } from "../../types/scene";

// ---------------------------
// 场景模块类型
// ---------------------------
export interface SceneModule {
  id: string;
  name: string;
  description: string;
  defaultConfig: SceneConfig;
  devices: DeviceComponentRegistry;
  behaviors?: BehaviorModule;
  scoring?: ScoringModule;
}

export interface DeviceComponentRegistry {
  [deviceType: string]: React.ComponentType<any>;
}

export interface BehaviorModule {
  onSceneLoad?: (config: SceneConfig) => void;
  handlers?: {
    [eventType: string]: (deviceId: string, data: any) => void;
  };
}

export interface ScoringModule {
  evaluate?: (config: SceneConfig, state: any) => void;
}

// ---------------------------
// 场景上下文
// ---------------------------
interface SceneContextValue {
  currentScene: SceneModule | null;
  currentConfig: SceneConfig | null;
  deviceStates: Map<string, any>;
  registerDevice: (deviceId: string, device: any) => void;
  getDeviceState: (deviceId: string) => any;
  setDeviceState: (deviceId: string, state: any) => void;
  emitEvent: (eventType: string, deviceId: string, data: any) => void;
}

const SceneContext = createContext<SceneContextValue | null>(null);

export const useSceneContext = () => {
  const ctx = useContext(SceneContext);
  if (!ctx) throw new Error("useSceneContext must be used within SceneManager");
  return ctx;
};

// ---------------------------
// SceneManager Provider
// ---------------------------
interface SceneManagerProps {
  scenes: SceneModule[];
  children: React.ReactNode;
}

export const SceneManager: React.FC<SceneManagerProps> = ({
  scenes,
  children,
}) => {
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  const [deviceStates, setDeviceStates] = useState<Map<string, any>>(
    new Map()
  );
  const [registeredDevices, setRegisteredDevices] = useState<
    Map<string, any>
  >(new Map());

  const currentScene = useMemo(
    () => scenes.find((s) => s.id === currentSceneId) || null,
    [scenes, currentSceneId]
  );

  const currentConfig = useMemo(
    () => currentScene?.defaultConfig || null,
    [currentScene]
  );

  // 注册设备
  const registerDevice = useCallback((deviceId: string, device: any) => {
    setRegisteredDevices((prev) => new Map(prev).set(deviceId, device));
  }, []);

  // 获取设备状态
  const getDeviceState = useCallback(
    (deviceId: string) => deviceStates.get(deviceId),
    [deviceStates]
  );

  // 设置设备状态
  const setDeviceState = useCallback((deviceId: string, state: any) => {
    setDeviceStates((prev) => {
      const newMap = new Map(prev);
      newMap.set(deviceId, state);
      return newMap;
    });
  }, []);

  // 发射事件
  const emitEvent = useCallback(
    (eventType: string, deviceId: string, data: any) => {
      currentScene?.behaviors?.handlers?.[eventType]?.(deviceId, data);
    },
    [currentScene]
  );

  const contextValue: SceneContextValue = {
    currentScene,
    currentConfig,
    deviceStates,
    registerDevice,
    getDeviceState,
    setDeviceState,
    emitEvent,
  };

  return (
    <SceneContext.Provider value={contextValue}>
      {/* 场景选择器 UI */}
      <SceneSelector
        scenes={scenes}
        currentSceneId={currentSceneId}
        onSelectScene={setCurrentSceneId}
      />

      {children}
    </SceneContext.Provider>
  );
};

// ---------------------------
// SceneRenderer 组件
// ---------------------------
interface SceneRendererProps {
  useNewPhysics?: boolean;
}

export const SceneRenderer: React.FC<SceneRendererProps> = ({
  useNewPhysics = true,
}) => {
  const { currentScene, currentConfig } = useSceneContext();

  if (!currentScene || !currentConfig) {
    return <div>请选择一个场景</div>;
  }

  const deviceComponents = currentConfig.devices.map((deviceConfig) => {
    const Component = currentScene.devices[deviceConfig.type];
    if (!Component) {
      console.warn(`Unknown device type: ${deviceConfig.type}`);
      return null;
    }
    return <Component key={deviceConfig.id} config={deviceConfig} />;
  });

  if (useNewPhysics) {
    return (
      <Physics gravity={currentConfig.physics.gravity}>
        {deviceComponents}
      </Physics>
    );
  } else {
    // 旧场景渲染（保持兼容）
    return <>{/* 旧 Scene 组件渲染逻辑 */}</>;
  }
};

// ---------------------------
// 场景选择器 UI
// ---------------------------
const SceneSelector: React.FC<{
  scenes: SceneModule[];
  currentSceneId: string | null;
  onSelectScene: (id: string) => void;
}> = ({ scenes, currentSceneId, onSelectScene }) => {
  return (
    <div className="fixed top-4 right-4 bg-slate-800/95 p-3 rounded-xl z-50">
      <div className="text-sm font-semibold text-slate-400 mb-2">选择场景</div>
      <div className="flex gap-2">
        {scenes.map((scene) => (
          <button
            key={scene.id}
            onClick={() => onSelectScene(scene.id)}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              currentSceneId === scene.id
                ? "bg-blue-500 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            {scene.name}
          </button>
        ))}
      </div>
    </div>
  );
};
```

---

## 三、传送带分拣场景配置示例

```json
// src/config/scenes/conveyor-sorting.json
{
  "id": "conveyor-sorting",
  "name": "传送带分拣",
  "description": "经典的传送带物料分拣场景，包含上料、色标检测、物料检测和两个分拣气缸",
  "version": "1.0.0",
  "author": "老徐",

  "physics": {
    "gravity": [0, -9.8, 0],
    "defaultMaterialFriction": 0.5,
    "defaultMaterialRestitution": 0.1
  },

  "devices": [
    {
      "id": "main-conveyor",
      "name": "主传送带",
      "type": "conveyor",
      "position": [0, 0, 0],
      "config": {
        "speed": 0.01,
        "length": 4,
        "width": 1
      }
    },
    {
      "id": "feed-cylinder",
      "name": "上料气缸",
      "type": "cylinder",
      "position": [-1.3, 1.12, 1.2],
      "config": {
        "direction": "z",
        "stroke": 0.625,
        "speed": 0.01,
        "limitZone": 0.04
      },
      "plcMapping": {
        "valve": "feedCylinderValve",
        "limitRetract": "magneticFeedRetract",
        "limitExtend": "magneticFeedExtend"
      }
    },
    {
      "id": "sorting1-cylinder",
      "name": "分拣气缸1",
      "type": "cylinder",
      "position": [-0.2, 1.12, 0.8],
      "config": {
        "direction": "z",
        "stroke": 0.55,
        "speed": 0.01,
        "limitZone": 0.04
      },
      "plcMapping": {
        "valve": "sorting1CylinderValve",
        "limitRetract": "magneticSorting1Retract",
        "limitExtend": "magneticSorting1Extend"
      }
    },
    {
      "id": "sorting2-cylinder",
      "name": "分拣气缸2",
      "type": "cylinder",
      "position": [0.9, 1.12, 0.8],
      "config": {
        "direction": "z",
        "stroke": 0.55,
        "speed": 0.01,
        "limitZone": 0.04
      },
      "plcMapping": {
        "valve": "sorting2CylinderValve",
        "limitRetract": "magneticSorting2Retract",
        "limitExtend": "magneticSorting2Extend"
      }
    },
    {
      "id": "feed-sensor",
      "name": "上料传感器",
      "type": "sensor",
      "position": [-1.3, 1.45, 0],
      "config": {
        "detectionRange": 0.15
      },
      "plcMapping": {
        "output": "sensorFeed"
      }
    },
    {
      "id": "color-sensor",
      "name": "色标传感器",
      "type": "sensor",
      "position": [-0.2, 1.45, 0],
      "config": {
        "detectionRange": 0.15,
        "triggerCondition": "material.color === 'black'"
      },
      "plcMapping": {
        "output": "sensorColor"
      }
    },
    {
      "id": "material-sensor",
      "name": "物料传感器",
      "type": "sensor",
      "position": [0.9, 1.45, 0],
      "config": {
        "detectionRange": 0.15
      },
      "plcMapping": {
        "output": "sensorMaterial"
      }
    },
    {
      "id": "material-table",
      "name": "物料台",
      "type": "materialTable",
      "position": [-1.3, 0.98, 0.6],
      "config": {
        "spawnPosition": [-1.3, 1.06, 0.6]
      }
    },
    {
      "id": "signal-tower",
      "name": "信号灯塔",
      "type": "signalTower",
      "position": [1.6, 0.98, -0.5],
      "config": {
        "lights": ["red", "green", "yellow"]
      },
      "plcMapping": {
        "red": "signalTowerRed",
        "green": "signalTowerGreen",
        "yellow": "signalTowerYellow"
      }
    }
  ],

  "plcMapping": {
    "modbus": {
      "start": 0,
      "reset": 1,
      "stop": 11,
      "feedCylinderValve": 100,
      "sorting1CylinderValve": 101,
      "sorting2CylinderValve": 102,
      "conveyor": 103,
      "signalTowerRed": 104,
      "signalTowerGreen": 105,
      "signalTowerYellow": 106,
      "sensorFeed": 8,
      "sensorColor": 9,
      "sensorMaterial": 10,
      "magneticFeedRetract": 2,
      "magneticFeedExtend": 3,
      "magneticSorting1Retract": 4,
      "magneticSorting1Extend": 5,
      "magneticSorting2Retract": 6,
      "magneticSorting2Extend": 7
    },
    "s7": {
      "start": "M10.0",
      "reset": "M10.1",
      "stop": "M21.0",
      "feedCylinderValve": "M100.0",
      "sorting1CylinderValve": "M101.0",
      "sorting2CylinderValve": "M102.0",
      "conveyor": "M103.0",
      "signalTowerRed": "M104.0",
      "signalTowerGreen": "M105.0",
      "signalTowerYellow": "M106.0",
      "sensorFeed": "M18.0",
      "sensorColor": "M19.0",
      "sensorMaterial": "M20.0",
      "magneticFeedRetract": "M12.0",
      "magneticFeedExtend": "M12.1",
      "magneticSorting1Retract": "M14.0",
      "magneticSorting1Extend": "M14.1",
      "magneticSorting2Retract": "M16.0",
      "magneticSorting2Extend": "M16.1"
    }
  },

  "scoring": {
    "modules": [
      {
        "id": "M1",
        "name": "复位测试",
        "maxPoints": 10,
        "subModules": [
          {
            "id": "M1S1",
            "name": "复位按钮触发",
            "isPrerequisite": true,
            "items": [
              {
                "id": "I1001",
                "name": "检测到复位信号",
                "points": 10,
                "condition": "signals.reset === true"
              }
            ]
          }
        ]
      }
    ]
  },

  "ui": {
    "showLabels": true,
    "defaultCameraPosition": [0, 5, 8]
  }
}
```

---

## 四、开发流程

### 阶段一：基础架构（场景管理器）

1. 创建 `src/core/scene-manager/` 模块
2. 定义完整的 `SceneConfig` TypeScript 类型
3. 实现 `SceneManager` Provider 和 `useSceneContext`
4. 实现 `SceneRenderer` 组件
5. 创建通用设备组件（GenericConveyor、GenericCylinder 等）

### 阶段二：迁移现有场景

1. 将现有传送带分拣场景提取为 `src/scenes/conveyor-sorting/` 模块
2. 创建 `conveyor-sorting.json` 配置文件
3. 在 `App.tsx` 中集成 `SceneManager`
4. 确保旧功能完全兼容

### 阶段三：开发新场景

当要开发新场景（如机械手）时：

1. 在 `src/scenes/` 下创建新目录 `robot-arm/`
2. 实现该场景的特定设备组件（如需要）
3. 创建场景配置文件 `robot-arm.json`
4. 在场景入口文件 `index.ts` 中注册
5. 实现该场景的行为逻辑和评分逻辑

---

## 五、优势总结

| 特性 | 说明 |
|------|------|
| **场景独立开发** | 每个场景在独立目录下开发，互不干扰 |
| **配置驱动** | JSON 配置定义设备布局、物理参数、评分规则，无需改代码 |
| **组件复用** | 通用设备组件可被多个场景复用 |
| **向后兼容** | 保留旧 Scene 组件，逐步迁移 |
| **易于扩展** | 新增场景只需添加新目录和配置 |
| **可测试性** | 每个场景可独立测试 |
