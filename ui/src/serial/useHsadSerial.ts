import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { jointHotspots, type JointId } from '../data/jointHotspots'
import type { SignalMetrics } from '../simulation/signalTypes'
import { HSAD_BAUD_RATE, HSAD_FRAME_FIELDS, HsadSerialProcessor, type SerialProcessorSnapshot } from './hsadSerialProcessor'

export type SerialConnectionState = 'unsupported' | 'idle' | 'requesting' | 'opening' | 'calibrating' | 'connected' | 'stale' | 'error'

const emptySnapshot = (): SerialProcessorSnapshot => ({
  histories: Object.fromEntries(jointHotspots.map((joint) => [joint.id, []])) as unknown as SerialProcessorSnapshot['histories'],
  angles: Object.fromEntries(jointHotspots.map((joint) => [joint.id, 0])) as SerialProcessorSnapshot['angles'],
  orientation: { pitch: 0, yaw: 0, roll: 0 },
  baselineReady: false,
  baselineProgress: 0,
  sampleRate: 0,
  validFrames: 0,
  invalidFrames: 0,
  calibratedCount: 0,
  calibrationJoint: null,
  mappingCalibrationJoint: null,
  mappingCalibratedCount: 0,
  sourceMap: Object.fromEntries(jointHotspots.map((joint) => [joint.id, joint.id])) as Record<JointId, JointId>,
  rawChannelPairs: Object.fromEntries(jointHotspots.map((joint) => [joint.id, joint.rawChannels])) as Record<JointId, readonly [number, number]>,
  integrationThresholds: Object.fromEntries(jointHotspots.map((joint) => [joint.id, 0.0025])) as Record<JointId, number>,
  channelWarnings: Object.fromEntries(jointHotspots.map((joint) => [joint.id, null])) as Record<JointId, string | null>,
})

const emptyMetrics: SignalMetrics = { currentVPlus: 1.65, currentVMinus: 1.65, currentDifferential: 0, peak: 0, valley: 0, vpp: 0, sampleRate: 0, phase: '静止', thresholdTriggered: false, siaAngle: 0 }

