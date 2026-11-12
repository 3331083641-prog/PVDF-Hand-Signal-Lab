import { ArrowRight, BookOpenCheck, CirclePlay, Radio, ScanSearch } from 'lucide-react'
import { getImageAsset } from '../data/imageAssets'
import { modeCopy } from '../data/teachingFlow'
import { navigate } from './AppShell'
import { useTeachingMode } from './TeachingMode'

export function HeroTeachingStage() {
  const asset = getImageAsset('hero')
  const { mode, setMode } = useTeachingMode()
  return <section className="teaching-hero" aria-labelledby="home-title">
    <div className="hero-instrument-copy">
      <p className="context-label">柔性 PVDF · 课堂交互实验</p>
      <h1 id="home-title" data-page-title tabIndex={-1}>从手指弯曲读取的电信号，解析一只手的动作</h1>
      <p>观察装置、理解双层压电、读取差分信号，再用积分角度驱动三维手。</p>
      <div className="hero-actions"><button className="primary-button" onClick={() => navigate('/device')}>开始学习 <ArrowRight /></button><button className="secondary-button" onClick={() => navigate('/lab')}>直接进入实验</button></div>
      <div className="mode-inline" role="group" aria-label="教学模式">
        {(['teacher', 'student'] as const).map((item) => <button key={item} aria-pressed={mode === item} onClick={() => setMode(item)}>{item === 'teacher' ? <CirclePlay /> : <BookOpenCheck />}<span><b>{modeCopy[item].title}</b><small>{modeCopy[item].description}</small></span></button>)}
      </div>
      <dl className="hero-facts"><div><dt>检测单元</dt><dd>14</dd></div><div><dt>原始电压</dt><dd>28 路</dd></div><div><dt>有效信号</dt><dd>14 路</dd></div><div><dt>映射输出</dt><dd>14 + 3</dd></div></dl>
    </div>
    <div className="hero-device-visual">
      <img src={asset.src} alt={asset.alt} fetchPriority="high" />
      <button className="hero-marker marker-sensors" onClick={() => navigate('/device')}><ScanSearch />14 个检测单元</button>
      <button className="hero-marker marker-signal" onClick={() => navigate('/lab')}><Radio />28 路采集</button>
      <div className="hero-trace" aria-hidden="true"><i /><i /><i /></div>
    </div>
  </section>
}
