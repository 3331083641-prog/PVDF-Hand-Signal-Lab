import {
  Activity,
  ArrowRight,
  Cpu,
  Crosshair,
  FlaskConical,
  Focus,
  Layers,
  ScanSearch,
} from 'lucide-react'
import { useState, useRef, type MouseEvent } from 'react'
import { getImageAsset } from '../data/imageAssets'
import { navigate } from './AppShell'

interface GloveHotspot {
  id: string
  label: string
  type: 'dip-pip' | 'mcp' | 'mcu'
  px: number // Native pixel X on 1672x941 image
  py: number // Native pixel Y on 1672x941 image
  channels: string
  diff: string
  role: string
}

// Measured pixel coordinates on the 1672 x 941 image
const GLOVE_HOTSPOTS: GloveHotspot[] = [
  // Thumb (拇指)
  { id: 'T2', label: '拇指 IP', type: 'dip-pip', px: 1402, py: 680, channels: 'CH1/CH2', diff: 'D1', role: '指间关节' },
  { id: 'T1', label: '拇指 MCP', type: 'mcp', px: 1229, py: 775, channels: 'CH3/CH4', diff: 'D2', role: '掌指关节' },

  // Index finger (食指)
  { id: 'I3', label: '食指 DIP', type: 'dip-pip', px: 1437, py: 338, channels: 'CH5/CH6', diff: 'D3', role: '远端指间' },
  { id: 'I2', label: '食指 PIP', type: 'dip-pip', px: 1312, py: 418, channels: 'CH7/CH8', diff: 'D4', role: '近端指间' },
  { id: 'I1', label: '食指 MCP', type: 'mcp', px: 1196, py: 517, channels: 'CH9/CH10', diff: 'D5', role: '掌指关节' },

  // Middle finger (中指)
  { id: 'M3', label: '中指 DIP', type: 'dip-pip', px: 1378, py: 235, channels: 'CH11/CH12', diff: 'D6', role: '远端指间' },
  { id: 'M2', label: '中指 PIP', type: 'dip-pip', px: 1215, py: 295, channels: 'CH13/CH14', diff: 'D7', role: '近端指间' },
  { id: 'M1', label: '中指 MCP', type: 'mcp', px: 1129, py: 414, channels: 'CH15/CH16', diff: 'D8', role: '掌指关节' },

  // Ring finger (无名指)
  { id: 'R3', label: '无名指 DIP', type: 'dip-pip', px: 1278, py: 185, channels: 'CH17/CH18', diff: 'D9', role: '远端指间' },
  { id: 'R2', label: '无名指 PIP', type: 'dip-pip', px: 1180, py: 275, channels: 'CH19/CH20', diff: 'D10', role: '近端指间' },
  { id: 'R1', label: '无名指 MCP', type: 'mcp', px: 1065, py: 376, channels: 'CH21/CH22', diff: 'D11', role: '掌指关节' },

  // Little finger (小指)
  { id: 'L3', label: '小指 DIP', type: 'dip-pip', px: 1135, py: 228, channels: 'CH23/CH24', diff: 'D12', role: '远端指间' },
  { id: 'L2', label: '小指 PIP', type: 'dip-pip', px: 1055, py: 325, channels: 'CH25/CH26', diff: 'D13', role: '近端指间' },
  { id: 'L1', label: '小指 MCP', type: 'mcp', px: 995, py: 423, channels: 'CH27/CH28', diff: 'D14', role: '掌指关节' },

  // MCU & Analog MUX (ESP32 双核主控 + TMUX1574 模拟复用)
  { id: 'MCU', label: 'ESP32 主控与信号调理板', type: 'mcu', px: 920, py: 620, channels: '28路微纳差分 / 模拟复用', diff: '80 Hz 硬件同步', role: 'ESP32 (14路物理ADC)' },
]

