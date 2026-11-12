import { jointHotspots } from './jointHotspots'

export type JointAngles = Record<string, number>

const uniform = (value: number): JointAngles => Object.fromEntries(jointHotspots.map((joint) => [joint.id, value]))

export const mappingPresets = {
  open: { label: '张开', angles: uniform(4) },
  // 教学握拳按关节层级分配角度，避免 MCP/PIP/DIP 同时接近 90°
  // 导致累计约 270° 的不自然过卷。
  fist: {
    label: '握拳',
    angles: {
      T1: 48, T2: 58,
      I1: 70, I2: 86, I3: 54,
      M1: 72, M2: 88, M3: 56,
      R1: 70, R2: 86, R3: 54,
      L1: 66, L2: 82, L3: 50,
    },
  },
  index: { label: '食指弯曲', angles: { ...uniform(8), I1: 70, I2: 84, I3: 54 } },
  cascade: { label: '连续弯曲', angles: uniform(36) },
} as const

export const defaultJointAngles = mappingPresets.open.angles
