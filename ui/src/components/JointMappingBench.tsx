import { Cable, CircleAlert, Pause, Play, Radio, RotateCcw, Unplug, Cpu, Waves, Activity } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { jointHotspots, type JointId } from '../data/jointHotspots'
import { defaultJointAngles, mappingPresets, type JointAngles } from '../data/mappingPresets'
import { useHsadSerial } from '../serial/useHsadSerial'
import { useHsadSignal } from '../simulation/useHsadSignal'
import type { SignalDisplayMode } from '../simulation/signalTypes'
import { HSADHand3D, type HSADSelectionEvent } from './hand3d/HSADHand3D'
import { RealtimeSignalChart } from './RealtimeSignalChart'

const formatV = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(3)} V`
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
    if (serial.state === 'unsupported') return '浏览器不支持 WebSerial'
    if (serial.state === 'requesting') return '等待选择 COM8'
    if (serial.state === 'opening') return '正在打开串口'
    if (serial.state === 'calibrating') return `零点校准 ${Math.round(serial.baselineProgress * 100)}%`
    if (serial.state === 'connected') return `${serial.metrics.sampleRate.toFixed(1)} Hz 在线`
    if (serial.state === 'stale') return '数据暂停接收'
    if (serial.state === 'error') return '串口异常'
    return '硬件未连接'
  })()

  const startSerialCalibration = () => {
    try {
      serial.startCalibration(selectedId)
      setSerialNotice(`标定中：请将${selected.shortLabel}从 0° 连续弯曲到 90°，然后点击“完成 90°”。`)
    } catch (reason) {
      setSerialNotice(reason instanceof Error ? reason.message : '无法开始标定。')
    }
  }

  const finishSerialCalibration = () => {
    try {
      const gain = serial.finishCalibration()
      setSerialNotice(`${selected.shortLabel}标定完成，增益 ${gain.toFixed(2)} °/(V·s)。`)
    } catch (reason) {
      setSerialNotice(reason instanceof Error ? reason.message : '无法完成标定。')
    }
  }

  const detectSerialMapping = () => {
    try {
      if (serial.mappingCalibrationJoint === selectedId) {
        const result = serial.finishJointMapping()
        setSerialNotice(
          `${selected.shortLabel}已绑定实物源 ${result.sourceJointId}（CH${result.rawChannels[0]}/CH${result.rawChannels[1]}），峰值 ${(result.peak * 1000).toFixed(1)} mV，区分度 ${result.confidence.toFixed(2)}。请重新执行 0→90° 角度标定。`
        )
      } else {
        serial.startJointMapping(selectedId)
        setSerialNotice(`通道识别中：固定其他手指，只连续弯曲实物${selected.shortLabel} 3 次，然后点击“完成识别”。`)
      }
    } catch (reason) {
      setSerialNotice(reason instanceof Error ? reason.message : '无法完成通道识别。')
    }
  }

  return (
    <section className="mapping-bench" aria-label="关节信号与动作映射实验台">
      {/* Column 1: Signal Oscilloscope & Conditioning */}
      <aside className="bench-wave-panel">
        <div className="bench-section-head">
          <div>
            <span className="section-badge-code">MODULE 01 · 信号示波</span>
            <strong className="bench-section-title">{selected.label}</strong>
          </div>
          <span
            className={
              source === 'teaching'
                ? 'source-badge'
                : `source-badge ${serial.state === 'connected' ? 'live' : 'waiting'}`
            }
          >
            <span className="badge-status-dot" />
            <span>{source === 'teaching' ? '教学推演' : serialStatus}</span>
          </span>
        </div>

        <div className="bench-channel-selector">
          <label className="compact-select">
            <span className="compact-select-label">当前监测关节与通道对</span>
            <select
              value={selectedId}
              onChange={(event) => selectJoint(event.target.value as JointId)}
              className="channel-select-input"
            >
              {jointHotspots.map((joint) => (
                <option value={joint.id} key={joint.id}>
                  {joint.channel}. {joint.label} [CH{joint.rawChannels[0]}/CH{joint.rawChannels[1]} → {joint.differential}]
                </option>
              ))}
            </select>
          </label>
        </div>

        {source === 'serial' && (
          <div className="serial-source-map">
            <span className="source-map-tag">实物映射</span>
            <span>源: {serial.sourceJointId} · CH{serial.rawChannelPair[0]}/CH{serial.rawChannelPair[1]} · 已标定 {serial.mappingCalibratedCount}/14</span>
          </div>
        )}

        <div className="segmented-control" role="group" aria-label="示波器显示模式">
          <button
            aria-pressed={displayMode === 'raw'}
            onClick={() => setDisplayMode('raw')}
            className={`seg-btn ${displayMode === 'raw' ? 'is-active' : ''}`}
          >
            <Waves size={14} />
            <span>原始双通道 (V+ / V−)</span>
          </button>
          <button
            aria-pressed={displayMode === 'differential'}
            onClick={() => setDisplayMode('differential')}
            className={`seg-btn ${displayMode === 'differential' ? 'is-active' : ''}`}
          >
            <Activity size={14} />
            <span>差分有效信号 (Udiff)</span>
          </button>
        </div>

        {source === 'serial' && !serialActive ? (
          <div className="serial-empty" role="status">
            <div className="serial-empty-icon">
              {serial.state === 'error' ? <CircleAlert size={28} /> : <Cable size={28} />}
            </div>
            <strong>{serial.state === 'unsupported' ? '请使用桌面版 Chromium 内核浏览器' : '连接实物采集板 USB-SERIAL CH340K'}</strong>
            <span>在浏览器端口选择器中选择 COM8。通信协议：460800 baud、31 字段数据帧、80 Hz 实时传输。</span>
            {serial.error && <em className="serial-error-msg">{serial.error}</em>}
            <button
              type="button"
              onClick={() => void serial.connect()}
              disabled={
                serial.state === 'unsupported' ||
                serial.state === 'requesting' ||
                serial.state === 'opening'
              }
              className="serial-connect-btn"
            >
              <Cable size={16} />
              <span>连接实物串口 (COM8)</span>
            </button>
          </div>
        ) : (
          <RealtimeSignalChart history={history} mode={displayMode} />
        )}

        {source === 'serial' && serialActive && (
          <div className="serial-toolbar" aria-live="polite">
            <div className="serial-toolbar-info">
              <b>{serial.deviceLabel}</b>
              <span>
                {serial.state === 'calibrating'
                  ? '保持平放静止 2 秒校准零点；首次动作请弯曲。'
                  : `有效: ${serial.validFrames} | 丢帧: ${serial.invalidFrames} | 标定: ${serial.calibratedCount}/14`}
              </span>
            </div>
            <div className="serial-toolbar-btns">
              <button onClick={serial.rebaseline} className="serial-btn">重校零点</button>
              <button onClick={() => void serial.disconnect()} className="serial-btn btn-danger">
                <Unplug size={13} />
                <span>断开</span>
              </button>
            </div>
          </div>
        )}

        {source === 'serial' && serial.channelWarning && (
          <div className="serial-channel-warning" role="alert">
            <CircleAlert size={15} />
            <span>{serial.channelWarning}，请检查硬件接线或调理电路。</span>
          </div>
        )}

        {/* 6 Signal Metrics Readouts */}
        <div className="signal-metrics">
          <div className="metric-cell">
            <small>V+ 当前正相</small>
            <b className="val-positive">{metrics.currentVPlus.toFixed(3)} V</b>
          </div>
          <div className="metric-cell">
            <small>V− 当前反相</small>
            <b className="val-negative">{metrics.currentVMinus.toFixed(3)} V</b>
          </div>
          <div className="metric-cell">
            <small>信号峰值 (Peak)</small>
            <b>{formatV(metrics.peak)}</b>
          </div>
          <div className="metric-cell">
            <small>信号谷值 (Valley)</small>
            <b>{formatV(metrics.valley)}</b>
          </div>
          <div className="metric-cell">
            <small>峰峰值 (Vpp)</small>
            <b>{metrics.vpp.toFixed(3)} V</b>
          </div>
          <div className="metric-cell">
            <small>有效采样率</small>
            <b className="val-accent">{metrics.sampleRate} Hz</b>
          </div>
        </div>

        <div className="formula-strip">
          <span className="formula-tag">共模抑制公式</span>
          <code>Udiff(t) = [ V+(t) − V−(t) ] / 2</code>
        </div>
      </aside>

      {/* Column 2: 3D Kinematics Hand Stage */}
      <div className="bench-model-panel">
        <div className="model-panel-head">
          <div>
            <span className="section-badge-code">MODULE 02 · 姿态映射</span>
            <strong className="bench-section-title">3D 骨骼解剖映射</strong>
          </div>
          <button
            onClick={() => setResetNonce((value) => value + 1)}
            className="panel-reset-btn"
            title="复位 3D 观察相机"
          >
            <RotateCcw size={15} />
            <span>复位视角</span>
          </button>
        </div>

        {/* Optical stage reticle marks */}
        <div className="stage-reticle reticle-tl" />
        <div className="stage-reticle reticle-tr" />
        <div className="stage-reticle reticle-bl" />
        <div className="stage-reticle reticle-br" />

        <HSADHand3D
          angles={stageAngles}
          pitch={stageOrientation.pitch}
          yaw={stageOrientation.yaw}
          roll={stageOrientation.roll}
          selected={{ type: 'joint', id: selectedId }}
          onSelect={modelSelect}
          resetNonce={resetNonce}
          presentation="mapping"
        />

        {/* Flight Telemetry Status Banner */}
        <div className="mapping-status" aria-live="polite">
          <div className="status-phase-wrap">
            <span className={`phase-led phase-${metrics.phase}`} />
            <span className="status-phase-text">{metrics.phase}</span>
          </div>

          <div className="status-telemetry-mid">
            <span className="telemetry-mid-source">
              {source === 'serial' ? '串口物理采集输入' : '教学推演输入轨迹'}
            </span>
            <span className="telemetry-mid-values">
              真值 {physicalAngle.toFixed(1)}° · 差分 {formatV(metrics.currentDifferential)}
            </span>
          </div>

          <div className="status-joint-badge">
            <span className="joint-badge-tag">当前关节</span>
            <span className="joint-badge-name">{selected.shortLabel}</span>
          </div>

          <div className="status-primary-readout">
            <output className="status-angle-out">{mappedAngle.toFixed(1)}°</output>
            <span className="status-angle-lbl">SIA 积分角</span>
          </div>
        </div>
      </div>

      {/* Column 3: Experiment Control Center */}
      <aside className="bench-control-panel">
        <div className="bench-section-head">
          <div>
            <span className="section-badge-code">MODULE 03 · 实验控制</span>
            <strong className="bench-section-title">{selected.label}</strong>
          </div>
          <output className="head-angle-gauge">
            {Math.round(source === 'serial' ? mappedAngle : targetAngle)}°
          </output>
        </div>

        {/* Joint Picker with Anatomical Finger Tabs */}
        <div className="joint-picker-container">
          <span className="picker-block-title">选择解剖关节</span>
          <div className="joint-picker">
            <div className="finger-tabs" role="tablist" aria-label="手指快速选择">
              {fingers.map((finger) => {
                const firstJoint = jointHotspots.find((joint) => joint.finger === finger)
                const isActive = selected.finger === finger
                return (
                  <button
                    type="button"
                    role="tab"
                    key={finger}
                    aria-selected={isActive}
                    onClick={() => firstJoint && selectJoint(firstJoint.id)}
                    className={`finger-tab-btn ${isActive ? 'is-active' : ''}`}
                  >
                    {finger}
                  </button>
                )
              })}
            </div>
            <div className="joint-grid" aria-label={`${selected.finger}关节选择`}>
              {siblingJoints.map((joint) => {
                const isSelected = joint.id === selectedId
                return (
                  <button
                    type="button"
                    key={joint.id}
                    aria-pressed={isSelected}
                    onClick={() => selectJoint(joint.id)}
                    className={`joint-sub-btn ${isSelected ? 'is-selected' : ''}`}
                  >
                    <span className="joint-sub-code">{joint.id}</span>
                    <span className="joint-sub-lbl">{joint.shortLabel.replace(selected.finger, '')}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Target Angle Slider */}
        <label className="primary-range">
          <div className="range-head">
            <span className="range-title">{source === 'serial' ? '实物串口映射角' : '关节目标弯曲角'}</span>
            <output className="range-val">{Math.round(source === 'serial' ? mappedAngle : targetAngle)}°</output>
          </div>
          <input
            type="range"
            min="0"
            max="90"
            value={source === 'serial' ? mappedAngle : targetAngle}
            disabled={source === 'serial'}
            onChange={(event) => {
              setContinuous(false)
              setTargetAngle(Number(event.target.value))
            }}
            className="slider-input"
          />
        </label>

        {/* Spatial Orientation Grid */}
        <div className="orientation-section">
          <span className="picker-block-title">三轴空间姿态微调</span>
          <div className="orientation-grid">
            {(['pitch', 'yaw', 'roll'] as const).map((key) => (
              <label key={key} className="orient-cell">
                <div className="orient-head">
                  <span>{key[0].toUpperCase() + key.slice(1)}</span>
                  <output>{stageOrientation[key].toFixed(source === 'serial' ? 1 : 0)}°</output>
                </div>
                <input
                  type="range"
                  min="-35"
                  max="35"
                  value={stageOrientation[key]}
                  disabled={source === 'serial'}
                  onChange={(event) =>
                    setOrientation((current) => ({ ...current, [key]: Number(event.target.value) }))
                  }
                  className="slider-input slider-mini"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Speed Slider */}
        <label className="speed-control">
          <div className="speed-head">
            <span>动作过渡角速度</span>
            <output>{source === 'serial' ? '由实测信号决定' : `${speed}°/s`}</output>
          </div>
          <input
            type="range"
            min="16"
            max="100"
            value={speed}
            disabled={source === 'serial'}
            onChange={(event) => setSpeed(Number(event.target.value))}
            className="slider-input slider-mini"
          />
        </label>

        {/* Presets or Calibration Block */}
        {source === 'teaching' ? (
          <div className="preset-block">
            <span className="picker-block-title">典型动作预设</span>
            <div className="preset-btns">
              {(Object.keys(mappingPresets) as Array<keyof typeof mappingPresets>).map((key) => (
                <button
                  key={key}
                  onClick={() => choosePreset(key)}
                  className="preset-btn"
                >
                  {mappingPresets[key].label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="serial-calibration-block">
            <span className="picker-block-title">实物关节识别与增益标定</span>
            <button
              className="mapping-detect-button"
              onClick={detectSerialMapping}
              disabled={
                !serialActive ||
                !serial.baselineProgress ||
                (serial.mappingCalibrationJoint !== null && serial.mappingCalibrationJoint !== selectedId)
              }
            >
              {serial.mappingCalibrationJoint === selectedId ? '完成通道识别' : '识别当前实物关节通道'}
            </button>
            <div className="serial-calib-btns">
              <button
                onClick={startSerialCalibration}
                disabled={!serialActive || !serial.baselineProgress || serial.mappingCalibrationJoint !== null}
                className="calib-btn"
              >
                开始 0→90°
              </button>
              <button
                onClick={finishSerialCalibration}
                disabled={serial.calibrationJoint !== selectedId}
                className="calib-btn"
              >
                完成 90°
              </button>
              <button
                onClick={() => {
                  serial.flipPolarity(selectedId)
                  setSerialNotice('通道极性已反向，请保持静止重新校零。')
                }}
                className="calib-btn"
              >
                反向极性
              </button>
            </div>
            {serialNotice && <p className="serial-notice-msg">{serialNotice}</p>}
          </div>
        )}

        {/* Play & Reset Controller */}
        <div className="play-controls">
          <button
            className="play-primary-btn"
            onClick={() => (source === 'serial' ? serial.resetAngles() : setPlaying((value) => !value))}
          >
            {source === 'serial' ? (
              <RotateCcw size={16} />
            ) : playing ? (
              <Pause size={16} />
            ) : (
              <Play size={16} />
            )}
            <span>{source === 'serial' ? '角度归零' : playing ? '暂停仿真' : '继续仿真'}</span>
          </button>
          <button onClick={resetAll} className="play-reset-btn" title="复位全部关节与姿态">
            <RotateCcw size={16} />
            <span>全局复位</span>
          </button>
        </div>

        {/* Source Mode Switcher */}
        <div className="source-switch-wrap">
          <span className="picker-block-title">实验数据源模式</span>
          <div className="source-switch" role="group" aria-label="数据源选择">
            <button
              aria-pressed={source === 'teaching'}
              onClick={() => {
                setSource('teaching')
                setPlaying(true)
              }}
              className={`source-btn ${source === 'teaching' ? 'is-active' : ''}`}
            >
              <Cpu size={14} />
              <span>教学推演</span>
            </button>
            <button
              aria-pressed={source === 'serial'}
              onClick={() => {
                setSource('serial')
                setPlaying(false)
                if (serial.state === 'idle' || serial.state === 'error') void serial.connect()
              }}
              className={`source-btn ${source === 'serial' ? 'is-active is-serial' : ''}`}
            >
              <Radio size={14} />
              <span>实时串口 (COM8)</span>
            </button>
          </div>
        </div>

        {/* 6 Readout Parameters */}
        <dl className="result-readout">
          <div className="readout-cell">
            <dt>{source === 'serial' ? '实物映射角' : '仿真目标角'}</dt>
            <dd>{Math.round(source === 'serial' ? mappedAngle : targetAngle)}°</dd>
          </div>
          <div className="readout-cell">
            <dt>{source === 'serial' ? 'SIA 实时积分角' : 'SIA 推演积分角'}</dt>
            <dd className="val-accent">{metrics.siaAngle.toFixed(1)}°</dd>
          </div>
          <div className="readout-cell">
            <dt>当前瞬态差分</dt>
            <dd>{formatV(metrics.currentDifferential)}</dd>
          </div>
          <div className="readout-cell">
            <dt>运动阶段判别</dt>
            <dd>{metrics.phase}</dd>
          </div>
          <div className="readout-cell">
            <dt>DSP 内部滤波</dt>
            <dd>二阶巴特沃斯 6 Hz</dd>
          </div>
          <div className="readout-cell">
            <dt>SIA 积分阈值</dt>
            <dd>
              {metrics.thresholdTriggered ? '已触发' : '静止未触发'}
              {source === 'serial' ? ` (${(serial.integrationThreshold * 1000).toFixed(0)}mV)` : ''}
            </dd>
          </div>
        </dl>

        <p className="sr-only" aria-live="polite">
          当前选择{selected.label}，
          {source === 'serial' ? `串口映射角度${mappedAngle.toFixed(1)}` : `目标角度${Math.round(targetAngle)}`}
          度，当前显示{displayMode === 'raw' ? '原始双通道' : '差分有效信号'}。
        </p>
      </aside>
    </section>
  )
}
