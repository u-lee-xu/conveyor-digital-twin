import { COMPONENT } from '../constants';

export function getPushPlateWorldZ(cylinderZ: number, extension: number): number {
  return cylinderZ - (extension + COMPONENT.CYLINDER_SURFACE_OFFSET);
}
