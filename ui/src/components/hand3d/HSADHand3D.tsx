import { Canvas, type ThreeEvent, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useId, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import { DRACOLoader, GLTFLoader, OrbitControls, SkeletonUtils, type GLTF } from 'three-stdlib'
import {
  deviceParts,
  getDevicePartByNodeName,
  jointHotspots,
  type FlexAxis,
  type JointId,
} from '../../data/jointHotspots'
import type { JointAngles } from '../../data/mappingPresets'

// Keep both teaching pages on the same reviewed asset. The revision query
// prevents a browser from reusing the pre-correction GLB after deployment.
export const HSAD_MODEL_URL = `${import.meta.env.BASE_URL}models/hsad/hsad_reference_device.glb?rev=thumb-inward-b6634c0`

export type HSADSelection = { type: 'joint' | 'part'; id: string }
export type HSADSelectionEvent = HSADSelection & { clientX: number; clientY: number }

type HandProps = {
  angles: JointAngles
  pitch?: number
  yaw?: number
  roll?: number
  selected?: HSADSelection | null
  onSelect?: (selection: HSADSelectionEvent) => void
  resetNonce?: number
  presentation?: 'device' | 'mapping'
  className?: string
}



const flexAxes: Record<FlexAxis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
}

/** 新教学模型必须提供这些可见或可点击节点，不使用旧模型静默降级。 */
const requiredPartNodes = [
  'MainFPC',
  'FingerFPC',
  'Serpentine',
  'CircuitModule',
  'SignalConditioning',
  'ESP32Module',
  'IMUModule',
  'BatteryModule',
  'PowerManagement',
] as const

function findNamedOrPrefixedObject(root: THREE.Object3D, nodeNames: readonly string[]) {
  let match: THREE.Object3D | undefined
  root.traverse((object) => {
    if (match) return
    if (nodeNames.some((name) => object.name === name || object.name.startsWith(`${name}_`))) match = object
  })
  return match
}

function jointFromNodeName(nodeName: string) {
  return jointHotspots.find((joint) => (
    nodeName === joint.sensorNode
    || nodeName.startsWith(`${joint.sensorNode}_`)
    || nodeName === `Highlight_${joint.id}`
    || nodeName.startsWith(`Highlight_${joint.id}_`)
    || nodeName === joint.anatomicalNode
  ))
}

function resolveSelection(object: THREE.Object3D): HSADSelection | null {
  let current: THREE.Object3D | null = object
  while (current) {
    const metadataJointId = current.userData.hsadJointId
    if (typeof metadataJointId === 'string' && jointHotspots.some((joint) => joint.id === metadataJointId)) {
      return { type: 'joint', id: metadataJointId }
    }

    const joint = jointFromNodeName(current.name)
    if (joint) return { type: 'joint', id: joint.id }

    const metadataPartId = current.userData.hsadPartId
    if (typeof metadataPartId === 'string' && deviceParts.some((part) => part.id === metadataPartId)) {
      return { type: 'part', id: metadataPartId }
    }

    const part = getDevicePartByNodeName(current.name)
    if (part) return { type: 'part', id: part.id }
    current = current.parent
  }
  return null
}

function validateModelSchema(scene: THREE.Object3D) {
  const missingJoints = jointHotspots.flatMap((joint) => [
    scene.getObjectByName(joint.boneNode) ? null : joint.boneNode,
    findNamedOrPrefixedObject(scene, [joint.sensorNode]) ? null : joint.sensorNode,
  ]).filter((name): name is string => Boolean(name))
  const missingParts = requiredPartNodes.filter((name) => !findNamedOrPrefixedObject(scene, [name]))
  const missing = [...missingJoints, ...missingParts]
  if (missing.length) throw new Error(`HSAD teaching model schema mismatch: ${missing.join(', ')}`)
}

type MarkerRef = RefObject<HTMLSpanElement | null>

