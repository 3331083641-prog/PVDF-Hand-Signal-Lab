import { useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { TeachingModeProvider } from './components/TeachingMode'
import { DevicePage, HomePage, LabPage, PhysicsPage } from './pages/TeachingPages'

const getRoute = () => window.location.hash.replace('#', '') || '/'

export default function App() {
  const [route, setRoute] = useState(getRoute)
  useEffect(() => { const update = () => setRoute(getRoute()); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update) }, [])
  useEffect(() => {
    const titles: Record<string, string> = { '/': '教学总控', '/device': '认识装置', '/physics': 'PVDF机理', '/lab': '关节信号与动作映射实验台' }
    document.title = `${titles[route] ?? '教学总控'} · 柔性 PVDF 手部动作教学系统`
    window.setTimeout(() => document.querySelector<HTMLElement>('[data-page-title]')?.focus(), 0)
  }, [route])
  const Page = ({ '/': HomePage, '/device': DevicePage, '/physics': PhysicsPage, '/lab': LabPage }[route] ?? HomePage)
  return <TeachingModeProvider><AppShell route={route}><Page /></AppShell></TeachingModeProvider>
}
