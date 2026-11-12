import { Canvas, type ThreeEvent, useFrame } from '@react-three/fiber'
import { ArrowDown, ArrowUp, Info, Play, RotateCcw, X, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useHsadSignal } from '../simulation/useHsadSignal'
import { RealtimeSignalChart } from './RealtimeSignalChart'

type LayerId = 'upper-fpc' | 'upper-tape' | 'upper-pvdf' | 'insulation' | 'lower-pvdf' | 'lower-tape' | 'lower-fpc'
type MechanismStage = '静止' | '弯曲' | '保持' | '释放'
type StressState = '拉伸' | '压缩' | '无明显动态变化'

const layers: Array<{ id: LayerId; label: string; material: string; note: string; group: 'upper' | 'core' | 'lower' }> = [
  { id: 'upper-fpc', label: '上层 PI/Cu FPC', material: '#d98a1e', note: '上层柔性电路与引线电极', group: 'upper' },
  { id: 'upper-tape', label: '上层导电胶', material: '#696d70', note: '界面电荷引出层', group: 'upper' },
  { id: 'upper-pvdf', label: '上层 PVDF 膜', material: '#e7f3f2', note: '正向极化压电薄膜 (d31)', group: 'upper' },
  { id: 'insulation', label: '中间绝缘屏蔽层', material: '#f3f0e9', note: '两相物理隔离与共模屏蔽', group: 'core' },
  { id: 'lower-pvdf', label: '下层 PVDF 膜', material: '#d4e7e8', note: '反向极化压电薄膜 (-d31)', group: 'lower' },
  { id: 'lower-tape', label: '下层导电胶', material: '#60676b', note: '界面电荷引出层', group: 'lower' },
  { id: 'lower-fpc', label: '下层 PI/Cu FPC', material: '#c97716', note: '下层柔性电路与引线电极', group: 'lower' },
]

function curveAt(x: number, bend: number, direction: 1 | -1) {
  return direction * bend * 0.012 * (1 - Math.pow(x / 2.8, 2))
}

