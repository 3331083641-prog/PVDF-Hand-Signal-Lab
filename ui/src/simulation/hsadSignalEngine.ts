import { SeededMonteCarlo } from './seededMonteCarlo'
import { SIAAngleEngine } from './siaAngleEngine'
import { getJointSignalConfig, type SignalEngineOptions, type SignalMetrics, type SignalSample } from './signalTypes'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

class LowPassBiquad {
  private x1 = 0
  private x2 = 0
  private y1 = 0
  private y2 = 0
  private readonly b0: number
  private readonly b1: number
  private readonly b2: number
  private readonly a1: number
  private readonly a2: number

  constructor(sampleRate: number, cutoff = 6, q = Math.SQRT1_2) {
    const w0 = 2 * Math.PI * cutoff / sampleRate
    const alpha = Math.sin(w0) / (2 * q)
    const a0 = 1 + alpha
    this.b0 = ((1 - Math.cos(w0)) / 2) / a0
    this.b1 = (1 - Math.cos(w0)) / a0
    this.b2 = this.b0
    this.a1 = (-2 * Math.cos(w0)) / a0
    this.a2 = (1 - alpha) / a0
  }

  update(value: number) {
    const result = this.b0 * value + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2
    this.x2 = this.x1
    this.x1 = value
    this.y2 = this.y1
    this.y1 = result
    return result
  }

  reset() {
    this.x1 = 0
    this.x2 = 0
    this.y1 = 0
    this.y2 = 0
  }
}

export class HsadSignalEngine {
  readonly sampleRate: number
  readonly history: SignalSample[] = []
  private readonly dt: number
  private readonly random: SeededMonteCarlo
  private readonly filter: LowPassBiquad
  private readonly sia: SIAAngleEngine
  private readonly config
  private elapsed = 0
  private physicalAngle = 0
  private previousPhysicalAngle = 0
  private targetAngle = 0
  private speedDegPerSecond: number
  private chargeState = 0
  private motionElapsed = 0
  private motionDirection = 0
  private motionTexture = 0
  private sourceMode: 'teaching' | 'serial' = 'teaching'
  private externalPolarity: 1 | -1 = 1

  constructor(options: SignalEngineOptions) {
    this.sampleRate = options.sampleRate ?? 80
    this.dt = 1 / this.sampleRate
    this.config = getJointSignalConfig(options.jointId)
    this.random = new SeededMonteCarlo((options.seed ?? 0x48534144) ^ this.config.jointId.charCodeAt(0) ^ this.config.jointId.charCodeAt(1))
    this.filter = new LowPassBiquad(this.sampleRate)
    this.sia = new SIAAngleEngine(this.config.calibrationGain, options.threshold ?? 0.006)
    this.speedDegPerSecond = options.speedDegPerSecond ?? 52
  }

  setTargetAngle(angle: number) { this.targetAngle = clamp(angle, 0, 90) }
  setSpeed(speedDegPerSecond: number) { this.speedDegPerSecond = clamp(speedDegPerSecond, 8, 140) }
  setPolarity(polarity: 1 | -1) { this.externalPolarity = polarity }
  setSourceMode(mode: 'teaching' | 'serial') { this.sourceMode = mode }
  getSourceMode() { return this.sourceMode }
  getPhysicalAngle() { return this.physicalAngle }

  reset(angle = 0) {
    this.elapsed = 0
    this.physicalAngle = clamp(angle, 0, 90)
    this.previousPhysicalAngle = this.physicalAngle
    this.targetAngle = this.physicalAngle
    this.chargeState = 0
    this.motionElapsed = 0
    this.motionDirection = 0
    this.motionTexture = 0
    this.history.length = 0
    this.random.reset()
    this.filter.reset()
    this.sia.reset(this.physicalAngle)
  }

