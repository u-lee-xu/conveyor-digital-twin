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
  s7Guide?: {
    title: string;
    description: string;
    addressMapping: S7AddressMapping[];
    configSections: S7ConfigSection[];
  };
}

export interface S7AddressMapping {
  name: string;
  modbusAddress: string;
  s7Address: string;
  description: string;
}

export const S7_ADDRESS_MAPPING: S7AddressMapping[] = [
  { name: '启动按钮', modbusAddress: 'M0', s7Address: 'M10.0', description: '按下启动按钮，系统开始自动运行' },
  { name: '复位按钮', modbusAddress: 'M1', s7Address: 'M10.1', description: '按下复位按钮，所有气缸缩回，传送带运行8秒清料' },
  { name: '上料气缸缩回限位', modbusAddress: 'M2', s7Address: 'M12.0', description: '上料气缸缩回到位时为 ON' },
  { name: '上料气缸伸出限位', modbusAddress: 'M3', s7Address: 'M12.1', description: '上料气缸伸出到位时为 ON' },
  { name: '分拣1气缸缩回限位', modbusAddress: 'M4', s7Address: 'M14.0', description: '分拣1气缸缩回到位时为 ON' },
  { name: '分拣1气缸伸出限位', modbusAddress: 'M5', s7Address: 'M14.1', description: '分拣1气缸伸出到位时为 ON' },
  { name: '分拣2气缸缩回限位', modbusAddress: 'M6', s7Address: 'M16.0', description: '分拣2气缸缩回到位时为 ON' },
  { name: '分拣2气缸伸出限位', modbusAddress: 'M7', s7Address: 'M16.1', description: '分拣2气缸伸出到位时为 ON' },
  { name: '上料传感器', modbusAddress: 'M8', s7Address: 'M18.0', description: '检测物料台上是否有物料，检测到物料时为 ON' },
  { name: '色标传感器', modbusAddress: 'M9', s7Address: 'M19.0', description: '检测物料颜色，检出黑色物料时为 ON，无法检出蓝色物料时为 OFF' },
  { name: '物料传感器', modbusAddress: 'M10', s7Address: 'M20.0', description: '检测物料是否到达分拣2位置，检测到物料时为 ON' },
  { name: '停止按钮', modbusAddress: 'M11', s7Address: 'M21.0', description: '按下停止按钮，系统停止运行' },
  { name: '上料气缸', modbusAddress: 'M100', s7Address: 'M100.0', description: '控制物料推送到传送带，ON 时气缸伸出' },
  { name: '分拣1气缸', modbusAddress: 'M101', s7Address: 'M101.0', description: '将物料推入1号分拣口，ON 时气缸伸出' },
  { name: '分拣2气缸', modbusAddress: 'M102', s7Address: 'M102.0', description: '将物料推入2号分拣口，ON 时气缸伸出' },
  { name: '传送带', modbusAddress: 'M103', s7Address: 'M103.0', description: '控制传送带的启动和停止，ON 时传送带运行' },
  { name: '信号灯塔-红灯', modbusAddress: 'M104', s7Address: 'M104.0', description: '控制信号灯塔红灯亮灭，ON 时红灯亮' },
  { name: '信号灯塔-绿灯', modbusAddress: 'M105', s7Address: 'M105.0', description: '控制信号灯塔绿灯亮灭，ON 时绿灯亮' },
  { name: '信号灯塔-黄灯', modbusAddress: 'M106', s7Address: 'M106.0', description: '控制信号灯塔黄灯亮灭，ON 时黄灯亮' },
];

export interface S7ConfigStep {
  text: string;
  detail?: string;
}

export interface S7ConfigSection {
  title: string;
  steps: S7ConfigStep[];
}

const S7_CONFIG_SECTIONS: S7ConfigSection[] = [
  {
    title: '第一步：博途项目配置',
    steps: [
      { text: '打开 TIA Portal，新建或打开已有项目', detail: '选择 S7-1200 或 S7-1500 系列 CPU' },
      { text: '在设备组态中双击 CPU，打开属性面板', detail: '在左侧导航树中找到"PROFINET 接口"' },
      { text: '配置以太网 IP 地址', detail: '在"以太网地址"选项卡中设置 IP（如 192.168.0.1），子网掩码 255.255.255.0' },
      { text: '开启 PUT/GET 通信权限', detail: '在"保护"选项卡中：安全等级选"完全访问"，勾选"允许来自远程对象的 PUT/GET 通信访问"' },
      { text: '编写 PLC 程序', detail: '参照下方 S7 地址映射表编写程序，输入用 M10.0~M21.0，输出用 M100.0~M106.0' },
      { text: '启动 PLCSIM 仿真并下载程序', detail: '点击"启动仿真"，将程序下载到 PLCSIM 中' },
    ],
  },
  {
    title: '第二步：NetToPLCSim 桥接配置',
    steps: [
      { text: '右键以管理员身份运行 NetToPLCSim', detail: '必须以管理员身份运行，否则无法桥接网络' },
      { text: '点击 "Add" 添加一条映射规则', detail: '如果 PLCSIM 已经在运行，NetToPLCSim 可能会自动检测到' },
      { text: '设置 Local IP（本机网卡 IP）', detail: '下拉选择你电脑的物理网卡 IP；如果只有本机使用，选 127.0.0.1' },
      { text: '设置 PLC IP（博途中配置的 PLC IP）', detail: '填写你在博途中给 CPU 设置的 IP 地址（如 192.168.0.1）' },
      { text: '确认 Rack 和 Slot', detail: 'S7-1200/1500 通常是 Rack=0, Slot=1，一般不需要修改' },
      { text: '点击 "Start Server" 启动桥接', detail: '状态栏应显示 "Running"，表示桥接已建立' },
    ],
  },
  {
    title: '第三步：数字孪生连接',
    steps: [
      { text: '打开数字孪生程序，切换到仿真模式或评分模式', detail: '' },
      { text: '在连接面板中选择"Siemens S7"协议', detail: '或直接选择预设"S7-1200/1500 仿真"' },
      { text: '确认 IP、端口、Rack、Slot 配置正确', detail: 'IP 填 NetToPLCSim 中设置的 Local IP，端口 102，Rack=0，Slot=1' },
      { text: '点击"连接"按钮', detail: '连接成功后状态指示灯变为绿色' },
    ],
  },
];

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
  ],
  s7Guide: {
    title: '西门子 S7 仿真配置指南',
    description: '通过 S7 协议连接西门子 PLC 仿真器，无需在博途中配置 Modbus Server。输入地址从 M10.0 开始，避开系统时钟位 MB0。',
    addressMapping: S7_ADDRESS_MAPPING,
    configSections: S7_CONFIG_SECTIONS
  }
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
