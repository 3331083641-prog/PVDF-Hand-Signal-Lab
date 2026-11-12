export class SeededMonteCarlo {
  private readonly initialSeed: number
  private state: number
  private spareNormal: number | null = null
  private drift = 0
  private common = 0
  private microPulse = 0

  constructor(seed = 0x48_53_41_44) {
    this.initialSeed = seed >>> 0 || 1
    this.state = this.initialSeed
  }

  reset() {
    this.state = this.initialSeed
    this.spareNormal = null
    this.drift = 0
    this.common = 0
    this.microPulse = 0
  }

  uniform() {
    let value = this.state
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    this.state = value >>> 0
    return this.state / 0x1_0000_0000
  }

  gaussian() {
    if (this.spareNormal !== null) {
      const value = this.spareNormal
      this.spareNormal = null
      return value
    }
    const u = Math.max(this.uniform(), 1e-12)
    const v = this.uniform()
    const magnitude = Math.sqrt(-2 * Math.log(u))
    this.spareNormal = magnitude * Math.sin(2 * Math.PI * v)
    return magnitude * Math.cos(2 * Math.PI * v)
  }

  /** 低频漂移 + 相关共模噪声 + 极少量微脉冲，均由固定种子驱动。 */
  nextCommonMode(dt: number) {
    const driftAlpha = Math.exp(-dt / 5.8)
    this.drift = driftAlpha * this.drift + this.gaussian() * 0.00016
    const commonAlpha = Math.exp(-dt / 0.34)
    this.common = commonAlpha * this.common + this.gaussian() * 0.00055
    if (this.uniform() < dt * 0.035) this.microPulse += this.gaussian() * 0.006
    this.microPulse *= Math.exp(-dt / 0.055)
    return this.drift + this.common + this.microPulse
  }
}