  step(): SignalSample {
    this.elapsed += this.dt
    const remaining = this.targetAngle - this.physicalAngle
    const maxStep = this.speedDegPerSecond * this.dt
    this.previousPhysicalAngle = this.physicalAngle
    this.physicalAngle += clamp(remaining, -maxStep, maxStep)
    if (Math.abs(remaining) < 0.01) this.physicalAngle = this.targetAngle

    const angularVelocity = (this.physicalAngle - this.previousPhysicalAngle) / this.dt
    const moving = Math.abs(angularVelocity) > 0.08
    const direction = moving ? Math.sign(angularVelocity) : 0
    if (moving && direction !== this.motionDirection) this.motionElapsed = 0
    this.motionElapsed = moving ? this.motionElapsed + this.dt : 0
    this.motionDirection = direction

    // Uideal follows angular velocity, while the front-end response has a
    // short onset overshoot and charge-relaxation tail. This preserves the
    // integral/angle relationship without drawing an unrealistically perfect
    // rectangular teaching trace for a constant-speed bend.
    const velocityVoltage = this.config.polarity * this.externalPolarity * angularVelocity / this.config.calibrationGain
    const onsetEnvelope = moving ? 0.93 + 0.18 * Math.exp(-this.motionElapsed / 0.14) : 0
    const idealMotion = velocityVoltage * onsetEnvelope
    const responseTau = moving ? 0.045 : 0.105
    const responseAlpha = 1 - Math.exp(-this.dt / responseTau)
    this.chargeState += (idealMotion - this.chargeState) * responseAlpha

    // A fixed-seed, correlated anti-phase texture represents small contact
    // and flexural variations. It is tied to motion amplitude and therefore
    // does not turn the static baseline into an unconstrained random trace.
    this.motionTexture = this.motionTexture * 0.82 + this.random.gaussian() * 0.18
    const motionTexture = moving
      ? this.motionTexture * Math.abs(velocityVoltage) * 0.045
      : this.motionTexture * 0.0007
    const motionVoltage = this.chargeState + motionTexture

    const common = this.random.nextCommonMode(this.dt)
    const independentScale = 0.00125 * this.config.noiseScale
    const n1 = this.random.gaussian() * independentScale
    const n2 = this.random.gaussian() * independentScale
    const vPlus = clamp(1.65 + motionVoltage + common + n1, 0, 3.3)
    const vMinus = clamp(1.65 - motionVoltage + common + n2, 0, 3.3)
    const differential = (vPlus - vMinus) / 2
    const filtered = this.filter.update(differential)
    const sia = this.sia.update(filtered, this.dt)
    const phase = Math.abs(angularVelocity) > 0.08 ? (angularVelocity > 0 ? '弯曲' : '伸展') : sia.phase
    const sample: SignalSample = {
      time: this.elapsed,
      vPlus,
      vMinus,
      differential,
      filtered,
      siaAngle: sia.angle,
      physicalAngle: this.physicalAngle,
      phase,
      thresholdTriggered: sia.thresholdTriggered,
    }
    this.history.push(sample)
    if (this.history.length > this.sampleRate * 4) this.history.shift()
    return sample
  }

  getMetrics(): SignalMetrics {
    const current = this.history.at(-1)
    if (!current) {
      return {
        currentVPlus: 1.65,
        currentVMinus: 1.65,
        currentDifferential: 0,
        peak: 0,
        valley: 0,
        vpp: 0,
        sampleRate: this.sampleRate,
        phase: '静止',
        thresholdTriggered: false,
        siaAngle: this.physicalAngle,
      }
    }
    const differential = this.history.map((sample) => sample.differential)
    const peak = Math.max(...differential)
    const valley = Math.min(...differential)
    return {
      currentVPlus: current.vPlus,
      currentVMinus: current.vMinus,
      currentDifferential: current.differential,
      peak,
      valley,
      vpp: peak - valley,
      sampleRate: this.sampleRate,
      phase: current.phase,
      thresholdTriggered: current.thresholdTriggered,
      siaAngle: current.siaAngle,
    }
  }
}
