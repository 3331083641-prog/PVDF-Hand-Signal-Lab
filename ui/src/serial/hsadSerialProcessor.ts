import { jointHotspots, type JointId } from '../data/jointHotspots'
import { getJointSignalConfig, type MotionPhase, type SignalMetrics, type SignalSample } from '../simulation/signalTypes'

export const HSAD_BAUD_RATE = 460_800
export const HSAD_SAMPLE_RATE = 80
export const HSAD_FRAME_FIELDS = 31
export const HSAD_SENSOR_COUNT = 14
const BASELINE_SECONDS = 2
const MIN_INTEGRATION_THRESHOLD_V = 0.0025
const MAX_INTEGRATION_THRESHOLD_V = 0.010
const NOISE_THRESHOLD_MULTIPLIER = 2.0
const TRIGGER_HOLD_FRAMES = 2
const RELEASE_THRESHOLD_RATIO = 0.45
const MIN_POLARITY_DETECTION_V = 0.005
const PROVISIONAL_GAIN_NUMERATOR = 18
const MIN_PROVISIONAL_GAIN = 1_400
const MAX_PROVISIONAL_GAIN = 4_500
// 对慢漂持续作限速跟踪。旧逻辑只在 |残差|<8 mV 时更新；一旦温漂越界便
// 永远无法回零，最终把静止状态积分到 90°。限幅步进不会追随快速压电脉冲。
const BASELINE_TRACK_ALPHA_QUIET = 0.003
const BASELINE_TRACK_ALPHA_MOTION = 0.00015
const BASELINE_TRACK_STEP_LIMIT_V = 0.025
const HISTORY_LENGTH = HSAD_SAMPLE_RATE * 4
// v4 恢复固件真实的 LOW/HIGH 交错相邻配对；旧错误映射与标定不可复用。
const STORAGE_KEY = 'hsad-serial-calibration-interleaved-map-v4'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const robustSigma = (values: number[], center: number) => 1.4826 * median(values.map((value) => Math.abs(value - center)))

type StoredCalibration = {
  gains: number[]
  calibrated: boolean[]
  pairSigns: number[]
  polarityKnown: boolean[]
  sourceMap: number[]
  mappingCalibrated: boolean[]
}

export type JointMappingResult = {
  targetJointId: JointId
  sourceJointId: JointId
  rawChannels: readonly [number, number]
  confidence: number
  peak: number
}

export type SerialProcessorSnapshot = {
  histories: Record<JointId, SignalSample[]>
  angles: Record<JointId, number>
  orientation: { pitch: number; yaw: number; roll: number }
  baselineReady: boolean
  baselineProgress: number
  sampleRate: number
  validFrames: number
  invalidFrames: number
  calibratedCount: number
  calibrationJoint: JointId | null
  mappingCalibrationJoint: JointId | null
  mappingCalibratedCount: number
  sourceMap: Record<JointId, JointId>
  rawChannelPairs: Record<JointId, readonly [number, number]>
  integrationThresholds: Record<JointId, number>
  channelWarnings: Record<JointId, string | null>
}

const emptyHistories = () => Object.fromEntries(jointHotspots.map((joint) => [joint.id, [] as SignalSample[]])) as unknown as Record<JointId, SignalSample[]>

export class HsadSerialProcessor {
  private readonly histories = emptyHistories()
  private readonly baseline = Array(HSAD_SENSOR_COUNT).fill(0) as number[]
  private readonly integrationThresholds = Array(HSAD_SENSOR_COUNT).fill(MIN_INTEGRATION_THRESHOLD_V) as number[]
  private baselineFrames: number[][] = []
  private baselineStartedAt = 0
  private baselineReady = false
  private baselineProgress = 0
  private readonly angles = Array(HSAD_SENSOR_COUNT).fill(0) as number[]
  private readonly previousSignal = Array(HSAD_SENSOR_COUNT).fill(0) as number[]
  private readonly previousStage = Array(HSAD_SENSOR_COUNT).fill(0) as number[]
  private readonly triggerCounts = Array(HSAD_SENSOR_COUNT).fill(0) as number[]
  private readonly holdStartedAt = Array(HSAD_SENSOR_COUNT).fill(Number.NaN) as number[]
  private readonly frameTimes: number[] = []
  private lastFrameAt = 0
  private elapsed = 0
  private validFrames = 0
  private invalidFrames = 0
  private orientation = { pitch: 0, yaw: 0, roll: 0 }
  private gains = jointHotspots.map((joint) => getJointSignalConfig(joint.id).calibrationGain)
  private calibrated = Array(HSAD_SENSOR_COUNT).fill(false) as boolean[]
  private pairSigns = Array(HSAD_SENSOR_COUNT).fill(1) as number[]
  private polarityKnown = Array(HSAD_SENSOR_COUNT).fill(false) as boolean[]
  // target anatomy index -> physical differential source index. The FPC/EDA order is
  // the safe default; the assembled device can be identified non-destructively in UI.
  private sourceMap = jointHotspots.map((_, index) => index)
  private mappingCalibrated = Array(HSAD_SENSOR_COUNT).fill(false) as boolean[]
  private calibrationIndex: number | null = null
  private calibrationArea = 0
  private calibrationPrevious = 0
  private mappingCalibrationIndex: number | null = null
  private mappingEnergy = Array(HSAD_SENSOR_COUNT).fill(0) as number[]
  private mappingPeaks = Array(HSAD_SENSOR_COUNT).fill(0) as number[]
  private mappingSamples = 0

