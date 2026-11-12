import { Activity, Atom, Binary, CircuitBoard, Hand, ScanSearch, Waves } from 'lucide-react'

export type TeachingMode = 'teacher' | 'student'

export const teachingFlow = [
  { id: 'observe', title: '认识装置', short: '观察', detail: '辨认14个检测单元', route: '/device', icon: ScanSearch },
  { id: 'bilayer', title: '双层PVDF', short: '机理', detail: '理解反向压电响应', route: '/physics', icon: Atom },
  { id: 'select', title: '选择关节', short: '定位', detail: '锁定一对原始通道', route: '/lab', icon: Hand },
  { id: 'raw', title: '观察双通道', short: '采集', detail: 'V+ 与 V− 反向瞬态', route: '/lab', icon: Waves },
  { id: 'difference', title: '得到差分', short: '处理', detail: '抑制共模干扰', route: '/lab', icon: Binary },
  { id: 'integral', title: '积分成角度', short: '计算', detail: 'SIA恢复关节角', route: '/lab', icon: CircuitBoard },
  { id: 'mapping', title: '驱动三维手', short: '映射', detail: '角度同步到骨骼', route: '/lab', icon: Activity },
] as const

export const modeCopy: Record<TeachingMode, { title: string; description: string }> = {
  teacher: { title: '教师演示', description: '沿七步实验链自动引导，适合课堂投影。' },
  student: { title: '学生探索', description: '自由旋转、选关节、改参数并即时观察。' },
}
