import { Activity, Atom, ScanSearch, type LucideIcon } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { HeroTeachingStage } from '../components/HeroTeachingStage'
import { TeachingFlowNavigator } from '../components/TeachingFlowNavigator'

const DeviceHotspotExplorer = lazy(() => import('../components/DeviceHotspotExplorer').then((module) => ({ default: module.DeviceHotspotExplorer })))
const PVDFLearningWorkspace = lazy(() => import('../components/PVDFDynamicModel').then((module) => ({ default: module.PVDFLearningWorkspace })))
const JointMappingBench = lazy(() => import('../components/JointMappingBench').then((module) => ({ default: module.JointMappingBench })))

function ModuleFallback({ label }: { label: string }) { return <div className="module-fallback"><strong>正在准备{label}…</strong></div> }

function PageIntro({ icon: Icon, title, lead, step }: { icon: LucideIcon; title: string; lead: string; step: string }) {
  return <header className="page-intro"><div className="page-intro-icon"><Icon /></div><div><p className="context-label">{step}</p><h1 data-page-title tabIndex={-1}>{title}</h1><p>{lead}</p></div></header>
}

export function HomePage() {
  return <main><HeroTeachingStage /><TeachingFlowNavigator /></main>
}

export function DevicePage() {
  return <main className="teaching-page"><PageIntro icon={ScanSearch} step="01 · 认识真实装置" title="转动、点击，读懂 14 个检测单元" lead="同一只完整 HSAD 三维手：关节与器件都能直接选中。" /><Suspense fallback={<ModuleFallback label="三维装置" />}><DeviceHotspotExplorer /></Suspense></main>
}

export function PhysicsPage() {
  return <main className="teaching-page"><PageIntro icon={Atom} step="02 · 理解压电机理" title="双层 PVDF，如何留下有效动作信号" lead="改变弯曲与极性，观察两层反向响应和差分输出。" /><Suspense fallback={<ModuleFallback label="PVDF 模型" />}><PVDFLearningWorkspace /></Suspense></main>
}

export function LabPage() {
  return <main className="teaching-page teaching-page-wide"><PageIntro icon={Activity} step="03 · 完成关节实验" title="关节信号与动作映射实验台" lead="选择一个关节：从双通道电压一直追踪到三维骨骼运动。" /><Suspense fallback={<ModuleFallback label="关节实验台" />}><JointMappingBench /></Suspense></main>
}
