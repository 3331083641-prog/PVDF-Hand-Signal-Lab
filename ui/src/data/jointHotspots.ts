export type JointId =
  | 'T2' | 'T1'
  | 'I3' | 'I2' | 'I1'
  | 'M3' | 'M2' | 'M1'
  | 'R3' | 'R2' | 'R1'
  | 'L3' | 'L2' | 'L1'

export type FlexAxis = 'x' | 'y' | 'z'

export type JointHotspot = {
  id: JointId
  label: string
  shortLabel: string
  finger: '拇指' | '食指' | '中指' | '无名指' | '小指'
  joint: 'IP' | 'MCP' | 'PIP' | 'DIP'
  channel: number
  /** 两路原始 PVDF 电压在 28 路帧中的一基序号。 */
  rawChannels: readonly [number, number]
  differential: string
  /** GLB 中实际受控的关节骨骼。 */
  boneNode: string
  /** GLB 中可点击、可高亮的检测单元语义节点。 */
  sensorNode: `Sensor_${JointId}`
  /** 与论文解剖学关节命名一致的 GLB 语义锚点。 */
  anatomicalNode: string
  /** 骨骼局部坐标中的屈曲轴与方向，由模型导出规范统一保证。 */
  flexAxis: FlexAxis
  flexSign: 1 | -1
  role: string
}

/**
 * HSAD 的唯一关节、通道与模型节点模式表。
 * 顺序严格对应论文与上位机：D1~D14 共 14 路差分有效信号，
 * 每路由两路 PVDF 原始电压构成（共 28 路）。ESP32 的 acquire28Channels()
 * 已把同一 ADC 引脚在 TMUX LOW/HIGH bank 的结果交错写入 output[2*i]
 * 与 output[2*i+1]，因此串口 CSV 中每个传感器始终是相邻字段。此处 CH
 * 指固件输出字段，而不是硬板网络编号，不能再次按 EDA 网络重排。
 */
