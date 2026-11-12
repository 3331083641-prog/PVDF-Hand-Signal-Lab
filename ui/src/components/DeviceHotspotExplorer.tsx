import { ArrowLeft, ArrowRight, CircleStop, Focus, Layers, Play, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { deviceParts, jointHotspots } from '../data/jointHotspots'
import { defaultJointAngles } from '../data/mappingPresets'
import { navigate } from './AppShell'
import { HSADHand3D, type HSADSelection, type HSADSelectionEvent } from './hand3d/HSADHand3D'
import { useTeachingMode } from './TeachingMode'

const fingerGroups = [
  { name: '拇指', prefix: 'T', joints: ['T2', 'T1'] },
  { name: '食指', prefix: 'I', joints: ['I3', 'I2', 'I1'] },
  { name: '中指', prefix: 'M', joints: ['M3', 'M2', 'M1'] },
  { name: '无名指', prefix: 'R', joints: ['R3', 'R2', 'R1'] },
  { name: '小指', prefix: 'L', joints: ['L3', 'L2', 'L1'] },
] as const

export function DeviceHotspotExplorer() {
  const { mode } = useTeachingMode()
  const stageRef = useRef<HTMLDivElement>(null)
  const [category, setCategory] = useState<'joint' | 'part'>('joint')
  const [selected, setSelected] = useState<HSADSelection>({ type: 'joint', id: 'T2' })
  const [playing, setPlaying] = useState(mode === 'teacher')
  const [resetNonce, setResetNonce] = useState(0)
  const [lifted, setLifted] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [popover, setPopover] = useState({ x: 74, y: 32 })

  const options = category === 'joint' ? jointHotspots : deviceParts
  const index = Math.max(0, options.findIndex((item) => item.id === selected.id))
  const joint = useMemo(() => selected.type === 'joint' ? jointHotspots.find((item) => item.id === selected.id) : undefined, [selected])
  const part = useMemo(() => selected.type === 'part' ? deviceParts.find((item) => item.id === selected.id) : undefined, [selected])

  useEffect(() => {
    if (!playing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => {
      const next = (index + 1) % options.length
      setLifted(true)
      setSelected({ type: category, id: options[next].id })
      setPopover({ x: 73, y: 30 + (next % 3) * 11 })
    }, 2800)
    return () => window.clearInterval(timer)
  }, [category, index, options, playing])

  const chooseCategory = (next: 'joint' | 'part') => {
    setCategory(next)
    setLifted(true)
    setPlaying(false)
    setSelected({ type: next, id: (next === 'joint' ? jointHotspots[0] : deviceParts[0]).id })
  }

  const selectFromModel = (value: HSADSelectionEvent) => {
    const rect = stageRef.current?.getBoundingClientRect()
    setLifted(true)
    setPlaying(false)
    setCategory(value.type)
    setSelected({ type: value.type, id: value.id })
    if (rect) {
      setPopover({
        x: Math.min(78, Math.max(38, (value.clientX - rect.left) / rect.width * 100 + 3)),
        y: Math.min(68, Math.max(16, (value.clientY - rect.top) / rect.height * 100 - 4)),
      })
    }
  }

  const move = (delta: number) => {
    const next = (index + delta + options.length) % options.length
    setLifted(true)
    setSelected({ type: category, id: options[next].id })
    setPopover({ x: 74, y: 28 + (next % 4) * 8 })
  }

  return (
    <section className="device-explorer" aria-label="三维装置交互检视">
      <div className="device-stage" ref={stageRef}>
        {/* Optical stage reticle marks */}
        <div className="stage-reticle reticle-tl" />
        <div className="stage-reticle reticle-tr" />
        <div className="stage-reticle reticle-bl" />
        <div className="stage-reticle reticle-br" />
        <div className="stage-axis-indicator">
          <span>HSAD-3D STAGE · CAD V7</span>
          <span className="stage-scale-indicator">1:1 解剖比例</span>
        </div>

        {/* Top Bezel Toolbar */}
        <div className="instrument-toolbar">
          <div className="toolbar-group category-group" role="group" aria-label="查看对象分类">
            <button
              aria-pressed={category === 'joint'}
              onClick={() => chooseCategory('joint')}
              className={`toolbar-btn ${category === 'joint' ? 'is-active' : ''}`}
            >
              <Focus size={15} />
              <span>14 个检测单元</span>
            </button>
            <button
              aria-pressed={category === 'part'}
              onClick={() => chooseCategory('part')}
              className={`toolbar-btn ${category === 'part' ? 'is-active' : ''}`}
            >
              <Layers size={15} />
              <span>装置核心器件</span>
            </button>
          </div>

          <div className="toolbar-group assembly-tools">
            <button
              aria-pressed={expanded}
              onClick={() => {
                setExpanded(!expanded)
                setLifted(false)
                setPlaying(false)
                setResetNonce((value) => value + 1)
              }}
              className={`toolbar-btn ${expanded ? 'is-expanded' : ''}`}
              title="整体拆解/合拢装置结构"
            >
              <span className={`status-led ${expanded ? 'led-active' : 'led-idle'}`} />
              <Layers size={15} />
              <span>{expanded ? '合拢装置' : '整体拆解'}</span>
            </button>

            <button
              onClick={() => {
                setExpanded(false)
                setLifted(false)
                setPlaying(false)
                setResetNonce((value) => value + 1)
              }}
              className="toolbar-btn"
              title="复位至正对手背初始视角"
            >
              <RotateCcw size={15} />
              <span>复位视角</span>
            </button>
          </div>
        </div>

        {/* 3D Hand Model */}
        <HSADHand3D
          angles={defaultJointAngles}
          presentation="device"
          selected={selected}
          onSelect={selectFromModel}
          resetNonce={resetNonce}
          lifted={lifted}
          expanded={expanded}
        />

        {/* Inspection Popover */}
        <aside
          className="device-popover"
          style={{ left: `${popover.x}%`, top: `${popover.y}%` }}
          aria-live="polite"
        >
          <div className="popover-header">
            <span className="popover-eyebrow">
              <Focus size={13} />
              {joint ? `检测单元 ${joint.channel} · ${joint.id}` : '装置器件'}
            </span>
            <span className="popover-chip">{joint ? '双层PVDF' : 'PCB/FPC'}</span>
          </div>

          <strong className="popover-title">{joint?.label ?? part?.label}</strong>

          {joint ? (
            <div className="popover-metrics">
              <div className="metric-box">
                <span className="metric-label">原始通道</span>
                <span className="metric-val">CH{joint.rawChannels[0]} / CH{joint.rawChannels[1]}</span>
              </div>
              <div className="metric-box">
                <span className="metric-label">差分输出</span>
                <span className="metric-val val-accent">{joint.differential}</span>
              </div>
              <div className="metric-box">
                <span className="metric-label">解剖位置</span>
                <span className="metric-val">{joint.finger} {joint.joint}</span>
              </div>
            </div>
          ) : (
            <p className="popover-desc">{part?.description}</p>
          )}

          <button className="popover-action-btn" onClick={() => navigate('/lab')}>
            <span>在实验台中追踪信号</span>
            <ArrowRight size={14} />
          </button>
        </aside>

        {/* Bottom Finger Grouped Navigation / Part Selector */}
        {category === 'joint' ? (
          <div className="stage-finger-rail" aria-label="按手指快速选择关节">
            {fingerGroups.map((group) => (
              <div key={group.name} className="finger-group-col">
                <span className="finger-col-label">{group.name}</span>
                <div className="finger-col-btns">
                  {group.joints.map((jointId) => {
                    const isSelected = selected.id === jointId
                    const jointObj = jointHotspots.find((j) => j.id === jointId)
                    return (
                      <button
                        key={jointId}
                        aria-pressed={isSelected}
                        onClick={() => {
                          setPlaying(false)
                          setLifted(true)
                          setSelected({ type: 'joint', id: jointId })
                        }}
                        className={`joint-tag-btn ${isSelected ? 'is-selected' : ''}`}
                        title={`${group.name} ${jointObj?.label ?? jointId}`}
                      >
                        <span className="joint-id-text">{jointId}</span>
                        <small className="joint-name-text">{jointObj?.shortLabel.replace(group.name, '')}</small>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="stage-index stage-part-index" aria-label="装置器件快速选择">
            {deviceParts.map((item) => (
              <button
                key={item.id}
                aria-pressed={item.id === selected.id}
                onClick={() => {
                  setPlaying(false)
                  setLifted(true)
                  setSelected({ type: 'part', id: item.id })
                }}
                className={`part-tag-btn ${item.id === selected.id ? 'is-selected' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* Sequence Control Pill */}
        <div className="stage-sequence">
          <select
            className="device-compact-select"
            aria-label="选择讲解对象"
            value={selected.id}
            onChange={(event) => {
              setPlaying(false)
              setLifted(true)
              setSelected({ type: category, id: event.target.value })
            }}
          >
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <button onClick={() => move(-1)} aria-label="上一个讲解对象" className="seq-nav-btn">
            <ArrowLeft size={15} />
          </button>
          <button
            onClick={() => setPlaying((value) => !value)}
            className={`seq-play-btn ${playing ? 'is-playing' : ''}`}
          >
            {playing ? <CircleStop size={15} /> : <Play size={15} />}
            <span>{playing ? '暂停讲解' : '自动讲解'}</span>
          </button>
          <span className="seq-counter">
            <b>{String(index + 1).padStart(2, '0')}</b> / {String(options.length).padStart(2, '0')}
          </span>
          <button onClick={() => move(1)} aria-label="下一个讲解对象" className="seq-nav-btn">
            <ArrowRight size={15} />
          </button>
        </div>
      </div>

      {/* Observation Takeaway Banner */}
      <div className="stage-takeaway">
        <div className="takeaway-left">
          <span className="takeaway-badge">差分拓扑</span>
          <span className="takeaway-text">
            双层 PVDF 反向电压输出差分消除共模噪声，提取动态弯曲有效信号。
          </span>
        </div>
        <button className="takeaway-jump-btn" onClick={() => navigate('/physics')}>
          <span>PVDF 压电机理</span>
          <ArrowRight size={15} />
        </button>
      </div>
    </section>
  )
}