function createRibbonGeometry(bend: number, direction: 1 | -1, offset: number) {
  const segments = 56
  const halfLength = 2.8
  const halfDepth = 0.72
  const positions: number[] = []
  const indices: number[] = []
  for (let index = 0; index <= segments; index += 1) {
    const ratio = index / segments
    const x = -halfLength + ratio * halfLength * 2
    const curve = curveAt(x, bend, direction)
    positions.push(x, offset + curve, -halfDepth, x, offset + curve, halfDepth)
    if (index < segments) {
      const base = index * 2
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function RibbonLayer({
  id,
  color,
  offset,
  bend,
  direction,
  stress,
  onFocus,
}: {
  id: LayerId
  color: string
  offset: number
  bend: number
  direction: 1 | -1
  stress?: StressState
  onFocus: (id: LayerId) => void
}) {
  const geometry = useMemo(() => createRibbonGeometry(bend, direction, offset), [bend, direction, offset])
  const stressColor = stress === '拉伸' ? '#dc4a28' : stress === '压缩' ? '#0284c7' : '#000000'
  const click = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    onFocus(id)
  }
  return (
    <mesh geometry={geometry} onPointerDown={click}>
      <meshStandardMaterial
        color={color}
        roughness={0.48}
        metalness={id.includes('fpc') || id.includes('tape') ? 0.28 : 0.02}
        emissive={stressColor}
        emissiveIntensity={stress && stress !== '无明显动态变化' ? 0.18 : 0}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function PolarizationArrows({ bend, direction, polarity }: { bend: number; direction: 1 | -1; polarity: 1 | -1 }) {
  return (
    <group>
      {[-1.75, -0.85, 0, 0.85, 1.75].flatMap((x) => {
        const curve = curveAt(x, bend, direction)
        return [
          <group key={`upper-${x}`} position={[x, 0.14 + curve, 0]} rotation={[0, 0, polarity > 0 ? 0 : Math.PI]}>
            <mesh>
              <cylinderGeometry args={[0.012, 0.012, 0.11, 8]} />
              <meshStandardMaterial color="#557181" />
            </mesh>
            <mesh position={[0, 0.075, 0]}>
              <coneGeometry args={[0.034, 0.065, 10]} />
              <meshStandardMaterial color="#557181" />
            </mesh>
          </group>,
          <group key={`lower-${x}`} position={[x, -0.14 + curve, 0]} rotation={[0, 0, polarity > 0 ? Math.PI : 0]}>
            <mesh>
              <cylinderGeometry args={[0.012, 0.012, 0.11, 8]} />
              <meshStandardMaterial color="#557181" />
            </mesh>
            <mesh position={[0, 0.075, 0]}>
              <coneGeometry args={[0.034, 0.065, 10]} />
              <meshStandardMaterial color="#557181" />
            </mesh>
          </group>,
        ]
      })}
    </group>
  )
}

function ChargeParticles({
  bend,
  direction,
  polarity,
  dynamicLevel,
  stage,
}: {
  bend: number
  direction: 1 | -1
  polarity: 1 | -1
  dynamicLevel: number
  stage: MechanismStage
}) {
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (group.current) group.current.position.x = Math.sin(clock.elapsedTime * 2.2) * 0.018 * dynamicLevel
  })
  const sign = direction * polarity
  const upperPositive = sign > 0
  const opacity = stage === '静止' ? 0.12 : 0.28 + dynamicLevel * 0.72
  const rows = [-0.46, 0, 0.46]
  return (
    <group ref={group}>
      {Array.from({ length: 11 }, (_, index) => {
        const x = -2.35 + index * (4.7 / 10)
        const curve = curveAt(x, bend, direction)
        const z = rows[index % rows.length]
        const scale = 0.62 + dynamicLevel * 0.48
        return (
          <group key={index}>
            <mesh position={[x, 0.205 + curve, z]} scale={scale}>
              <sphereGeometry args={[0.052, 12, 10]} />
              <meshStandardMaterial
                transparent
                opacity={opacity}
                color={upperPositive ? '#dc4a28' : '#0284c7'}
                emissive={upperPositive ? '#dc4a28' : '#0284c7'}
                emissiveIntensity={0.25}
              />
            </mesh>
            <mesh position={[x, -0.205 + curve, z]} scale={scale}>
              <sphereGeometry args={[0.052, 12, 10]} />
              <meshStandardMaterial
                transparent
                opacity={opacity}
                color={upperPositive ? '#0284c7' : '#dc4a28'}
                emissive={upperPositive ? '#0284c7' : '#dc4a28'}
                emissiveIntensity={0.25}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function StressArrows({ direction, bend }: { direction: 1 | -1; bend: number }) {
  const scale = 0.55 + (bend / 90) * 0.45
  const ArrowPair = ({ y, color, inward }: { y: number; color: string; inward: boolean }) => (
    <group position={[0, y, 0.9]} scale={scale}>
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * 1.1, 0, 0]}
          rotation={[
            0,
            0,
            inward ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : side > 0 ? -Math.PI / 2 : Math.PI / 2,
          ]}
        >
          <mesh>
            <cylinderGeometry args={[0.014, 0.014, 0.42, 8]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, 0.25, 0]}>
            <coneGeometry args={[0.055, 0.12, 10]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
      ))}
    </group>
  )
  const upperTension = direction > 0
  return (
    <>
      <ArrowPair y={0.49} color={upperTension ? '#dc4a28' : '#0284c7'} inward={!upperTension} />
      <ArrowPair y={-0.49} color={upperTension ? '#0284c7' : '#dc4a28'} inward={upperTension} />
    </>
  )
}

function ElectrodeLeads({ bend, direction }: { bend: number; direction: 1 | -1 }) {
  const endCurve = curveAt(2.65, bend, direction)
  return (
    <group position={[0, endCurve, 0]}>
      <mesh position={[3.25, 0.205, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 1.2, 10]} />
        <meshStandardMaterial color="#dc4a28" />
      </mesh>
      <mesh position={[3.25, -0.205, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 1.2, 10]} />
        <meshStandardMaterial color="#0284c7" />
      </mesh>
      <mesh position={[3.92, 0, 0]}>
        <boxGeometry args={[0.22, 0.62, 0.42]} />
        <meshStandardMaterial color="#0c2b45" roughness={0.45} />
      </mesh>
    </group>
  )
}

function BilayerScene({
  bend,
  direction,
  polarity,
  dynamicLevel,
  stage,
  upperStress,
  lowerStress,
  onFocus,
}: {
  bend: number
  direction: 1 | -1
  polarity: 1 | -1
  dynamicLevel: number
  stage: MechanismStage
  upperStress: StressState
  lowerStress: StressState
  onFocus: (id: LayerId) => void
}) {
  const offsets = [0.36, 0.25, 0.14, 0, -0.14, -0.25, -0.36]
  return (
    <>
      <ambientLight intensity={1.45} />
      <directionalLight position={[-3, 5, 6]} intensity={2.2} />
      <directionalLight position={[4, -1, 3]} intensity={0.9} color="#bdeff4" />
      <group rotation={[-0.28, 0.14, -0.03]} position={[-0.5, 0, 0]}>
        {layers.map((layer, index) => (
          <RibbonLayer
            key={layer.id}
            id={layer.id}
            color={layer.material}
            offset={offsets[index]}
            bend={bend}
            direction={direction}
            stress={layer.id === 'upper-pvdf' ? upperStress : layer.id === 'lower-pvdf' ? lowerStress : undefined}
            onFocus={onFocus}
          />
        ))}
        <PolarizationArrows bend={bend} direction={direction} polarity={polarity} />
        <ChargeParticles bend={bend} direction={direction} polarity={polarity} dynamicLevel={dynamicLevel} stage={stage} />
        <StressArrows direction={direction} bend={bend} />
        <ElectrodeLeads bend={bend} direction={direction} />
        <group position={[0, 1.45, 0]} rotation={[0, 0, direction > 0 ? Math.PI : 0]}>
          <mesh>
            <cylinderGeometry args={[0.022, 0.022, 0.7, 12]} />
            <meshStandardMaterial color="#dc4a28" />
          </mesh>
          <mesh position={[0, -0.42, 0]}>
            <coneGeometry args={[0.11, 0.25, 16]} />
            <meshStandardMaterial color="#dc4a28" />
          </mesh>
        </group>
      </group>
    </>
  )
}

export function PVDFLearningWorkspace() {
  const [targetAngle, setTargetAngle] = useState(48)
  const [speed, setSpeed] = useState(48)
  const [holdMs, setHoldMs] = useState(1200)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [polarity, setPolarity] = useState<1 | -1>(1)
  const [focus, setFocus] = useState<LayerId>('upper-pvdf')
  const [showPrinciple, setShowPrinciple] = useState(false)
  const [cycleStage, setCycleStage] = useState<MechanismStage | null>(null)
  const holdStartedAt = useRef<number | null>(null)
  const { history, metrics, physicalAngle, reset } = useHsadSignal({
    jointId: 'I2',
    targetAngle,
    speed,
    polarity: (direction * polarity) as 1 | -1,
  })
  const currentLayer = layers.find((layer) => layer.id === focus) ?? layers[2]

  useEffect(() => {
    if (!cycleStage) return
    if (cycleStage === '弯曲' && Math.abs(physicalAngle - targetAngle) < 1) {
      holdStartedAt.current = performance.now()
      setCycleStage('保持')
      return
    }
    if (cycleStage === '保持' && holdStartedAt.current !== null && performance.now() - holdStartedAt.current >= holdMs) {
      setTargetAngle(0)
      setCycleStage('释放')
      return
    }
    if (cycleStage === '释放' && physicalAngle < 0.8) {
      setCycleStage(null)
      holdStartedAt.current = null
    }
  }, [cycleStage, holdMs, metrics.currentDifferential, physicalAngle, targetAngle])

  const stage: MechanismStage =
    cycleStage ??
    (targetAngle === 0 && physicalAngle < 0.8
      ? '静止'
      : Math.abs(targetAngle - physicalAngle) > 1
      ? targetAngle > physicalAngle
        ? '弯曲'
        : '释放'
      : '保持')

  const upperStress: StressState =
    physicalAngle < 0.8 ? '无明显动态变化' : direction > 0 ? '拉伸' : '压缩'
  const lowerStress: StressState =
    physicalAngle < 0.8 ? '无明显动态变化' : direction > 0 ? '压缩' : '拉伸'
  const dynamicLevel = Math.min(
    1,
    Math.max(stage === '静止' ? 0.02 : 0.08, Math.abs(metrics.currentDifferential) * 12)
  )
  const upperCharge = direction * polarity > 0 ? '正电荷指示' : '负电荷指示'
  const lowerCharge = direction * polarity > 0 ? '负电荷指示' : '正电荷指示'

  const doReset = () => {
    setTargetAngle(0)
    setDirection(1)
    setPolarity(1)
    setCycleStage(null)
    holdStartedAt.current = null
    reset(0)
  }

  const playCycle = () => {
    reset(0)
    setTargetAngle(58)
    setCycleStage('弯曲')
    holdStartedAt.current = null
  }

  return (
    <section className="pvdf-lab" aria-label="PVDF 压电机理交互推演">
      {/* Header Bar */}
      <div className="pvdf-instrument-head">
        <div className="pvdf-head-title">
          <span className="pvdf-head-badge">七层双通道微观模型 · SEC.02</span>
          <strong>弯曲力学状态、电荷再分布与差分响应同步推演</strong>
        </div>
        <div className="pvdf-head-meta">
          <span className="source-badge">教学推演引擎</span>
          <span className="pvdf-clock-tag">80 Hz 同步</span>
        </div>
      </div>

      {/* Main Dual Stage */}
      <div className="pvdf-main-stage">
        {/* Left 3D Viewport */}
        <div className="pvdf-layer-viewport">
          <div className="stage-reticle reticle-tl" />
          <div className="stage-reticle reticle-tr" />
          <div className="stage-reticle reticle-bl" />
          <div className="stage-reticle reticle-br" />

          <Canvas camera={{ position: [0, 2.7, 8.5], fov: 37 }} dpr={[1, 1.5]}>
            <BilayerScene
              bend={physicalAngle}
              direction={direction}
              polarity={polarity}
              dynamicLevel={dynamicLevel}
              stage={stage}
              upperStress={upperStress}
              lowerStress={lowerStress}
              onFocus={setFocus}
            />
          </Canvas>

          <div className="force-direction-badge">
            <span className="force-icon">{direction > 0 ? <ArrowDown size={14} /> : <ArrowUp size={14} />}</span>
            <span className="force-text">力学定义：{direction > 0 ? '正向弯曲（指侧下凹）' : '反向弯曲（指侧凸起）'}</span>
          </div>

          <aside className="layer-popover" aria-live="polite">
            <div className="layer-popover-head">
              <span className="layer-tag">当前检视层</span>
              <span className="layer-name">{currentLayer.label}</span>
            </div>
            <p className="layer-note">{currentLayer.note}</p>
          </aside>

          <div className="charge-legend">
            <span className="legend-item">
              <i className="charge-positive" />
              <span>界面正电荷 (+)</span>
            </span>
            <span className="legend-item">
              <i className="charge-negative" />
              <span>界面负电荷 (−)</span>
            </span>
            <span className="legend-divider">|</span>
            <small>注：彩色粒子仅表示电极界面的自由电荷重新分布，不跨越绝缘层</small>
          </div>

          {/* Layer Hierarchy Stack Rail */}
          <div className="layer-rail" role="tablist" aria-label="七层结构选择">
            {layers.map((layer) => {
              const active = layer.id === focus
              return (
                <button
                  key={layer.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFocus(layer.id)}
                  className={`layer-btn layer-btn-${layer.group} ${active ? 'is-active' : ''}`}
                  title={layer.note}
                >
                  <span className="layer-dot" style={{ background: layer.material }} />
                  <span>{layer.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right Output Oscilloscope & State Readout */}
        <div className="pvdf-output">
          <div className="output-heading">
            <div className="output-head-meta">
              <span className="output-sec-tag">差分输出示波器</span>
              <span className="output-sub">Udiff = (V+ − V−) / 2</span>
            </div>
            <div className="output-primary-val">
              <span className="val-sign">{metrics.currentDifferential >= 0 ? '+' : '−'}</span>
              <span className="val-num">{Math.abs(metrics.currentDifferential).toFixed(3)}</span>
              <span className="val-unit">V</span>
            </div>
          </div>

          <RealtimeSignalChart history={history} mode="differential" compact />

          <dl className="pvdf-state-grid">
            <div className="state-cell">
              <dt>当前运动阶段</dt>
              <dd className="state-phase">
                <span className={`phase-dot phase-${stage}`} />
                <span>{stage}</span>
              </dd>
            </div>
            <div className="state-cell">
              <dt>上层应力状态</dt>
              <dd className={`state-stress ${upperStress === '拉伸' ? 'stress-tension' : upperStress === '压缩' ? 'stress-compression' : ''}`}>
                {upperStress}
              </dd>
            </div>
            <div className="state-cell">
              <dt>下层应力状态</dt>
              <dd className={`state-stress ${lowerStress === '拉伸' ? 'stress-tension' : lowerStress === '压缩' ? 'stress-compression' : ''}`}>
                {lowerStress}
              </dd>
            </div>
            <div className="state-cell">
              <dt>界面电荷极性指示</dt>
              <dd className="state-polarity">
                <small>上:</small> {upperCharge.replace('指示', '')} <small>下:</small> {lowerCharge.replace('指示', '')}
              </dd>
            </div>
          </dl>

          <div className="pvdf-physics-note">
            <Zap size={13} className="note-icon" />
            <p>
              {stage === '保持'
                ? '保持阶段：曲率恒定，动态电荷因电路泄漏回落基线。'
                : '弯曲阶段：上下层应变相反，差分抵消同向共模噪声。'}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Control Rack */}
      <div className="pvdf-controls">
        <label className="ctrl-slider-group">
          <div className="ctrl-slider-head">
            <span className="ctrl-name">弯曲目标角度</span>
            <output className="ctrl-out">{targetAngle}°</output>
          </div>
          <input
            type="range"
            min="0"
            max="90"
            value={targetAngle}
            onChange={(event) => {
              setCycleStage(null)
              setTargetAngle(Number(event.target.value))
            }}
          />
        </label>

        <label className="ctrl-slider-group">
          <div className="ctrl-slider-head">
            <span className="ctrl-name">弯曲角速度</span>
            <output className="ctrl-out">{speed}°/s</output>
          </div>
          <input
            type="range"
            min="12"
            max="100"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          />
        </label>

        <label className="ctrl-slider-group">
          <div className="ctrl-slider-head">
            <span className="ctrl-name">保持平台时间</span>
            <output className="ctrl-out">{holdMs} ms</output>
          </div>
          <input
            type="range"
            min="300"
            max="3000"
            step="100"
            value={holdMs}
            onChange={(event) => setHoldMs(Number(event.target.value))}
          />
        </label>

        <div className="ctrl-switch-pair">
          <button
            className={`ctrl-toggle-btn ${direction < 0 ? 'is-reversed' : ''}`}
            onClick={() => setDirection((value) => (value === 1 ? -1 : 1))}
            title="切换弯曲方向"
          >
            <span className="toggle-lbl">弯曲方向</span>
            <span className="toggle-val">{direction > 0 ? '正向弯曲' : '反向弯曲'}</span>
          </button>
          <button
            className={`ctrl-toggle-btn ${polarity < 0 ? 'is-reversed' : ''}`}
            onClick={() => setPolarity((value) => (value === 1 ? -1 : 1))}
            title="切换电极极性接法"
          >
            <span className="toggle-lbl">极性接法</span>
            <span className="toggle-val">{polarity > 0 ? '正相正接' : '反向反接'}</span>
          </button>
        </div>

        <div className="ctrl-action-group">
          <button className="icon-control ctrl-primary-action" onClick={playCycle} title="执行一次完整的弯曲-保持-释放动作">
            <Play size={14} />
            <span>完整动作周期</span>
          </button>
          <button className="icon-control ctrl-reset-action" onClick={doReset} title="复位角度与物理状态">
            <RotateCcw size={14} />
            <span>复位基线</span>
          </button>
          <button
            className={`principle-trigger ${showPrinciple ? 'is-open' : ''}`}
            onClick={() => setShowPrinciple((value) => !value)}
            aria-expanded={showPrinciple}
          >
            <Info size={14} />
            <span>物理本构方程</span>
          </button>
        </div>
      </div>

      {/* Principle Modal Drawer */}
      {showPrinciple && (
        <aside className="principle-popover pvdf-principle-detail" aria-label="物理机理本构方程详解">
          <div className="popover-bar">
            <strong className="popover-title">正压电效应本构方程与双通道差分模型</strong>
            <button className="popover-close-btn" onClick={() => setShowPrinciple(false)} aria-label="关闭本构方程详解">
              <X size={18} />
            </button>
          </div>

          <div className="popover-content">
            <p className="popover-lead">
              PVDF（聚偏氟乙烯）在极化后形成有序偶极。机械弯曲应力改变偶极取向与电位移，电极界面自由电荷发生重新分布：
            </p>

            <div className="formula-block">
              <div className="formula-row">
                <span className="formula-label">压电本构方程：</span>
                <code>D₃ = d₃₁ · T₁ + ε₃₃ᵀ · E₃</code>
              </div>
              <div className="formula-row">
                <span className="formula-label">虚地近似条件：</span>
                <code>D₃ ≈ d₃₁ · T₁  (电荷放大器输入电场 E₃ ≈ 0)</code>
              </div>
              <div className="formula-row">
                <span className="formula-label">界面感应电荷：</span>
                <code>Q = ∬_A D · n dA</code>
              </div>
              <div className="formula-row">
                <span className="formula-label">双通道差分输出：</span>
                <code>Udiff(t) = [ V₊(t) − V₋(t) ] / 2</code>
              </div>
            </div>

            <div className="popover-raw-preview">
              <span className="preview-label">原始正反相双通道响应对照 (V+ / V−)：</span>
              <RealtimeSignalChart history={history} mode="raw" compact />
            </div>

            <small className="popover-footnote">
              * 红色 V₊ 与蓝色 V₋ 为推演引擎根据论文物理约束生成的对称双通道响应；数据作为物理机理演示与实验教学依据。
            </small>
          </div>
        </aside>
      )}
    </section>
  )
}
