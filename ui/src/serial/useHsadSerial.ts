import { parseHsadFrame } from './hsadFrame'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { jointHotspots, type JointId } from '../data/jointHotspots'
import type { SignalMetrics } from '../simulation/signalTypes'
import { HSAD_BAUD_RATE, HsadSerialProcessor, type SerialProcessorSnapshot } from './hsadSerialProcessor'

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
  const sharedRef = useRef<EventSource | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const readAbortRef = useRef(false)
  const lastValidFrameRef = useRef(0)
  const [snapshot, setSnapshot] = useState<SerialProcessorSnapshot>(() => emptySnapshot())
  const [state, setState] = useState<SerialConnectionState>(() => navigator.serial ? 'idle' : 'unsupported')
  const [error, setError] = useState('')
  const [deviceLabel, setDeviceLabel] = useState('未选择设备')

  const publish = useCallback(() => setSnapshot(processorRef.current.getSnapshot()), [])

  const stopReading = useCallback(async () => {
    sharedRef.current?.close()
    sharedRef.current = null
    readAbortRef.current = true
    try { await readerRef.current?.cancel() } catch { /* 端口可能已由系统断开。 */ }
    try { readerRef.current?.releaseLock() } catch { /* 读取循环可能已释放锁。 */ }
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
        if (done) {
          if (!readAbortRef.current) { setState('error'); setError('设备数据流已关闭，请重新连接。') }
          break
        }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''
        if (buffer.length > 8192) { buffer = ''; processorRef.current.noteInvalidFrame() }
        for (const line of lines) {
          if (!line.trim()) continue
          const values = parseHsadFrame(line)
          if (!values) {
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
          if (performance.now() - lastValidFrameRef.current < 1200) setState(next.baselineReady ? 'connected' : 'calibrating')
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
      try { await port.close() } catch { /* 设备可能已被断开。 */ }
      if (portRef.current === port) portRef.current = null
    }
  }, [])

  const connect = useCallback(async (transport: 'usb' | 'bluetooth' = 'usb') => {
    if (portRef.current || sharedRef.current) return
    if (!navigator.serial) {
      setState('unsupported')
      setError('当前浏览器不支持 Web Serial，请使用最新版桌面 Chrome 或 Edge。')
      return
    }
    setError('')
    try {
      setState('requesting')
      const port = await navigator.serial.requestPort(transport === 'bluetooth'
        ? { filters: [{ bluetoothServiceClassId: '00001101-0000-1000-8000-00805f9b34fb' }] }
        : { filters: [{ usbVendorId: 0x1a86 }] })
      portRef.current = port
      const info = port.getInfo()
      setDeviceLabel(transport === 'bluetooth' ? '蓝牙 SPP · 已选设备' : `USB CH340 · VID ${info.usbVendorId?.toString(16) ?? '未知'}`)
      setState('opening')
      await port.open({ baudRate: HSAD_BAUD_RATE, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none', bufferSize: 65536 })
      if (!port.readable) throw new Error('设备已打开，但没有可读数据流。')
      try { await port.setSignals({ dataTerminalReady: false, requestToSend: false }) } catch { /* 部分 CH340 驱动不暴露控制线。 */ }
      processorRef.current = new HsadSerialProcessor()
      lastValidFrameRef.current = performance.now()
      publish()
      setState('calibrating')
      void readLoop(port)
    } catch (reason) {
      const message = reason instanceof DOMException && reason.name === 'NotFoundError'
        ? '未选择设备。USB 请选择采集板；蓝牙请先在 Windows 中配对支持 SPP 的手套。'
        : reason instanceof Error ? reason.message : '无法打开串口。'
      setError(message)
      setState('error')
      try { await portRef.current?.close() } catch { /* 忽略打开失败后的关闭异常。 */ }
      portRef.current = null
    }
  }, [publish, readLoop])

  const connectShared = useCallback(async () => {
    await disconnect()
    processorRef.current = new HsadSerialProcessor()
    publish()
    setDeviceLabel('Python 共享 · 蓝牙 COM24')
    setState('opening')
    lastValidFrameRef.current = 0
    const feed = new EventSource('http://127.0.0.1:8766/events')
    sharedRef.current = feed
    let previousSequence: number | null = null
    let lastPaint = 0
    const fail = (message: string) => {
      feed.close()
      if (sharedRef.current !== feed) return
      sharedRef.current = null
      setState('error')
      setError(message)
    }
    feed.onopen = () => {
      if (sharedRef.current !== feed) return
      lastValidFrameRef.current = performance.now()
      setState('calibrating')
    }
    feed.onmessage = (event) => {
      if (sharedRef.current !== feed) return
      try {
        const batch = JSON.parse(event.data) as { sequence: number; values: number[] }[]
        if (!Array.isArray(batch)) throw new Error('数据格式无效')
        for (const frame of batch) {
          if (!Number.isSafeInteger(frame.sequence) || (previousSequence !== null && frame.sequence !== previousSequence + 1)) {
            throw new Error('数据序号不连续，请重新连接并校零')
          }
          const values = Array.isArray(frame.values) ? parseHsadFrame(frame.values.join(',')) : null
          if (!values) throw new Error('数据帧无效')
          previousSequence = frame.sequence
          if (processorRef.current.process(values)) lastValidFrameRef.current = performance.now()
        }
        if (performance.now() - lastPaint >= 33) {
          lastPaint = performance.now()
          const next = processorRef.current.getSnapshot()
          setSnapshot(next)
          setState(next.baselineReady ? 'connected' : 'calibrating')
        }
      } catch (reason) { fail(`共享采集中断：${reason instanceof Error ? reason.message : '数据异常'}`) }
    }
    feed.addEventListener('gap', () => fail('共享数据积压，请重新连接并校零。'))
    feed.onerror = () => fail('Python 共享采集未启动或已断开，请启动共享采集程序后重新连接。')
  }, [disconnect, publish])

  const rebaseline = useCallback(() => { processorRef.current.rebaseline(); processorRef.current.resetAngles(); publish(); setState('calibrating') }, [publish])
  const resetAngles = useCallback(() => { processorRef.current.resetAngles(); publish() }, [publish])
  const startCalibration = useCallback((jointId: JointId) => { processorRef.current.startAngleCalibration(jointId); publish() }, [publish])
  const finishCalibration = useCallback(() => { const gain = processorRef.current.finishAngleCalibration(); publish(); return gain }, [publish])
  const flipPolarity = useCallback((jointId: JointId) => { processorRef.current.flipPolarity(jointId); publish(); setState('calibrating') }, [publish])
  const startJointMapping = useCallback((jointId: JointId) => { processorRef.current.startJointMapping(jointId); publish() }, [publish])
  const finishJointMapping = useCallback(() => { const result = processorRef.current.finishJointMapping(); publish(); return result }, [publish])

  useEffect(() => {
    if (!enabled || !['connected', 'calibrating', 'stale'].includes(state)) return
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
    connectShared,
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
