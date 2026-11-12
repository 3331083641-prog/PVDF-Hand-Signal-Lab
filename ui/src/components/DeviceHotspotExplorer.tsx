import { ArrowLeft, ArrowRight, CircleStop, Focus, Play, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { deviceParts, jointHotspots } from '../data/jointHotspots'
import { defaultJointAngles } from '../data/mappingPresets'
import { navigate } from './AppShell'
import { HSADHand3D, type HSADSelection, type HSADSelectionEvent } from './hand3d/HSADHand3D'
import { useTeachingMode } from './TeachingMode'

export function DeviceHotspotExplorer() {
  const { mode } = useTeachingMode()
  const [category, setCategory] = useState<'joint' | 'part'>('joint')
  const [selected, setSelected] = useState<HSADSelection>({ type: 'joint', id: 'T2' })
  const [playing, setPlaying] = useState(mode === 'teacher')
  const [resetNonce, setResetNonce] = useState(0)
  const options = category === 'joint' ? jointHotspots : deviceParts
  const index = Math.max(0, options.findIndex((item) => item.id === selected.id))
  const joint = useMemo(() => selected.type === 'joint' ? jointHotspots.find((item) => item.id === selected.id) : undefined, [selected])
  const part = useMemo(() => selected.type === 'part' ? deviceParts.find((item) => item.id === selected.id) : undefined, [selected])

  useEffect(() => {
    if (!playing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => {
      const next = (index + 1) % options.length
      setSelected({ type: category, id: options[next].id })
    }, 2800)
    return () => window.clearInterval(timer)
  }, [category, index, options, playing])

  const chooseCategory = (next: 'joint' | 'part') => {
    setCategory(next)
    setPlaying(false)
    setSelected({ type: next, id: (next === 'joint' ? jointHotspots[0] : deviceParts[0]).id })
  }

  const selectFromModel = (value: HSADSelectionEvent) => {
    setPlaying(false)
    setCategory(value.type)
    setSelected({ type: value.type, id: value.id, hit: value.hit })

  }

  const move = (delta: number) => {
    const next = (index + delta + options.length) % options.length
    setSelected({ type: category, id: options[next].id })
  }

  return <section className="device-explorer">
    <div className="device-stage">
      <div className="instrument-toolbar">
        <div role="group" aria-label="查看对象"><button aria-pressed={category === 'joint'} onClick={() => chooseCategory('joint')}>14 个检测单元</button><button aria-pressed={category === 'part'} onClick={() => chooseCategory('part')}>装置器件</button></div>
        <button onClick={() => setResetNonce((value) => value + 1)}><RotateCcw size={17} />复位视角</button>
      </div>

      <HSADHand3D angles={defaultJointAngles} presentation="device" selected={selected} onSelect={selectFromModel} resetNonce={resetNonce} />

      <aside className="device-popover" aria-live="polite">
        <span className="popover-eyebrow"><Focus size={14} />{joint ? `检测单元 ${joint.channel}` : '装置器件'}</span>
        <strong>{joint?.label ?? part?.label}</strong>
        <p>{joint?.role ?? part?.description}</p>
        {joint ? <dl><div><dt>原始通道</dt><dd>CH{joint.rawChannels[0]} / CH{joint.rawChannels[1]}</dd></div><div><dt>差分输出</dt><dd>{joint.differential}</dd></div></dl> : <small>{part?.evidence}</small>}
        <button onClick={() => navigate('/lab')}>在实验台中查看 <ArrowRight size={15} /></button>
      </aside>

      <div className="stage-index" aria-label="快速选择">
        {options.map((item) => <button key={item.id} aria-pressed={item.id === selected.id} onClick={() => { setPlaying(false); setSelected({ type: category, id: item.id }) }}>{category === 'joint' ? item.id : item.label}</button>)}
      </div>

      <div className="stage-sequence">
        <button onClick={() => move(-1)} aria-label="上一个"><ArrowLeft /></button>
        <button onClick={() => setPlaying((value) => !value)}>{playing ? <CircleStop /> : <Play />}{playing ? '停止讲解' : '自动讲解'}</button>
        <span>{index + 1} / {options.length}</span>
        <button onClick={() => move(1)} aria-label="下一个"><ArrowRight /></button>
      </div>
    </div>
    <div className="stage-takeaway"><span><b>观察：</b>每个关节由两路原始电压组成，差分后得到一路有效信号。</span><button onClick={() => navigate('/physics')}>继续理解双层 PVDF <ArrowRight size={17} /></button></div>
  </section>
}