export const jointHotspots: JointHotspot[] = [
  { id: 'T2', label: '拇指指间关节 IP', shortLabel: '拇指 IP', finger: '拇指', joint: 'IP', channel: 1, rawChannels: [1, 2], differential: 'D1', boneNode: 'Thumb_IP', sensorNode: 'Sensor_T2', anatomicalNode: 'Thumb_IP_Sensor', flexAxis: 'x', flexSign: -1, role: '捕捉拇指远端屈伸产生的动态形变。' },
  { id: 'T1', label: '拇指掌指关节 MCP', shortLabel: '拇指 MCP', finger: '拇指', joint: 'MCP', channel: 2, rawChannels: [3, 4], differential: 'D2', boneNode: 'Thumb_MCP', sensorNode: 'Sensor_T1', anatomicalNode: 'Thumb_MCP_Sensor', flexAxis: 'x', flexSign: -1, role: '捕捉拇指根部屈伸产生的动态形变。' },
  { id: 'I3', label: '食指远端关节 DIP', shortLabel: '食指 DIP', finger: '食指', joint: 'DIP', channel: 3, rawChannels: [5, 6], differential: 'D3', boneNode: 'Index_DIP', sensorNode: 'Sensor_I3', anatomicalNode: 'Index_DIP_Sensor', flexAxis: 'x', flexSign: -1, role: '捕捉食指远端关节的弯曲变化。' },
  { id: 'I2', label: '食指近端关节 PIP', shortLabel: '食指 PIP', finger: '食指', joint: 'PIP', channel: 4, rawChannels: [7, 8], differential: 'D4', boneNode: 'Index_PIP', sensorNode: 'Sensor_I2', anatomicalNode: 'Index_PIP_Sensor', flexAxis: 'x', flexSign: -1, role: '捕捉食指中段主要屈曲变化。' },
  { id: 'I1', label: '食指掌指关节 MCP', shortLabel: '食指 MCP', finger: '食指', joint: 'MCP', channel: 5, rawChannels: [9, 10], differential: 'D5', boneNode: 'Index_MCP', sensorNode: 'Sensor_I1', anatomicalNode: 'Index_MCP_Sensor', flexAxis: 'x', flexSign: -1, role: '捕捉食指根部屈曲变化。' },
  { id: 'M3', label: '中指远端关节 DIP', shortLabel: '中指 DIP', finger: '中指', joint: 'DIP', channel: 6, rawChannels: [11, 12], differential: 'D6', boneNode: 'Middle_DIP', sensorNode: 'Sensor_M3', anatomicalNode: 'Middle_DIP_Sensor', flexAxis: 'x', flexSign: -1, role: '捕捉中指远端关节的弯曲变化。' },
  { id: 'M2', label: '中指近端关节 PIP', shortLabel: '中指 PIP', finger: '中指', joint: 'PIP', channel: 7, rawChannels: [13, 14], differential: 'D7', boneNode: 'Middle_PIP', sensorNode: 'Sensor_M2', anatomicalNode: 'Middle_PIP_Sensor', flexAxis: 'x', flexSign: -1, role: '捕捉中指中段主要屈曲变化。' },
  { id: 'M1', label: '中指掌指关节 MCP', shortLabel: '中指 MCP', finger: '中指', joint: 'MCP', channel: 8, rawChannels: [15, 16], differential: 'D8', boneNode: 'Middle_MCP', sensorNode: 'Sensor_M1', anatomicalNode: 'Middle_MCP_Sensor', flexAxis: 'x', flexSign: -1, role: '捕捉中指根部屈曲变化。' },
  { id: 'R3', label: '无名指远端关节 DIP', shortLabel: '无名指 DIP', finger: '无名指', joint: 'DIP', channel: 9, rawChannels: [17, 18], differential: 'D9', boneNode: 'Ring_DIP', sensorNode: 'Sensor_R3', anatomicalNode: 'Ring_DIP_Sensor', flexAxis: 'x', flexSign: -1, role: '捕捉无名指远端关节的弯曲变化。' },
  { id: 'R2', label: '无名指近端关节 PIP', shortLabel: '无名指 PIP', finger: '无名指', joint: 'PIP', channel: 10, rawChannels: [19, 20], differential: 'D10', boneNode: 'Ring_PIP', sensorNode: 'Sensor_R2', anatomicalNode: 'Ring_PIP_Sensor', flexAxis: 'x', flexSign: -1, role: '捕捉无名指中段主要屈曲变化。' },
  { id: 'R1', label: '无名指掌指关节 MCP', shortLabel: '无名指 MCP', finger: '无名指', joint: 'MCP', channel: 11, rawChannels: [21, 22], differential: 'D11', boneNode: 'Ring_MCP', sensorNode: 'Sensor_R1', anatomicalNode: 'Ring_MCP_Sensor', flexAxis: 'x', flexSign: -1, role: '捕捉无名指根部屈曲变化。' },
  { id: 'L3', label: '小指远端关节 DIP', shortLabel: '小指 DIP', finger: '小指', joint: 'DIP', channel: 12, rawChannels: [23, 24], differential: 'D12', boneNode: 'Little_DIP', sensorNode: 'Sensor_L3', anatomicalNode: 'Little_DIP_Sensor', flexAxis: 'x', flexSign: -1, role: '捕捉小指远端关节的弯曲变化。' },
  { id: 'L2', label: '小指近端关节 PIP', shortLabel: '小指 PIP', finger: '小指', joint: 'PIP', channel: 13, rawChannels: [25, 26], differential: 'D13', boneNode: 'Little_PIP', sensorNode: 'Sensor_L2', anatomicalNode: 'Little_PIP_Sensor', flexAxis: 'x', flexSign: -1, role: '捕捉小指中段主要屈曲变化。' },
  { id: 'L1', label: '小指掌指关节 MCP', shortLabel: '小指 MCP', finger: '小指', joint: 'MCP', channel: 14, rawChannels: [27, 28], differential: 'D14', boneNode: 'Little_MCP', sensorNode: 'Sensor_L1', anatomicalNode: 'Little_MCP_Sensor', flexAxis: 'x', flexSign: -1, role: '捕捉小指根部屈曲变化。' },
]

export const jointById = new Map<JointId, JointHotspot>(jointHotspots.map((joint) => [joint.id, joint]))
export const jointBySensorNode = new Map<string, JointHotspot>(jointHotspots.map((joint) => [joint.sensorNode, joint]))

export const jointChannelMap = new Map(jointHotspots.map((joint) => [joint.id, {
  rawChannelPair: joint.rawChannels,
  differentialChannel: joint.differential,
}]))

