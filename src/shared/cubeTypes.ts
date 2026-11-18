export type FaceId = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';

export type CubeSize = 2 | 3;

export type KnownColorId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6';

export type CubeColor = KnownColorId | '?';

export type StickerConfidence = 'high' | 'medium' | 'low' | 'manual' | 'unscanned';

export type ColorSchemeMode = 'auto' | 'standard';

export type RecognitionMode = 'ai' | 'canvas';

export type AiSpeedMode = 'accurate' | 'fast';

export interface PhotoCanvasAlign {
  cx: number; // normalized 0..1
  cy: number; // normalized 0..1
  scale: number; // multiplier around default 0.34 radius
}

export interface RecognitionTimingBreakdown {
  mode: RecognitionMode;
  aiSpeedMode?: AiSpeedMode;
  pass1Ms: number;
  pass2Ms: number;
  retries: number;
  autoFixedRotation: boolean;
  pass2Skipped: boolean;
  serverTotalMs: number;
}

export interface StickerRef {
  face: FaceId;
  index: number; // 0..8 (3x3) or 0..3 (2x2) row-major looking directly at the face in the 2D net
}

export type FaceGrid = CubeColor[];

export type FaceConfidenceGrid = StickerConfidence[];

export type CubeFaces = Record<FaceId, FaceGrid>;

export type CubeConfidenceMap = Record<FaceId, FaceConfidenceGrid>;

export interface PhotoAnalysisSummary {
  photoIndex: number;
  visibleFaces: FaceId[];
  orientationNote: string;
}

export interface AmbiguousStickerNote {
  face: FaceId;
  index: number;
  chosenColor: CubeColor;
  alternativeColor: CubeColor;
  reason: string;
}

export interface ColorMeta {
  code: CubeColor;
  shortLabel: string;
  name: string;
  hex: string;
  borderHex: string;
  textOnHex: string;
}

export type CubePalette = Record<KnownColorId, ColorMeta>;

export const FACE_ORDER: FaceId[] = ['U', 'R', 'F', 'D', 'L', 'B'];

export const FACE_LABELS: Record<FaceId, string> = {
  U: 'Up (Top)',
  R: 'Right',
  F: 'Front',
  D: 'Down (Bottom)',
  L: 'Left',
  B: 'Back',
};

export const KNOWN_COLORS: KnownColorId[] = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];

export const UNSCANNED_COLOR_META: ColorMeta = {
  code: '?',
  shortLabel: '?',
  name: 'Unscanned',
  hex: '#F1F5F9',
  borderHex: '#CBD5E1',
  textOnHex: '#64748B',
};

function normalizeHex(raw: string, fallback: string): string {
  const cleaned = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) {
    return cleaned.toUpperCase();
  }
  return fallback;
}

function hexLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function buildColorMeta(id: KnownColorId, name: string, hexInput: string, fallbackHex: string): ColorMeta {
  const hex = normalizeHex(hexInput, fallbackHex);
  const lum = hexLuminance(hex);
  const textOnHex = lum > 0.42 ? '#0F172A' : '#FFFFFF';
  const borderHex = lum > 0.85 ? '#CBD5E1' : lum < 0.08 ? '#475569' : '#334155';
  const cleanName = name.trim() || id;
  const shortLabel = cleanName.slice(0, 2).toUpperCase();
  return {
    code: id,
    shortLabel,
    name: cleanName,
    hex,
    borderHex,
    textOnHex,
  };
}

export const DEFAULT_PALETTE: CubePalette = {
  C1: buildColorMeta('C1', 'White', '#FFFFFF', '#FFFFFF'),
  C2: buildColorMeta('C2', 'Red', '#DC2626', '#DC2626'),
  C3: buildColorMeta('C3', 'Green', '#16A34A', '#16A34A'),
  C4: buildColorMeta('C4', 'Yellow', '#FACC15', '#FACC15'),
  C5: buildColorMeta('C5', 'Orange', '#F97316', '#F97316'),
  C6: buildColorMeta('C6', 'Blue', '#2563EB', '#2563EB'),
};

export function getColorMeta(palette: CubePalette, color: CubeColor): ColorMeta {
  if (color === '?') return UNSCANNED_COLOR_META;
  return palette[color] ?? UNSCANNED_COLOR_META;
}

export function inferCubeSizeFromFaces(faces: CubeFaces | undefined | null): CubeSize {
  if (faces?.U?.length === 4) return 2;
  return 3;
}

export function createEmptyFaces(cubeSize: CubeSize = 3): CubeFaces {
  const count = cubeSize * cubeSize;
  const emptyFace = (): FaceGrid => new Array<CubeColor>(count).fill('?');
  return {
    U: emptyFace(),
    R: emptyFace(),
    F: emptyFace(),
    D: emptyFace(),
    L: emptyFace(),
    B: emptyFace(),
  };
}

export function createEmptyConfidences(cubeSize: CubeSize = 3): CubeConfidenceMap {
  const count = cubeSize * cubeSize;
  const emptyConf = (): FaceConfidenceGrid => new Array<StickerConfidence>(count).fill('unscanned');
  return {
    U: emptyConf(),
    R: emptyConf(),
    F: emptyConf(),
    D: emptyConf(),
    L: emptyConf(),
    B: emptyConf(),
  };
}

export function createUniformConfidences(
  conf: StickerConfidence,
  cubeSize: CubeSize = 3
): CubeConfidenceMap {
  const count = cubeSize * cubeSize;
  const fillConf = (): FaceConfidenceGrid => new Array<StickerConfidence>(count).fill(conf);
  return {
    U: fillConf(),
    R: fillConf(),
    F: fillConf(),
    D: fillConf(),
    L: fillConf(),
    B: fillConf(),
  };
}

export function createSolvedStandardFaces(cubeSize: CubeSize = 3): CubeFaces {
  const count = cubeSize * cubeSize;
  const fill = (c: CubeColor): FaceGrid => new Array<CubeColor>(count).fill(c);
  return {
    U: fill('C1'),
    R: fill('C2'),
    F: fill('C3'),
    D: fill('C4'),
    L: fill('C5'),
    B: fill('C6'),
  };
}
