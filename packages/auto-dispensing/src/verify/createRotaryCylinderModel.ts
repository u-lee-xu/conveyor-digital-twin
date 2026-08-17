import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type SculptMaterialSpec = Record<string, any>;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((part) => part + part).join('')
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized.slice(1), 16) : 0x8a7a5f;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0) return palette.filter((value) => typeof value === 'string');
  const secondary = spec.albedo?.secondary;
  const colors = [spec.baseColor ?? spec.color ?? spec.albedo?.dominant, ...(Array.isArray(secondary) ? secondary : [])];
  return colors.filter((value): value is string => typeof value === 'string' && value.startsWith('#'));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(x: number, y: number, seed: number, periodX: number, periodY: number): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value = Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, seed: number, periodX: number, periodY: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === 'number' ? band.frequency : 0;
    const amplitude = typeof band.amplitude === 'number' ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description = `${String(band.pattern ?? '')} ${String(band.role ?? '')}`.toLowerCase();
    return [{
      frequency,
      amplitude,
      stretchX: typeof stretch[0] === 'number' ? Math.max(0.1, stretch[0]) : 1,
      stretchY: typeof stretch[1] === 'number' ? Math.max(0.1, stretch[1]) : 1,
      ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
    }];
  });
  return parsed.length > 0 ? parsed : [
    { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
  ];
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY);
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

type ColorGradientStop = { offset: number; color: string };
type ColorGradientSpec = {
  type: 'linear' | 'radial';
  axis: [number, number];
  stops: ColorGradientStop[];
};

function parseRgba(value: string): [number, number, number] {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!match) return [138, 122, 95];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// Analytical per-pixel gradient sample. The extraction schema's colorGradient carries
// exact rgba(...) stop colors (see extract_part_color_recipe.py), so this samples the
// same trend directly in JS math rather than round-tripping through a Canvas 2D
// createLinearGradient/createRadialGradient object — same visual result, and it composes
// directly with the existing noise/height-correlated colorVariation blend below.
function sampleColorGradient(gradient: ColorGradientSpec, u: number, v: number): [number, number, number] {
  const stops = gradient.stops.length >= 2 ? gradient.stops : [{ offset: 0, color: 'rgba(138,122,95,1)' }, { offset: 1, color: 'rgba(138,122,95,1)' }];
  let t: number;
  if (gradient.type === 'radial') {
    const [cx, cy] = gradient.axis;
    const dx = u - cx;
    const dy = v - cy;
    const maxRadius = Math.max(0.001, Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy)));
    t = clamp01(Math.hypot(dx, dy) / maxRadius);
  } else {
    const [ax, ay] = gradient.axis;
    const projection = (u - 0.5) * ax + (v - 0.5) * ay;
    const maxProjection = 0.5 * (Math.abs(ax) + Math.abs(ay)) || 0.5;
    t = clamp01(projection / maxProjection + 0.5);
  }
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)));
  const mix = scaled - index;
  const a = parseRgba(stops[index].color);
  const b = parseRgba(stops[index + 1].color);
  return [
    THREE.MathUtils.lerp(a[0], b[0], mix),
    THREE.MathUtils.lerp(a[1], b[1], mix),
    THREE.MathUtils.lerp(a[2], b[2], mix),
  ];
}

function writePixel(data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 2,
    typeof repeat[1] === 'number' ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: 'reference-pixel-extraction' | 'procedural';
};

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== 'object') return null;
  if (reference.usable === false) return null;
  const confidence = typeof reference.confidence === 'number'
    ? reference.confidence
    : (typeof reference.estimatedFidelity === 'number' ? reference.estimatedFidelity : 0);
  const threshold = typeof reference.targetThreshold === 'number' ? reference.targetThreshold : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== 'object') return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== 'object') return null;
  const record = map as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : record.path;
  return typeof url === 'string' && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 1,
    typeof repeat[1] === 'number' ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

function makeReferenceTextureSet(spec: SculptMaterialSpec, options: ProceduralModelOptions): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, 'albedo');
  const roughness = referenceMapUrl(spec, 'roughness');
  const height = referenceMapUrl(spec, 'height');
  const normal = referenceMapUrl(spec, 'normal');
  const ao = referenceMapUrl(spec, 'ao');
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: 'reference-pixel-extraction',
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === 'undefined') return null;
  const qualityFirst = (options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity';
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : (qualityFirst ? 1024 : 512);
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))));
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext('2d'),
    roughness: canvases.roughness.getContext('2d'),
    height: canvases.height.getContext('2d'),
    normal: canvases.normal.getContext('2d'),
    ao: canvases.ao.getContext('2d'),
  };
  if (!contexts.albedo || !contexts.roughness || !contexts.height || !contexts.normal || !contexts.ao) return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  const colors = (palette.length >= 2 ? palette : [fallback, '#6E614B', '#A08F70']).map(hexToRgb);
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ['base'], 0.76));
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ['variation'], 0.18));
  const colorAmplitude = clamp01(readLayerNumber(spec.colorVariation, ['amplitude', 'variation'], 0.18));
  const heightCorrelation = clamp01(readLayerNumber(spec.colorVariation, ['heightCorrelation'], 0.3));
  const colorGradient: ColorGradientSpec | undefined = spec.colorGradient;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2);
      let color: [number, number, number];
      if (colorGradient) {
        // Evidence-derived spatial gradient (Plan 1.3 Workstream C) takes priority
        // over the noise-based palette blend below — it is a measured trend, not a guess.
        color = sampleColorGradient(colorGradient, u, v);
      } else {
        const paletteValue = clamp01(
          0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation
        );
        color = mixPalette(colors, paletteValue);
      }
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35));
  const aoStrength = clamp01(readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35));
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6;
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage = (
        heightField[y * size + left] + heightField[y * size + right]
        + heightField[up + x] + heightField[down + x]
      ) * 0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte);
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte);
      writePixel(
        images.normal.data, offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: 'procedural',
  };
}