function ModelControls({ targetObject, focusKey = '', resetNonce = 0, device, marker }: { targetObject?: THREE.Object3D; focusKey?: string; resetNonce?: number; device: boolean; marker: MarkerRef }) {
  const { camera, gl, size } = useThree()
  const controls = useRef<OrbitControls | null>(null)
  const previousFocusKey = useRef(focusKey)
  const flight = useRef<{ target: THREE.Vector3; eye: THREE.Vector3 } | null>(null)
  const projected = useMemo(() => new THREE.Vector3(), [])
  const reduced = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)'), [])

  useEffect(() => {
    const instance = new OrbitControls(camera, gl.domElement)
    instance.enableDamping = true
    instance.dampingFactor = 0.075
    instance.enablePan = true
    instance.minDistance = 2.3
    instance.maxDistance = 11
    instance.minPolarAngle = Math.PI * 0.12
    instance.maxPolarAngle = Math.PI * 0.82
    instance.target.set(0, 0, 0)
    instance.addEventListener('start', () => { flight.current = null })
    controls.current = instance
    return () => instance.dispose()
  }, [camera, gl])

  useEffect(() => {
    const instance = controls.current
    if (!instance) return
    flight.current = null
    // Leave room for the extended thumb on the narrow laboratory canvas.
    const aspect = size.width / Math.max(1, size.height)
    const distance = Math.max(9.6, 6.8 / Math.max(0.25, aspect))
    instance.maxDistance = Math.max(13, distance * 1.4)
    instance.target.set(0, 0, 0)
    camera.position.set(0.03, 0.02, 1).normalize().multiplyScalar(distance)
    instance.update()
  }, [camera, resetNonce, size.width, size.height])

  useEffect(() => {
    const instance = controls.current
    if (!instance || !targetObject || !focusKey || previousFocusKey.current === focusKey) return
    previousFocusKey.current = focusKey
    const target = new THREE.Vector3()
    targetObject.getWorldPosition(target)
    const previousTarget = instance.target.clone()
    const direction = camera.position.clone().sub(previousTarget).normalize()
    if (device) {
      const destination = previousTarget.lerp(target, 0.72)
      const distance = Math.min(camera.position.distanceTo(instance.target), 7.4)
      flight.current = { target: destination, eye: destination.clone().addScaledVector(direction, distance) }
      return
    }
    instance.target.lerp(target, 0.8)
    camera.position.copy(target.clone().add(direction.multiplyScalar(5.3)))
    instance.update()
  }, [camera, focusKey, targetObject, device])

  useFrame((_, dt) => {
    const instance = controls.current
    if (!instance) return
    const next = flight.current
    if (next) {
      const alpha = reduced.matches ? 1 : 1 - Math.exp(-16 * dt)
      camera.position.lerp(next.eye, alpha)
      instance.target.lerp(next.target, alpha)
      if (camera.position.distanceToSquared(next.eye) + instance.target.distanceToSquared(next.target) < 1e-7) flight.current = null
    }
    instance.update()
    const label = marker.current
    if (label && targetObject) {
      camera.updateMatrixWorld()
      targetObject.getWorldPosition(projected).project(camera)
      const x = Math.round((1 + projected.x) * size.width / 2)
      const y = Math.round((1 - projected.y) * size.height / 2)
      const transform = `translate(${x}px, ${y}px)`
      if (label.style.transform !== transform) {
        label.style.transform = transform
        label.classList.toggle('align-left', x > size.width - 54)
      }
      const hidden = Math.abs(projected.z) > 1 || x < 0 || y < 0 || x > size.width || y > size.height
      if (label.hidden !== hidden) label.hidden = hidden
    }
  })
  return null
}