  constructor() { this.loadCalibration() }

  private loadCalibration() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as StoredCalibration
      if (parsed.gains?.length === 14) this.gains = parsed.gains.map((value, index) => value > 0 ? value : this.gains[index])
      if (parsed.calibrated?.length === 14) this.calibrated = parsed.calibrated.map(Boolean)
      if (parsed.pairSigns?.length === 14) this.pairSigns = parsed.pairSigns.map((value) => value < 0 ? -1 : 1)
      if (parsed.polarityKnown?.length === 14) this.polarityKnown = parsed.polarityKnown.map(Boolean)
      if (parsed.sourceMap?.length === 14 && new Set(parsed.sourceMap).size === 14 && parsed.sourceMap.every((value) => Number.isInteger(value) && value >= 0 && value < 14)) {
        this.sourceMap = [...parsed.sourceMap]
      }
      if (parsed.mappingCalibrated?.length === 14) this.mappingCalibrated = parsed.mappingCalibrated.map(Boolean)
    } catch { /* 首次使用没有本地标定记录。 */ }
  }

  private saveCalibration() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ gains: this.gains, calibrated: this.calibrated, pairSigns: this.pairSigns, polarityKnown: this.polarityKnown, sourceMap: this.sourceMap, mappingCalibrated: this.mappingCalibrated }))
  }

  noteInvalidFrame() { this.invalidFrames += 1 }

  rebaseline(now = performance.now() / 1000) {
    this.baselineReady = false
    this.baselineProgress = 0
    this.baselineFrames = []
    this.baselineStartedAt = now
    this.baseline.fill(0)
    this.mappingCalibrationIndex = null
    this.mappingEnergy.fill(0)
    this.mappingPeaks.fill(0)
    this.mappingSamples = 0
  }

  resetAngles() {
    this.angles.fill(0)
    this.previousSignal.fill(0)
    this.previousStage.fill(0)
    this.triggerCounts.fill(0)
    this.holdStartedAt.fill(Number.NaN)
  }

  startAngleCalibration(jointId: JointId) {
    if (!this.baselineReady) throw new Error('请先保持手部静止，等待零点校准完成。')
    this.calibrationIndex = jointHotspots.findIndex((joint) => joint.id === jointId)
    this.calibrationArea = 0
    this.calibrationPrevious = 0
    this.angles[this.calibrationIndex] = 0
  }

  finishAngleCalibration() {
    if (this.calibrationIndex === null) throw new Error('当前没有正在进行的关节标定。')
    const index = this.calibrationIndex
    this.calibrationIndex = null
    if (this.calibrationArea <= 1e-5) throw new Error('标定积分面积过小，请检查极性并重新完成一次 0°→90° 连续弯曲。')
    this.gains[index] = 90 / this.calibrationArea
    this.calibrated[index] = true
    this.polarityKnown[index] = true
    this.angles[index] = 90
    this.saveCalibration()
    return this.gains[index]
  }

  flipPolarity(jointId: JointId) {
    const index = jointHotspots.findIndex((joint) => joint.id === jointId)
    this.pairSigns[index] *= -1
    this.polarityKnown[index] = true
    this.saveCalibration()
    this.rebaseline()
  }

  startJointMapping(jointId: JointId) {
    if (!this.baselineReady) throw new Error('请先保持手部静止，等待零点校准完成。')
    const index = jointHotspots.findIndex((joint) => joint.id === jointId)
    if (index < 0) throw new Error('未找到目标关节。')
    this.mappingCalibrationIndex = index
    this.mappingEnergy.fill(0)
    this.mappingPeaks.fill(0)
    this.mappingSamples = 0
  }

  finishJointMapping(): JointMappingResult {
    if (this.mappingCalibrationIndex === null) throw new Error('当前没有正在识别的关节。')
    const targetIndex = this.mappingCalibrationIndex
    if (this.mappingSamples < HSAD_SAMPLE_RATE) throw new Error('采集时间过短，请连续弯曲目标关节 3 次后再完成识别。')

    const ranked = this.mappingEnergy
      .map((energy, sourceIndex) => ({ energy, sourceIndex, peak: this.mappingPeaks[sourceIndex] }))
      .sort((a, b) => b.energy - a.energy)
    const best = ranked[0]
    const second = ranked[1]
    const confidence = best.energy / Math.max(second.energy, 1e-9)
    if (best.peak < 0.004) throw new Error('没有检测到足够明显的压电响应。请加快弯曲速度，并确认该关节两路原始电压正常。')
    if (confidence < 1.12) throw new Error('多个通道同时响应，无法可靠判断。请固定其他手指，只弯曲目标关节后重试。')
    this.mappingCalibrationIndex = null

    // Keep a one-to-one permutation. If the detected source was occupied, swap the
    // previous source into that target instead of creating duplicate virtual motion.
    const previousSource = this.sourceMap[targetIndex]
    const occupiedTarget = this.sourceMap.indexOf(best.sourceIndex)
    this.sourceMap[targetIndex] = best.sourceIndex
    if (occupiedTarget >= 0 && occupiedTarget !== targetIndex) {
      this.sourceMap[occupiedTarget] = previousSource
      this.mappingCalibrated[occupiedTarget] = false
      this.calibrated[occupiedTarget] = false
      this.polarityKnown[occupiedTarget] = false
      this.pairSigns[occupiedTarget] = 1
    }
    this.mappingCalibrated[targetIndex] = true
    this.calibrated[targetIndex] = false
    this.polarityKnown[targetIndex] = false
    this.pairSigns[targetIndex] = 1
    this.resetAngles()
    this.saveCalibration()

    return {
      targetJointId: jointHotspots[targetIndex].id,
      sourceJointId: jointHotspots[best.sourceIndex].id,
      rawChannels: jointHotspots[best.sourceIndex].rawChannels,
      confidence,
      peak: best.peak,
    }
  }

  process(values: number[], now = performance.now() / 1000) {
    if (values.length !== HSAD_FRAME_FIELDS || values.some((value) => !Number.isFinite(value))) {
      this.noteInvalidFrame()
      return false
    }
    const raw28 = values.slice(0, 28)
    if (raw28.some((value) => value < -0.05 || value > 3.4)) {
      this.noteInvalidFrame()
      return false
    }

    const dt = this.lastFrameAt ? clamp(now - this.lastFrameAt, 0.005, 0.05) : 1 / HSAD_SAMPLE_RATE
    this.lastFrameAt = now
    this.elapsed += dt
    this.validFrames += 1
    this.frameTimes.push(now)
    while (this.frameTimes.length > 160 || (this.frameTimes[0] && now - this.frameTimes[0] > 2)) this.frameTimes.shift()

    // 固件 acquire28Channels() 已把每个 ADC 引脚的 LOW/HIGH bank 交错写入
    // 连续两个字段；网页必须按相邻字段配对，不能再次按硬板网络重排。
    const sourceSignals = jointHotspots.map((joint) => {
      const [plusChannel, minusChannel] = joint.rawChannels
      return (raw28[plusChannel - 1] - raw28[minusChannel - 1]) / 2
    })
    if (!this.baselineReady) {
      if (!this.baselineStartedAt) this.baselineStartedAt = now
      this.baselineFrames.push(sourceSignals)
      this.baselineProgress = clamp((now - this.baselineStartedAt) / BASELINE_SECONDS, 0, 1)
      if (this.baselineProgress >= 1 && this.baselineFrames.length >= 20) {
        // 只取校准窗末段，避开串口打开或 ESP32 复位后的滤波器起始过渡。
        const settledFrames = this.baselineFrames.slice(-HSAD_SAMPLE_RATE)
        for (let index = 0; index < HSAD_SENSOR_COUNT; index += 1) {
          const samples = settledFrames.map((frame) => frame[index])
          this.baseline[index] = median(samples)
          this.integrationThresholds[index] = clamp(
            robustSigma(samples, this.baseline[index]) * NOISE_THRESHOLD_MULTIPLIER,
            MIN_INTEGRATION_THRESHOLD_V,
            MAX_INTEGRATION_THRESHOLD_V,
          )
        }
        this.baselineFrames = []
        this.baselineReady = true
        this.baselineProgress = 1
      }
    }

    const sourceZeroed = sourceSignals.map((signal, sourceIndex) => {
      if (this.baselineReady) {
        const residual = signal - this.baseline[sourceIndex]
        const quietLimit = Math.max(0.008, this.integrationThresholds[sourceIndex] * 1.4)
        const alpha = Math.abs(residual) <= quietLimit ? BASELINE_TRACK_ALPHA_QUIET : BASELINE_TRACK_ALPHA_MOTION
        const drift = clamp(residual, -BASELINE_TRACK_STEP_LIMIT_V, BASELINE_TRACK_STEP_LIMIT_V)
        this.baseline[sourceIndex] += alpha * drift
      }
      return this.baselineReady ? signal - this.baseline[sourceIndex] : 0
    })

    if (this.mappingCalibrationIndex !== null && this.baselineReady) {
      this.mappingSamples += 1
      for (let sourceIndex = 0; sourceIndex < HSAD_SENSOR_COUNT; sourceIndex += 1) {
        const magnitude = Math.abs(sourceZeroed[sourceIndex])
        const noiseFloor = this.integrationThresholds[sourceIndex] * 0.5
        const excess = Math.max(0, magnitude - noiseFloor)
        this.mappingEnergy[sourceIndex] += excess * excess * dt
        this.mappingPeaks[sourceIndex] = Math.max(this.mappingPeaks[sourceIndex], magnitude)
      }
    }

    const stages: MotionPhase[] = []
    for (let index = 0; index < HSAD_SENSOR_COUNT; index += 1) {
      const sourceIndex = this.sourceMap[index]
      const threshold = this.integrationThresholds[sourceIndex]
      const polarityDetectionThreshold = Math.max(MIN_POLARITY_DETECTION_V, threshold * 1.5)
      if (!this.polarityKnown[index] && Math.abs(sourceZeroed[sourceIndex]) >= polarityDetectionThreshold) {
        // Baseline is established with the hand open. The first intentional pulse is
        // therefore treated as flexion, allowing opposite PVDF/electrode mounting
        // polarities to work without silently clamping the angle at zero.
        this.pairSigns[index] = sourceZeroed[sourceIndex] >= 0 ? 1 : -1
        this.polarityKnown[index] = true
        this.saveCalibration()
      }
      const zeroed = sourceZeroed[sourceIndex] * this.pairSigns[index]
      // ESP32 固件已对 28 路电压执行二阶 6 Hz 低通；浏览器不再重复滤波，
      // 避免短促压电脉冲再次衰减并产生额外相位延迟。
      const filtered = zeroed
      const magnitude = Math.abs(filtered)
      if (magnitude >= threshold || (this.triggerCounts[index] > 0 && magnitude >= threshold * RELEASE_THRESHOLD_RATIO)) {
        this.triggerCounts[index] = TRIGGER_HOLD_FRAMES
      } else {
        this.triggerCounts[index] = Math.max(0, this.triggerCounts[index] - 1)
      }
      const thresholdTriggered = this.triggerCounts[index] > 0
      let effective = thresholdTriggered
        ? Math.sign(filtered) * Math.max(0, magnitude - threshold * 0.2)
        : 0
      let stageCode = 0
      let phase: MotionPhase = '静止'
      if (effective > 0) {
        stageCode = 1
        phase = '弯曲'
        this.holdStartedAt[index] = Number.NaN
      } else if (effective < 0) {
        stageCode = 3
        phase = '伸展'
        const held = Number.isNaN(this.holdStartedAt[index]) ? 0 : now - this.holdStartedAt[index]
        effective *= 1.056 - 0.11 * Math.exp(-Math.max(0, held) / 2.3374)
      } else {
        if (this.previousStage[index] === 1) this.holdStartedAt[index] = now
        stageCode = this.angles[index] > 0.5 ? 2 : 0
        phase = stageCode === 2 ? '保持' : '静止'
      }

      const area = (this.previousSignal[index] + effective) * dt / 2
      const provisionalGain = clamp(
        PROVISIONAL_GAIN_NUMERATOR / Math.max(threshold, MIN_INTEGRATION_THRESHOLD_V),
        MIN_PROVISIONAL_GAIN,
        MAX_PROVISIONAL_GAIN,
      )
      const gain = this.calibrated[index] ? this.gains[index] : provisionalGain
      this.angles[index] = clamp(this.angles[index] + gain * area, 0, 90)
      if (this.calibrationIndex === index) {
        const calibrationValue = filtered >= threshold ? filtered : 0
        this.calibrationArea += (this.calibrationPrevious + calibrationValue) * dt / 2
        this.calibrationPrevious = calibrationValue
      }
      this.previousSignal[index] = effective
      this.previousStage[index] = stageCode
      stages[index] = phase

      const [plusChannel, minusChannel] = jointHotspots[sourceIndex].rawChannels
      const sample: SignalSample = {
        time: this.elapsed,
        vPlus: raw28[plusChannel - 1],
        vMinus: raw28[minusChannel - 1],
        differential: zeroed,
        filtered,
        siaAngle: this.angles[index],
        physicalAngle: this.angles[index],
        phase,
        thresholdTriggered,
      }
      const history = this.histories[jointHotspots[index].id]
      history.push(sample)
      if (history.length > HISTORY_LENGTH) history.shift()
    }

    this.orientation = {
      pitch: values[28] * 180 / Math.PI,
      yaw: values[29] * 180 / Math.PI,
      roll: values[30] * 180 / Math.PI,
    }
    return true
  }

  getMetrics(jointId: JointId): SignalMetrics {
    const history = this.histories[jointId]
    const current = history.at(-1)
    const diffs = history.map((sample) => sample.differential)
    const peak = diffs.length ? Math.max(...diffs) : 0
    const valley = diffs.length ? Math.min(...diffs) : 0
    return {
      currentVPlus: current?.vPlus ?? 1.65,
      currentVMinus: current?.vMinus ?? 1.65,
      currentDifferential: current?.differential ?? 0,
      peak,
      valley,
      vpp: peak - valley,
      sampleRate: Math.round(this.getSampleRate() * 10) / 10,
      phase: current?.phase ?? '静止',
      thresholdTriggered: current?.thresholdTriggered ?? false,
      siaAngle: current?.siaAngle ?? 0,
    }
  }

  getSampleRate() {
    if (this.frameTimes.length < 2) return 0
    return (this.frameTimes.length - 1) / (this.frameTimes.at(-1)! - this.frameTimes[0])
  }

  getSnapshot(): SerialProcessorSnapshot {
    return {
      histories: Object.fromEntries(jointHotspots.map((joint) => [joint.id, [...this.histories[joint.id]]])) as Record<JointId, SignalSample[]>,
      angles: Object.fromEntries(jointHotspots.map((joint, index) => [joint.id, this.angles[index]])) as Record<JointId, number>,
      orientation: { ...this.orientation },
      baselineReady: this.baselineReady,
      baselineProgress: this.baselineProgress,
      sampleRate: this.getSampleRate(),
      validFrames: this.validFrames,
      invalidFrames: this.invalidFrames,
      calibratedCount: this.calibrated.filter(Boolean).length,
      calibrationJoint: this.calibrationIndex === null ? null : jointHotspots[this.calibrationIndex].id,
      mappingCalibrationJoint: this.mappingCalibrationIndex === null ? null : jointHotspots[this.mappingCalibrationIndex].id,
      mappingCalibratedCount: this.mappingCalibrated.filter(Boolean).length,
      sourceMap: Object.fromEntries(jointHotspots.map((joint, index) => [joint.id, jointHotspots[this.sourceMap[index]].id])) as Record<JointId, JointId>,
      rawChannelPairs: Object.fromEntries(jointHotspots.map((joint, index) => [joint.id, jointHotspots[this.sourceMap[index]].rawChannels])) as Record<JointId, readonly [number, number]>,
      integrationThresholds: Object.fromEntries(jointHotspots.map((joint, index) => [joint.id, this.integrationThresholds[this.sourceMap[index]]])) as Record<JointId, number>,
      channelWarnings: Object.fromEntries(jointHotspots.map((joint, index) => {
        const current = this.histories[joint.id].at(-1)
        if (!current) return [joint.id, null]
        const [plusChannel, minusChannel] = jointHotspots[this.sourceMap[index]].rawChannels
        if (current.vPlus < 0.1 || current.vPlus > 3.2) return [joint.id, `CH${plusChannel}（V+）接近电源轨：${current.vPlus.toFixed(3)} V`]
        if (current.vMinus < 0.1 || current.vMinus > 3.2) return [joint.id, `CH${minusChannel}（V−）接近电源轨：${current.vMinus.toFixed(3)} V`]
        return [joint.id, null]
      })) as Record<JointId, string | null>,
    }
  }
}
