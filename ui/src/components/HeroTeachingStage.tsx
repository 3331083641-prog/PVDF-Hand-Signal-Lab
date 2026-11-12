import {
  ArrowRight,
  BookOpenCheck,
  CirclePlay,
  Cpu,
  Crosshair,
  FlaskConical,
  Focus,
  Layers,
  ScanSearch,
  Zap,
} from 'lucide-react'
import { useState, useRef, type MouseEvent } from 'react'
import { getImageAsset } from '../data/imageAssets'
import { navigate } from './AppShell'
import { useTeachingMode } from './TeachingMode'

interface GloveHotspot {
  id: string
  label: string
  type: 'dip-pip' | 'mcp' | 'mcu'
  x: number // percentage
  y: number // percentage
  channels: string
  diff: string
  role: string
}

const GLOVE_HOTSPOTS: GloveHotspot[] = [
  // Thumb
  { id: 'T2', label: '拇指 IP', type: 'dip-pip', x: 23, y: 55, channels: 'CH1/CH2', diff: 'D1', role: '指间关节' },
  { id: 'T1', label: '拇指 MCP', type: 'mcp', x: 31, y: 68, channels: 'CH3/CH4', diff: 'D2', role: '掌指关节' },
  // Index
  { id: 'I3', label: '食指 DIP', type: 'dip-pip', x: 39, y: 22, channels: 'CH5/CH6', diff: 'D3', role: '远端指间' },
  { id: 'I2', label: '食指 PIP', type: 'dip-pip', x: 42, y: 35, channels: 'CH7/CH8', diff: 'D4', role: '近端指间' },
  { id: 'I1', label: '食指 MCP', type: 'mcp', x: 45, y: 53, channels: 'CH9/CH10', diff: 'D5', role: '掌指关节' },
  // Middle
  { id: 'M3', label: '中指 DIP', type: 'dip-pip', x: 52, y: 15, channels: 'CH11/CH12', diff: 'D6', role: '远端指间' },
  { id: 'M2', label: '中指 PIP', type: 'dip-pip', x: 53, y: 30, channels: 'CH13/CH14', diff: 'D7', role: '近端指间' },
  { id: 'M1', label: '中指 MCP', type: 'mcp', x: 54, y: 50, channels: 'CH15/CH16', diff: 'D8', role: '掌指关节' },
  // Ring
  { id: 'R3', label: '无名指 DIP', type: 'dip-pip', x: 65, y: 23, channels: 'CH17/CH18', diff: 'D9', role: '远端指间' },
  { id: 'R2', label: '无名指 PIP', type: 'dip-pip', x: 65, y: 36, channels: 'CH19/CH20', diff: 'D10', role: '近端指间' },
  { id: 'R1', label: '无名指 MCP', type: 'mcp', x: 64, y: 53, channels: 'CH21/CH22', diff: 'D11', role: '掌指关节' },
  // Little
  { id: 'L3', label: '小指 DIP', type: 'dip-pip', x: 77, y: 35, channels: 'CH23/CH24', diff: 'D12', role: '远端指间' },
  { id: 'L2', label: '小指 PIP', type: 'dip-pip', x: 76, y: 46, channels: 'CH25/CH26', diff: 'D13', role: '近端指间' },
  { id: 'L1', label: '小指 MCP', type: 'mcp', x: 74, y: 59, channels: 'CH27/CH28', diff: 'D14', role: '掌指关节' },
  // MCU
  { id: 'MCU', label: 'ESP32-S3 主控板', type: 'mcu', x: 54, y: 84, channels: '28路 ADC', diff: '80Hz', role: '差分调理/主控' },
]

