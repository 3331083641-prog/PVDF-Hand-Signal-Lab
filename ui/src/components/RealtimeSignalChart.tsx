import type { SignalDisplayMode, SignalSample } from '../simulation/signalTypes'

type SeriesDefinition = { key: keyof SignalSample; label: string; color: string; chLabel: string }

const createPath = (history: SignalSample[], key: keyof SignalSample, min: number, max: number) => history.map((sample, index) => {
  const raw = sample[key]
  const value = typeof raw === 'number' ? raw : 0
  const x = history.length <= 1 ? 0 : index / (history.length - 1) * 1000
  const y = 294 - (value - min) / (max - min) * 250
  return `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`
}).join(' ')

export function RealtimeSignalChart({ history, mode, compact = false }: { history: SignalSample[]; mode: SignalDisplayMode; compact?: boolean }) {
  const min = mode === 'raw' ? 0 : -1.65
  const max = mode === 'raw' ? 3.3 : 1.65
  const baseline = mode === 'raw' ? 1.65 : 0
  const yBaseline = 294 - (baseline - min) / (max - min) * 250
  
  const series: SeriesDefinition[] = mode === 'raw'
    ? [
        { key: 'vPlus', label: 'V+ (正相)', color: '#dc4a28', chLabel: 'CH1' },
        { key: 'vMinus', label: 'V− (反相)', color: '#0284c7', chLabel: 'CH2' }
      ]
    : [
        { key: 'differential', label: 'Udiff (差分有效)', color: '#d97706', chLabel: 'DIFF' }
      ]

  const summary = history.length
    ? `${mode === 'raw' ? '原始双通道采集' : '差分有效动作信号'}，最近 ${history.length} 个采样点。`
    : '等待教学推演采样。'

  // Latest sample point for cursor
  const latestSample = history[history.length - 1]
  const latestX = 1000

  return (
    <figure className={`realtime-chart ${compact ? 'realtime-chart-compact' : ''}`}>
      <div className="realtime-chart-head">
        <div className="chart-legend">
          {series.map((item) => (
            <span key={item.label} className="legend-tag">
              <span className="legend-ch-badge" style={{ borderColor: item.color, color: item.color }}>{item.chLabel}</span>
              <i style={{ background: item.color }} />
              <b>{item.label}</b>
            </span>
          ))}
        </div>
        <div className="chart-specs">
          <span className="chart-spec-item"><small>TIME/DIV</small> 500 ms</span>
          <span className="chart-spec-item"><small>FS</small> 80 Hz</span>
          <span className="chart-spec-item window-tag">4.0s 窗口</span>
        </div>
      </div>

      <div className="chart-screen-bezel">
        <svg viewBox="0 0 1000 330" preserveAspectRatio="none" role="img" aria-label={summary}>
          <defs>
            <filter id="scope-glow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="currentColor" floodOpacity="0.4" />
            </filter>
            <pattern id="scope-subgrid" width="50" height="31.25" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 31.25" fill="none" stroke="rgba(12, 43, 69, 0.04)" strokeWidth="0.75" />
            </pattern>
          </defs>
          <title>{summary}</title>

          {/* Subgrid & Main Grid */}
          <rect x="0" y="44" width="1000" height="250" fill="url(#scope-subgrid)" />
          
          <g className="realtime-grid">
            {[44, 106.5, 169, 231.5, 294].map((y) => (
              <line key={y} x1="0" y1={y} x2="1000" y2={y} />
            ))}
            {[0, 125, 250, 375, 500, 625, 750, 875, 1000].map((x) => (
              <line key={x} x1={x} y1="44" x2={x} y2="294" />
            ))}
          </g>

          {/* Baseline Indicator with dashed center */}
          <line className="chart-baseline" x1="0" y1={yBaseline} x2="1000" y2={yBaseline} />

          {/* Signal Paths */}
          {series.map((item) => (
            <path
              key={item.label}
              d={createPath(history, item.key, min, max)}
              fill="none"
              stroke={item.color}
              vectorEffect="non-scaling-stroke"
              className="chart-signal-trace"
            />
          ))}

          {/* Realtime Sweep Head Cursor */}
          {latestSample && series.map((item) => {
            const raw = latestSample[item.key]
            const value = typeof raw === 'number' ? raw : 0
            const y = 294 - (value - min) / (max - min) * 250
            return (
              <g key={`cur-${item.key}`}>
                <circle cx={latestX} cy={y} r="3.5" fill={item.color} />
                <circle cx={latestX} cy={y} r="7" fill="none" stroke={item.color} strokeWidth="1" opacity="0.6" />
              </g>
            )
          })}
        </svg>

        <div className="chart-axis">
          <span>{max.toFixed(mode === 'raw' ? 1 : 2)} V</span>
          <span className="baseline-mark">{baseline.toFixed(2)} V 基准</span>
          <span>{min.toFixed(mode === 'raw' ? 1 : 2)} V</span>
        </div>
      </div>

      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  )
}
