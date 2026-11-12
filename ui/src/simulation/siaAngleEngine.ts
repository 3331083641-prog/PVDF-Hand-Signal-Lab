import type { MotionPhase } from './signalTypes'

export type SIAState = {
  angle: number
  phase: MotionPhase
  thresholdTriggered: boolean
}

export class SIAAngleEngine {
  private angle = 0
  private previousSignal = 0
  private previousStage = 0
  private holdSeconds = 0
  private readonly gain: number
  private readonly threshold: number

  constructor(gain: number, threshold = 0.006) {
    this.gain = gain
    this.threshold = threshold
  }

  reset(angle = 0) {
    this.angle = Math.min(90, Math.max(0, angle))
    this.previousSignal = 0
    this.previousStage = 0
    this.holdSeconds = 0
  }

  private holdCorrection(seconds: number) {
    return 1.056 - 0.11 * Math.exp(-Math.max(0, seconds) / 2.3374)
  }

  update(signalV: number, dt: number): SIAState {
    const boundedDt = Math.min(0.05, Math.max(0.005, dt))
    const thresholdTriggered = Math.abs(signalV) >= this.threshold
    const effective = thresholdTriggered ? signalV : 0
    let corrected = effective
    let stage = 0
    let phase: MotionPhase = '静止'

    if (effective > 0) {
      stage = 1
      this.holdSeconds = 0
      phase = '弯曲'
    } else if (effective < 0) {
      stage = 3
      corrected = effective * this.holdCorrection(this.holdSeconds)
      phase = '伸展'
    } else if (this.angle > 0.5) {
      stage = 2
      if (this.previousStage === 1 || this.previousStage === 2) this.holdSeconds += boundedDt
      phase = this.previousStage === 3 ? '恢复' : '保持'
    }

    const area = (this.previousSignal + corrected) * boundedDt * 0.5
    this.angle = Math.min(90, Math.max(0, this.angle + this.gain * area))
    this.previousSignal = corrected
    this.previousStage = stage
    return { angle: this.angle, phase, thresholdTriggered }
  }
}
