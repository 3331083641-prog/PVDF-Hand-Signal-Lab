import { useState, type ReactNode } from 'react'
import { Activity, Atom, BookOpenCheck, FlaskConical, Hand, Home, Menu, ScanSearch, X } from 'lucide-react'
import { modeCopy } from '../data/teachingFlow'
import { useTeachingMode } from './TeachingMode'

const nav = [
  ['/', '首页', Home, '00'],
  ['/device', '认识装置', ScanSearch, '01'],
  ['/physics', 'PVDF机理', Atom, '02'],
  ['/lab', '信号与映射实验台', Activity, '03'],
] as const

export function navigate(path: string) {
  window.location.hash = path
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

export function AppShell({ children, route }: { children: ReactNode; route: string }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { mode, setMode } = useTeachingMode()

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <button className="brand" onClick={() => navigate('/')} aria-label="返回首页">
            <span className="brand-icon-box">
              <Hand size={20} strokeWidth={2.2} />
            </span>
            <span className="brand-text">
              <span className="brand-title">柔性 PVDF 动作信号系统</span>
              <span className="brand-subtitle">
                <span className="brand-code">PVDF-LAB</span>
                <span className="brand-status-dot" aria-hidden="true" />
                <span className="brand-status-text">高校教学实验平台</span>
              </span>
            </span>
          </button>

          <nav id="main-navigation" className={menuOpen ? 'main-nav main-nav-open' : 'main-nav'} aria-label="主导航">
            {nav.map(([path, label, Icon, indexCode]) => {
              const active = route === path
              return (
                <button
                  key={path}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => {
                    navigate(path)
                    setMenuOpen(false)
                  }}
                  className={active ? 'nav-link nav-link-active' : 'nav-link'}
                >
                  <span className="nav-index">{indexCode}</span>
                  <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                  <span>{label}</span>
                </button>
              )
            })}
            {menuOpen && (
              <div className="mobile-menu-footer">
                <button
                  className="mobile-mode-btn"
                  onClick={() => setMode(mode === 'teacher' ? 'student' : 'teacher')}
                >
                  <BookOpenCheck size={16} />
                  <span>切换为{mode === 'teacher' ? '学生探索' : '教师演示'}模式</span>
                </button>
                <button
                  className="mobile-lab-btn"
                  onClick={() => {
                    navigate('/lab')
                    setMenuOpen(false)
                  }}
                >
                  <FlaskConical size={16} />
                  <span>直接进入实验台</span>
                </button>
              </div>
            )}
          </nav>

          <div className="header-actions">
            <button
              className={`header-mode-toggle ${mode === 'teacher' ? 'mode-teacher' : 'mode-student'}`}
              onClick={() => setMode(mode === 'teacher' ? 'student' : 'teacher')}
              aria-label={`当前模式：${modeCopy[mode].title}，点击切换为${mode === 'teacher' ? '学生探索' : '教师演示'}`}
            >
              <BookOpenCheck size={15} />
              <span className="mode-toggle-label">{modeCopy[mode].title}</span>
              <span className="mode-toggle-pill">{mode === 'teacher' ? '演示' : '探索'}</span>
            </button>

            <button
              className="header-lab-button"
              onClick={() => navigate('/lab')}
              aria-label="进入信号与映射实验台"
            >
              <FlaskConical size={16} />
              <span>进入实验台</span>
            </button>

            <button
              className="menu-button"
              aria-controls="main-navigation"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label={menuOpen ? '关闭导航菜单' : '展开导航菜单'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {children}
    </div>
  )
}
