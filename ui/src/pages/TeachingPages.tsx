import { Activity, Atom, ScanSearch, type LucideIcon } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { HeroTeachingStage } from '../components/HeroTeachingStage'
import { TeachingFlowNavigator } from '../components/TeachingFlowNavigator'

const DeviceHotspotExplorer = lazy(() => import('../components/DeviceHotspotExplorer').then((module) => ({ default: module.DeviceHotspotExplorer })))
const PVDFLearningWorkspace = lazy(() => import('../components/PVDFDynamicModel').then((module) => ({ default: module.PVDFLearningWorkspace })))
const JointMappingBench = lazy(() => import('../components/JointMappingBench').then((module) => ({ default: module.JointMappingBench })))

function ModuleFallback({ label }: { label: string }) {
  return (
    <div className="module-fallback" role="status" aria-live="polite">
      <div className="module-fallback-spinner" />
      <strong>正在加载{label}交互环境…</strong>
    </div>
  )
}

function PageIntro({ icon: Icon, title, subtitle, step }: { icon: LucideIcon; title: string; subtitle: string; step: string }) {
  return (
    <header className="page-intro page-intro-compact">
      <div className="page-intro-icon">
        <Icon size={20} strokeWidth={2.2} />
      </div>
      <div className="page-intro-body">
        <div className="page-intro-row">
          <span className="page-step-badge">{step}</span>
          <h1 data-page-title tabIndex={-1}>{title}</h1>
          <span className="page-intro-sep">·</span>
          <span className="page-intro-subtitle">{subtitle}</span>
        </div>
      </div>
    </header>
  )
}

export function HomePage() {
  return (
    <main>
      <HeroTeachingStage />
      <TeachingFlowNavigator />
    </main>
  )
}

export function DevicePage() {
  return (
    <main className="teaching-page">
      <PageIntro
        icon={ScanSearch}
        step="01"
        title="认识真实装置"
        subtitle="14 个压电检测单元与器件三维解构"
      />
      <Suspense fallback={<ModuleFallback label="三维装置" />}>
        <DeviceHotspotExplorer />
      </Suspense>
    </main>
  )
}

export function PhysicsPage() {
  return (
    <main className="teaching-page">
      <PageIntro
        icon={Atom}
        step="02"
        title="PVDF 压电机理"
        subtitle="双层极化微观偶极与差分抵消推演"
      />
      <Suspense fallback={<ModuleFallback label="PVDF 模型" />}>
        <PVDFLearningWorkspace />
      </Suspense>
    </main>
  )
}

export function LabPage() {
  return (
    <main className="teaching-page teaching-page-wide">
      <PageIntro
        icon={Activity}
        step="03"
        title="关节信号与动作映射实验台"
        subtitle="28 路电压采集 · 差分滤波 · SIA 角度解算 · 3D 姿态映射"
      />
      <Suspense fallback={<ModuleFallback label="关节实验台" />}>
        <JointMappingBench />
      </Suspense>
    </main>
  )
}