function LoadedHand({ angles, pitch = 0, yaw = 0, roll = 0, selected, onSelect, resetNonce, presentation, marker }: HandProps & { marker: MarkerRef }) {
  const gltf = useLoader(GLTFLoader, HSAD_MODEL_URL, (loader) => {
    const draco = new DRACOLoader()
    draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)
    loader.setDRACOLoader(draco)
  }) as GLTF
  const root = useRef<THREE.Group>(null)
  const pointerStart = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const scene = useMemo(() => {
    const cloned = SkeletonUtils.clone(gltf.scene)
    validateModelSchema(cloned)
    cloned.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = true
      object.receiveShadow = true
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      const clonedMaterials = materials.map((material) => material.clone())
      object.material = Array.isArray(object.material) ? clonedMaterials : clonedMaterials[0]
      clonedMaterials.forEach((material) => {
        if (!('color' in material)) return
        const standard = material as THREE.MeshStandardMaterial
        material.userData.baseColor = standard.color.clone()
      })
    })
    cloned.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(cloned)
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    const scale = 5.25 / Math.max(size.x, size.y, size.z, 0.001)
    cloned.scale.setScalar(scale)
    cloned.position.copy(center.multiplyScalar(-scale))
    return cloned
  }, [gltf.scene])

  const restQuaternions = useMemo(() => new Map<JointId, THREE.Quaternion>(
    jointHotspots.map((joint) => {
      const bone = scene.getObjectByName(joint.boneNode)
      if (!bone) throw new Error(`Missing joint bone: ${joint.boneNode}`)
      return [joint.id, bone.quaternion.clone()]
    }),
  ), [scene])
  const thumbCmcRest = useMemo(() => scene.getObjectByName('Thumb_CMC')?.quaternion.clone(), [scene])

  const selectedObject = useMemo(() => {
    if (!selected) return undefined
    if (selected.type === 'joint') {
      const joint = jointHotspots.find((item) => item.id === selected.id)
      return joint
        ? scene.getObjectByName(`Highlight_${joint.id}`)
          ?? scene.getObjectByName(joint.anatomicalNode)
          ?? findNamedOrPrefixedObject(scene, [joint.sensorNode])
          ?? scene.getObjectByName(joint.boneNode)
        : undefined
    }
    const part = deviceParts.find((item) => item.id === selected.id)
    if (part?.id === 'sensor') return findNamedOrPrefixedObject(scene, jointHotspots.map((joint) => joint.sensorNode))
    return part ? findNamedOrPrefixedObject(scene, part.nodeNames) : undefined
  }, [scene, selected])

  useEffect(() => {
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const resolved = resolveSelection(object)
      const active = Boolean(selected && resolved && (
        (resolved.type === selected.type && resolved.id === selected.id)
        || (selected.type === 'part' && selected.id === 'sensor' && resolved.type === 'joint')
      ))
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => {
        if (!('color' in material)) return
        const standard = material as THREE.MeshStandardMaterial
        const base = standard.userData.baseColor as THREE.Color | undefined
        if (base) standard.color.copy(base)
        const isClickProxy = material.name === 'UI_Click_Proxy'
        standard.transparent = isClickProxy
        standard.opacity = isClickProxy ? (active ? 0.2 : 0) : 1
        if (selected && resolved && !active && !isClickProxy) standard.color.multiplyScalar(0.94)
        if (isClickProxy) standard.depthWrite = false
        if (isClickProxy && active) standard.color.set('#d88314')
        standard.emissive?.set(active ? '#d88314' : '#000000')
        standard.emissiveIntensity = active ? (isClickProxy ? 0.32 : 0.18) : 0
        standard.needsUpdate = true
      })
    })
  }, [scene, selected])

  const flexion = useMemo(() => new THREE.Quaternion(), [])

  const targetQuaternion = useMemo(() => new THREE.Quaternion(), [])
  useFrame((_, delta) => {
    jointHotspots.forEach((joint) => {
      const bone = scene.getObjectByName(joint.boneNode)
      const rest = restQuaternions.get(joint.id)
      if (!bone || !rest) return
      const bend = THREE.MathUtils.degToRad((angles[joint.id] ?? 0) * joint.flexSign)
      flexion.setFromAxisAngle(flexAxes[joint.flexAxis], bend)
      targetQuaternion.copy(rest).multiply(flexion)
      bone.quaternion.slerp(targetQuaternion, 1 - Math.exp(-delta * 8.5))
    })
    // Thumb_CMC is an auxiliary (non-sensing) bone. A restrained in-plane
    // opposition component keeps the thumb base connected and makes T1/T2
    // flexion read as a hand movement rather than a hinged side branch.
    const thumbCmc = scene.getObjectByName('Thumb_CMC')
    if (thumbCmc && thumbCmcRest) {
      const opposition = THREE.MathUtils.degToRad((angles.T1 ?? 0) * 0.22)
      flexion.setFromAxisAngle(flexAxes.z, opposition)
      targetQuaternion.copy(thumbCmcRest).multiply(flexion)
      thumbCmc.quaternion.slerp(targetQuaternion, 1 - Math.exp(-delta * 7.5))
    }
    if (root.current) {
      targetQuaternion.setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), THREE.MathUtils.degToRad(roll), 'YXZ',
      ))
      root.current.quaternion.slerp(targetQuaternion, 1 - Math.exp(-delta * 7))
    }
  })

  const rememberPointer = (event: ThreeEvent<PointerEvent>) => {
    pointerStart.current = {
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
      pointerId: event.nativeEvent.pointerId,
    }
  }

  const selectIfClick = (event: ThreeEvent<PointerEvent>) => {
    const start = pointerStart.current
    pointerStart.current = null
    if (!start || start.pointerId !== event.nativeEvent.pointerId) return
    const distance = Math.hypot(event.nativeEvent.clientX - start.x, event.nativeEvent.clientY - start.y)
    if (distance > 5) return
    const resolution = resolveSelection(event.object)
    if (!resolution) return
    event.stopPropagation()
    onSelect?.({ ...resolution, clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY })
  }

  return <>
    <group ref={root}>
      <group
        rotation={[Math.PI / 2, 0, 0]}
        onPointerDown={rememberPointer}
        onPointerUp={selectIfClick}
        onPointerCancel={() => { pointerStart.current = null }}
      >
        <primitive object={scene} />
      </group>
    </group>
    <ModelControls targetObject={selectedObject} focusKey={selected ? `${selected.type}:${selected.id}` : ''} resetNonce={resetNonce} device={presentation === 'device'} marker={marker} />
  </>
}

class ModelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed
      ? <div className="model-error" role="alert"><strong>三维教学模型未能载入</strong><span>请确认关节轴校正版 GLB 已生成，并包含 14 个语义检测节点与关键器件节点。</span><button type="button" onClick={() => window.location.reload()}>重新载入</button></div>
      : this.props.children
  }
}

export function HSADHand3D(props: HandProps) {
  const descriptionId = useId()
  const marker = useRef<HTMLSpanElement>(null)
  return <div className={`hsad-hand-canvas ${props.className ?? ''}`} role="group" aria-label="可环绕查看并控制十四个关节的完整 HSAD 三维手" aria-describedby={descriptionId}>
    <span id={descriptionId} className="sr-only">深色柔性手套上覆盖橙黄色柔性 FPC、十四个检测单元与手背采集模块。三维舞台支持鼠标旋转缩放；所有关节选择和角度设置也可通过舞台旁的表单控件完成。</span>
    <ModelBoundary>
      <Suspense fallback={<div className="model-error"><strong>正在载入完整 HSAD 模型…</strong></div>}>
        <Canvas aria-label="HSAD 三维手交互视图" camera={{ position: [1.65, 0.85, 7.4], fov: 38 }} dpr={[1, 1.6]} gl={{ antialias: true, alpha: true }} onCreated={({ gl }) => { gl.domElement.setAttribute('role', 'img'); gl.domElement.setAttribute('aria-label', 'HSAD 三维手交互视图') }}>
          <hemisphereLight args={['#f4f8ff', '#b1a69b', 1.15]} />
          <directionalLight position={[-4, 7, 6]} intensity={2.15} />
          <directionalLight position={[4, 2, -3]} intensity={1.7} color="#c6edf0" />
          <pointLight position={[-3, -1, 3]} intensity={0.7} color="#f0a321" />
          <LoadedHand {...props} marker={marker} />
        </Canvas>
      </Suspense>
    </ModelBoundary>
    {props.presentation === 'device' && props.selected?.type === 'joint' && <span ref={marker} hidden className="device-anchor" aria-hidden="true"><i />{props.selected.id}</span>}
  </div>
}