export function HeroTeachingStage() {
  const asset = getImageAsset('hero')
  const { mode, setMode } = useTeachingMode()
  const visualRef = useRef<HTMLDivElement>(null)

  // Interactive 3D tilt & cursor tracking
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, px: 50, py: 50, isHover: false })
  const [coord, setCoord] = useState({ x: 120.4, y: 86.2 })
  const [selectedHotspot, setSelectedHotspot] = useState<GloveHotspot | null>(GLOVE_HOTSPOTS[3]) // default I2
  const [filterLayer, setFilterLayer] = useState<'all' | 'dip-pip' | 'mcp' | 'mcu'>('all')
  const [scanning, setScanning] = useState(true)

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!visualRef.current) return
    const rect = visualRef.current.getBoundingClientRect()
    const px = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
    const py = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100))
    // Calculate 3D tilt angles (limit to -8 to +8 deg)
    const rx = ((py - 50) / 50) * -7
    const ry = ((px - 50) / 50) * 8
    setTilt({ rx, ry, px, py, isHover: true })
    setCoord({
      x: Number((80 + px * 1.15).toFixed(1)),
      y: Number((40 + py * 0.95).toFixed(1)),
    })
  }

  const handleMouseLeave = () => {
    setTilt({ rx: 0, ry: 0, px: 50, py: 50, isHover: false })
  }

  const activeHotspots = GLOVE_HOTSPOTS.filter(
    (h) => filterLayer === 'all' || h.type === filterLayer
  )

  return (
    <section className="teaching-hero" aria-labelledby="home-title">
      {/* Left Column: Subtracted, Concise, Instrument-Grade Text */}
      <div className="hero-instrument-copy">
        <div className="hero-eyebrow">
          <span className="hero-tag">高校科研平台</span>
          <span className="hero-tag-sep">/</span>
          <span className="hero-tag-secondary">柔性 PVDF 压电传感与动作解算系统</span>
        </div>

        <h1 id="home-title" data-page-title tabIndex={-1}>
          从手指弯曲信号，<br />
          解析手势动作
        </h1>

        <p className="hero-lead">
          柔性双层 PVDF 阵列采集 28 路动态电压，经差分共模抑制与 SIA 算法恢复 14 关节角度，驱动 3D 动作映射。
        </p>

        <div className="hero-actions">
          <button className="primary-button hero-cta-btn" onClick={() => navigate('/device')}>
            <span>进入三维装置</span>
            <ArrowRight size={16} />
          </button>
          <button className="secondary-button hero-lab-btn" onClick={() => navigate('/lab')}>
            <FlaskConical size={16} />
            <span>信号映射实验台</span>
          </button>
        </div>

        {/* Compact Tactile Mode Toggle */}
        <div className="mode-toggle-compact" role="group" aria-label="教学模式切换">
          <span className="mode-compact-lbl">模式：</span>
          <button
            type="button"
            aria-pressed={mode === 'teacher'}
            onClick={() => setMode('teacher')}
            className={`mode-pill-btn ${mode === 'teacher' ? 'is-active' : ''}`}
          >
            <CirclePlay size={14} />
            <span>课堂演示</span>
          </button>
          <button
            type="button"
            aria-pressed={mode === 'student'}
            onClick={() => setMode('student')}
            className={`mode-pill-btn ${mode === 'student' ? 'is-active' : ''}`}
          >
            <BookOpenCheck size={14} />
            <span>自由探索</span>
          </button>
        </div>

        {/* Crisp Scientific Telemetry Matrix (Subtitles removed) */}
        <dl className="hero-facts">
          <div className="fact-item">
            <dt>检测单元</dt>
            <dd>14 <small>个</small></dd>
          </div>
          <div className="fact-item">
            <dt>原始通道</dt>
            <dd>28 <small>路</small></dd>
          </div>
          <div className="fact-item">
            <dt>差分输出</dt>
            <dd>14 <small>路</small></dd>
          </div>
          <div className="fact-item">
            <dt>映射自由度</dt>
            <dd>14+3 <small>DOF</small></dd>
          </div>
        </dl>
      </div>

      {/* Right Column: High-Tech Interactive Glove Stage with Dynamic Effects */}
      <div
        className="hero-device-visual interactive-glove-stage"
        ref={visualRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `perspective(1000px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          transition: tilt.isHover ? 'transform 0.08s ease-out' : 'transform 0.5s ease-out',
        }}
      >
        {/* Optical Reticles */}
        <div className="visual-reticle reticle-tl" />
        <div className="visual-reticle reticle-tr" />
        <div className="visual-reticle reticle-bl" />
        <div className="visual-reticle reticle-br" />

        {/* Dynamic Specular Light Glare tracking mouse */}
        {tilt.isHover && (
          <div
            className="glove-specular-glare"
            style={{
              background: `radial-gradient(circle 240px at ${tilt.px}% ${tilt.py}%, rgba(56, 189, 248, 0.18), transparent 70%)`,
            }}
          />
        )}

        {/* Laser / Radar Scanline */}
        {scanning && <div className="glove-laser-scanline" />}

        {/* Base Photo Wrap */}
        <div className="visual-img-wrap">
          <img src={asset.src} alt={asset.alt} fetchPriority="high" draggable={false} />
        </div>

        {/* Interactive Layer Filter Toolbar on Top of Photo */}
        <div className="glove-layer-toolbar" role="group" aria-label="传感器图层筛选">
          <button
            type="button"
            className={`glove-layer-btn ${filterLayer === 'all' ? 'is-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setFilterLayer('all') }}
          >
            <Layers size={12} />
            <span>全阵列(14)</span>
          </button>
          <button
            type="button"
            className={`glove-layer-btn ${filterLayer === 'dip-pip' ? 'is-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setFilterLayer('dip-pip') }}
          >
            <Focus size={12} />
            <span>指间(IP/DIP/PIP)</span>
          </button>
          <button
            type="button"
            className={`glove-layer-btn ${filterLayer === 'mcp' ? 'is-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setFilterLayer('mcp') }}
          >
            <Crosshair size={12} />
            <span>掌指(MCP)</span>
          </button>
          <button
            type="button"
            className={`glove-layer-btn ${filterLayer === 'mcu' ? 'is-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setFilterLayer('mcu') }}
          >
            <Cpu size={12} />
            <span>主控(MCU)</span>
          </button>
        </div>

        {/* 14 Interactive Pulsing Hotspot Nodes on Glove */}
        <div className="glove-hotspots-overlay" aria-label="手套压电节点交互热点">
          {activeHotspots.map((h) => {
            const isSelected = selectedHotspot?.id === h.id
            return (
              <button
                type="button"
                key={h.id}
                className={`glove-node-point ${isSelected ? 'is-selected' : ''} ${h.type === 'mcu' ? 'is-mcu' : ''}`}
                style={{ left: `${h.x}%`, top: `${h.y}%` }}
                onMouseEnter={() => setSelectedHotspot(h)}
                onClick={() => navigate(h.type === 'mcu' ? '/device' : '/lab')}
                aria-label={`压电节点 ${h.id} ${h.label}`}
                title={`点击进入实验台：${h.label} (${h.diff})`}
              >
                <span className="node-ping" />
                <span className="node-core">
                  <small>{h.id}</small>
                </span>
              </button>
            )
          })}
        </div>

        {/* Dynamic Telemetry HUD Card for Hovered Hotspot */}
        {selectedHotspot && (
          <aside className="glove-hotspot-hud-card" aria-live="polite">
            <div className="hud-card-head">
              <div className="hud-node-title">
                <span className="hud-node-badge">{selectedHotspot.id}</span>
                <strong>{selectedHotspot.label}</strong>
              </div>
              <span className="hud-node-type">{selectedHotspot.role}</span>
            </div>

            <div className="hud-card-metrics">
              <div className="hud-metric-row">
                <span className="hud-lbl">采样通道</span>
                <span className="hud-val">{selectedHotspot.channels}</span>
              </div>
              <div className="hud-metric-row">
                <span className="hud-lbl">差分有效对</span>
                <span className="hud-val hud-accent">{selectedHotspot.diff}</span>
              </div>
              <div className="hud-metric-row">
                <span className="hud-lbl">压电响应</span>
                <span className="hud-val hud-active">双层极化正常</span>
              </div>
            </div>

            <button
              type="button"
              className="hud-quick-jump"
              onClick={() => navigate('/lab')}
            >
              <span>在实验台中观测</span>
              <ArrowRight size={13} />
            </button>
          </aside>
        )}

        {/* Corner Coordinates & Telemetry Stamp */}
        <div className="glove-telemetry-stamp">
          <div className="stamp-left">
            <ScanSearch size={13} />
            <span>POS: X {coord.x} · Y {coord.y} mm</span>
          </div>
          <div className="stamp-right">
            <span className="stamp-led" />
            <span>ARRAY: 14/14 CH ACTIVE</span>
          </div>
        </div>

        {/* Laser Scanner Control Pill */}
        <button
          type="button"
          className={`glove-scan-toggle ${scanning ? 'is-active' : ''}`}
          onClick={(e) => { e.stopPropagation(); setScanning(!scanning) }}
          title={scanning ? '暂停激光雷达扫描' : '开启激光雷达扫描'}
        >
          <Zap size={12} />
          <span>{scanning ? '雷达扫描中' : '扫描暂停'}</span>
        </button>
      </div>
    </section>
  )
}
