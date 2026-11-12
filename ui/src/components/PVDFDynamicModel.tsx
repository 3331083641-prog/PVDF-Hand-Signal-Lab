import { Canvas, type ThreeEvent, useFrame } from '@react-three/fiber'
import { ArrowDown, ArrowUp, Info, Play, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useHsadSignal } from '../simulation/useHsadSignal'
import { RealtimeSignalChart } from './RealtimeSignalChart'

type LayerId = 'upper-fpc' | 'upper-tape' | 'upper-pvdf' | 'insulation' | 'lower-pvdf' | 'lower-tape' | 'lower-fpc'
type MechanismStage = '静止' | '弯曲' | '保持' | '释放'
type StressState = '拉伸' | '压缩' | '无明显动态变化'

const layers: Array<{ id: LayerId; label: string; material: string; note: string }> = [
  { id: 'upper-fpc', label: '上层 PI / Copper FPC', material: '#d98a1e', note: 'PI 基底与铜电极构成上层柔性电路，并收集界面自由电荷。' },
  { id: 'upper-tape', label: '上层导电胶带', material: '#696d70', note: '导电胶带将 PVDF 表面的电荷变化可靠引至铜电极。' },
  { id: 'upper-pvdf', label: '上层 PVDF', material: '#e7f3f2', note: '受弯曲应力后，已有极化偶极对应的电位移发生变化。' },
  { id: 'insulation', label: '中间绝缘层', material: '#f3f0e9', note: '隔离上下两个 PVDF 通道；电荷粒子不会穿过这一层。' },
  { id: 'lower-pvdf', label: '下层 PVDF', material: '#d4e7e8', note: '与上层处于相反应力状态，产生反向原始通道响应。' },
  { id: 'lower-tape', label: '下层导电胶带', material: '#60676b', note: '将下层 PVDF 的界面自由电荷变化接入采集链。' },
  { id: 'lower-fpc', label: '下层 Copper / PI FPC', material: '#c97716', note: '下层柔性电路与上层共同构成镜像双通道检测单元。' },
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
  const geometry = useMemo(() => {
    const flat = createRibbonGeometry(0, 1, offset)
    const bent = createRibbonGeometry(90, 1, offset)
    flat.morphAttributes.position = [bent.getAttribute('position') as THREE.BufferAttribute]
    flat.morphAttributes.normal = [bent.getAttribute('normal') as THREE.BufferAttribute]
    bent.dispose()
    return flat
  }, [offset])
  useEffect(() => () => geometry.dispose(), [geometry])
  const stressColor = stress === '拉伸' ? '#e85b35' : stress === '压缩' ? '#1ba9b8' : '#000000'
  const click = (event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); onFocus(id) }
  return <mesh geometry={geometry} morphTargetInfluences={[direction * bend / 90]} onPointerDown={click}>
    <meshStandardMaterial
      color={color}
      roughness={0.48}
      metalness={id.includes('fpc') || id.includes('tape') ? 0.28 : 0.02}
      emissive={stressColor}
      emissiveIntensity={stress ? 0.16 : 0}
      side={THREE.DoubleSide}
    />
  </mesh>
}

function PolarizationArrows({ bend, direction, polarity }: { bend: number; direction: 1 | -1; polarity: 1 | -1 }) {
  return <group>{[-1.75, -0.85, 0, 0.85, 1.75].flatMap((x) => {
    const curve = curveAt(x, bend, direction)
    return [
      <group key={`upper-${x}`} position={[x, 0.14 + curve, 0]} rotation={[0, 0, polarity > 0 ? 0 : Math.PI]}>
        <mesh><cylinderGeometry args={[0.012, 0.012, 0.11, 8]} /><meshStandardMaterial color="#557181" /></mesh>
        <mesh position={[0, 0.075, 0]}><coneGeometry args={[0.034, 0.065, 10]} /><meshStandardMaterial color="#557181" /></mesh>
      </group>,
      <group key={`lower-${x}`} position={[x, -0.14 + curve, 0]} rotation={[0, 0, polarity > 0 ? Math.PI : 0]}>
        <mesh><cylinderGeometry args={[0.012, 0.012, 0.11, 8]} /><meshStandardMaterial color="#557181" /></mesh>
        <mesh position={[0, 0.075, 0]}><coneGeometry args={[0.034, 0.065, 10]} /><meshStandardMaterial color="#557181" /></mesh>
      </group>,
    ]
  })}</group>
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
  const materials = useMemo(() => [0, 1].map(() => new THREE.MeshStandardMaterial({
    transparent: true, depthWrite: false, opacity: 0, emissiveIntensity: .16,
  })), [])
  useEffect(() => () => materials.forEach(m => m.dispose()), [materials])
  const colors = useMemo(() => [new THREE.Color('#e85b35'), new THREE.Color('#1ba9b8')], [])
  const reduced = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)'), [])
  const upperPositive = direction * polarity > 0
  const quiet = stage === '静止' || stage === '保持'
  const opacity = quiet ? .10 + .16 * dynamicLevel : .12 + .76 * dynamicLevel
  useFrame((_, dt) => {
    const blend = reduced.matches ? 1 : 1 - Math.exp(-dt * 22)
    materials.forEach((material, i) => {
      material.color.lerp(colors[upperPositive ? i : 1-i], blend)
      material.emissive.copy(material.color)
      material.opacity = THREE.MathUtils.lerp(material.opacity, opacity, blend)
    })
  })
  const rows = [-0.46, 0, 0.46]
  return <group>{Array.from({ length: 11 }, (_, index) => {
    const x = -2.35 + index * (4.7 / 10)
    const curve = curveAt(x, bend, direction)
    const z = rows[index % rows.length]
    const scale = 0.62 + dynamicLevel * 0.48
    return <group key={index}>
      <mesh position={[x, 0.205 + curve, z]} scale={scale} material={materials[0]}>
        <sphereGeometry args={[0.052, 12, 10]} />
      </mesh>
      <mesh position={[x, -0.205 + curve, z]} scale={scale} material={materials[1]}>
        <sphereGeometry args={[0.052, 12, 10]} />
      </mesh>
    </group>
  })}</group>
}

