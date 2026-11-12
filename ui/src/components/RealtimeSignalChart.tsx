import type { SignalDisplayMode, SignalSample } from '../simulation/signalTypes'

type SeriesDefinition = { key: keyof SignalSample; label: string; color: string; opacity?: number }

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
    ? [{ key: 'vPlus', label: 'V+', color: '#d95d45' }, { key: 'vMinus', label: 'V−', color: '#237fbe' }]
    : [{ key: 'differential', label: 'Udiff', color: '#d88314' }]
  const last = history[history.length - 1]
  const sampleX = history.length === 1 ? 0 : 1000
  const summary = history.length
    ? `${mode === 'raw' ? '原始双通道' : '差分有效信号'}，最近 ${history.length} 个采样点。`
    : '等待教学推演采样。'

  return <figure className={`realtime-chart ${compact ? 'realtime-chart-compact' : ''}`}>
    <div className="realtime-chart-head"><div className="chart-legend">{series.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}</div><span>80 Hz · 4 s 窗口</span></div>
    <svg viewBox="0 0 1000 330" preserveAspectRatio="none" role="img" aria-label={summary}>
      <title>{summary}</title>
      <g className="realtime-grid">
        {[44, 106.5, 169, 231.5, 294].map((y) => <line key={y} x1="0" y1={y} x2="1000" y2={y} />)}
        {[0, 250, 500, 750, 1000].map((x) => <line key={x} x1={x} y1="44" x2={x} y2="294" />)}
      </g>
      <line className="chart-baseline" x1="0" y1={yBaseline} x2="1000" y2={yBaseline} />
      <g key={mode} className="signal-traces">
        {last && <line x1={sampleX} x2={sampleX} y1="44" y2="294" stroke="currentColor" opacity=".18" />}
        {series.map(item => <g key={item.label}>
          <path d={createPath(history, item.key, min, max)} fill="none" stroke={item.color} opacity={item.opacity ?? 1} vectorEffect="non-scaling-stroke" />
          {last && <circle cx={sampleX} cy={294 - (Number(last[item.key]) - min) / (max - min) * 250} r="4" fill={item.color} />}
        </g>)}
      </g>
    </svg>
    <div className="chart-axis"><span>{max.toFixed(mode === 'raw' ? 1 : 2)} V</span><span>{baseline.toFixed(2)} V 基线</span><span>{min.toFixed(mode === 'raw' ? 1 : 2)} V</span></div>
    <figcaption>{summary}</figcaption>
  </figure>
}