export const modelNodeMap = new Map(jointHotspots.map((joint) => [joint.id, {
  boneName: joint.boneNode,
  modelNodeName: joint.sensorNode,
  anatomicalNodeName: joint.anatomicalNode,
  highlightNodeName: `Highlight_${joint.id}`,
}]))

export const sensorMetadata = jointHotspots.map((joint) => ({
  anatomicalName: joint.label,
  shortId: joint.id,
  finger: joint.finger,
  jointType: joint.joint,
  boneName: joint.boneNode,
  rawChannelPair: joint.rawChannels,
  differentialChannel: joint.differential,
  modelNodeName: joint.sensorNode,
  anatomicalNodeName: joint.anatomicalNode,
}))

export type DevicePartId = 'fpc' | 'serpentine' | 'acquisition' | 'battery' | 'esp32' | 'imu' | 'conditioning' | 'sensor' | 'power' | 'mux' | 'serial'

export type DevicePart = {
  id: DevicePartId
  label: string
  description: string
  evidence: string
  /** 精确节点名或节点名前缀；用于 raycast、聚焦与高亮。 */
  nodeNames: readonly string[]
}

export const deviceParts: DevicePart[] = [
  { id: 'sensor', label: '双层 PVDF 检测单元', description: '同一关节处的两层 PVDF 以相反极性响应，形成一对原始信号。', evidence: '论文图 2-2、图 2-10', nodeNames: ['SensorGroup'] },
  { id: 'fpc', label: '柔性 FPC', description: '主柔性板与五条指部支路共同承载检测单元和信号走线。', evidence: '论文图 2-3、EDA 柔性板工程', nodeNames: ['MainFPC', 'FingerFPC'] },
  { id: 'serpentine', label: '蛇形柔性走线', description: '相邻感应片之间的镂空蛇形段在屈指时展开，为手背皮肤的伸长留出余量。', evidence: '毕业论文图 2-4a、b', nodeNames: ['Serpentine'] },
  { id: 'acquisition', label: '手背采集模块', description: '集中承载采集、控制与无线传输相关电路。', evidence: '论文图 2-5、硬板 EDA 工程', nodeNames: ['DeviceRoot', 'CircuitModule'] },
  { id: 'conditioning', label: '信号调理区域', description: '手背靠指根的两排芯片组成电荷放大阵列，将 PVDF 产生的电荷转换为可采集的电压。', evidence: '论文图 2-5、P1 电荷放大原理图', nodeNames: ['SignalConditioning'] },
  { id: 'esp32', label: 'ESP32 主控', description: '腕侧偏小指方向的金属屏蔽罩覆盖 ESP32 模组，模组负责采样、数据封装与无线传输。', evidence: '论文图 2-5、ESP32-WROOM-32E 原理图', nodeNames: ['ESP32Module'] },
  { id: 'imu', label: 'IMU 姿态模块', description: '手背双层 FPC 之间、靠指根的一侧装有 JY60。它经串口向 ESP32 发送手腕姿态。', evidence: '夹层透视 · 毕业论文图 2-5b、图 2-8', nodeNames: ['IMUModule'] },
  { id: 'battery', label: '内置电池', description: '薄型锂电池位于手背 FPC 夹层靠腕侧，电极连接充放电电路，为装置供电。', evidence: '夹层透视 · 毕业论文图 2-5b', nodeNames: ['BatteryModule'] },
  { id: 'mux', label: '模拟多路复用器', description: '屏蔽罩两侧的窄封装芯片负责切换模拟输入，让多路调理后的信号依次进入采样电路。', evidence: '毕业论文图 2-5a、图 2-7b', nodeNames: ['MuxPackage'] },
  { id: 'serial', label: '串口下载电路', description: '金属罩靠小指一侧的电路用于串口传输与程序下载。', evidence: '毕业论文图 2-5a', nodeNames: ['SerialPackage'] },
  { id: 'power', label: '电源管理区域', description: '腕侧靠拇指方向的充放电与供电器件连接夹层电池。', evidence: '硬板 EDA 电源与充电管理区域', nodeNames: ['PowerManagement'] },
]

/** 返回与给定模型节点相匹配的器件；FingerFPC_*、Serpentine_* 等子节点使用前缀匹配。 */
export function getDevicePartByNodeName(nodeName: string) {
  return deviceParts.find((part) => part.nodeNames.some((name) => nodeName === name || nodeName.startsWith(`${name}_`)))
}
