export type SignalSourceMode = 'teaching' | 'serial'

export type MotionPhase = '静止' | '弯曲' | '保持' | '伸展' | '恢复'

export type SignalDisplayMode = 'raw' | 'differential'

export type JointSignalConfig = {
  jointId: string
  /** 教学标定值：角度增量 / 电压时间积分，待真实 0°→90° 校准替换。 */
  calibrationGain: number
  polarity: 1 | -1
  noiseScale: number
}

export type SignalSample = {
  time: number
  vPlus: number
  vMinus: number
  differential: number
  filtered: number
  siaAngle: number
  physicalAngle: number
  phase: MotionPhase
  thresholdTriggered: boolean
}

export type SignalMetrics = {
  currentVPlus: number
  currentVMinus: number
  currentDifferential: number
  peak: number
  valley: number
  vpp: number
  sampleRate: number
  phase: MotionPhase
  thresholdTriggered: boolean
  siaAngle: number
}

export type SignalEngineOptions = {
  jointId: string
  seed?: number
  sampleRate?: number
  threshold?: number
  speedDegPerSecond?: number
}

export const TEACHING_JOINT_CONFIGS: JointSignalConfig[] = [
  ['T2', 158, 1, 0.92], ['T1', 166, 1, 1.02],
  ['I3', 174, 1, 0.88], ['I2', 168, 1, 0.96], ['I1', 181, 1, 1.08],
  ['M3', 172, 1, 0.90], ['M2', 164, 1, 0.98], ['M1', 178, 1, 1.04],
  ['R3', 176, 1, 0.93], ['R2', 169, 1, 1.01], ['R1', 184, 1, 1.10],
  ['L3', 171, 1, 0.95], ['L2', 162, 1, 1.06], ['L1', 179, 1, 1.12],
].map(([jointId, calibrationGain, polarity, noiseScale]) => ({
  jointId: jointId as string,
  calibrationGain: calibrationGain as number,
  polarity: polarity as 1,
  noiseScale: noiseScale as number,
}))

export const getJointSignalConfig = (jointId: string) =>
  TEACHING_JOINT_CONFIGS.find((config) => config.jointId === jointId) ?? TEACHING_JOINT_CONFIGS[0]