export function useHsadSerial(selectedId: JointId, enabled: boolean) {
  const processorRef = useRef(new HsadSerialProcessor())
  const portRef = useRef<SerialPort | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const readAbortRef = useRef(false)
  const lastValidFrameRef = useRef(0)
  const [snapshot, setSnapshot] = useState<SerialProcessorSnapshot>(() => emptySnapshot())
  const [state, setState] = useState<SerialConnectionState>(() => navigator.serial ? 'idle' : 'unsupported')
  const [error, setError] = useState('')
  const [deviceLabel, setDeviceLabel] = useState('COM8 / CH340K')

  const publish = useCallback(() => setSnapshot(processorRef.current.getSnapshot()), [])

  const stopReading = useCallback(async () => {
    readAbortRef.current = true
    try { await readerRef.current?.cancel() } catch { /* 端口可能已由系统断开。 */ }
    readerRef.current?.releaseLock()
    readerRef.current = null
  }, [])

  const disconnect = useCallback(async () => {
    await stopReading()
    try { await portRef.current?.close() } catch { /* 已断开的端口无需再次关闭。 */ }
    portRef.current = null
    setState(navigator.serial ? 'idle' : 'unsupported')
    setError('')
  }, [stopReading])

  const readLoop = useCallback(async (port: SerialPort) => {
    if (!port.readable) throw new Error('串口已打开，但没有可读数据流。')
    readAbortRef.current = false
    const reader = port.readable.getReader()
    readerRef.current = reader
    const decoder = new TextDecoder()
    let buffer = ''
    let lastPaint = 0
    try {
      while (!readAbortRef.current) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const values = line.split(',').map((item) => Number(item.trim()))
          if (values.length !== HSAD_FRAME_FIELDS || values.some((item) => !Number.isFinite(item))) {
            processorRef.current.noteInvalidFrame()
            continue
          }
          if (processorRef.current.process(values)) lastValidFrameRef.current = performance.now()
        }
        const now = performance.now()
        if (now - lastPaint >= 33) {
          lastPaint = now
          const next = processorRef.current.getSnapshot()
          setSnapshot(next)
          setState(next.baselineReady ? 'connected' : 'calibrating')
        }
      }
    } catch (reason) {
      if (!readAbortRef.current) {
        setError(reason instanceof Error ? reason.message : '读取串口时发生未知错误。')
        setState('error')
      }
    } finally {
      try { reader.releaseLock() } catch { /* 锁可能已经释放。 */ }
      if (readerRef.current === reader) readerRef.current = null
    }
  }, [])

  const connect = useCallback(async () => {
    if (!navigator.serial) {
      setState('unsupported')
      setError('当前浏览器不支持 Web Serial，请使用最新版桌面 Chrome 或 Edge。')
      return
    }
    setError('')
    try {
      setState('requesting')
      const authorizedPorts = await navigator.serial.getPorts()
      const authorizedCh340 = authorizedPorts.find((candidate) => candidate.getInfo().usbVendorId === 0x1a86)
      const port = authorizedCh340 ?? await navigator.serial.requestPort({ filters: [{ usbVendorId: 0x1a86 }] })
      portRef.current = port
      const info = port.getInfo()
      setDeviceLabel(info.usbVendorId === 0x1a86 ? 'USB-SERIAL CH340K (COM8)' : `USB 串口 ${info.usbVendorId?.toString(16) ?? ''}`)
      setState('opening')
      await port.open({ baudRate: HSAD_BAUD_RATE, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none', bufferSize: 65536 })
      try { await port.setSignals({ dataTerminalReady: false, requestToSend: false }) } catch { /* 部分 CH340 驱动不暴露控制线。 */ }
      processorRef.current.rebaseline()
      processorRef.current.resetAngles()
      publish()
      setState('calibrating')
      void readLoop(port)
    } catch (reason) {
      const message = reason instanceof DOMException && reason.name === 'NotFoundError'
        ? '未选择串口。请重试并选择 USB-SERIAL CH340K (COM8)。'
        : reason instanceof Error ? reason.message : '无法打开串口。'
      setError(message)
      setState('error')
      try { await portRef.current?.close() } catch { /* 忽略打开失败后的关闭异常。 */ }
      portRef.current = null
    }
  }, [publish, readLoop])

  const rebaseline = useCallback(() => { processorRef.current.rebaseline(); processorRef.current.resetAngles(); publish(); setState('calibrating') }, [publish])
  const resetAngles = useCallback(() => { processorRef.current.resetAngles(); publish() }, [publish])
  const startCalibration = useCallback((jointId: JointId) => { processorRef.current.startAngleCalibration(jointId); publish() }, [publish])
  const finishCalibration = useCallback(() => { const gain = processorRef.current.finishAngleCalibration(); publish(); return gain }, [publish])
  const flipPolarity = useCallback((jointId: JointId) => { processorRef.current.flipPolarity(jointId); publish(); setState('calibrating') }, [publish])
  const startJointMapping = useCallback((jointId: JointId) => { processorRef.current.startJointMapping(jointId); publish() }, [publish])
  const finishJointMapping = useCallback(() => { const result = processorRef.current.finishJointMapping(); publish(); return result }, [publish])

  useEffect(() => {
    if (!enabled || (state !== 'connected' && state !== 'calibrating')) return
    const timer = window.setInterval(() => {
      if (lastValidFrameRef.current && performance.now() - lastValidFrameRef.current > 1200) setState('stale')
    }, 500)
    return () => window.clearInterval(timer)
  }, [enabled, state])

  useEffect(() => () => {
    void (async () => {
      await stopReading()
      try { await portRef.current?.close() } catch { /* 页面卸载时端口可能已关闭。 */ }
    })()
  }, [stopReading])

  const metrics = useMemo(() => state === 'idle' || state === 'unsupported' ? emptyMetrics : processorRef.current.getMetrics(selectedId), [selectedId, snapshot, state])
  return {
    state,
    error,
    deviceLabel,
    history: snapshot.histories[selectedId],
    angles: snapshot.angles,
    orientation: snapshot.orientation,
    baselineProgress: snapshot.baselineProgress,
    calibratedCount: snapshot.calibratedCount,
    calibrationJoint: snapshot.calibrationJoint,
    mappingCalibrationJoint: snapshot.mappingCalibrationJoint,
    mappingCalibratedCount: snapshot.mappingCalibratedCount,
    sourceJointId: snapshot.sourceMap[selectedId],
    rawChannelPair: snapshot.rawChannelPairs[selectedId],
    integrationThreshold: snapshot.integrationThresholds[selectedId],
    channelWarning: snapshot.channelWarnings[selectedId],
    validFrames: snapshot.validFrames,
    invalidFrames: snapshot.invalidFrames,
    metrics,
    connect,
    disconnect,
    rebaseline,
    resetAngles,
    startCalibration,
    finishCalibration,
    flipPolarity,
    startJointMapping,
    finishJointMapping,
  }
}