function createSculptMaterial(id: string, spec: SculptMaterialSpec, options: ProceduralModelOptions): THREE.MeshPhysicalMaterial {
  const textures = makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options);
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : new THREE.Color(typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F'),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ['base'], 0.76)),
    metalness: clamp01(readLayerNumber(spec.metalness, ['base'], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ['base', 'amount'], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ['base'], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ['base', 'amount'], 0)),
    ior: Math.max(1, readLayerNumber(spec.ior, ['base', 'value'], 1.5)),
    thickness: Math.max(0, readLayerNumber(spec.thickness, ['base', 'amount'], 0)),
    attenuationDistance: Math.max(0.001, readLayerNumber(spec.attenuationDistance, ['base', 'value'], Infinity)),
    attenuationColor: new THREE.Color(typeof spec.attenuationColor === 'string' ? spec.attenuationColor : '#ffffff'),
    sheen: clamp01(readLayerNumber(spec.sheen, ['base', 'amount'], 0)),
    sheenColor: new THREE.Color(typeof spec.sheenColor === 'string' ? spec.sheenColor : '#ffffff'),
    sheenRoughness: clamp01(readLayerNumber(spec.sheenRoughness, ['base'], 1.0)),
    iridescence: clamp01(readLayerNumber(spec.iridescence, ['base', 'amount'], 0)),
    iridescenceIOR: Math.max(1, readLayerNumber(spec.iridescenceIOR, ['base', 'value'], 1.3)),
    anisotropy: clamp01(readLayerNumber(spec.anisotropy, ['base', 'amount'], 0)),
    anisotropyRotation: readLayerNumber(spec.anisotropy, ['rotation'], 0),
    specularIntensity: clamp01(readLayerNumber(spec.specularIntensity, ['base'], 1.0)),
    specularColor: new THREE.Color(typeof spec.specularColor === 'string' ? spec.specularColor : '#ffffff'),
    emissive: new THREE.Color(typeof spec.emissive === 'string' ? spec.emissive : '#000000'),
    emissiveIntensity: Math.max(0, readLayerNumber(spec.emissiveIntensity, ['base'], 1.0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ['base'], 1)),
    transparent: readLayerNumber(spec.transmission, ['base', 'amount'], 0) > 0 || readLayerNumber(spec.opacity, ['base'], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ['cutoff', 'alphaTest'], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35)));
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35);
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ['amplitude', 'strength'], 0));
    if (bumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = bumpScale;
    }
    const displacementScale = Math.max(0, readLayerNumber(spec.displacement, ['amplitude', 'strength'], 0));
    if (displacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = displacementScale;
      material.displacementBias = -displacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ['envMapIntensity'], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrTextureSource = textures?.source ?? 'flat-fallback';
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number')) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55));
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: RotaryCylinder
// Sculpt build pass: blockout
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createRotaryCylinderModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "RotaryCylinder";

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["baseAluminum"] = createSculptMaterial(
    "baseAluminum",
    {"id": "baseAluminum", "name": "Anodized aluminum base", "type": "physical", "shaderModel": "MeshPhysicalMaterial", "baseColor": "#B9C0C8", "color": "#B9C0C8", "albedo": {"dominant": "#DADBDE", "secondary": ["#6F5B5A", "#BFBFC2", "#939294"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights.", "map": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_base/basealuminum_albedo.png", "url": "basealuminum_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}}, "colorVariation": {"palette": ["#DADBDE", "#6F5B5A", "#BFBFC2", "#939294", "#333230"], "pattern": "reference-derived pixel palette", "amplitude": 0.297, "heightCorrelation": 0.42}, "textureResolution": 1024, "textureProjection": {"mode": "box", "repeat": [1.0, 1.0], "anisotropy": 8}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.52, "role": "reference-derived broad albedo and height breakup"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.35, "role": "reference-derived cracks, ridges, pores, grain, or leaf clusters"}, {"id": "micro", "frequency": 72.0, "amplitude": 0.14, "role": "reference-derived micro highlight breakup under grazing light"}], "roughness": {"base": 0.695, "variation": 0.119, "map": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_base/basealuminum_roughness.png", "url": "basealuminum_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "localResponse": "reference-derived roughness estimate; cavities and textured zones trend rougher, bright highlights trend smoother"}, "metalness": {"base": 1.0, "variation": 0.05}, "clearcoat": {"strength": 0.15, "roughness": 0.4, "base": 0.0}, "normal": {"pattern": "reference-derived height-gradient normal map", "strength": 0.228, "map": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_base/basealuminum_normal.png", "url": "basealuminum_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "heightSource": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_base/basealuminum_height.png", "url": "basealuminum_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "space": "tangent"}, "bump": {"pattern": "reference-derived height field", "amplitude": 0.027, "map": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_base/basealuminum_height.png", "url": "basealuminum_height.png", "channel": "height", "source": "reference-pixel-extraction"}}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_base/basealuminum_ao.png", "url": "basealuminum_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.35, "scratches": [{"id": "scratch1", "pattern": "linear", "count": 2, "depth": 0.002}], "chips": []}, "dirt": {"amount": 0.08, "cavityBias": 0.5, "color": "#4A463F"}, "localOverrides": [{"id": "rimBevel", "region": "edges", "roughness": 0.18, "metalness": 0.9, "note": "brighter beveled edges catch grazing light"}, {"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "shaderNotes": ["Solid albedo for flat paint: solid albedo plus procedural roughness, low clearcoat", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."], "notes": "silver anodized aluminum, brushed faintly, brighter step edges", "finishClass": "brushed-steel", "texturePalette": ["#C2C1BF", "#7E7D7F", "#D5C8CB", "#DFDFE2", "#E3E3E3"], "proceduralTexture": "brushed", "clearcoatRoughness": {"base": 0.0, "variation": 0.0}, "transmission": {"base": 0.0, "variation": 0.0}, "ior": {"base": 1.5, "value": 1.5}, "envMapIntensity": 1.0, "anisotropy": {"base": 1.0}, "referencePbr": {"version": "1.0", "sourceImage": "/tmp/opencode/img2threejs/cylinder/base_crop.png", "extractor": "stage1_intake/extract_pbr_evidence.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.86, "estimatedFidelity": 0.86, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_base/basealuminum_albedo.png", "url": "basealuminum_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_base/basealuminum_roughness.png", "url": "basealuminum_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_base/basealuminum_height.png", "url": "basealuminum_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_base/basealuminum_normal.png", "url": "basealuminum_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_base/basealuminum_ao.png", "url": "basealuminum_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 467, "sourceHeight": 183, "mapSize": 1024, "cropBBoxPixels": {"x": 0, "y": 0, "width": 461, "height": 179}, "mask": {"backgroundColor": "#EDEDED", "backgroundNoise": 6.928, "transparentPixelFraction": 0.0, "foregroundCoverage": 0.4874}, "mapStats": {"valueRange": 0.7081, "heightP90Gradient": 0.0611, "roughnessBase": 0.695, "roughnessVariation": 0.119, "normalStrength": 0.228, "blurRadius": 21}, "palette": ["#DADBDE", "#6F5B5A", "#BFBFC2", "#939294", "#333230"]}, "warnings": ["single-image inverse rendering cannot prove true physical PBR; confidence is capped"]}},
    options
  );
  materialMap["discAluminum"] = createSculptMaterial(
    "discAluminum",
    {"id": "discAluminum", "name": "Machined disc aluminum", "type": "physical", "shaderModel": "MeshPhysicalMaterial", "baseColor": "#C6CBD2", "color": "#C6CBD2", "albedo": {"dominant": "#DCDCE0", "secondary": ["#C4C6CC", "#AEB0B7", "#504C53"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights.", "map": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_disc/discaluminum_albedo.png", "url": "discaluminum_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}}, "colorVariation": {"palette": ["#DCDCE0", "#C4C6CC", "#AEB0B7", "#504C53", "#888B93"], "pattern": "reference-derived pixel palette", "amplitude": 0.249, "heightCorrelation": 0.42}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 8}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.487, "role": "reference-derived broad albedo and height breakup"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.35, "role": "reference-derived cracks, ridges, pores, grain, or leaf clusters"}, {"id": "micro", "frequency": 72.0, "amplitude": 0.14, "role": "reference-derived micro highlight breakup under grazing light"}], "roughness": {"base": 0.695, "variation": 0.114, "map": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_disc/discaluminum_roughness.png", "url": "discaluminum_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "localResponse": "reference-derived roughness estimate; cavities and textured zones trend rougher, bright highlights trend smoother"}, "metalness": {"base": 1.0, "variation": 0.05}, "clearcoat": {"strength": 0.2, "roughness": 0.3, "base": 0.0}, "normal": {"pattern": "reference-derived height-gradient normal map", "strength": 0.234, "map": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_disc/discaluminum_normal.png", "url": "discaluminum_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "heightSource": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_disc/discaluminum_height.png", "url": "discaluminum_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "space": "tangent"}, "bump": {"pattern": "reference-derived height field", "amplitude": 0.03, "map": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_disc/discaluminum_height.png", "url": "discaluminum_height.png", "channel": "height", "source": "reference-pixel-extraction"}}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_disc/discaluminum_ao.png", "url": "discaluminum_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.4, "scratches": [{"id": "turning", "pattern": "concentric", "count": 3, "depth": 0.001}], "chips": []}, "dirt": {"amount": 0.06, "cavityBias": 0.5, "color": "#3E3A33"}, "localOverrides": [{"id": "tickGroove", "region": "scale-ticks", "roughness": 0.7, "metalness": 0.6, "note": "engraved ticks read as dark lines"}, {"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "shaderNotes": ["prefer MeshPhysicalMaterial; anisotropy for brushed turning lines", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."], "notes": "machined silver disc, turned rings, engraved scale", "finishClass": "brushed-steel", "texturePalette": ["#F0F0F0", "#C5C6CA", "#D5D7DC", "#989AA1", "#D5C7CB"], "proceduralTexture": "brushed", "clearcoatRoughness": {"base": 0.0, "variation": 0.0}, "transmission": {"base": 0.0, "variation": 0.0}, "ior": {"base": 1.5, "value": 1.5}, "envMapIntensity": 1.0, "anisotropy": {"base": 1.0}, "referencePbr": {"version": "1.0", "sourceImage": "/tmp/opencode/img2threejs/cylinder/disc_crop.png", "extractor": "stage1_intake/extract_pbr_evidence.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.86, "estimatedFidelity": 0.86, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_disc/discaluminum_albedo.png", "url": "discaluminum_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_disc/discaluminum_roughness.png", "url": "discaluminum_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_disc/discaluminum_height.png", "url": "discaluminum_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_disc/discaluminum_normal.png", "url": "discaluminum_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/tmp/opencode/img2threejs/cylinder/pbr_disc/discaluminum_ao.png", "url": "discaluminum_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 368, "sourceHeight": 212, "mapSize": 1024, "cropBBoxPixels": {"x": 0, "y": 0, "width": 350, "height": 212}, "mask": {"backgroundColor": "#EFEFEF", "backgroundNoise": 5.196, "transparentPixelFraction": 0.0, "foregroundCoverage": 0.4783}, "mapStats": {"valueRange": 0.5922, "heightP90Gradient": 0.0665, "roughnessBase": 0.695, "roughnessVariation": 0.114, "normalStrength": 0.234, "blurRadius": 21}, "palette": ["#DCDCE0", "#C4C6CC", "#AEB0B7", "#504C53", "#888B93"]}, "warnings": ["single-image inverse rendering cannot prove true physical PBR; confidence is capped"]}},
    options
  );
  materialMap["brass"] = createSculptMaterial(
    "brass",
    {"id": "brass", "name": "Brass fittings", "type": "physical", "shaderModel": "MeshPhysicalMaterial", "baseColor": "#C9A15C", "color": "#C9A15C", "albedo": {"dominant": "#C9A15C", "secondary": ["#B08A45", "#E0C183"]}, "colorVariation": {"palette": ["#C9A15C", "#B08A45", "#E0C183"], "pattern": "gradient", "amplitude": 0.1, "heightCorrelation": 0.0}, "textureResolution": 1024, "textureProjection": {"mode": "box", "repeat": [1.0, 1.0], "anisotropy": 8}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 1.0, "amplitude": 0.2, "role": "brass tonal"}, {"id": "meso", "frequency": 8.0, "amplitude": 0.1, "role": "knurl rings"}, {"id": "micro", "frequency": 32.0, "amplitude": 0.05, "role": "polish grain"}], "roughness": {"base": 0.3, "variation": 0.08, "map": "independent-procedural-field"}, "metalness": {"base": 0.85, "variation": 0.05}, "clearcoat": {"strength": 0.1, "roughness": 0.5}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.3, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35}, "wear": {"edgeWear": 0.2, "scratches": [], "chips": []}, "dirt": {"amount": 0.1, "cavityBias": 0.4, "color": "#2E2A22"}, "localOverrides": [{"id": "collarRing", "region": "collar", "roughness": 0.5, "metalness": 0.8, "note": "collar ring slightly matte"}], "shaderNotes": ["brass: warm albedo, high metalness, mid roughness"], "notes": "brass pneumatic fittings with collar rings", "referencePbr": {"version": "1.0", "sourceImage": "/home/p5/DigitalTwinsPaper/气缸.png", "extractor": "img2threejs-analyze-texture", "method": "finish-classification+gradient-palette", "verdict": "brass fitting from base crop; warm metallic", "hardLimit": "JPG", "usable": true, "confidence": 0.7, "estimatedFidelity": 0.7, "targetThreshold": 0.7, "maps": {"albedo": {"path": "/tmp/opencode/img2threejs/cylinder/base_crop.png", "channel": "rgb"}, "roughness": {"path": "/tmp/opencode/img2threejs/cylinder/base_crop.png", "channel": "roughness-derived"}, "height": {"path": "/tmp/opencode/img2threejs/cylinder/base_crop.png", "channel": "height-derived"}, "normal": {"path": "/tmp/opencode/img2threejs/cylinder/base_crop.png", "channel": "normal-derived"}, "ao": {"path": "/tmp/opencode/img2threejs/cylinder/base_crop.png", "channel": "ao-derived"}}}},
    options
  );
  materialMap["darkPlastic"] = createSculptMaterial(
    "darkPlastic",
    {"id": "darkPlastic", "name": "Dark plastic sensor/mount", "type": "standard", "shaderModel": "MeshStandardMaterial", "baseColor": "#2A2D31", "color": "#2A2D31", "albedo": {"dominant": "#2A2D31", "secondary": ["#1F2226", "#3A3E44"]}, "colorVariation": {"palette": ["#2A2D31", "#1F2226", "#3A3E44"], "pattern": "mottled", "amplitude": 0.06, "heightCorrelation": 0.2}, "textureResolution": 1024, "textureProjection": {"mode": "box", "repeat": [1.0, 1.0], "anisotropy": 4}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 1.0, "amplitude": 0.3, "role": "plastic tonal"}, {"id": "meso", "frequency": 6.0, "amplitude": 0.1, "role": "mold grain"}, {"id": "micro", "frequency": 24.0, "amplitude": 0.04, "role": "plastic sheen"}], "roughness": {"base": 0.6, "variation": 0.1, "map": "independent-procedural-field"}, "metalness": {"base": 0.05, "variation": 0.0}, "normal": {"pattern": "none", "strength": 0.0, "scale": 1.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.4, "contactShadowBias": 0.4}, "wear": {"edgeWear": 0.1, "scratches": [], "chips": []}, "dirt": {"amount": 0.05, "cavityBias": 0.6, "color": "#1A1B1D"}, "localOverrides": [], "shaderNotes": ["flat dark plastic"], "notes": "dark plastic magnetic switch housing", "referencePbr": {"version": "1.0", "sourceImage": "/home/p5/DigitalTwinsPaper/气缸.png", "extractor": "img2threejs-analyze-texture", "method": "finish-classification+gradient-palette", "verdict": "dark molded plastic housing", "hardLimit": "JPG", "usable": true, "confidence": 0.72, "estimatedFidelity": 0.72, "targetThreshold": 0.7, "maps": {"albedo": {"path": "/tmp/opencode/img2threejs/cylinder/disc_crop.png", "channel": "rgb"}, "roughness": {"path": "/tmp/opencode/img2threejs/cylinder/disc_crop.png", "channel": "roughness-derived"}, "height": {"path": "/tmp/opencode/img2threejs/cylinder/disc_crop.png", "channel": "height-derived"}, "normal": {"path": "/tmp/opencode/img2threejs/cylinder/disc_crop.png", "channel": "normal-derived"}, "ao": {"path": "/tmp/opencode/img2threejs/cylinder/disc_crop.png", "channel": "ao-derived"}}}},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const attachment_root_0 = null;
  const endpoint_root_0 = makeAttachmentEndpoint(attachment_root_0);
  const node_root_0 = new THREE.Group();
  node_root_0.name = "RotaryCylinder__pivot";
  if (endpoint_root_0) {
    node_root_0.position.copy(endpoint_root_0.start);
    node_root_0.rotation.set(0, 0, 0);
    node_root_0.scale.set(1, 1, 1);
  } else {
    node_root_0.position.set(0.0, 0.0, 0.0);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
    node_root_0.scale.set(1.0, 1.0, 1.0);
  }
  node_root_0.userData.sculptComponent = {"id": "root", "name": "RotaryCylinder", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.9, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Root group; holds base + output disc; exposes swing pivot on output disc", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.04, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": null, "attachment": null, "dimensions": {"width": 0.72, "height": 0.28, "depth": 0.5, "units": "m", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "soc-generic", "type": "attach", "localPosition": [0, 0.08, 0], "axis": [0, 1, 0], "allowAttach": true, "notes": "child mount point"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "materialLayers": [], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(192,198,205,1.0)", "secondaryAlbedo": "rgba(154,162,172,1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(192,198,205,1.0)", "position": 0.0}, {"color": "rgba(154,162,172,1.0)", "position": 1.0}]}}};
  node_root_0.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "soc-generic", "type": "attach", "localPosition": [0, 0.08, 0], "axis": [0, 1, 0], "allowAttach": true, "notes": "child mount point"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_root_0);
  nodes["root"] = node_root_0;
  const mesh_root_0Geometry = endpoint_root_0
    ? new THREE.CylinderGeometry(endpoint_root_0.endRadius, endpoint_root_0.baseRadius, endpoint_root_0.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  const mesh_root_0 = new THREE.Mesh(
    mesh_root_0Geometry,
    materialMap["baseAluminum"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_root_0.name = "RotaryCylinder";
  if (endpoint_root_0) {
    mesh_root_0.position.copy(endpoint_root_0.midpoint);
    mesh_root_0.quaternion.copy(endpoint_root_0.quaternion);
  }
  mesh_root_0.castShadow = options.castShadow ?? true;
  mesh_root_0.receiveShadow = options.receiveShadow ?? true;
  mesh_root_0.userData.sculptComponent = {"id": "root", "name": "RotaryCylinder", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.9, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Root group; holds base + output disc; exposes swing pivot on output disc", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.04, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": null, "attachment": null, "dimensions": {"width": 0.72, "height": 0.28, "depth": 0.5, "units": "m", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "soc-generic", "type": "attach", "localPosition": [0, 0.08, 0], "axis": [0, 1, 0], "allowAttach": true, "notes": "child mount point"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "materialLayers": [], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(192,198,205,1.0)", "secondaryAlbedo": "rgba(154,162,172,1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(192,198,205,1.0)", "position": 0.0}, {"color": "rgba(154,162,172,1.0)", "position": 1.0}]}}};
  node_root_0.add(mesh_root_0);
  meshes["root"] = mesh_root_0;
  colliders["root"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_root_0);
  const socket_root_soc_generic_0 = new THREE.Object3D();
  socket_root_soc_generic_0.name = "soc-generic";
  socket_root_soc_generic_0.position.set(0.0, 0.08, 0.0);
  socket_root_soc_generic_0.rotation.set(0, 0, 0);
  socket_root_soc_generic_0.userData.socket = {"id": "soc-generic", "type": "attach", "localPosition": [0, 0.08, 0], "axis": [0, 1, 0], "allowAttach": true, "notes": "child mount point"};
  node_root_0.add(socket_root_soc_generic_0);
  sockets["root:soc-generic"] = socket_root_soc_generic_0;

  const attachment_base_1 = {"parentId": "root", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001};
  const endpoint_base_1 = makeAttachmentEndpoint(attachment_base_1);
  const node_base_1 = new THREE.Group();
  node_base_1.name = "Anodized aluminum base__pivot";
  if (endpoint_base_1) {
    node_base_1.position.copy(endpoint_base_1.start);
    node_base_1.rotation.set(0, 0, 0);
    node_base_1.scale.set(1, 1, 1);
  } else {
    node_base_1.position.set(0.0, 0.08, 0.0);
    node_base_1.rotation.set(0.0, 0.0, 0.0);
    node_base_1.scale.set(1.0, 1.0, 1.0);
  }
  node_base_1.userData.sculptComponent = {"id": "base", "name": "Anodized aluminum base", "level": "macro", "role": "mount", "importance": 1.0, "confidence": 0.9, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Two-tier stepped prism base, cambered edges; box with stacked step volumes", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.04, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001}, "dimensions": {"width": 0.72, "height": 0.16, "depth": 0.5, "units": "m", "confidence": 0.85}, "transform": {"position": [0, 0.08, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "soc-generic", "type": "attach", "localPosition": [-0.38, 0.05, 0.06], "axis": [0, 1, 0], "allowAttach": true, "notes": "child mount point"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "baseAluminum", "materialLayers": ["baseAluminum"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "steppedTiers", "type": "extrusion", "description": "lower long tier + upper short tier along +Z side; step height 0.06", "params": {"stepHeight": 0.06, "stepDepth": 0.18}}, {"id": "airFittings", "type": "nested-parts", "description": "two threaded brass fittings on -X short end", "count": 2, "params": {"diameter": 0.032, "length": 0.045, "pitch": 0.12, "y": [0.05, 0.09]}}, {"id": "mountHoles", "type": "countersunk", "description": "two mounting holes on side face", "count": 2, "params": {"diameter": 0.02, "depth": 0.01}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(192,198,205,1.0)", "secondaryAlbedo": "rgba(154,162,172,1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(192,198,205,1.0)", "position": 0.0}, {"color": "rgba(154,162,172,1.0)", "position": 1.0}]}}};
  node_base_1.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "soc-generic", "type": "attach", "localPosition": [-0.38, 0.05, 0.06], "axis": [0, 1, 0], "allowAttach": true, "notes": "child mount point"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_base_1);
  nodes["base"] = node_base_1;
  const mesh_base_1Geometry = endpoint_base_1
    ? new THREE.CylinderGeometry(endpoint_base_1.endRadius, endpoint_base_1.baseRadius, endpoint_base_1.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  const mesh_base_1 = new THREE.Mesh(
    mesh_base_1Geometry,
    materialMap["baseAluminum"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_base_1.name = "Anodized aluminum base";
  if (endpoint_base_1) {
    mesh_base_1.position.copy(endpoint_base_1.midpoint);
    mesh_base_1.quaternion.copy(endpoint_base_1.quaternion);
  }
  mesh_base_1.castShadow = options.castShadow ?? true;
  mesh_base_1.receiveShadow = options.receiveShadow ?? true;
  mesh_base_1.userData.sculptComponent = {"id": "base", "name": "Anodized aluminum base", "level": "macro", "role": "mount", "importance": 1.0, "confidence": 0.9, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Two-tier stepped prism base, cambered edges; box with stacked step volumes", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.04, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001}, "dimensions": {"width": 0.72, "height": 0.16, "depth": 0.5, "units": "m", "confidence": 0.85}, "transform": {"position": [0, 0.08, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "soc-generic", "type": "attach", "localPosition": [-0.38, 0.05, 0.06], "axis": [0, 1, 0], "allowAttach": true, "notes": "child mount point"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "baseAluminum", "materialLayers": ["baseAluminum"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "steppedTiers", "type": "extrusion", "description": "lower long tier + upper short tier along +Z side; step height 0.06", "params": {"stepHeight": 0.06, "stepDepth": 0.18}}, {"id": "airFittings", "type": "nested-parts", "description": "two threaded brass fittings on -X short end", "count": 2, "params": {"diameter": 0.032, "length": 0.045, "pitch": 0.12, "y": [0.05, 0.09]}}, {"id": "mountHoles", "type": "countersunk", "description": "two mounting holes on side face", "count": 2, "params": {"diameter": 0.02, "depth": 0.01}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(192,198,205,1.0)", "secondaryAlbedo": "rgba(154,162,172,1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(192,198,205,1.0)", "position": 0.0}, {"color": "rgba(154,162,172,1.0)", "position": 1.0}]}}};
  node_base_1.add(mesh_base_1);
  meshes["base"] = mesh_base_1;
  colliders["base"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_base_1);
  const socket_base_soc_generic_0 = new THREE.Object3D();
  socket_base_soc_generic_0.name = "soc-generic";
  socket_base_soc_generic_0.position.set(-0.38, 0.05, 0.06);
  socket_base_soc_generic_0.rotation.set(0, 0, 0);
  socket_base_soc_generic_0.userData.socket = {"id": "soc-generic", "type": "attach", "localPosition": [-0.38, 0.05, 0.06], "axis": [0, 1, 0], "allowAttach": true, "notes": "child mount point"};
  node_base_1.add(socket_base_soc_generic_0);
  sockets["base:soc-generic"] = socket_base_soc_generic_0;

  const attachment_outputDisc_2 = {"parentId": "root", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001};
  const endpoint_outputDisc_2 = makeAttachmentEndpoint(attachment_outputDisc_2);
  const node_outputDisc_2 = new THREE.Group();
  node_outputDisc_2.name = "Rotary output disc__pivot";
  if (endpoint_outputDisc_2) {
    node_outputDisc_2.position.copy(endpoint_outputDisc_2.start);
    node_outputDisc_2.rotation.set(0, 0, 0);
    node_outputDisc_2.scale.set(1, 1, 1);
  } else {
    node_outputDisc_2.position.set(0.0, 0.21, 0.0);
    node_outputDisc_2.rotation.set(0.0, 0.0, 0.0);
    node_outputDisc_2.scale.set(1.0, 1.0, 1.0);
  }
  node_outputDisc_2.userData.sculptComponent = {"id": "outputDisc", "name": "Rotary output disc", "level": "macro", "role": "rotor", "importance": 1.0, "confidence": 0.9, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Flat cylinder plate with engraved scale, bolt holes, hex socket; rotates around its own Y axis", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.04, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001}, "dimensions": {"width": 0.56, "height": 0.045, "depth": 0.56, "units": "m", "confidence": 0.85}, "transform": {"position": [0, 0.21, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "swing-90deg", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "soc-endEffector", "type": "shaft", "localPosition": [0, 0.03, 0], "axis": [0, 1, 0], "allowAttach": true, "notes": "end effector / hopper mount"}, {"id": "soc-generic", "type": "attach", "localPosition": [0.21, 0.225, 0], "axis": [0, 1, 0], "allowAttach": true, "notes": "child mount point"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "discAluminum", "materialLayers": ["discAluminum"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "scaleTicks", "type": "radial-engraving", "description": "degree ticks along rim, 24 ticks 5-degree increments, darker engraved", "count": 24, "params": {"innerRadius": 0.24, "outerRadius": 0.27, "depth": 0.0015}}, {"id": "boltHoles", "type": "radial-instances", "description": "8 bolt holes on 0.21 radius", "count": 8, "params": {"radius": 0.21, "diameter": 0.016, "depth": 0.008}}, {"id": "hexSocket", "type": "recess", "description": "center hex socket recess", "count": 1, "params": {"diameter": 0.05, "depth": 0.008, "sides": 6}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(192,198,205,1.0)", "secondaryAlbedo": "rgba(154,162,172,1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(192,198,205,1.0)", "position": 0.0}, {"color": "rgba(154,162,172,1.0)", "position": 1.0}]}}};
  node_outputDisc_2.userData.actionProfile = {"animationRole": "swing-90deg", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "soc-endEffector", "type": "shaft", "localPosition": [0, 0.03, 0], "axis": [0, 1, 0], "allowAttach": true, "notes": "end effector / hopper mount"}, {"id": "soc-generic", "type": "attach", "localPosition": [0.21, 0.225, 0], "axis": [0, 1, 0], "allowAttach": true, "notes": "child mount point"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_outputDisc_2);
  nodes["outputDisc"] = node_outputDisc_2;
  const mesh_outputDisc_2Geometry = endpoint_outputDisc_2
    ? new THREE.CylinderGeometry(endpoint_outputDisc_2.endRadius, endpoint_outputDisc_2.baseRadius, endpoint_outputDisc_2.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16);
  const mesh_outputDisc_2 = new THREE.Mesh(
    mesh_outputDisc_2Geometry,
    materialMap["discAluminum"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_outputDisc_2.name = "Rotary output disc";
  if (endpoint_outputDisc_2) {
    mesh_outputDisc_2.position.copy(endpoint_outputDisc_2.midpoint);
    mesh_outputDisc_2.quaternion.copy(endpoint_outputDisc_2.quaternion);
  }
  mesh_outputDisc_2.castShadow = options.castShadow ?? true;
  mesh_outputDisc_2.receiveShadow = options.receiveShadow ?? true;
  mesh_outputDisc_2.userData.sculptComponent = {"id": "outputDisc", "name": "Rotary output disc", "level": "macro", "role": "rotor", "importance": 1.0, "confidence": 0.9, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Flat cylinder plate with engraved scale, bolt holes, hex socket; rotates around its own Y axis", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.04, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001}, "dimensions": {"width": 0.56, "height": 0.045, "depth": 0.56, "units": "m", "confidence": 0.85}, "transform": {"position": [0, 0.21, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "swing-90deg", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "soc-endEffector", "type": "shaft", "localPosition": [0, 0.03, 0], "axis": [0, 1, 0], "allowAttach": true, "notes": "end effector / hopper mount"}, {"id": "soc-generic", "type": "attach", "localPosition": [0.21, 0.225, 0], "axis": [0, 1, 0], "allowAttach": true, "notes": "child mount point"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "discAluminum", "materialLayers": ["discAluminum"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "scaleTicks", "type": "radial-engraving", "description": "degree ticks along rim, 24 ticks 5-degree increments, darker engraved", "count": 24, "params": {"innerRadius": 0.24, "outerRadius": 0.27, "depth": 0.0015}}, {"id": "boltHoles", "type": "radial-instances", "description": "8 bolt holes on 0.21 radius", "count": 8, "params": {"radius": 0.21, "diameter": 0.016, "depth": 0.008}}, {"id": "hexSocket", "type": "recess", "description": "center hex socket recess", "count": 1, "params": {"diameter": 0.05, "depth": 0.008, "sides": 6}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(192,198,205,1.0)", "secondaryAlbedo": "rgba(154,162,172,1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(192,198,205,1.0)", "position": 0.0}, {"color": "rgba(154,162,172,1.0)", "position": 1.0}]}}};
  node_outputDisc_2.add(mesh_outputDisc_2);
  meshes["outputDisc"] = mesh_outputDisc_2;
  colliders["outputDisc"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_outputDisc_2);
  const socket_outputDisc_soc_endEffector_0 = new THREE.Object3D();
  socket_outputDisc_soc_endEffector_0.name = "soc-endEffector";
  socket_outputDisc_soc_endEffector_0.position.set(0.0, 0.03, 0.0);
  socket_outputDisc_soc_endEffector_0.rotation.set(0, 0, 0);
  socket_outputDisc_soc_endEffector_0.userData.socket = {"id": "soc-endEffector", "type": "shaft", "localPosition": [0, 0.03, 0], "axis": [0, 1, 0], "allowAttach": true, "notes": "end effector / hopper mount"};
  node_outputDisc_2.add(socket_outputDisc_soc_endEffector_0);
  sockets["outputDisc:soc-endEffector"] = socket_outputDisc_soc_endEffector_0;
  const socket_outputDisc_soc_generic_1 = new THREE.Object3D();
  socket_outputDisc_soc_generic_1.name = "soc-generic";
  socket_outputDisc_soc_generic_1.position.set(0.21, 0.225, 0.0);
  socket_outputDisc_soc_generic_1.rotation.set(0, 0, 0);
  socket_outputDisc_soc_generic_1.userData.socket = {"id": "soc-generic", "type": "attach", "localPosition": [0.21, 0.225, 0], "axis": [0, 1, 0], "allowAttach": true, "notes": "child mount point"};
  node_outputDisc_2.add(socket_outputDisc_soc_generic_1);
  sockets["outputDisc:soc-generic"] = socket_outputDisc_soc_generic_1;

  const attachment_fitting1_3 = {"parentId": "base", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001};
  const endpoint_fitting1_3 = makeAttachmentEndpoint(attachment_fitting1_3);
  const node_fitting1_3 = new THREE.Group();
  node_fitting1_3.name = "Air fitting 1__pivot";
  if (endpoint_fitting1_3) {
    node_fitting1_3.position.copy(endpoint_fitting1_3.start);
    node_fitting1_3.rotation.set(0, 0, 0);
    node_fitting1_3.scale.set(1, 1, 1);
  } else {
    node_fitting1_3.position.set(-0.38, 0.05, 0.06);
    node_fitting1_3.rotation.set(0.0, 0.0, 0.0);
    node_fitting1_3.scale.set(1.0, 1.0, 1.0);
  }
  node_fitting1_3.userData.sculptComponent = {"id": "fitting1", "name": "Air fitting 1", "level": "meso", "role": "port", "importance": 1.0, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Threaded brass barb cylinder with collar", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.04, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "base", "attachment": {"parentId": "base", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001}, "dimensions": {"width": 0.032, "height": 0.032, "depth": 0.045, "units": "m", "confidence": 0.7}, "transform": {"position": [-0.38, 0.05, 0.06], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "brass", "materialLayers": ["brass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(192,198,205,1.0)", "secondaryAlbedo": "rgba(154,162,172,1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(192,198,205,1.0)", "position": 0.0}, {"color": "rgba(154,162,172,1.0)", "position": 1.0}]}}};
  node_fitting1_3.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["base"] ?? root).add(node_fitting1_3);
  nodes["fitting1"] = node_fitting1_3;
  const mesh_fitting1_3Geometry = endpoint_fitting1_3
    ? new THREE.CylinderGeometry(endpoint_fitting1_3.endRadius, endpoint_fitting1_3.baseRadius, endpoint_fitting1_3.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16);
  const mesh_fitting1_3 = new THREE.Mesh(
    mesh_fitting1_3Geometry,
    materialMap["brass"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_fitting1_3.name = "Air fitting 1";
  if (endpoint_fitting1_3) {
    mesh_fitting1_3.position.copy(endpoint_fitting1_3.midpoint);
    mesh_fitting1_3.quaternion.copy(endpoint_fitting1_3.quaternion);
  }
  mesh_fitting1_3.castShadow = options.castShadow ?? true;
  mesh_fitting1_3.receiveShadow = options.receiveShadow ?? true;
  mesh_fitting1_3.userData.sculptComponent = {"id": "fitting1", "name": "Air fitting 1", "level": "meso", "role": "port", "importance": 1.0, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Threaded brass barb cylinder with collar", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.04, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "base", "attachment": {"parentId": "base", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001}, "dimensions": {"width": 0.032, "height": 0.032, "depth": 0.045, "units": "m", "confidence": 0.7}, "transform": {"position": [-0.38, 0.05, 0.06], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "brass", "materialLayers": ["brass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(192,198,205,1.0)", "secondaryAlbedo": "rgba(154,162,172,1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(192,198,205,1.0)", "position": 0.0}, {"color": "rgba(154,162,172,1.0)", "position": 1.0}]}}};
  node_fitting1_3.add(mesh_fitting1_3);
  meshes["fitting1"] = mesh_fitting1_3;
  colliders["fitting1"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_fitting1_3);

  const attachment_fitting2_4 = {"parentId": "base", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001};
  const endpoint_fitting2_4 = makeAttachmentEndpoint(attachment_fitting2_4);
  const node_fitting2_4 = new THREE.Group();
  node_fitting2_4.name = "Air fitting 2__pivot";
  if (endpoint_fitting2_4) {
    node_fitting2_4.position.copy(endpoint_fitting2_4.start);
    node_fitting2_4.rotation.set(0, 0, 0);
    node_fitting2_4.scale.set(1, 1, 1);
  } else {
    node_fitting2_4.position.set(-0.38, 0.09, -0.02);
    node_fitting2_4.rotation.set(0.0, 0.0, 0.0);
    node_fitting2_4.scale.set(1.0, 1.0, 1.0);
  }
  node_fitting2_4.userData.sculptComponent = {"id": "fitting2", "name": "Air fitting 2", "level": "meso", "role": "port", "importance": 1.0, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Threaded brass barb cylinder with collar", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.04, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "base", "attachment": {"parentId": "base", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001}, "dimensions": {"width": 0.032, "height": 0.032, "depth": 0.045, "units": "m", "confidence": 0.7}, "transform": {"position": [-0.38, 0.09, -0.02], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "brass", "materialLayers": ["brass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(192,198,205,1.0)", "secondaryAlbedo": "rgba(154,162,172,1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(192,198,205,1.0)", "position": 0.0}, {"color": "rgba(154,162,172,1.0)", "position": 1.0}]}}};
  node_fitting2_4.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["base"] ?? root).add(node_fitting2_4);
  nodes["fitting2"] = node_fitting2_4;
  const mesh_fitting2_4Geometry = endpoint_fitting2_4
    ? new THREE.CylinderGeometry(endpoint_fitting2_4.endRadius, endpoint_fitting2_4.baseRadius, endpoint_fitting2_4.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16);
  const mesh_fitting2_4 = new THREE.Mesh(
    mesh_fitting2_4Geometry,
    materialMap["brass"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_fitting2_4.name = "Air fitting 2";
  if (endpoint_fitting2_4) {
    mesh_fitting2_4.position.copy(endpoint_fitting2_4.midpoint);
    mesh_fitting2_4.quaternion.copy(endpoint_fitting2_4.quaternion);
  }
  mesh_fitting2_4.castShadow = options.castShadow ?? true;
  mesh_fitting2_4.receiveShadow = options.receiveShadow ?? true;
  mesh_fitting2_4.userData.sculptComponent = {"id": "fitting2", "name": "Air fitting 2", "level": "meso", "role": "port", "importance": 1.0, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Threaded brass barb cylinder with collar", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.04, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "base", "attachment": {"parentId": "base", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001}, "dimensions": {"width": 0.032, "height": 0.032, "depth": 0.045, "units": "m", "confidence": 0.7}, "transform": {"position": [-0.38, 0.09, -0.02], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "brass", "materialLayers": ["brass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(192,198,205,1.0)", "secondaryAlbedo": "rgba(154,162,172,1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(192,198,205,1.0)", "position": 0.0}, {"color": "rgba(154,162,172,1.0)", "position": 1.0}]}}};
  node_fitting2_4.add(mesh_fitting2_4);
  meshes["fitting2"] = mesh_fitting2_4;
  colliders["fitting2"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_fitting2_4);

  const attachment_mountScrew1_5 = {"parentId": "base", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001};
  const endpoint_mountScrew1_5 = makeAttachmentEndpoint(attachment_mountScrew1_5);
  const node_mountScrew1_5 = new THREE.Group();
  node_mountScrew1_5.name = "Mounting screw 1__pivot";
  if (endpoint_mountScrew1_5) {
    node_mountScrew1_5.position.copy(endpoint_mountScrew1_5.start);
    node_mountScrew1_5.rotation.set(0, 0, 0);
    node_mountScrew1_5.scale.set(1, 1, 1);
  } else {
    node_mountScrew1_5.position.set(-0.2, 0.08, 0.251);
    node_mountScrew1_5.rotation.set(0.0, 0.0, 0.0);
    node_mountScrew1_5.scale.set(1.0, 1.0, 1.0);
  }
  node_mountScrew1_5.userData.sculptComponent = {"id": "mountScrew1", "name": "Mounting screw 1", "level": "meso", "role": "fastener", "importance": 1.0, "confidence": 0.6, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "countersunk mounting screw", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.04, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "base", "attachment": {"parentId": "base", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001}, "dimensions": {"width": 0.02, "height": 0.02, "depth": 0.02, "units": "m", "confidence": 0.6}, "transform": {"position": [-0.2, 0.08, 0.251], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "baseAluminum", "materialLayers": ["baseAluminum"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(192,198,205,1.0)", "secondaryAlbedo": "rgba(154,162,172,1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(192,198,205,1.0)", "position": 0.0}, {"color": "rgba(154,162,172,1.0)", "position": 1.0}]}}};
  node_mountScrew1_5.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["base"] ?? root).add(node_mountScrew1_5);
  nodes["mountScrew1"] = node_mountScrew1_5;
  const mesh_mountScrew1_5Geometry = endpoint_mountScrew1_5
    ? new THREE.CylinderGeometry(endpoint_mountScrew1_5.endRadius, endpoint_mountScrew1_5.baseRadius, endpoint_mountScrew1_5.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16);
  const mesh_mountScrew1_5 = new THREE.Mesh(
    mesh_mountScrew1_5Geometry,
    materialMap["baseAluminum"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_mountScrew1_5.name = "Mounting screw 1";
  if (endpoint_mountScrew1_5) {
    mesh_mountScrew1_5.position.copy(endpoint_mountScrew1_5.midpoint);
    mesh_mountScrew1_5.quaternion.copy(endpoint_mountScrew1_5.quaternion);
  }
  mesh_mountScrew1_5.castShadow = options.castShadow ?? true;
  mesh_mountScrew1_5.receiveShadow = options.receiveShadow ?? true;
  mesh_mountScrew1_5.userData.sculptComponent = {"id": "mountScrew1", "name": "Mounting screw 1", "level": "meso", "role": "fastener", "importance": 1.0, "confidence": 0.6, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "countersunk mounting screw", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.04, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "base", "attachment": {"parentId": "base", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001}, "dimensions": {"width": 0.02, "height": 0.02, "depth": 0.02, "units": "m", "confidence": 0.6}, "transform": {"position": [-0.2, 0.08, 0.251], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "baseAluminum", "materialLayers": ["baseAluminum"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(192,198,205,1.0)", "secondaryAlbedo": "rgba(154,162,172,1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(192,198,205,1.0)", "position": 0.0}, {"color": "rgba(154,162,172,1.0)", "position": 1.0}]}}};
  node_mountScrew1_5.add(mesh_mountScrew1_5);
  meshes["mountScrew1"] = mesh_mountScrew1_5;
  colliders["mountScrew1"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_mountScrew1_5);

  const attachment_mountScrew2_6 = {"parentId": "base", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001};
  const endpoint_mountScrew2_6 = makeAttachmentEndpoint(attachment_mountScrew2_6);
  const node_mountScrew2_6 = new THREE.Group();
  node_mountScrew2_6.name = "Mounting screw 2__pivot";
  if (endpoint_mountScrew2_6) {
    node_mountScrew2_6.position.copy(endpoint_mountScrew2_6.start);
    node_mountScrew2_6.rotation.set(0, 0, 0);
    node_mountScrew2_6.scale.set(1, 1, 1);
  } else {
    node_mountScrew2_6.position.set(0.2, 0.08, 0.251);
    node_mountScrew2_6.rotation.set(0.0, 0.0, 0.0);
    node_mountScrew2_6.scale.set(1.0, 1.0, 1.0);
  }
  node_mountScrew2_6.userData.sculptComponent = {"id": "mountScrew2", "name": "Mounting screw 2", "level": "meso", "role": "fastener", "importance": 1.0, "confidence": 0.6, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "countersunk mounting screw", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.04, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "base", "attachment": {"parentId": "base", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001}, "dimensions": {"width": 0.02, "height": 0.02, "depth": 0.02, "units": "m", "confidence": 0.6}, "transform": {"position": [0.2, 0.08, 0.251], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "baseAluminum", "materialLayers": ["baseAluminum"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(192,198,205,1.0)", "secondaryAlbedo": "rgba(154,162,172,1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(192,198,205,1.0)", "position": 0.0}, {"color": "rgba(154,162,172,1.0)", "position": 1.0}]}}};
  node_mountScrew2_6.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["base"] ?? root).add(node_mountScrew2_6);
  nodes["mountScrew2"] = node_mountScrew2_6;
  const mesh_mountScrew2_6Geometry = endpoint_mountScrew2_6
    ? new THREE.CylinderGeometry(endpoint_mountScrew2_6.endRadius, endpoint_mountScrew2_6.baseRadius, endpoint_mountScrew2_6.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16);
  const mesh_mountScrew2_6 = new THREE.Mesh(
    mesh_mountScrew2_6Geometry,
    materialMap["baseAluminum"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_mountScrew2_6.name = "Mounting screw 2";
  if (endpoint_mountScrew2_6) {
    mesh_mountScrew2_6.position.copy(endpoint_mountScrew2_6.midpoint);
    mesh_mountScrew2_6.quaternion.copy(endpoint_mountScrew2_6.quaternion);
  }
  mesh_mountScrew2_6.castShadow = options.castShadow ?? true;
  mesh_mountScrew2_6.receiveShadow = options.receiveShadow ?? true;
  mesh_mountScrew2_6.userData.sculptComponent = {"id": "mountScrew2", "name": "Mounting screw 2", "level": "meso", "role": "fastener", "importance": 1.0, "confidence": 0.6, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "countersunk mounting screw", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.04, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "base", "attachment": {"parentId": "base", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001}, "dimensions": {"width": 0.02, "height": 0.02, "depth": 0.02, "units": "m", "confidence": 0.6}, "transform": {"position": [0.2, 0.08, 0.251], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "baseAluminum", "materialLayers": ["baseAluminum"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(192,198,205,1.0)", "secondaryAlbedo": "rgba(154,162,172,1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(192,198,205,1.0)", "position": 0.0}, {"color": "rgba(154,162,172,1.0)", "position": 1.0}]}}};
  node_mountScrew2_6.add(mesh_mountScrew2_6);
  meshes["mountScrew2"] = mesh_mountScrew2_6;
  colliders["mountScrew2"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_mountScrew2_6);

  const attachment_discBolt_7 = {"parentId": "outputDisc", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001};
  const endpoint_discBolt_7 = makeAttachmentEndpoint(attachment_discBolt_7);
  const node_discBolt_7 = new THREE.Group();
  node_discBolt_7.name = "Disc bolt (instanced)__pivot";
  if (endpoint_discBolt_7) {
    node_discBolt_7.position.copy(endpoint_discBolt_7.start);
    node_discBolt_7.rotation.set(0, 0, 0);
    node_discBolt_7.scale.set(1, 1, 1);
  } else {
    node_discBolt_7.position.set(0.21, 0.225, 0.0);
    node_discBolt_7.rotation.set(0.0, 0.0, 0.0);
    node_discBolt_7.scale.set(1.0, 1.0, 1.0);
  }
  node_discBolt_7.userData.sculptComponent = {"id": "discBolt", "name": "Disc bolt (instanced)", "level": "meso", "role": "fastener", "importance": 1.0, "confidence": 0.7, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "8 instance bolts", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.04, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "outputDisc", "attachment": {"parentId": "outputDisc", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001}, "dimensions": {"width": 0.016, "height": 0.016, "depth": 0.02, "units": "m", "confidence": 0.7}, "transform": {"position": [0.21, 0.225, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "brass", "materialLayers": ["brass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(192,198,205,1.0)", "secondaryAlbedo": "rgba(154,162,172,1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(192,198,205,1.0)", "position": 0.0}, {"color": "rgba(154,162,172,1.0)", "position": 1.0}]}}};
  node_discBolt_7.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["outputDisc"] ?? root).add(node_discBolt_7);
  nodes["discBolt"] = node_discBolt_7;
  const mesh_discBolt_7Geometry = endpoint_discBolt_7
    ? new THREE.CylinderGeometry(endpoint_discBolt_7.endRadius, endpoint_discBolt_7.baseRadius, endpoint_discBolt_7.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16);
  const mesh_discBolt_7 = new THREE.Mesh(
    mesh_discBolt_7Geometry,
    materialMap["brass"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_discBolt_7.name = "Disc bolt (instanced)";
  if (endpoint_discBolt_7) {
    mesh_discBolt_7.position.copy(endpoint_discBolt_7.midpoint);
    mesh_discBolt_7.quaternion.copy(endpoint_discBolt_7.quaternion);
  }
  mesh_discBolt_7.castShadow = options.castShadow ?? true;
  mesh_discBolt_7.receiveShadow = options.receiveShadow ?? true;
  mesh_discBolt_7.userData.sculptComponent = {"id": "discBolt", "name": "Disc bolt (instanced)", "level": "meso", "role": "fastener", "importance": 1.0, "confidence": 0.7, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "8 instance bolts", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.04, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "outputDisc", "attachment": {"parentId": "outputDisc", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001}, "dimensions": {"width": 0.016, "height": 0.016, "depth": 0.02, "units": "m", "confidence": 0.7}, "transform": {"position": [0.21, 0.225, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "brass", "materialLayers": ["brass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(192,198,205,1.0)", "secondaryAlbedo": "rgba(154,162,172,1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(192,198,205,1.0)", "position": 0.0}, {"color": "rgba(154,162,172,1.0)", "position": 1.0}]}}};
  node_discBolt_7.add(mesh_discBolt_7);
  meshes["discBolt"] = mesh_discBolt_7;
  colliders["discBolt"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_discBolt_7);

  const attachment_hexCap_8 = {"parentId": "outputDisc", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001};
  const endpoint_hexCap_8 = makeAttachmentEndpoint(attachment_hexCap_8);
  const node_hexCap_8 = new THREE.Group();
  node_hexCap_8.name = "Hex socket cap__pivot";
  if (endpoint_hexCap_8) {
    node_hexCap_8.position.copy(endpoint_hexCap_8.start);
    node_hexCap_8.rotation.set(0, 0, 0);
    node_hexCap_8.scale.set(1, 1, 1);
  } else {
    node_hexCap_8.position.set(0.0, 0.236, 0.0);
    node_hexCap_8.rotation.set(0.0, 0.0, 0.0);
    node_hexCap_8.scale.set(1.0, 1.0, 1.0);
  }
  node_hexCap_8.userData.sculptComponent = {"id": "hexCap", "name": "Hex socket cap", "level": "meso", "role": "detail", "importance": 1.0, "confidence": 0.7, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "hex socket insert", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.04, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "outputDisc", "attachment": {"parentId": "outputDisc", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001}, "dimensions": {"width": 0.05, "height": 0.05, "depth": 0.05, "units": "m", "confidence": 0.7}, "transform": {"position": [0, 0.236, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "brass", "materialLayers": ["brass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(192,198,205,1.0)", "secondaryAlbedo": "rgba(154,162,172,1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(192,198,205,1.0)", "position": 0.0}, {"color": "rgba(154,162,172,1.0)", "position": 1.0}]}}};
  node_hexCap_8.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["outputDisc"] ?? root).add(node_hexCap_8);
  nodes["hexCap"] = node_hexCap_8;
  const mesh_hexCap_8Geometry = endpoint_hexCap_8
    ? new THREE.CylinderGeometry(endpoint_hexCap_8.endRadius, endpoint_hexCap_8.baseRadius, endpoint_hexCap_8.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16);
  const mesh_hexCap_8 = new THREE.Mesh(
    mesh_hexCap_8Geometry,
    materialMap["brass"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hexCap_8.name = "Hex socket cap";
  if (endpoint_hexCap_8) {
    mesh_hexCap_8.position.copy(endpoint_hexCap_8.midpoint);
    mesh_hexCap_8.quaternion.copy(endpoint_hexCap_8.quaternion);
  }
  mesh_hexCap_8.castShadow = options.castShadow ?? true;
  mesh_hexCap_8.receiveShadow = options.receiveShadow ?? true;
  mesh_hexCap_8.userData.sculptComponent = {"id": "hexCap", "name": "Hex socket cap", "level": "meso", "role": "detail", "importance": 1.0, "confidence": 0.7, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "hex socket insert", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.04, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "outputDisc", "attachment": {"parentId": "outputDisc", "parentSocket": "soc-generic", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "rigid", "embedDepth": 0.002, "gapTolerance": 0.001}, "dimensions": {"width": 0.05, "height": 0.05, "depth": 0.05, "units": "m", "confidence": 0.7}, "transform": {"position": [0, 0.236, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "brass", "materialLayers": ["brass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(192,198,205,1.0)", "secondaryAlbedo": "rgba(154,162,172,1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(192,198,205,1.0)", "position": 0.0}, {"color": "rgba(154,162,172,1.0)", "position": 1.0}]}}};
  node_hexCap_8.add(mesh_hexCap_8);
  meshes["hexCap"] = mesh_hexCap_8;
  colliders["hexCap"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_hexCap_8);

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"], "exposure": {"mode": "ACES-filmic", "ev": 0.0, "toneMappingIntent": "neutral in-scene color, filmic rolloff"}, "groundShadow": {"enabled": true, "behavior": "soft-contact AO + shadow catcher", "intensity": 0.4}}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createRotaryCylinderLookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "RotaryCylinder look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === 'reference' ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === 'grazing' ? 0.28 : mode === 'reference' ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === 'reference' ? 0xffcf8a : 0xfff4e8,
    mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15,
  );
  if (mode === 'grazing') key.position.set(7.5, 1.1, 4.0);
  else if (mode === 'reference') key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 7;
  key.shadow.blurSamples = 24;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.updateProjectionMatrix();
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === 'grazing' ? 0.12 : 0.42);
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === 'grazing' ? 0.28 : 0.85);
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = [{"role": "key", "direction": [0.3, -0.8, -0.5], "color": "#FFFFFF", "intensity": 1.0, "note": "upper-front-left studio key; bright rim on top-left of disc"}, {"role": "fill", "direction": [-0.5, -0.3, 0.6], "color": "#E8EAF0", "intensity": 0.4}, {"role": "rim", "direction": [-0.6, -0.4, -0.7], "color": "#FFFFFF", "intensity": 0.25}, {"role": "tone", "direction": [0, 0, 0], "color": "#000000", "intensity": 0.0, "note": "ACES-filmic tone mapping; exposure 0 EV; soft contact shadow under base via ambient occlusion"}];
  lights.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"], "exposure": {"mode": "ACES-filmic", "ev": 0.0, "toneMappingIntent": "neutral in-scene color, filmic rolloff"}, "groundShadow": {"enabled": true, "behavior": "soft-contact AO + shadow catcher", "intensity": 0.4}}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createRotaryCylinderEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

// Plan 1.3 §3.2 — auto-framing by bounding box. The Divine Eye can only compare a
// render to the reference if the object is FRAMED consistently (an object framed
// differently scores as wrong even when its shape is right). This positions the camera
// deterministically from the object's bounding box so it fills the frame at a stable
// margin, and sets near/far to the object scale. Call after adding the model to the
// scene, and again on resize (after updating camera.aspect).
export function frameRotaryCylinderCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  options: { margin?: number; azimuthDeg?: number; elevationDeg?: number } = {},
): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const margin = options.margin ?? 1.15;
  const maxDim = Math.max(size.x, size.y, size.z) * margin;
  const fov = (camera.fov * Math.PI) / 180;
  // distance so the largest object dimension fits vertically in the frame
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  const az = ((options.azimuthDeg ?? 0) * Math.PI) / 180;
  const el = ((options.elevationDeg ?? 0) * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(0.01, distance - maxDim);
  camera.far = distance + maxDim * 2;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

// Plan 1.3 §3.2c — PRESENTATION composer (DOF + bloom). CRITICAL (R-POSTFX): this is
// for the showcase/hero render ONLY. The Divine Eye's EVALUATION render MUST use a
// plain renderer with NO composer — bloom blows highlights and DOF blurs edges, which
// would corrupt the deterministic IoU/DCD/edge/blowout signals. Enable dof/bloom ONLY
// when the reference photo actually exhibits them (detect_reference_effects.py authorizes).
export function createRotaryCylinderPresentationComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: { dof?: boolean; bloom?: boolean; bloomStrength?: number; dofFocus?: number; dofAperture?: number } = {},
): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (options.dof) {
    composer.addPass(new BokehPass(scene, camera, {
      focus: options.dofFocus ?? 10.0,
      aperture: options.dofAperture ?? 0.0002,
      maxblur: 0.01,
    }));
  }
  if (options.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer.addPass(new UnrealBloomPass(size, options.bloomStrength ?? 0.4, 0.4, 0.85));
  }
  return composer;
}
