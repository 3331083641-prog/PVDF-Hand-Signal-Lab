import { Canvas, type ThreeEvent, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useId, useMemo, useRef, type RefObject, type ReactNode } from 'react'
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
export const HSAD_MODEL_URL = `${import.meta.env.BASE_URL}models/hsad/hsad_reference_device.glb?rev=6.1-worn`

export type HSADSelection = { type: 'joint' | 'part'; id: string; hit?: { uuid: string; indices: number[]; weights: number[] } }
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



const wornSpread: Partial<Record<JointId, number>> = { I1: -7, M1: -1, R1: 3, L1: 8 }

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

type GuideProps = { marker: RefObject<HTMLDivElement | null> }
type FocusTarget = { object: THREE.Object3D; hit?: HSADSelection['hit'] }

function ModelControls({ target, focusKey, resetNonce = 0, marker, device }: GuideProps & {
  target?: FocusTarget; focusKey: string; resetNonce?: number; device: boolean
}) {
  const { camera, gl, size } = useThree()
  const controls = useRef<OrbitControls | null>(null)
  const previousFocusKey = useRef(focusKey)

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
    controls.current = instance
    return () => instance.dispose()
  }, [camera, gl])

  useEffect(() => {
    const instance = controls.current
    if (!instance) return
    // Leave room for the extended thumb on the narrow laboratory canvas.
    const aspect = size.width / Math.max(1, size.height)
    const distance = Math.max(9.6, 6.8 / Math.max(0.25, aspect))
    instance.maxDistance = Math.max(13, distance * 1.4)
    instance.target.set(0, 0, 0)
    camera.position.set(device ? .24 : .03, device ? .14 : .02, 1).normalize().multiplyScalar(distance)
    instance.update()
  }, [camera, resetNonce, size.width, size.height, device])

  const position = useMemo(() => new THREE.Vector3(), [])
  const vertex = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const instance = controls.current
    if (!instance) return
    if (target) {
      const { object, hit } = target
      object.updateWorldMatrix(true, false)
      if (hit && object instanceof THREE.Mesh) {
        position.set(0, 0, 0)
        hit.indices.forEach((index, i) => position.addScaledVector(object.getVertexPosition(index, vertex), hit.weights[i]))
        object.localToWorld(position)
      } else {
        object.getWorldPosition(position)
      }
      if (previousFocusKey.current !== focusKey) {
        previousFocusKey.current = focusKey
        vertex.copy(camera.position).sub(instance.target).normalize()
        instance.target.copy(position)
        camera.position.copy(position).addScaledVector(vertex, 5.8)
      }
    }
    instance.update()
    if (marker.current && target && device) {
      camera.updateMatrixWorld()
      position.project(camera)
      marker.current.hidden = Math.abs(position.x) > 1 || Math.abs(position.y) > 1 || Math.abs(position.z) > 1
      marker.current.style.left = ((position.x + 1) * 50) + '%'
      marker.current.style.top = ((1 - position.y) * 50) + '%'
    }
  })
  return null
}

function LoadedHand({ angles, pitch = 0, yaw = 0, roll = 0, selected, onSelect, resetNonce, presentation, marker }: HandProps & GuideProps) {
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

  const target = useMemo<FocusTarget | undefined>(() => {
    if (!selected) return
    if (selected.hit) {
      const object = scene.getObjectByProperty('uuid', selected.hit.uuid)
      if (object) return { object, hit: selected.hit }
    }
    const internal = selected.id === 'imu' ? 'IMUModule' : selected.id === 'battery' ? 'BatteryModule' : undefined
    const name = selected.type === 'joint' ? 'Highlight_' + selected.id : internal ?? 'Guide_' + selected.id
    const object = scene.getObjectByName(name)
    if (!object) throw new Error('Missing teaching anchor: ' + name)
    return { object }
  }, [scene, selected])
  useEffect(() => {
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const resolved = resolveSelection(object)
      const active = Boolean(selected && resolved && (
        (resolved.type === selected.type && resolved.id === selected.id)
        || (selected.type === 'part' && selected.id === 'sensor' && resolved.type === 'joint')
      ))
      const internal = resolved?.type === 'part' && (resolved.id === 'imu' || resolved.id === 'battery')
      const reveal = internal && active && presentation === 'device'
      object.visible = !internal || reveal
      object.renderOrder = reveal ? (object.name.endsWith('_Internal') ? 20 : 21) : 0
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
        standard.depthTest = !reveal
        standard.depthWrite = !isClickProxy && !reveal
        if (isClickProxy && active) standard.color.set('#d88314')
        standard.emissive?.set(active ? '#d88314' : '#000000')
        standard.emissiveIntensity = active ? (isClickProxy ? 0.32 : 0.18) : 0
        standard.needsUpdate = true
      })
    })
  }, [scene, selected, presentation])

  const spread = useMemo(() => new THREE.Quaternion(), [])
  const flexion = useMemo(() => new THREE.Quaternion(), [])

  const targetQuaternion = useMemo(() => new THREE.Quaternion(), [])
  useFrame((_, delta) => {
    jointHotspots.forEach((joint) => {
      const bone = scene.getObjectByName(joint.boneNode)
      const rest = restQuaternions.get(joint.id)
      if (!bone || !rest) return
      const bend = THREE.MathUtils.degToRad((angles[joint.id] ?? 0) * joint.flexSign)
      flexion.setFromAxisAngle(flexAxes[joint.flexAxis], bend)
      const splay = presentation === 'device' ? wornSpread[joint.id] ?? 0 : 0
      spread.setFromAxisAngle(flexAxes.z, THREE.MathUtils.degToRad(splay))
      targetQuaternion.copy(rest).multiply(spread).multiply(flexion)
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
        THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), THREE.MathUtils.degToRad(roll + (presentation === 'device' ? -37 : 0)), 'YXZ',
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
    const visible = event.intersections.filter(i => i.object.visible && i.object instanceof THREE.Mesh)
    const picked = visible.find(i => i.object.renderOrder >= 20) ?? visible[0]
    if (!picked) return
    const resolution = resolveSelection(picked.object)
    if (!resolution) return
    event.stopPropagation()
    let hit: HSADSelection['hit']
    if (picked.face && picked.object instanceof THREE.Mesh) {
      const mesh = picked.object
      const { a, b, c } = picked.face
      const triangle = new THREE.Triangle(...[a, b, c].map(i => mesh.getVertexPosition(i, new THREE.Vector3())))
      const weights = triangle.getBarycoord(mesh.worldToLocal(picked.point.clone()), new THREE.Vector3())
      if (weights) hit = { uuid: mesh.uuid, indices: [a, b, c], weights: weights.toArray() }
    }
    onSelect?.({ ...resolution, hit, clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY })
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
    <ModelControls target={target} marker={marker} device={presentation === 'device'} focusKey={selected ? `${selected.type}:${selected.id}:${selected.hit?.uuid ?? ""}` : ''} resetNonce={resetNonce} />
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
  const marker = useRef<HTMLDivElement>(null)
  const label = props.selected?.type === 'joint' ? props.selected.id : deviceParts.find(p => p.id === props.selected?.id)?.label
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
    {props.presentation === 'device' && label && <div key={label} hidden ref={marker} className="device-pin" aria-hidden="true"><span>{label}</span></div>}
  </div>
}
