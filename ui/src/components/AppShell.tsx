import { useState, type ReactNode } from 'react'
import { Activity, Atom, BookOpenCheck, FlaskConical, Hand, Home, Menu, ScanSearch, X } from 'lucide-react'
import { modeCopy } from '../data/teachingFlow'
import { useTeachingMode } from './TeachingMode'

const nav = [
  ['/', '首页', Home], ['/device', '认识装置', ScanSearch], ['/physics', 'PVDF机理', Atom], ['/lab', '信号与映射实验台', Activity],
] as const

export function navigate(path: string) { window.location.hash = path; window.scrollTo({ top: 0, behavior: 'smooth' }) }

export function AppShell({ children, route }: { children: ReactNode; route: string }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { mode, setMode } = useTeachingMode()
  return <div className="app-shell">
    <header className="site-header"><div className="header-inner">
      <button className="brand" onClick={() => navigate('/')} aria-label="返回首页"><span><Hand size={21} /></span><span><b>柔性压电教学系统</b><small>PVDF HAND SIGNAL LAB</small></span></button>
      <nav id="main-navigation" className={menuOpen ? 'main-nav main-nav-open' : 'main-nav'} aria-label="主导航">{nav.map(([path, label, Icon]) => <button key={path} aria-current={route === path ? 'page' : undefined} onClick={() => { navigate(path); setMenuOpen(false) }} className={route === path ? 'nav-link nav-link-active' : 'nav-link'}><Icon size={17} />{label}</button>)}</nav>
      <div className="header-actions"><button className="header-mode" onClick={() => setMode(mode === 'teacher' ? 'student' : 'teacher')} aria-label={`当前为${modeCopy[mode].title}，点击切换模式`}><BookOpenCheck size={16} />{modeCopy[mode].title}</button><button className="header-lab-button" onClick={() => navigate('/lab')}><FlaskConical size={17} />进入实验</button><button className="menu-button" aria-controls="main-navigation" onClick={() => setMenuOpen((value) => !value)} aria-label={menuOpen ? '关闭导航' : '打开导航'} aria-expanded={menuOpen}>{menuOpen ? <X /> : <Menu />}</button></div>
    </div></header>
    {children}
  </div>
}
