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

export type DevicePartId = 'serpentine' | 'acquisition' | 'battery' | 'esp32' | 'imu' | 'conditioning' | 'sensor' | 'power'

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
  { id: 'serpentine', label: '蛇形柔性走线', description: '关节处的蛇形段为弯曲保留形变余量，使线路随手指自然运动。', evidence: '论文图 2-3、EDA 柔性板工程', nodeNames: ['Serpentine'] },
  { id: 'acquisition', label: '手背采集模块', description: '集中承载采集、控制与无线传输相关电路。', evidence: '论文图 2-5、硬板 EDA 工程', nodeNames: ['DeviceRoot', 'CircuitModule'] },
  { id: 'conditioning', label: '信号调理区域', description: 'U1–U7 是七颗四运放，每颗处理四路输入。每组配有 4 个 RF 反馈电阻（0805）、4 个 CF 反馈电容和 4 个输入电阻（均为 0402）。', evidence: '第七版 PCB 实装记录：LM324PWR，TSSOP-14；共 28 路。', nodeNames: ['SignalConditioning'] },
  { id: 'esp32', label: 'ESP32 主控', description: '协调多路采样、数据封装与无线传输。', evidence: '论文图 2-5、ESP32-WROOM-32E 原理图', nodeNames: ['ESP32Module'] },
  { id: 'imu', label: 'IMU 姿态模块', description: '夹层中的 U41（JY60）测量手部整体姿态。模块两侧各有 6 个焊盘，与手指关节的检测电路独立。', evidence: '第七版柔性板 U41 封装；论文图 2-5(b)。', nodeNames: ['IMUModule'] },
  { id: 'battery', label: '内置电池', description: '100 mAh 锂电池放在手背双层板之间，通过腕侧的电极焊接区供电。拆解时可看到电池和它在夹层中的位置。', evidence: '论文图 2-5(b) 标注电池放置区和电极区，正文第 22 页给出容量。外形为示意。', nodeNames: ['BatteryModule'] },
  { id: 'power', label: '电源管理区域', description: 'U26（TP4057-MS）负责锂电池充电，U31（AIC1221-33GY3TR）提供 3.3 V 稳压。Q2（AO3401）和 D8、D9（PMEG3030EP）位于供电通路。', evidence: '第七版 PCB 的 U26、U31、Q2、D8、D9 与 VBAT+、VIN、3.3V 网络。', nodeNames: ['PowerManagement'] },
]

/** 返回与给定模型节点相匹配的器件；FingerFPC_*、Serpentine_* 等子节点使用前缀匹配。 */
export function getDevicePartByNodeName(nodeName: string) {
  return deviceParts.find((part) => part.nodeNames.some((name) => nodeName === name || nodeName.startsWith(`${name}_`)))
}
