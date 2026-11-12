export type ImageAsset = {
  id: string
  fileName: string
  src: string
  title: string
  module: 'home' | 'physics' | 'signal-lab' | 'mapping' | 'summary'
  type: 'concept' | 'teaching-diagram' | 'background'
  containsEmbeddedText: boolean
  containsStaticData: boolean
  mayCrop: boolean
  alt: string
  caption?: string
  disclaimer?: string
}

const root = `${import.meta.env.BASE_URL}assets/images/selected/`
const conceptDisclaimer = '科研概念视觉图，不代表实验实物、工程图或真实实验数据。'
const staticDataDisclaimer = '图中曲线用于说明处理流程，实时数据由页面动态生成。'

export const imageAssets: ImageAsset[] = [
  {
    id: 'mapping', fileName: '01_真实手到虚拟手映射.png', src: `${root}01_真实手到虚拟手映射.png`, title: '真实手到虚拟手映射', module: 'mapping', type: 'concept', containsEmbeddedText: false, containsStaticData: false, mayCrop: true,
    alt: '佩戴橙黄色柔性 FPC 的黑色手套与蓝青色虚拟手之间的数据流概念图', caption: '科研概念视觉图。动态关节角与姿态由页面控制器绘制。', disclaimer: conceptDisclaimer,
  },
  {
    id: 'pipeline', fileName: '02_差分滤波教学流程.png', src: `${root}02_差分滤波教学流程.png`, title: '差分与滤波教学流程', module: 'signal-lab', type: 'teaching-diagram', containsEmbeddedText: true, containsStaticData: true, mayCrop: true,
    alt: '28路原始信号经过差分、数字滤波、积分后输出关节角的教学流程图', caption: '流程示意图，实时波形由页面中的可复现数据动态生成。', disclaimer: staticDataDisclaimer,
  },
  {
    id: 'hero', fileName: '04_首页装置主视觉.png', src: `${root}04_首页装置主视觉.png`, title: '首页装置主视觉', module: 'home', type: 'background', containsEmbeddedText: false, containsStaticData: false, mayCrop: true,
    alt: '浅灰背景中佩戴橙黄色柔性 FPC 与手背电路模块的黑色手套装置主视觉', caption: '装置视觉用于首页叙事，实时状态不由图片承担。', disclaimer: conceptDisclaimer,
  },
  {
    id: 'pvdf', fileName: '05_PVDF压电机理.png', src: `${root}05_PVDF压电机理.png`, title: 'PVDF压电机理', module: 'physics', type: 'concept', containsEmbeddedText: false, containsStaticData: true, mayCrop: false,
    alt: '手指使柔性薄膜弯曲并在上下电极形成电荷分离的 PVDF 压电机理图', caption: '定性物理机制图，滑块产生的是教学模拟。', disclaimer: conceptDisclaimer,
  },
  {
    id: 'summary', fileName: '06_科研概念综合图.png', src: `${root}06_科研概念综合图.png`, title: '科研概念综合图', module: 'summary', type: 'concept', containsEmbeddedText: true, containsStaticData: true, mayCrop: true,
    alt: '包含装置、虚拟手、处理流程和应用场景的科研概念综合图', caption: '科研概念视觉图，数据、角度和识别结果以系统实时输出为准。', disclaimer: conceptDisclaimer,
  },
]

export const getImageAsset = (id: ImageAsset['id']) => imageAssets.find((asset) => asset.id === id)!
