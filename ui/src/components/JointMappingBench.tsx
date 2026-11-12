import { Cable, CircleAlert, Pause, Play, Radio, RotateCcw, Unplug } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { jointHotspots, type JointId } from '../data/jointHotspots'
import { defaultJointAngles, mappingPresets, type JointAngles } from '../data/mappingPresets'
import { useHsadSerial } from '../serial/useHsadSerial'
import { useHsadSignal } from '../simulation/useHsadSignal'
import type { SignalDisplayMode } from '../simulation/signalTypes'
import { HSADHand3D, type HSADSelectionEvent } from './hand3d/HSADHand3D'
import { RealtimeSignalChart } from './RealtimeSignalChart'

const formatV = (value: number) => `${value >= 0 ? '' : '−'}${Math.abs(value).toFixed(3)} V`
const fingers = ['拇指', '食指', '中指', '无名指', '小指'] as const

export function JointMappingBench() {
  const [selectedId, setSelectedId] = useState<JointId>('I2')
  const [angles, setAngles] = useState<JointAngles>({ ...defaultJointAngles })
  const [targetAngle, setTargetAngle] = useState(4)
  const [speed, setSpeed] = useState(54)
  const [orientation, setOrientation] = useState({ pitch: 0, yaw: 0, roll: 0 })
  const [displayMode, setDisplayMode] = useState<SignalDisplayMode>('raw')
  const [source, setSource] = useState<'teaching' | 'serial'>('teaching')
  const [playing, setPlaying] = useState(true)
  const [continuous, setContinuous] = useState(false)
  const [resetNonce, setResetNonce] = useState(0)
  const [serialNotice, setSerialNotice] = useState('')
  const selected = useMemo(() => jointHotspots.find((joint) => joint.id === selectedId) ?? jointHotspots[0], [selectedId])
  const siblingJoints = useMemo(() => jointHotspots.filter((joint) => joint.finger === selected.finger), [selected.finger])
  const teaching = useHsadSignal({
    jointId: selectedId,
    targetAngle,
    speed,
    running: playing && source === 'teaching',
    initialAngle: angles[selectedId] ?? 0,
  })
  const serial = useHsadSerial(selectedId, source === 'serial')
  const history = source === 'serial' ? serial.history : teaching.history
  const metrics = source === 'serial' ? serial.metrics : teaching.metrics
  const mappedAngle = source === 'serial' ? serial.angles[selectedId] : teaching.metrics.siaAngle
  const physicalAngle = source === 'serial' ? mappedAngle : teaching.physicalAngle
  const serialActive = ['calibrating', 'connected', 'stale'].includes(serial.state)
  const stageAngles = source === 'serial' && serialActive ? serial.angles : angles
  const stageOrientation = source === 'serial' && serialActive ? serial.orientation : orientation

  useEffect(() => {
    if (source === 'serial') return
    // 三维手由信号处理链的 SIA 输出驱动；physicalAngle 仅作为教学输入真值。
    setAngles((current) => ({ ...current, [selectedId]: mappedAngle }))
  }, [mappedAngle, selectedId, source])

  useEffect(() => {
    if (!continuous || source !== 'teaching' || !playing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const started = performance.now()
    const timer = window.setInterval(() => {
      const phase = (performance.now() - started) / 1000
      setTargetAngle(8 + (Math.sin(phase * 1.25) + 1) * 38)
    }, 90)
    return () => window.clearInterval(timer)
  }, [continuous, playing, source])

  const selectJoint = (id: JointId) => {
    setContinuous(false)
    setSelectedId(id)
    if (source === 'teaching') setTargetAngle(angles[id] ?? 0)
  }

  const choosePreset = (key: keyof typeof mappingPresets) => {
    const preset = mappingPresets[key]
    const presetAngles: JointAngles = { ...preset.angles }
    setContinuous(key === 'cascade')
    setAngles(presetAngles)
    setTargetAngle(presetAngles[selectedId] ?? 0)
    setPlaying(true)
  }

  const resetAll = () => {
    if (source === 'serial') {
      serial.resetAngles()
      setSerialNotice('14 个关节积分角度已归零。')
      return
    }
    setContinuous(false)
    setAngles({ ...defaultJointAngles })
    setTargetAngle(defaultJointAngles[selectedId] ?? 0)
    setOrientation({ pitch: 0, yaw: 0, roll: 0 })
    setPlaying(true)
    setResetNonce((value) => value + 1)
    teaching.reset(defaultJointAngles[selectedId] ?? 0)
  }

  const modelSelect = (selection: HSADSelectionEvent) => {
    if (selection.type === 'joint') selectJoint(selection.id as JointId)
  }

  const serialStatus = (() => {
    if (serial.state === 'unsupported') return '浏览器不支持'
    if (serial.state === 'requesting') return '选择 COM8'
    if (serial.state === 'opening') return '正在打开'
    if (serial.state === 'calibrating') return `零点校准 ${Math.round(serial.baselineProgress * 100)}%`
    if (serial.state === 'connected') return `${serial.metrics.sampleRate.toFixed(1)} Hz`
    if (serial.state === 'stale') return '数据已暂停'
    if (serial.state === 'error') return '连接错误'
    return '未连接'
  })()

  const startSerialCalibration = () => {
    try {
      serial.startCalibration(selectedId)
      setSerialNotice(`标定中：请将${selected.shortLabel}从 0° 连续弯曲到 90°，然后点击“完成 90°”。`)
    } catch (reason) { setSerialNotice(reason instanceof Error ? reason.message : '无法开始标定。') }
  }

  const finishSerialCalibration = () => {
    try {
      const gain = serial.finishCalibration()
      setSerialNotice(`${selected.shortLabel}标定完成，增益 ${gain.toFixed(2)} °/(V·s)。`)
    } catch (reason) { setSerialNotice(reason instanceof Error ? reason.message : '无法完成标定。') }
  }

  const detectSerialMapping = () => {
    try {
      if (serial.mappingCalibrationJoint === selectedId) {
        const result = serial.finishJointMapping()
        setSerialNotice(`${selected.shortLabel}已绑定实物源 ${result.sourceJointId}（CH${result.rawChannels[0]}/CH${result.rawChannels[1]}），峰值 ${(result.peak * 1000).toFixed(1)} mV，区分度 ${result.confidence.toFixed(2)}。请重新执行 0→90° 角度标定。`)
      } else {
        serial.startJointMapping(selectedId)
        setSerialNotice(`通道识别中：固定其他手指，只连续弯曲实物${selected.shortLabel} 3 次，然后点击“完成识别”。`)
      }
    } catch (reason) { setSerialNotice(reason instanceof Error ? reason.message : '无法完成通道识别。') }
  }

  return <section className="mapping-bench" aria-label="关节信号与动作映射实验台">
    <aside className="bench-wave-panel">
      <div className="bench-section-head"><div><span>信号输入</span><strong>{selected.shortLabel}</strong></div><span className={source === 'teaching' ? 'source-badge' : `source-badge ${serial.state === 'connected' ? 'live' : 'waiting'}`}>{source === 'teaching' ? '教学推演' : serialStatus}</span></div>
      <label className="compact-select">关节选择<select value={selectedId} onChange={(event) => selectJoint(event.target.value as JointId)}>{jointHotspots.map((joint) => <option value={joint.id} key={joint.id}>{joint.channel}. {joint.label}</option>)}</select></label>
      {source === 'serial' && <p className="serial-source-map">当前实物源：{serial.sourceJointId} · CH{serial.rawChannelPair[0]}/CH{serial.rawChannelPair[1]} · 已识别 {serial.mappingCalibratedCount}/14</p>}
      <div className="segmented-control" role="group" aria-label="信号显示模式"><button aria-pressed={displayMode === 'raw'} onClick={() => setDisplayMode('raw')}>原始双通道</button><button aria-pressed={displayMode === 'differential'} onClick={() => setDisplayMode('differential')}>差分有效信号</button></div>
      {source === 'serial' && !serialActive ? <div className="serial-empty" role="status">
        {serial.state === 'error' ? <CircleAlert /> : <Cable />}
        <strong>{serial.state === 'unsupported' ? '请使用桌面版 Chrome 或 Edge' : '连接 USB-SERIAL CH340K'}</strong>
        <span>点击后在浏览器端口选择器中选择 COM8。通信参数：460800 baud、31 字段、80 Hz。</span>
        {serial.error && <em>{serial.error}</em>}
        <button type="button" onClick={() => void serial.connect()} disabled={serial.state === 'unsupported' || serial.state === 'requesting' || serial.state === 'opening'}><Cable size={16} />连接 COM8</button>
      </div> : <RealtimeSignalChart history={history} mode={displayMode} />}
      {source === 'serial' && serialActive && <div className="serial-toolbar" aria-live="polite">
        <div><b>{serial.deviceLabel}</b><span>{serial.state === 'calibrating' ? '请张开手并保持静止 2 秒；随后第一次动作应为弯曲。' : `有效帧 ${serial.validFrames} · 异常帧 ${serial.invalidFrames} · 已标定 ${serial.calibratedCount}/14${serial.calibratedCount < 14 ? '（其余使用自适应预标定增益）' : ''}`}</span></div>
        <button onClick={serial.rebaseline}>重校零点</button><button onClick={() => void serial.disconnect()}><Unplug size={14} />断开</button>
      </div>}
      {source === 'serial' && serial.channelWarning && <p className="serial-channel-warning" role="alert"><CircleAlert size={14} />{serial.channelWarning}，请检查该路接线或调理电路。</p>}
      <div className="signal-metrics">
        <span><small>V+ 当前</small><b>{metrics.currentVPlus.toFixed(3)} V</b></span>
        <span><small>V− 当前</small><b>{metrics.currentVMinus.toFixed(3)} V</b></span>
        <span><small>峰值</small><b>{formatV(metrics.peak)}</b></span>
        <span><small>谷值</small><b>{formatV(metrics.valley)}</b></span>
        <span><small>Vpp</small><b>{metrics.vpp.toFixed(3)} V</b></span>
        <span><small>采样率</small><b>{metrics.sampleRate} Hz</b></span>
      </div>
      <p className="formula-strip">Udiff(t) = [V+(t) − V−(t)] / 2</p>
    </aside>

    <div className="bench-model-panel">
      <div className="model-panel-head"><div><span>动作映射</span><strong>完整 HSAD 三维手</strong></div><button onClick={() => setResetNonce((value) => value + 1)}><RotateCcw size={16} />复位视角</button></div>
      <HSADHand3D angles={stageAngles} pitch={stageOrientation.pitch} yaw={stageOrientation.yaw} roll={stageOrientation.roll} selected={{ type: 'joint', id: selectedId }} onSelect={modelSelect} resetNonce={resetNonce} presentation="mapping" />
      <div className="mapping-status" data-phase={metrics.phase}><span><i />{metrics.phase}</span><small>{source === 'serial' ? '串口映射' : '目标轨迹'} {physicalAngle.toFixed(1)}° · {formatV(metrics.currentDifferential)}</small><strong>{selected.shortLabel}</strong><output>{mappedAngle.toFixed(1)}°</output></div>
    </div>

    <aside className="bench-control-panel">
      <div className="bench-section-head"><div><span>关节与姿态</span><strong>{selected.label}</strong></div><output>{Math.round(source === 'serial' ? mappedAngle : targetAngle)}°</output></div>
      <label className="primary-range">{source === 'serial' ? '串口映射角度' : '目标角度'}<input type="range" min="0" max="90" value={source === 'serial' ? mappedAngle : targetAngle} disabled={source === 'serial'} onChange={(event) => { setContinuous(false); setTargetAngle(Number(event.target.value)) }} /></label>
      <div className="joint-picker">
        <div className="finger-tabs" role="tablist" aria-label="手指快速选择">{fingers.map((finger) => {
          const firstJoint = jointHotspots.find((joint) => joint.finger === finger)
          return <button type="button" role="tab" key={finger} aria-selected={selected.finger === finger} onClick={() => firstJoint && selectJoint(firstJoint.id)}>{finger}</button>
        })}</div>
        <div className="joint-grid" aria-label={`${selected.finger}关节选择`}>{siblingJoints.map((joint) => <button type="button" key={joint.id} aria-pressed={joint.id === selectedId} onClick={() => selectJoint(joint.id)}>{joint.shortLabel}</button>)}</div>
      </div>
      <div className="orientation-grid">{(['pitch', 'yaw', 'roll'] as const).map((key) => <label key={key}><span>{key[0].toUpperCase() + key.slice(1)} <output>{stageOrientation[key].toFixed(source === 'serial' ? 1 : 0)}°</output></span><input type="range" min="-35" max="35" value={stageOrientation[key]} disabled={source === 'serial'} onChange={(event) => setOrientation((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</div>
      <label className="speed-control"><span>动作速度 <output>{source === 'serial' ? '由实测信号决定' : `${speed}°/s`}</output></span><input type="range" min="16" max="100" value={speed} disabled={source === 'serial'} onChange={(event) => setSpeed(Number(event.target.value))} /></label>
      {source === 'teaching' ? <div className="preset-block"><span>预设动作</span><div>{(Object.keys(mappingPresets) as Array<keyof typeof mappingPresets>).map((key) => <button key={key} onClick={() => choosePreset(key)}>{mappingPresets[key].label}</button>)}</div></div> : <div className="serial-calibration-block"><span>实物关节识别与角度标定</span><button className="mapping-detect-button" onClick={detectSerialMapping} disabled={!serialActive || !serial.baselineProgress || (serial.mappingCalibrationJoint !== null && serial.mappingCalibrationJoint !== selectedId)}>{serial.mappingCalibrationJoint === selectedId ? '完成识别' : '识别当前实物关节'}</button><div><button onClick={startSerialCalibration} disabled={!serialActive || !serial.baselineProgress || serial.mappingCalibrationJoint !== null}>开始 0→90°</button><button onClick={finishSerialCalibration} disabled={serial.calibrationJoint !== selectedId}>完成 90°</button><button onClick={() => { serial.flipPolarity(selectedId); setSerialNotice('通道极性已反向，请保持静止重新校零。') }}>反向极性</button></div>{serialNotice && <p>{serialNotice}</p>}</div>}
      <div className="play-controls"><button className="primary-button" onClick={() => source === 'serial' ? serial.resetAngles() : setPlaying((value) => !value)}>{source === 'serial' ? <RotateCcw size={18} /> : playing ? <Pause size={18} /> : <Play size={18} />}{source === 'serial' ? '角度归零' : playing ? '暂停' : '播放'}</button><button onClick={resetAll}><RotateCcw size={18} />重置</button></div>
      <div className="source-switch" role="group" aria-label="数据源"><button aria-pressed={source === 'teaching'} onClick={() => { setSource('teaching'); setPlaying(true) }}>教学推演</button><button aria-pressed={source === 'serial'} onClick={() => { setSource('serial'); setPlaying(false); if (serial.state === 'idle' || serial.state === 'error') void serial.connect() }}><Radio size={14} />实时串口</button></div>
      <dl className="result-readout">
        <div><dt>{source === 'serial' ? '当前关节角' : '目标角度'}</dt><dd>{Math.round(source === 'serial' ? mappedAngle : targetAngle)}°</dd></div>
        <div><dt>{source === 'serial' ? 'SIA 实时角度' : 'SIA 推演角度'}</dt><dd>{metrics.siaAngle.toFixed(1)}°</dd></div>
        <div><dt>当前差分</dt><dd>{formatV(metrics.currentDifferential)}</dd></div>
        <div><dt>运动阶段</dt><dd>{metrics.phase}</dd></div>
        <div><dt>内部滤波</dt><dd>ESP32 · 二阶 6 Hz</dd></div>
        <div><dt>积分阈值</dt><dd>{metrics.thresholdTriggered ? '已触发' : '未触发'}{source === 'serial' ? ` · ${(serial.integrationThreshold * 1000).toFixed(0)} mV` : ''}</dd></div>
      </dl>
      <p className="sr-only" aria-live="polite">当前选择{selected.label}，{source === 'serial' ? `串口映射角度${mappedAngle.toFixed(1)}` : `目标角度${Math.round(targetAngle)}`}度，当前显示{displayMode === 'raw' ? '原始双通道' : '差分有效信号'}。</p>
    </aside>
  </section>
}
