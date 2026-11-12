import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { DevicePartId } from '../../data/jointHotspots'
import type { HSADSelection } from './HSADHand3D'

// Offsets are in the upright viewer's frame: +Z is away from the glove back.
// Lateral spacing lets the layers remain distinguishable in the front view.
const offsets: Record<DevicePartId, [number, number, number]> = {
  sensor: [.55, .14, .90], serpentine: [.27, .06, .47],
  acquisition: [-.94, -.18, .87], conditioning: [-1.38, .40, 1.26],
  esp32: [-1.58, -.57, 1.50], power: [.94, -.46, 1.17],
  imu: [.96, .32, 1.36], battery: [-.48, -.93, 1.60],
}

function movableMesh(mesh: THREE.Mesh) {
  const rest = mesh.position.clone()
  const localShift = new THREE.Vector3()
  const inverse = new THREE.Matrix3()
  if (!(mesh instanceof THREE.SkinnedMesh)) {
    return {
      shift(offset: THREE.Vector3) {
        inverse.setFromMatrix4(mesh.parent!.matrixWorld).invert()
        mesh.position.copy(rest).add(localShift.copy(offset).applyMatrix3(inverse))
      },
      dispose() { mesh.position.copy(rest) },
    }
  }
  // Moving an attached skinned mesh's Object3D alone is cancelled by its
  // inverse bind transform. Offset its display skeleton after the live pose.
  // Rendering and Three's skinned raycast then use the same vertex positions.
  const original = mesh.skeleton
  const display = new THREE.Skeleton(original.bones.map(() => new THREE.Bone()), original.boneInverses)
  if (!mesh.boundingSphere) mesh.computeBoundingSphere()
  const sphere = mesh.boundingSphere!.clone()
  const box = mesh.boundingBox?.clone()
  return {
    shift(offset: THREE.Vector3) {
      if (offset.lengthSq() === 0) {
        mesh.skeleton = original
      } else {
        original.bones.forEach((bone, i) => {
          const matrix = display.bones[i].matrixWorld.copy(bone.matrixWorld)
          matrix.elements[12] += offset.x
          matrix.elements[13] += offset.y
          matrix.elements[14] += offset.z
        })
        mesh.skeleton = display
      }
      inverse.setFromMatrix4(mesh.matrixWorld).invert()
      localShift.copy(offset).applyMatrix3(inverse)
      mesh.boundingSphere!.copy(sphere).translate(localShift)
      if (box) mesh.boundingBox!.copy(box).translate(localShift)
    },
    dispose() {
      mesh.skeleton = original
      mesh.boundingSphere!.copy(sphere)
      if (box) mesh.boundingBox!.copy(box)
      display.dispose()
    },
  }
}

type Cluster = {
  selection: HSADSelection
  members: ReturnType<typeof movableMesh>[]
  bounds: THREE.Box3
  direction: THREE.Vector3
  progress: number
  guide: THREE.Line
}

export function DeviceAssembly({ model, active, expanded, resolve, focus }: {
  model: THREE.Object3D
  active?: HSADSelection | null
  expanded: boolean
  resolve: (object: THREE.Object3D) => HSADSelection | null
  focus: THREE.Object3D
}) {
  const guides = useRef<THREE.Group>(null)
  const clusters = useRef<Cluster[]>([])
  const offset = useRef(new THREE.Vector3())
  const reduced = useRef(matchMedia('(prefers-reduced-motion: reduce)'))
  useLayoutEffect(() => {
    const group = guides.current!
    const byId = new Map<string, Cluster>()
    const substrate = model.getObjectByName('MainFPC')
    const substrateMeshes: THREE.Mesh[] = []
    substrate?.traverse(object => {
      if (object instanceof THREE.Mesh) substrateMeshes.push(object)
    })
    // Skip the substrate for both the camera and the R3F raycaster.
    const substrateLayers = substrateMeshes.map(mesh => mesh.layers.mask)
    substrateMeshes.forEach(mesh => mesh.layers.disableAll())
    const material = new THREE.LineBasicMaterial({ color: '#147581', transparent: true, opacity: .8, depthWrite: false })
    model.updateWorldMatrix(true, false)
    model.updateMatrixWorld(true)
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      const selection = resolve(object)
      if (!selection) return
      const id = selection.id
      let cluster = byId.get(id)
      if (!cluster) {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3))
        const guide = new THREE.Line(geometry, material)
        guide.visible = false
        guide.frustumCulled = false
        group.add(guide)
        const direction = offsets[selection.type === 'joint' ? 'sensor' : id as DevicePartId]
        cluster = { selection, members: [], bounds: new THREE.Box3(), direction: new THREE.Vector3(...direction), progress: 0, guide }
        byId.set(id, cluster)
      }
      cluster.bounds.expandByObject(object, true)
      cluster.members.push(movableMesh(object))
    })
    clusters.current = [...byId.values()]
    for (const cluster of clusters.current) {
      const center = cluster.bounds.getCenter(new THREE.Vector3())
      cluster.guide.position.copy(center)
    }
    return () => {
      substrateMeshes.forEach((mesh, i) => { mesh.layers.mask = substrateLayers[i] })
      for (const cluster of byId.values()) {
        cluster.members.forEach(member => member.dispose())
        group.remove(cluster.guide)
        cluster.guide.geometry.dispose()
      }
      material.dispose()
      clusters.current = []
    }
  }, [model, resolve])

  useLayoutEffect(() => {
    if (!active) return
    const bounds = new THREE.Box3()
    for (const cluster of clusters.current) {
      if (active.id !== cluster.selection.id && !(active.id === 'sensor' && cluster.selection.type === 'joint')) continue
      bounds.union(cluster.bounds)
      bounds.union(cluster.bounds.clone().translate(cluster.direction))
    }
    if (!bounds.isEmpty()) bounds.getCenter(focus.position)
  }, [active, focus, model])

  useFrame((_, dt) => {
    for (const cluster of clusters.current) {
      const selected = active?.id === cluster.selection.id || (active?.id === 'sensor' && cluster.selection.type === 'joint')
      const target = expanded ? (selected ? 1.30 : 1) : (selected ? 1 : 0)
      if (!target && !cluster.progress) continue
      const amount = reduced.current.matches ? target : THREE.MathUtils.damp(cluster.progress, target, 12, dt)
      cluster.progress = Math.abs(amount - target) < .001 ? target : amount
      offset.current.copy(cluster.direction).multiplyScalar(cluster.progress)
      cluster.members.forEach(member => member.shift(offset.current))
      cluster.guide.visible = Boolean(selected && cluster.progress > .03)
      if (cluster.guide.visible) {
        const positions = cluster.guide.geometry.getAttribute('position')
        positions.setXYZ(1, offset.current.x, offset.current.y, offset.current.z)
        positions.needsUpdate = true
      }
    }
  })
  return <group ref={guides} name="AssemblyGuides" />
}
