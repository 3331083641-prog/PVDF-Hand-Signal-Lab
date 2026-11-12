import { ArrowLeft, ArrowRight, Box, CircleStop, Play, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { deviceParts, jointHotspots } from '../data/jointHotspots'
import { defaultJointAngles } from '../data/mappingPresets'
import { navigate } from './AppShell'
import { HSADHand3D, type HSADSelection } from './hand3d/HSADHand3D'
import { useTeachingMode } from './TeachingMode'

const fingers = [...new Set(jointHotspots.map(joint => joint.finger))]

export function DeviceHotspotExplorer() {
  const { mode } = useTeachingMode()
  const [selected, setSelected] = useState<HSADSelection>({ type: 'joint', id: 'T2' })
  const [playing, setPlaying] = useState(() => mode === 'teacher' && !matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [resetNonce, setResetNonce] = useState(0)
  const category = selected.type
  const options = category === 'joint' ? jointHotspots : deviceParts
  const index = options.findIndex(item => item.id === selected.id)
  const joint = category === 'joint' ? jointHotspots.find(item => item.id === selected.id) : undefined
  const part = category === 'part' ? deviceParts.find(item => item.id === selected.id) : undefined

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => {
      setSelected({ type: category, id: options[(index + 1) % options.length].id })
    }, 2800)
    return () => window.clearTimeout(timer)
  }, [category, index, options, playing])

  const select = ({ type, id }: HSADSelection) => {
    setPlaying(false)
    setSelected({ type, id })
  }
  const move = (delta: number) => select({ type: category, id: options[(index + delta + options.length) % options.length].id })

  return <section className="device-explorer">
    <div className="device-workspace">
      <div className="device-view">
        <header className="device-view-head"><span><Box size={17} />三维装置</span><button onClick={() => setResetNonce(value => value + 1)}><RotateCcw size={15} />复位视角</button></header>
        <div className="device-viewport">
          <HSADHand3D angles={defaultJointAngles} presentation="device" selected={selected} onSelect={select} resetNonce={resetNonce} />
        </div>
        <footer className="device-view-foot">
          <small className="pointer-help">拖动旋转 · 滚轮缩放</small><small className="touch-help">单指旋转 · 双指缩放</small>
          <div className="device-transport">
            <button onClick={() => move(-1)} aria-label="上一个"><ArrowLeft size={16} /></button>
            <button onClick={() => setPlaying(value => !value)} aria-pressed={playing}>{playing ? <CircleStop size={16} /> : <Play size={16} />}{playing ? '停止讲解' : '自动讲解'}</button>
            <span>{index + 1} / {options.length}</span>
            <button onClick={() => move(1)} aria-label="下一个"><ArrowRight size={16} /></button>
          </div>
        </footer>
      </div>
      <aside className="device-inspector">
        <div className="device-modes" role="group" aria-label="查看对象">
          <button aria-pressed={category === 'joint'} onClick={() => select({ type: 'joint', id: jointHotspots[0].id })}>14 个检测单元</button>
          <button aria-pressed={category === 'part'} onClick={() => select({ type: 'part', id: deviceParts[0].id })}>装置器件</button>
        </div>
        <div className="device-details" aria-live="polite" aria-atomic="true">
          <div key={selected.id} className="device-reading">
            <h2>{joint && <span>{joint.id}</span>}{joint?.label ?? part?.label}</h2>
            <p>{joint?.role ?? part?.description}</p>
            {joint ? <dl><div><dt>原始通道</dt><dd>CH{joint.rawChannels[0]} / CH{joint.rawChannels[1]}</dd></div><div><dt>差分输出</dt><dd>{joint.differential}</dd></div></dl> : <small>{part?.evidence}</small>}
          </div>
        </div>
        <div className="device-index" role="group" aria-label="快速选择">
          {category === 'joint' ? fingers.map(finger => <div className="device-finger" key={finger}>
            <span>{finger}</span>{jointHotspots.filter(item => item.finger === finger).map(item => <button key={item.id} aria-label={item.id + ' ' + item.label} aria-pressed={item.id === selected.id} onClick={() => select({ type: 'joint', id: item.id })}>{item.id}<small>{item.joint}</small></button>)}
          </div>) : <div className="device-part-list">{deviceParts.map(item => <button key={item.id} aria-pressed={item.id === selected.id} onClick={() => select({ type: 'part', id: item.id })}>{item.label}</button>)}</div>}
        </div>
        <button className="device-lab-link" onClick={() => navigate('/lab')}>在实验台中查看 <ArrowRight size={16} /></button>
      </aside>
    </div>
    <div className="stage-takeaway"><span><b>观察：</b>每个关节由两路原始电压组成，差分后得到一路有效信号。</span><button onClick={() => navigate('/physics')}>继续理解双层 PVDF <ArrowRight size={17} /></button></div>
  </section>
}
