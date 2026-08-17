import * as THREE from 'three'
import { createRotaryCylinderModel, createRotaryCylinderLookDevLights, createRotaryCylinderEnvironment, frameRotaryCylinderCamera } from './createRotaryCylinderModel'

const mode = (new URLSearchParams(location.search).get('mode') ?? 'reference') as 'reference' | 'neutral' | 'grazing'
const azDeg = Number(new URLSearchParams(location.search).get('az') ?? -22)
const elDeg = Number(new URLSearchParams(location.search).get('el') ?? 14)

const app = document.getElementById('app')!
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x14161a)

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.01, 50)
camera.position.set(-0.4, 0.9, 1.9)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
app.appendChild(renderer.domElement)

scene.environment = createRotaryCylinderEnvironment(renderer)
scene.add(createRotaryCylinderLookDevLights(mode))

const model = createRotaryCylinderModel()
scene.add(model)

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(6, 6),
  new THREE.ShadowMaterial({ opacity: 0.35 }),
)
ground.rotation.x = -Math.PI / 2
ground.position.y = -0.001
ground.receiveShadow = true
scene.add(ground)

frameRotaryCylinderCamera(camera, model, { margin: 1.1, azimuthDeg: azDeg, elevationDeg: elDeg })

const runtime = model.userData.sculptRuntime as { nodes: Record<string, THREE.Object3D> }
const disc = runtime.nodes.outputDisc
if (disc) {
  const t = performance.now() / 1000
  disc.rotation.y = -Math.PI / 4 * Math.sin(t * 0.8)
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}
window.addEventListener('resize', resize)

renderer.setAnimationLoop(() => {
  renderer.render(scene, camera)
})