function StressArrows({ direction, bend }: { direction: 1 | -1; bend: number }) {
  const scale = 0.55 + bend / 90 * 0.45
  const ArrowPair = ({ y, color, inward }: { y: number; color: string; inward: boolean }) => <group position={[0, y, 0.9]} scale={scale}>
    {[-1, 1].map((side) => <group key={side} position={[side * 1.1, 0, 0]} rotation={[0, 0, inward ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? -Math.PI / 2 : Math.PI / 2)]}>
      <mesh><cylinderGeometry args={[0.014, 0.014, 0.42, 8]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0, 0.25, 0]}><coneGeometry args={[0.055, 0.12, 10]} /><meshStandardMaterial color={color} /></mesh>
    </group>)}
  </group>
  const upperTension = direction > 0
  return <>
    <ArrowPair y={0.49} color={upperTension ? '#e85b35' : '#1ba9b8'} inward={!upperTension} />
    <ArrowPair y={-0.49} color={upperTension ? '#1ba9b8' : '#e85b35'} inward={upperTension} />
  </>
}

function ElectrodeLeads({ bend, direction }: { bend: number; direction: 1 | -1 }) {
  const endCurve = curveAt(2.65, bend, direction)
  return <group position={[0, endCurve, 0]}>
    <mesh position={[3.25, 0.205, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.018, 0.018, 1.2, 10]} /><meshStandardMaterial color="#e85b35" /></mesh>
    <mesh position={[3.25, -0.205, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.018, 0.018, 1.2, 10]} /><meshStandardMaterial color="#1ba9b8" /></mesh>
    <mesh position={[3.92, 0, 0]}><boxGeometry args={[0.22, 0.62, 0.42]} /><meshStandardMaterial color="#123b5d" roughness={0.45} /></mesh>
  </group>
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
  // Interpolate only display curvature, keeping the simulation and graph on their sample clock.
  const [curve, setCurve] = useState(direction * bend)
  const reduced = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)'), [])
  useFrame((_, dt) => {
    const target = direction * bend
    if (curve === target) return
    const next = THREE.MathUtils.damp(curve, target, 30, dt)
    setCurve(reduced.matches || Math.abs(next-target)<.025 ? target : next)
  })
  const visualBend = direction * curve
  const offsets = [0.36, 0.25, 0.14, 0, -0.14, -0.25, -0.36]
  return <>
    <ambientLight intensity={1.45} />
    <directionalLight position={[-3, 5, 6]} intensity={2.2} />
    <directionalLight position={[4, -1, 3]} intensity={0.9} color="#bdeff4" />
    <group rotation={[-0.28, 0.14, -0.03]} position={[-0.5, 0, 0]}>
      {layers.map((layer, index) => <RibbonLayer
        key={layer.id}
        id={layer.id}
        color={layer.material}
        offset={offsets[index]}
        bend={visualBend}
        direction={direction}
        stress={layer.id === 'upper-pvdf' ? upperStress : layer.id === 'lower-pvdf' ? lowerStress : undefined}
        onFocus={onFocus}
      />)}
      <PolarizationArrows bend={visualBend} direction={direction} polarity={polarity} />
      <ChargeParticles bend={visualBend} direction={direction} polarity={polarity} dynamicLevel={dynamicLevel} stage={stage} />
      <StressArrows direction={direction} bend={Math.abs(curve)} />
      <ElectrodeLeads bend={visualBend} direction={direction} />
      <group position={[0, 1.45, 0]} rotation={[0, 0, direction > 0 ? Math.PI : 0]}>
        <mesh><cylinderGeometry args={[0.022, 0.022, 0.7, 12]} /><meshStandardMaterial color="#e85b35" /></mesh>
        <mesh position={[0, -0.42, 0]}><coneGeometry args={[0.11, 0.25, 16]} /><meshStandardMaterial color="#e85b35" /></mesh>
      </group>
    </group>
  </>
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

  const stage: MechanismStage = cycleStage
    ?? (targetAngle === 0 && physicalAngle < 0.8
      ? '静止'
      : Math.abs(targetAngle - physicalAngle) > 1
        ? targetAngle > physicalAngle ? '弯曲' : '释放'
        : '保持')
  const upperStress: StressState = physicalAngle < 0.8 ? '无明显动态变化' : direction > 0 ? '拉伸' : '压缩'
  const lowerStress: StressState = physicalAngle < 0.8 ? '无明显动态变化' : direction > 0 ? '压缩' : '拉伸'
  const dynamicLevel = Math.min(1, Math.max(stage === '静止' ? 0.02 : 0.08, Math.abs(metrics.currentDifferential) * 12))
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

  return <section className="pvdf-lab">
    <div className="pvdf-instrument-head">
      <div><span>七层双 PVDF 检测单元</span><strong>弯曲、极化与差分响应同步推演</strong></div>
      <span className="source-badge">教学推演</span>
    </div>
    <div className="pvdf-main-stage">
      <div className="pvdf-layer-viewport">
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
        <div className="force-label">{direction > 0 ? <ArrowDown /> : <ArrowUp />}定义：{direction > 0 ? '正向弯曲' : '反向弯曲'}</div>
        <aside className="layer-popover"><span>{currentLayer.label}</span><p>{currentLayer.note}</p></aside>
        <div className="charge-legend"><span><i className="charge-positive" />界面正电荷</span><span><i className="charge-negative" />界面负电荷</span><small>粒子仅表示电极自由电荷重新分布</small></div>
        <div className="layer-rail" aria-label="七层结构选择">{layers.map((layer) => <button key={layer.id} aria-pressed={layer.id === focus} onClick={() => setFocus(layer.id)}>{layer.label}</button>)}</div>
      </div>
      <div className="pvdf-output">
        <div className="output-heading"><span>差分有效信号</span><strong>{metrics.currentDifferential >= 0 ? '+' : '−'}{Math.abs(metrics.currentDifferential).toFixed(3)} V</strong></div>
        <RealtimeSignalChart history={history} mode="differential" compact />
        <dl className="pvdf-state-grid">
          <div><dt>当前阶段</dt><dd>{stage}</dd></div>
          <div><dt>上层应力</dt><dd>{upperStress}</dd></div>
          <div><dt>下层应力</dt><dd>{lowerStress}</dd></div>
          <div><dt>界面极性</dt><dd>上层{upperCharge}，下层{lowerCharge}</dd></div>
        </dl>
        <p>{stage === '保持' ? '保持阶段：几何弯曲不变，终端动态信号因反馈、泄漏与弛豫逐渐衰减。' : '上下层响应方向相反；差分保留反对称弯曲分量并抑制同向共模扰动。'}</p>
      </div>
    </div>
    <div className="pvdf-controls">
      <label><span>弯曲角度 <output>{targetAngle}°</output></span><input type="range" min="0" max="90" value={targetAngle} onChange={(event) => { setCycleStage(null); setTargetAngle(Number(event.target.value)) }} /></label>
      <label><span>动作速度 <output>{speed}°/s</output></span><input type="range" min="12" max="100" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} /></label>
      <label><span>保持时间 <output>{holdMs} ms</output></span><input type="range" min="300" max="3000" step="100" value={holdMs} onChange={(event) => setHoldMs(Number(event.target.value))} /></label>
      <div className="control-pair"><button aria-pressed={direction < 0} onClick={() => setDirection((value) => value === 1 ? -1 : 1)}>方向：{direction > 0 ? '正向' : '反向'}</button><button aria-pressed={polarity < 0} onClick={() => setPolarity((value) => value === 1 ? -1 : 1)}>极化：{polarity > 0 ? '正接' : '反接'}</button></div>
      <button className="icon-control" onClick={playCycle}><Play />完整周期</button>
      <button className="icon-control" onClick={doReset}><RotateCcw />复位</button>
      <button className="principle-trigger" onClick={() => setShowPrinciple((value) => !value)} aria-expanded={showPrinciple}><Info />查看原理</button>
    </div>
    {showPrinciple && <aside className="principle-popover pvdf-principle-detail">
      <button onClick={() => setShowPrinciple(false)} aria-label="关闭">×</button>
      <strong>正压电效应与双通道差分</strong>
      <p>图中箭头表示已有极化偶极的方向；彩色粒子只表示电极界面的自由电荷重新分布，不表示离子穿过 PVDF 或绝缘层。</p>
      <code>D₃ = d₃₁T₁ + ε₃₃ᵀE₃</code>
      <code>虚地近似：D₃ ≈ d₃₁T₁</code>
      <code>Q = ∫A D · n dA</code>
      <code>Udiff(t) = [V₊(t) − V₋(t)] / 2</code>
      <RealtimeSignalChart history={history} mode="raw" compact />
      <small>红色 V₊ 与蓝色 V₋ 为同一信号引擎生成的反向响应；数值为论文约束下的教学推演。</small>
    </aside>}
  </section>
}
