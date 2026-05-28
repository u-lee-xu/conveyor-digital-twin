export interface PLCAddress {
  name: string;
  address: string;
  type: string;
  description: string;
}

export interface PLCSignal {
  inputs: PLCAddress[];
  outputs: PLCAddress[];
}

export interface ModeGuide {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  details: string[];
}

export interface PLCHelpContent {
  title: string;
  description: string;
  signals: PLCSignal;
  modeGuides: ModeGuide[];
  controlRequirements: string[];
}

export const PLC_HELP_CONTENT: PLCHelpContent = {
  title: '使用指南',
  description: '数字孪生传送带系统 — 使用说明与PLC地址映射',
  signals: {
    inputs: [
      {
        name: '启动按钮',
        address: 'M0',
        type: '输入',
        description: '按下启动按钮，系统开始自动运行'
      },
      {
        name: '复位按钮',
        address: 'M1',
        type: '输入',
        description: '按下复位按钮，所有气缸缩回，传送带运行8秒清料'
      },
      {
        name: '上料气缸缩回限位',
        address: 'M2',
        type: '输入',
        description: '上料气缸缩回到位时为 ON'
      },
      {
        name: '上料气缸伸出限位',
        address: 'M3',
        type: '输入',
        description: '上料气缸伸出到位时为 ON'
      },
      {
        name: '分拣1气缸缩回限位',
        address: 'M4',
        type: '输入',
        description: '分拣1气缸缩回到位时为 ON'
      },
      {
        name: '分拣1气缸伸出限位',
        address: 'M5',
        type: '输入',
        description: '分拣1气缸伸出到位时为 ON'
      },
      {
        name: '分拣2气缸缩回限位',
        address: 'M6',
        type: '输入',
        description: '分拣2气缸缩回到位时为 ON'
      },
      {
        name: '分拣2气缸伸出限位',
        address: 'M7',
        type: '输入',
        description: '分拣2气缸伸出到位时为 ON'
      },
      {
        name: '上料传感器',
        address: 'M8',
        type: '输入',
        description: '检测物料台上是否有物料，检测到物料时为 ON'
      },
      {
        name: '色标传感器',
        address: 'M9',
        type: '输入',
        description: '检测物料颜色，检出黑色物料时为 ON，无法检出蓝色物料时为 OFF'
      },
      {
        name: '物料传感器',
        address: 'M10',
        type: '输入',
        description: '检测物料是否到达分拣2位置，检测到物料时为 ON'
      },
      {
        name: '停止按钮',
        address: 'M11',
        type: '输入',
        description: '按下停止按钮，系统停止运行'
      }
    ],
    outputs: [
      {
        name: '上料气缸',
        address: 'M100',
        type: '输出',
        description: '控制物料推送到传送带，ON 时气缸伸出'
      },
      {
        name: '分拣1气缸',
        address: 'M101',
        type: '输出',
        description: '将物料推入1号分拣口，ON 时气缸伸出'
      },
      {
        name: '分拣2气缸',
        address: 'M102',
        type: '输出',
        description: '将物料推入2号分拣口，ON 时气缸伸出'
      },
      {
        name: '传送带',
        address: 'M103',
        type: '输出',
        description: '控制传送带的启动和停止，ON 时传送带运行'
      },
      {
        name: '信号灯塔-红灯',
        address: 'M104',
        type: '输出',
        description: '控制信号灯塔红灯亮灭，ON 时红灯亮'
      },
      {
        name: '信号灯塔-绿灯',
        address: 'M105',
        type: '输出',
        description: '控制信号灯塔绿灯亮灭，ON 时绿灯亮'
      },
      {
        name: '信号灯塔-黄灯',
        address: 'M106',
        type: '输出',
        description: '控制信号灯塔黄灯亮灭，ON 时黄灯亮'
      }
    ]
  },
  modeGuides: [
    {
      id: 'manual',
      name: '手动模式',
      icon: '🎮',
      color: 'blue',
      description: '手动操作了解气缸动作、传感器效果',
      details: [
        '手动控制传送带的启动与停止',
        '手动控制各个气缸的伸出与缩回',
        '手动生成和清除物料',
        '观察传感器在不同状态下的响应',
        '可用于了解设备基本动作和传感器工作原理'
      ]
    },
    {
      id: 'auto',
      name: '自动模式',
      icon: '🤖',
      color: 'purple',
      description: '演示PLC程序设计达到的控制效果',
      details: [
        '系统自动运行完整的物料分拣流程',
        '演示PLC程序控制下的自动化过程',
        '展示传感器检测、气缸动作的协调配合',
        '可作为编程参考，理解控制逻辑的执行效果',
        '可用于观察和学习自动控制流程'
      ]
    },
    {
      id: 'sim',
      name: '仿真模式',
      icon: '🔌',
      color: 'orange',
      description: '连接PLC或PLC仿真实现程序调试',
      details: [
        '通过 Modbus TCP 协议连接真实PLC或PLC仿真软件',
        '支持汇川 H5U、EASY 系列实体PLC和 AutoShop 仿真',
        '支持所有兼容 Modbus TCP 协议的PLC及仿真软件',
        '实时读取PLC输出信号控制3D场景中的设备',
        '实时将传感器状态反馈给PLC输入',
        '可用于PLC程序开发阶段的在线调试'
      ]
    },
    {
      id: 'scoring',
      name: '评分模式',
      icon: '🏆',
      color: 'green',
      description: '自动实现PLC程序评价',
      details: [
        '连接PLC后自动运行评分流程',
        '按照预设评分标准检测PLC程序的正确性',
        '自动记录各项评分指标的通过/失败状态',
        '实时显示得分和评分进度',
        '可用于实验考核和程序验证'
      ]
    }
  ],
  controlRequirements: [
    '按下复位按钮，所有气缸缩回，传送带运行8秒清料后停止。',
    '按下启动按钮，上料气缸推出上料；上料传感器检出有物料推出后，传送带开始运行。',
    '物料随传送带运行至色标传感器位置，色标传感器检测物料颜色：可检出黑色物料（ON），无法检出蓝色物料（OFF）。',
    '黑色物料被色标传感器检出后，到达分拣1位置时，分拣1气缸推出将物料推入1号分拣口。',
    '蓝色物料无法被色标传感器检出，继续运行至分拣2位置，物料传感器检测到物料后，分拣2气缸推出将物料推入2号分拣口。',
    '运行状态下信号灯塔绿灯亮；复位清料过程中信号灯塔黄灯亮；停止状态下信号灯塔红灯亮。'
  ]
};

export const getInputAddress = (name: string): string | undefined => {
  const input = PLC_HELP_CONTENT.signals.inputs.find(i => i.name === name);
  return input?.address;
};

export const getOutputAddress = (name: string): string | undefined => {
  const output = PLC_HELP_CONTENT.signals.outputs.find(o => o.name === name);
  return output?.address;
};

export const getAllAddresses = (): { input: PLCAddress[]; output: PLCAddress[] } => {
  return {
    input: PLC_HELP_CONTENT.signals.inputs,
    output: PLC_HELP_CONTENT.signals.outputs
  };
};
