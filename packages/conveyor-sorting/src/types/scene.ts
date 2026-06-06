export interface SceneComponentProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

export const MATERIAL_COLORS = {
  BLUE: '#4A90E2',
  BLACK: '#2C3E50',
} as const;
