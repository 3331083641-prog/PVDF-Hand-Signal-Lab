import { useEffect, useMemo, useRef, useState } from 'react'
import { HsadSignalEngine } from './hsadSignalEngine'
import type { SignalMetrics, SignalSample } from './signalTypes'

const createEmptyMetrics = (siaAngle = 0): SignalMetrics => ({
  currentVPlus: 1.65,
  currentVMinus: 1.65,
  currentDifferential: 0,
  peak: 0,
  valley: 0,
  vpp: 0,
  sampleRate: 80,
  phase: '静止',
  thresholdTriggered: false,
  siaAngle,
})

type SignalSnapshot = {
  jointId: string
  history: SignalSample[]
  metrics: SignalMetrics
  physicalAngle: number
}

export function useHsadSignal({
  jointId,
  targetAngle,
  speed = 52,
  running = true,
  polarity = 1,
  initialAngle = 0,
}: {
  jointId: string
  targetAngle: number
  speed?: number
  running?: boolean
  polarity?: 1 | -1
  initialAngle?: number
}) {
  // initialAngle is captured only when a new joint engine is created. Subsequent
  // mapped-angle paints must not reconstruct or reset that engine.
  const engineContext = useMemo(() => {
    const next = new HsadSignalEngine({ jointId, seed: 0x48534144, speedDegPerSecond: speed })
    next.reset(initialAngle)
    return { engine: next, initialAngle }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jointId])
  const { engine } = engineContext
  const [snapshot, setSnapshot] = useState<SignalSnapshot>(() => ({
    jointId,
    history: [],
    metrics: createEmptyMetrics(initialAngle),
    physicalAngle: initialAngle,
  }))
  const accumulator = useRef(0)

  const currentSnapshot = snapshot.jointId === jointId
    ? snapshot
    : {
        jointId,
        history: [],
        metrics: createEmptyMetrics(engineContext.initialAngle),
        physicalAngle: engineContext.initialAngle,
      }

  useEffect(() => {
    accumulator.current = 0
    setSnapshot({
      jointId,
      history: [],
      metrics: createEmptyMetrics(engineContext.initialAngle),
      physicalAngle: engineContext.initialAngle,
    })
  }, [engine, engineContext.initialAngle, jointId])

  useEffect(() => { engine.setTargetAngle(targetAngle) }, [engine, targetAngle])
  useEffect(() => { engine.setSpeed(speed) }, [engine, speed])
  useEffect(() => { engine.setPolarity(polarity) }, [engine, polarity])

  useEffect(() => {
    if (!running) return
    let frame = 0
    let previous = performance.now()
    let lastPaint = previous
    const tick = (now: number) => {
      accumulator.current += Math.min(0.1, (now - previous) / 1000)
      previous = now
      while (accumulator.current >= 1 / engine.sampleRate) {
        engine.step()
        accumulator.current -= 1 / engine.sampleRate
      }
      if (now - lastPaint >= 45) {
        setSnapshot({
          jointId,
          history: [...engine.history],
          metrics: engine.getMetrics(),
          physicalAngle: engine.getPhysicalAngle(),
        })
        lastPaint = now
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [engine, jointId, running])

  const reset = (angle = 0) => {
    engine.reset(angle)
    accumulator.current = 0
    setSnapshot({
      jointId,
      history: [],
      metrics: createEmptyMetrics(angle),
      physicalAngle: angle,
    })
  }

  return {
    history: currentSnapshot.history,
    metrics: currentSnapshot.metrics,
    reset,
    physicalAngle: currentSnapshot.physicalAngle,
  }
}
