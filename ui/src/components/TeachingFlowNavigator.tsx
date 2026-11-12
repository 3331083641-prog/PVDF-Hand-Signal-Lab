import { ArrowRight, Pause, Play } from 'lucide-react'
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
    const timer = window.setInterval(() => setActive((value) => (value + 1) % teachingFlow.length), 2200)
    return () => window.clearInterval(timer)
  }, [playing])

  const currentStep = teachingFlow[active]

  return (
    <section className="teaching-route" aria-labelledby="learning-route-title">
      <div className="route-heading">
        <div className="route-heading-text">
          <div className="route-eyebrow">
            <span className="route-badge">实验教学链路</span>
            <span className="route-sub-tag">7 步闭环导轨</span>
          </div>
          <h2 id="learning-route-title">实验操作与物理机理映射导轨</h2>
        </div>

        <div className="route-controls">
          <button
            className={`route-play-btn ${playing ? 'is-playing' : ''}`}
            onClick={() => setPlaying((value) => !value)}
            aria-pressed={playing}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
            <span>{playing ? '暂停流程' : '自动演示'}</span>
            <span className="route-play-dot" />
          </button>
        </div>
      </div>

      <div className="route-track-wrap">
        <div className="route-progress-bar" style={{ width: `${((active + 1) / teachingFlow.length) * 100}%` }} />
        <div className="route-track" role="list">
          {teachingFlow.map((step, index) => {
            const Icon = step.icon
            const isCurrent = index === active
            return (
              <button
                role="listitem"
                key={step.id}
                aria-current={isCurrent ? 'step' : undefined}
                onMouseEnter={() => !playing && setActive(index)}
                onFocus={() => !playing && setActive(index)}
                onClick={() => navigate(step.route)}
                className={`route-step-card ${isCurrent ? 'is-active-step' : ''}`}
              >
                <div className="route-card-top">
                  <span className="step-num">{String(index + 1).padStart(2, '0')}</span>
                  <div className="step-icon-wrap">
                    <Icon size={17} strokeWidth={isCurrent ? 2.2 : 1.8} />
                  </div>
                </div>
                <b className="step-title">{step.title}</b>
              </button>
            )
          })}
        </div>
      </div>

      <div className="route-active-banner" aria-live="polite">
        <div className="banner-left">
          <span className="banner-step-pill">工步 {String(active + 1).padStart(2, '0')}</span>
          <div className="banner-content">
            <strong className="banner-title">{currentStep.short}</strong>
            <span className="banner-sep">·</span>
            <span className="banner-desc">{currentStep.detail}</span>
          </div>
        </div>
        <button className="banner-jump-btn" onClick={() => navigate(currentStep.route)}>
          <span>进入对应模块</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </section>
  )
}
