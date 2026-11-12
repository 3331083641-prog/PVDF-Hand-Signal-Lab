import { Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { teachingFlow } from '../data/teachingFlow'
import { navigate } from './AppShell'
import { useTeachingMode } from './TeachingMode'

export function TeachingFlowNavigator() {
  const { mode } = useTeachingMode()
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(mode === 'teacher')
  useEffect(() => setPlaying(mode === 'teacher'), [mode])
  useEffect(() => {
    if (!playing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setActive((value) => (value + 1) % teachingFlow.length), 1900)
    return () => window.clearInterval(timer)
  }, [playing])
  return <section className="teaching-route" aria-labelledby="learning-route-title">
    <div className="route-heading"><div><p className="context-label">一条连续实验链</p><h2 id="learning-route-title">操作一步，解释紧跟一步</h2></div><button onClick={() => setPlaying((value) => !value)} aria-pressed={playing}>{playing ? <Pause /> : <Play />}{playing ? '暂停引导' : '自动演示'}</button></div>
    <div className="route-track" role="list">{teachingFlow.map((step, index) => { const Icon = step.icon; return <button role="listitem" key={step.id} aria-current={index === active ? 'step' : undefined} onMouseEnter={() => !playing && setActive(index)} onFocus={() => !playing && setActive(index)} onClick={() => navigate(step.route)}><span>{String(index + 1).padStart(2, '0')}</span><Icon /><b>{step.title}</b><small>{step.detail}</small></button> })}</div>
    <p aria-live="polite"><b>{teachingFlow[active].short}</b> · {teachingFlow[active].detail}</p>
  </section>
}
