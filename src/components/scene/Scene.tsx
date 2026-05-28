import { useEffect, useRef, useState, createContext, useContext, useCallback, type ReactNode } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { useDeviceStore } from '../../stores';

interface SceneContextType {
  scene: THREE.Scene | null;
  add: (object: THREE.Object3D) => void;
  remove: (object: THREE.Object3D) => void;
}

const SceneContext = createContext<SceneContextType>({
  scene: null,
  add: () => {},
  remove: () => {},
});

export const useScene = () => useContext(SceneContext);

interface SceneProps {
  children: ReactNode;
}

export const Scene: React.FC<SceneProps> = ({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const css2DRendererRef = useRef<CSS2DRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationIdRef = useRef<number>(0);
  const lastRenderTimeRef = useRef<number>(0);
  const [sceneState, setSceneState] = useState<THREE.Scene | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e293b);
    sceneRef.current = scene;
    setSceneState(scene);

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 5, 8);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const css2DRenderer = new CSS2DRenderer();
    css2DRenderer.setSize(window.innerWidth, window.innerHeight);
    css2DRenderer.domElement.style.position = 'absolute';
    css2DRenderer.domElement.style.top = '0';
    css2DRenderer.domElement.style.pointerEvents = 'none';
    containerRef.current.appendChild(css2DRenderer.domElement);
    css2DRendererRef.current = css2DRenderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2;
    controls.maxDistance = 20;
    controls.maxPolarAngle = Math.PI / 2;
    controlsRef.current = controls;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 512;
    directionalLight.shadow.mapSize.height = 512;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 30;
    directionalLight.shadow.camera.left = -5;
    directionalLight.shadow.camera.right = 5;
    directionalLight.shadow.camera.top = 5;
    directionalLight.shadow.camera.bottom = -5;
    directionalLight.shadow.bias = -0.001;
    scene.add(directionalLight);

    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.8,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    let userInteracting = false;
    let interactionTimeout: ReturnType<typeof setTimeout> | null = null;

    const onPointerDown = () => {
      userInteracting = true;
      if (interactionTimeout) clearTimeout(interactionTimeout);
    };
    const onPointerUp = () => {
      interactionTimeout = setTimeout(() => {
        userInteracting = false;
      }, 2000);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const FRAME_ACTIVE = 16;
    const FRAME_IDLE = 66;

    const animate = (time: number) => {
      animationIdRef.current = requestAnimationFrame(animate);

      controls.update();

      const { conveyorRunning, material, cylinders } = useDeviceStore.getState();
      const hasAnimation = conveyorRunning || material.visible ||
        cylinders.feed.currentExtension > 0.01 ||
        cylinders.sorting1.currentExtension > 0.01 ||
        cylinders.sorting2.currentExtension > 0.01;

      if (userInteracting || hasAnimation) {
        const elapsed = time - lastRenderTimeRef.current;
        if (elapsed >= FRAME_ACTIVE) {
          lastRenderTimeRef.current = time;
          renderer.render(scene, camera);
          css2DRenderer.render(scene, camera);
        }
      } else {
        const elapsed = time - lastRenderTimeRef.current;
        if (elapsed >= FRAME_IDLE) {
          lastRenderTimeRef.current = time;
          renderer.render(scene, camera);
          css2DRenderer.render(scene, camera);
        }
      }
    };
    animate(0);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      css2DRenderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      if (interactionTimeout) clearTimeout(interactionTimeout);
      cancelAnimationFrame(animationIdRef.current);
      controls.dispose();
      const container = containerRef.current;
      if (container) {
        if (renderer.domElement) container.removeChild(renderer.domElement);
        if (css2DRenderer.domElement) container.removeChild(css2DRenderer.domElement);
      }
      groundGeometry.dispose();
      groundMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  const add = useCallback((object: THREE.Object3D) => {
    if (sceneRef.current) {
      sceneRef.current.add(object);
    }
  }, []);

  const remove = useCallback((object: THREE.Object3D) => {
    if (sceneRef.current) {
      sceneRef.current.remove(object);
    }
  }, []);

  return (
    <SceneContext.Provider value={{ scene: sceneState, add, remove }}>
      <div ref={containerRef} className="w-full h-full" />
      {children}
    </SceneContext.Provider>
  );
};

export default Scene;