export function HeroTeachingStage() {
  const asset = getImageAsset('hero')
  const visualRef = useRef<HTMLDivElement>(null)

  // Interactive 3D tilt & cursor tracking
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, px: 50, py: 50, isHover: false })
  const [coord, setCoord] = useState({ x: 120.4, y: 86.2 })
  const [selectedHotspot, setSelectedHotspot] = useState<GloveHotspot | null>(GLOVE_HOTSPOTS[3]) // default I2
  const [filterLayer, setFilterLayer] = useState<'all' | 'dip-pip' | 'mcp' | 'mcu'>('all')
  const [monitoring, setMonitoring] = useState(true)

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!visualRef.current) return
    const rect = visualRef.current.getBoundingClientRect()
    const px = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
    const py = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100))
    const rx = ((py - 50) / 50) * -6
    const ry = ((px - 50) / 50) * 7
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

        {/* Crisp Scientific Telemetry Matrix */}
        <dl className="hero-facts">
          <div className="fact-item">
            <dt>检测单元</dt>
            <dd>14 <small>单元</small></dd>
          </div>
          <div className="fact-item">
            <dt>原始信号</dt>
            <dd>28 <small>路 (14对)</small></dd>
          </div>
          <div className="fact-item">
            <dt>差分输出</dt>
            <dd>14 <small>路</small></dd>
          </div>
          <div className="fact-item">
            <dt>硬件采样率</dt>
            <dd>80 <small>Hz 同步</small></dd>
          </div>
        </dl>
      </div>

      {/* Right Column: High-Precision Interactive Glove Laboratory Stage */}
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
        {/* Technical Calibration Grid Reticles */}
        <div className="visual-reticle reticle-tl" />
        <div className="visual-reticle reticle-tr" />
        <div className="visual-reticle reticle-bl" />
        <div className="visual-reticle reticle-br" />

        {/* Dynamic Specular Light Glare tracking mouse */}
        {tilt.isHover && (
          <div
            className="glove-specular-glare"
            style={{
              background: `radial-gradient(circle 240px at ${tilt.px}% ${tilt.py}%, rgba(8, 131, 149, 0.14), transparent 70%)`,
            }}
          />
        )}

        {/* SVG Interactive Image Map (100% Locked to Physical Glove Sensors) */}
        <svg
          viewBox="0 0 1672 941"
          preserveAspectRatio="xMaxYMid slice"
          className="glove-interactive-svg"
        >
          <image href={asset.src} width="1672" height="941" />

          {/* 14 Interactive Pulsing Nodes mapped precisely on yellow sensor pads */}
          {activeHotspots.map((h) => {
            const isSelected = selectedHotspot?.id === h.id
            return (
              <g
                key={h.id}
                transform={`translate(${h.px}, ${h.py})`}
                className={`svg-node-group ${isSelected ? 'is-selected' : ''} ${h.type === 'mcu' ? 'is-mcu' : ''} ${monitoring ? 'is-monitoring' : ''}`}
                onMouseEnter={() => setSelectedHotspot(h)}
                onClick={() => navigate(h.type === 'mcu' ? '/device' : '/lab')}
                cursor="pointer"
                role="button"
                tabIndex={0}
                aria-label={`压电节点 ${h.id} ${h.label}`}
              >
                <circle r="14" className="svg-node-ping" />
                <circle r={h.type === 'mcu' ? 12 : 9} className="svg-node-core" />
                <text y="3" textAnchor="middle" className="svg-node-text">{h.id}</text>
              </g>
            )
          })}
        </svg>

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
              onClick={() => navigate(selectedHotspot.type === 'mcu' ? '/device' : '/lab')}
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
            <span>标定坐标: X {coord.x} · Y {coord.y} mm</span>
          </div>
          <div className="stamp-right">
            <span className="stamp-led" />
            <span>阵列状态: 14 单元在线 (80Hz)</span>
          </div>
        </div>

        {/* Channel Telemetry State Control Pill */}
        <button
          type="button"
          className={`glove-scan-toggle ${monitoring ? 'is-active' : ''}`}
          onClick={(e) => { e.stopPropagation(); setMonitoring(!monitoring) }}
          title={monitoring ? '暂停阵列动态监测' : '恢复阵列动态监测'}
        >
          <Activity size={12} />
          <span>{monitoring ? '阵列遥测中 (80Hz)' : '遥测已暂停'}</span>
        </button>
      </div>
    </section>
  )
}
