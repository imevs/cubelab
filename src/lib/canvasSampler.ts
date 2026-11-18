import {
  DEFAULT_PALETTE,
  FACE_ORDER,
  KNOWN_COLORS,
  buildColorMeta,
  createEmptyConfidences,
  createEmptyFaces,
  type AmbiguousStickerNote,
  type CubeConfidenceMap,
  type CubeFaces,
  type CubePalette,
  type CubeSize,
  type FaceConfidenceGrid,
  type FaceGrid,
  type FaceId,
  type KnownColorId,
  type PhotoAnalysisSummary,
  type PhotoCanvasAlign,
} from '../shared/cubeTypes.ts';
import { verifyCubeState } from '../shared/cubeVerifier.ts';
import type { UploadedPhoto } from './imageUtils.ts';

export interface ScanAssignment {
  face: FaceId;
  rotationCW: number; // 0, 1, 2, 3 clockwise 90-degree turns applied to photo grid
}

export interface CanvasSampleOutput {
  palette: CubePalette;
  faces: CubeFaces;
  confidences: CubeConfidenceMap;
  photoAnalyses: PhotoAnalysisSummary[];
  ambiguousStickers: AmbiguousStickerNote[];
  detectedAssignments: Record<string, ScanAssignment>;
  reasoningSummary: string;
  passCount: number;
  selfCorrected: boolean;
  durationMs: number;
}

export interface LiveSquareEvaluation {
  rgbs: Rgb[];
  hexes: string[];
  tileReady: boolean[];
  recognizedCount: number;
  allReady: boolean;
}

export type Rgb = [number, number, number];
type Lab = [number, number, number];

export const DEFAULT_SQUARE_ALIGN: PhotoCanvasAlign = {
  cx: 0.5,
  cy: 0.5,
  scale: 1,
};

const SCAN_CANONICAL_FACE_ORDER: FaceId[] = ['U', 'F', 'R', 'D', 'L', 'B'];

/**
 * Computes the row-major sticker center coordinates (4 for 2x2, 9 for 3x3)
 * inside a flat square box.
 */
export function getSquareSamplePoints(
  width: number,
  height: number,
  align?: PhotoCanvasAlign,
  gridN: CubeSize = 3
): {
  boxX: number;
  boxY: number;
  boxSize: number;
  points: Array<{ x: number; y: number }>;
} {
  const cx = width * (align?.cx ?? DEFAULT_SQUARE_ALIGN.cx);
  const cy = height * (align?.cy ?? DEFAULT_SQUARE_ALIGN.cy);
  const boxSize = Math.min(width, height) * 0.68 * (align?.scale ?? DEFAULT_SQUARE_ALIGN.scale);
  const boxX = cx - boxSize / 2;
  const boxY = cy - boxSize / 2;

  const points: Array<{ x: number; y: number }> = [];
  for (let row = 0; row < gridN; row++) {
    for (let col = 0; col < gridN; col++) {
      points.push({
        x: boxX + ((col + 0.5) / gridN) * boxSize,
        y: boxY + ((row + 0.5) / gridN) * boxSize,
      });
    }
  }
  return { boxX, boxY, boxSize, points };
}

export function rgbToHex([r, g, b]: Rgb): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToLab([r8, g8, b8]: Rgb): Lab {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = lin(r8);
  const g = lin(g8);
  const b = lin(b8);

  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function chromaLabDistSq(a: Lab, b: Lab): number {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  const chromaA = Math.hypot(a[1], a[2]);
  const chromaB = Math.hypot(b[1], b[2]);
  const isNeutralPair = Math.min(chromaA, chromaB) < 16;
  if (isNeutralPair) {
    return 0.45 * dl * dl + 1.5 * (da * da + db * db);
  }
  return 0.15 * dl * dl + 1.25 * (da * da + db * db);
}

const NAMED_REFS: Array<{ name: string; rgb: Rgb; lab: Lab }> = [
  { name: 'White', rgb: [245, 245, 245], lab: rgbToLab([245, 245, 245]) },
  { name: 'Yellow', rgb: [245, 205, 25], lab: rgbToLab([245, 205, 25]) },
  { name: 'Red', rgb: [205, 32, 32], lab: rgbToLab([205, 32, 32]) },
  { name: 'Orange', rgb: [245, 118, 22], lab: rgbToLab([245, 118, 22]) },
  { name: 'Green', rgb: [24, 158, 70], lab: rgbToLab([24, 158, 70]) },
  { name: 'Blue', rgb: [30, 88, 210], lab: rgbToLab([30, 88, 210]) },
  { name: 'Pink', rgb: [232, 95, 165], lab: rgbToLab([232, 95, 165]) },
  { name: 'Purple', rgb: [130, 75, 215], lab: rgbToLab([130, 75, 215]) },
  { name: 'Cyan', rgb: [20, 180, 210], lab: rgbToLab([20, 180, 210]) },
  { name: 'Black', rgb: [25, 25, 30], lab: rgbToLab([25, 25, 30]) },
];

function inferColorNameFromRgb(rgb: Rgb, usedNames: Set<string>): string {
  const lab = rgbToLab(rgb);
  const sorted = [...NAMED_REFS].sort(
    (a, b) => chromaLabDistSq(lab, a.lab) - chromaLabDistSq(lab, b.lab)
  );
  for (const cand of sorted) {
    if (!usedNames.has(cand.name.toLowerCase())) {
      return cand.name;
    }
  }
  return sorted[0].name;
}

export function rotateGridN<T>(g: readonly T[], turnsCW: number): T[] {
  let curr = [...g];
  const count = ((turnsCW % 4) + 4) % 4;
  if (curr.length === 4) {
    for (let t = 0; t < count; t++) {
      curr = [curr[2], curr[0], curr[3], curr[1]];
    }
    return curr;
  }
  for (let t = 0; t < count; t++) {
    curr = [
      curr[6], curr[3], curr[0],
      curr[7], curr[4], curr[1],
      curr[8], curr[5], curr[2],
    ];
  }
  return curr;
}

async function loadPhotoPixels(dataUrl: string): Promise<{
  width: number;
  height: number;
  data: Uint8ClampedArray;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Failed to decode cube photo for canvas sampling.'));
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        reject(new Error('Canvas context unavailable.'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      resolve({ width, height, data: imageData.data });
    };
    img.src = dataUrl;
  });
}

function sampleStickerPatchStats(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radiusPx: number
): { rgb: Rgb; lum: number; spread: number } {
  const pixels: Array<{ r: number; g: number; b: number; lum: number }> = [];
  const x0 = Math.max(0, Math.round(cx - radiusPx));
  const x1 = Math.min(width - 1, Math.round(cx + radiusPx));
  const y0 = Math.max(0, Math.round(cy - radiusPx));
  const y1 = Math.min(height - 1, Math.round(cy + radiusPx));
  const rSq = radiusPx * radiusPx;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > rSq) continue;
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      pixels.push({ r, g, b, lum });
    }
  }

  if (pixels.length === 0) return { rgb: [128, 128, 128], lum: 128, spread: 99 };

  const nonDark = pixels.filter((p) => p.lum >= 32);
  const pool = nonDark.length >= Math.max(4, pixels.length * 0.35) ? nonDark : pixels;
  pool.sort((a, b) => a.lum - b.lum);

  const lo = Math.floor(pool.length * 0.2);
  const hi = Math.max(lo + 1, Math.ceil(pool.length * 0.8));
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const count = hi - lo;
  for (let i = lo; i < hi; i++) {
    sumR += pool[i].r;
    sumG += pool[i].g;
    sumB += pool[i].b;
  }
  const mr = sumR / count;
  const mg = sumG / count;
  const mb = sumB / count;

  let chromaMad = 0;
  let lumMad = 0;
  const meanLum = 0.299 * mr + 0.587 * mg + 0.114 * mb;
  for (let i = lo; i < hi; i++) {
    const p = pool[i];
    const dL = p.lum - meanLum;
    const dr = (p.r - p.lum) - (mr - meanLum);
    const dg = (p.g - p.lum) - (mg - meanLum);
    const db = (p.b - p.lum) - (mb - meanLum);
    chromaMad += (Math.abs(dr) + Math.abs(dg) + Math.abs(db)) / 3;
    lumMad += Math.abs(dL);
  }
  const chromaSpread = chromaMad / count;
  const lumSpread = lumMad / count;

  return { rgb: [mr, mg, mb], lum: meanLum, spread: Math.max(chromaSpread, lumSpread * 0.55) };
}

export function sampleSquareFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  align?: PhotoCanvasAlign,
  gridN: CubeSize = 3
): Rgb[] {
  const { boxSize, points } = getSquareSamplePoints(width, height, align, gridN);
  const radius = Math.max(2, Math.round((boxSize / gridN) * 0.18));
  return points.map((p) => sampleStickerPatchStats(data, width, height, p.x, p.y, radius).rgb);
}

export async function previewSquareSamples(
  dataUrl: string,
  align?: PhotoCanvasAlign,
  gridN: CubeSize = 3
): Promise<string[]> {
  const px = await loadPhotoPixels(dataUrl);
  return sampleSquareFromImageData(px.data, px.width, px.height, align, gridN).map(rgbToHex);
}

/**
 * Evaluates a live 4:3 camera frame inside the 2x2 or 3x3 reticle to determine
 * whether all tiles cleanly show cube stickers (and not a blank wall or motion blur).
 */
export function evaluateLiveSquareFrame(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  align?: PhotoCanvasAlign,
  gridN: CubeSize = 3
): LiveSquareEvaluation {
  const tileCount = gridN * gridN;
  const { boxX, boxY, boxSize, points } = getSquareSamplePoints(width, height, align, gridN);
  const radius = Math.max(2, Math.round((boxSize / gridN) * 0.17));
  const stats = points.map((p) => sampleStickerPatchStats(data, width, height, p.x, p.y, radius));

  const rgbs = stats.map((s) => s.rgb);
  const hexes = rgbs.map(rgbToHex);
  const tileUniform = stats.map((s) => s.lum >= 10 && s.spread <= 34);

  // Guard against firing on an empty flat wall: require either color variation between tiles,
  // chromatic sticker colors, OR visible cube grid seams/bevels along the grid divider lines.
  const labs = rgbs.map(rgbToLab);
  let maxTileLabDelta = 0;
  for (let i = 0; i < tileCount; i++) {
    for (let j = i + 1; j < tileCount; j++) {
      const d = Math.hypot(labs[i][0] - labs[j][0], labs[i][1] - labs[j][1], labs[i][2] - labs[j][2]);
      if (d > maxTileLabDelta) maxTileLabDelta = d;
    }
  }
  const meanChroma =
    labs.reduce((acc, l) => acc + Math.hypot(l[1], l[2]), 0) / tileCount;

  const cellSize = boxSize / gridN;
  const seamMidpoints: Array<{ x: number; y: number; aIdx: number; bIdx: number }> =
    gridN === 2
      ? [
          { x: boxX + cellSize, y: boxY + 0.5 * cellSize, aIdx: 0, bIdx: 1 },
          { x: boxX + cellSize, y: boxY + 1.5 * cellSize, aIdx: 2, bIdx: 3 },
          { x: boxX + 0.5 * cellSize, y: boxY + cellSize, aIdx: 0, bIdx: 2 },
          { x: boxX + 1.5 * cellSize, y: boxY + cellSize, aIdx: 1, bIdx: 3 },
        ]
      : [
          { x: boxX + cellSize, y: boxY + 0.5 * cellSize, aIdx: 0, bIdx: 1 },
          { x: boxX + 2 * cellSize, y: boxY + 1.5 * cellSize, aIdx: 4, bIdx: 5 },
          { x: boxX + 0.5 * cellSize, y: boxY + cellSize, aIdx: 0, bIdx: 3 },
          { x: boxX + 1.5 * cellSize, y: boxY + 2 * cellSize, aIdx: 4, bIdx: 7 },
        ];

  let maxSeamDelta = 0;
  for (const sm of seamMidpoints) {
    const sx = Math.max(0, Math.min(width - 1, Math.round(sm.x)));
    const sy = Math.max(0, Math.min(height - 1, Math.round(sm.y)));
    const idx = (sy * width + sx) * 4;
    const seamLum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    const adjLum = (stats[sm.aIdx].lum + stats[sm.bIdx].lum) * 0.5;
    maxSeamDelta = Math.max(maxSeamDelta, Math.abs(adjLum - seamLum));
  }

  const faceLikelyPresent =
    maxTileLabDelta >= 10 || meanChroma >= 18 || maxSeamDelta >= 5;

  const tileReady = faceLikelyPresent
    ? tileUniform
    : tileUniform.map(() => false);
  const recognizedCount = tileReady.filter(Boolean).length;

  return {
    rgbs,
    hexes,
    tileReady,
    recognizedCount,
    allReady: recognizedCount === tileCount && faceLikelyPresent,
  };
}

export function areSquareRgbsSteady(a: Rgb[], b: Rgb[]): boolean {
  if (a.length !== b.length || (a.length !== 9 && a.length !== 4)) return false;
  for (let i = 0; i < a.length; i++) {
    const labA = rgbToLab(a[i]);
    const labB = rgbToLab(b[i]);
    const chromaDiff = Math.hypot(labA[1] - labB[1], labA[2] - labB[2]);
    const lumaDiff = Math.abs(labA[0] - labB[0]);
    if (chromaDiff > 18 || lumaDiff > 24) return false;
  }
  return true;
}

/**
 * Strict rotation-invariant check whether a candidate 2x2 or 3x3 face is the exact same
 * face as an already-scanned face (prevents instant double-capture of the same side).
 */
export function isDuplicateFaceScan(candidateRgbs: Rgb[], existingScans: Rgb[][]): boolean {
  const n = candidateRgbs.length;
  if ((n !== 9 && n !== 4) || existingScans.length === 0) return false;
  const candCenterLab = n === 9 ? rgbToLab(candidateRgbs[4]) : null;
  const candCenterLum = candCenterLab ? candCenterLab[0] : 0;

  for (const prev of existingScans) {
    if (prev.length !== n) continue;
    if (n === 9 && candCenterLab) {
      const prevCenterLab = rgbToLab(prev[4]);
      if (
        chromaLabDistSq(candCenterLab, prevCenterLab) > 130 ||
        Math.abs(candCenterLum - prevCenterLab[0]) > 18
      ) {
        continue;
      }
    }

    const candLabs = candidateRgbs.map(rgbToLab);
    const prevLabs = prev.map(rgbToLab);

    for (let rot = 0; rot < 4; rot++) {
      const rotCand = rotateGridN(candLabs, rot);
      let maxTileD = 0;
      let sumTileD = 0;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(
          (rotCand[i][0] - prevLabs[i][0]) * 0.65,
          rotCand[i][1] - prevLabs[i][1],
          rotCand[i][2] - prevLabs[i][2]
        );
        maxTileD = Math.max(maxTileD, d);
        sumTileD += d;
      }
      if (sumTileD / n < 10.5 && maxTileD < 18) {
        return true;
      }
    }
  }
  return false;
}

interface BalancedScanOutput {
  palette: CubePalette;
  scanGrids: FaceGrid[];
  scanConfs: FaceConfidenceGrid[];
  lowConfidenceTiles: Array<{
    scanIdx: number;
    tileIdx: number;
    chosenColor: KnownColorId;
    altColor: KnownColorId;
    margin: number;
  }>;
}

function solveBalancedUnordered6x8(
  scannedRgbs: Rgb[][], // 6 x 9
): BalancedScanOutput {
  const palette: CubePalette = { ...DEFAULT_PALETTE };
  const usedNames = new Set<string>();
  const centerLabs: Lab[] = [];

  for (let s = 0; s < 6; s++) {
    const id = KNOWN_COLORS[s];
    const centerRgb = scannedRgbs[s][4];
    const name = inferColorNameFromRgb(centerRgb, usedNames);
    usedNames.add(name.toLowerCase());
    palette[id] = buildColorMeta(id, name, rgbToHex(centerRgb), DEFAULT_PALETTE[id].hex);
    centerLabs.push(rgbToLab(centerRgb));
  }

  interface NonCenterTile {
    scanIdx: number;
    tileIdx: number;
    lab: Lab;
  }
  const nonCenters: NonCenterTile[] = [];
  for (let s = 0; s < 6; s++) {
    for (let i = 0; i < 9; i++) {
      if (i === 4) continue;
      nonCenters.push({ scanIdx: s, tileIdx: i, lab: rgbToLab(scannedRgbs[s][i]) });
    }
  }

  // Soft 1-step prototype blend so center shades adapt cleanly across lighting shifts
  const bucketLabs: Lab[][] = [[], [], [], [], [], []];
  for (const t of nonCenters) {
    let bestK = 0;
    let bestD = Infinity;
    for (let k = 0; k < 6; k++) {
      const d = chromaLabDistSq(t.lab, centerLabs[k]);
      if (d < bestD) {
        bestD = d;
        bestK = k;
      }
    }
    bucketLabs[bestK].push(t.lab);
  }
  const prototypes: Lab[] = centerLabs.map((cLab, k) => {
    const grp = bucketLabs[k];
    if (grp.length === 0) return cLab;
    const meanL = grp.reduce((sum, v) => sum + v[0], 0) / grp.length;
    const meanA = grp.reduce((sum, v) => sum + v[1], 0) / grp.length;
    const meanB = grp.reduce((sum, v) => sum + v[2], 0) / grp.length;
    return [
      cLab[0] * 0.55 + meanL * 0.45,
      cLab[1] * 0.55 + meanA * 0.45,
      cLab[2] * 0.55 + meanB * 0.45,
    ];
  });

  const costs: number[][] = nonCenters.map((t) =>
    prototypes.map((p) => chromaLabDistSq(t.lab, p))
  );

  // Greedy regret initialization with exact bucket size = 8 per color
  const order = nonCenters
    .map((_, idx) => {
      const sorted = [...costs[idx]].sort((a, b) => a - b);
      return { idx, regret: (sorted[1] ?? sorted[0]) - sorted[0] };
    })
    .sort((a, b) => b.regret - a.regret);

  const assign = new Array<number>(nonCenters.length).fill(0);
  const counts = [0, 0, 0, 0, 0, 0];

  for (const { idx } of order) {
    const ranked = costs[idx]
      .map((c, k) => ({ k, c }))
      .sort((a, b) => a.c - b.c);
    const chosen = ranked.find((r) => counts[r.k] < 8) ?? ranked[0];
    assign[idx] = chosen.k;
    counts[chosen.k] += 1;
  }

  // Exact 2-opt pairwise swap optimization
  for (let pass = 0; pass < 30; pass++) {
    let improved = false;
    for (let i = 0; i < nonCenters.length; i++) {
      for (let j = i + 1; j < nonCenters.length; j++) {
        const ki = assign[i];
        const kj = assign[j];
        if (ki === kj) continue;
        const curr = costs[i][ki] + costs[j][kj];
        const swapped = costs[i][kj] + costs[j][ki];
        if (swapped + 1e-6 < curr) {
          assign[i] = kj;
          assign[j] = ki;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  const scanGrids: FaceGrid[] = Array.from({ length: 6 }, (_, s) => {
    const g: FaceGrid = ['?', '?', '?', '?', KNOWN_COLORS[s], '?', '?', '?', '?'];
    return g;
  });
  const scanConfs: FaceConfidenceGrid[] = Array.from({ length: 6 }, () => [
    'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high',
  ]);
  const lowConfidenceTiles: BalancedScanOutput['lowConfidenceTiles'] = [];

  nonCenters.forEach((t, idx) => {
    const chosenK = assign[idx];
    const chosenId = KNOWN_COLORS[chosenK];
    scanGrids[t.scanIdx][t.tileIdx] = chosenId;

    const ranked = costs[idx]
      .map((c, k) => ({ k, c }))
      .sort((a, b) => a.c - b.c);
    const alt = ranked.find((r) => r.k !== chosenK);
    const margin = alt ? Math.sqrt(alt.c) - Math.sqrt(costs[idx][chosenK]) : 999;

    if (margin < 8) {
      scanConfs[t.scanIdx][t.tileIdx] = 'low';
      if (alt) {
        lowConfidenceTiles.push({
          scanIdx: t.scanIdx,
          tileIdx: t.tileIdx,
          chosenColor: chosenId,
          altColor: KNOWN_COLORS[alt.k],
          margin,
        });
      }
    } else if (margin < 18) {
      scanConfs[t.scanIdx][t.tileIdx] = 'medium';
    } else {
      scanConfs[t.scanIdx][t.tileIdx] = 'high';
    }
  });

  lowConfidenceTiles.sort((a, b) => a.margin - b.margin);
  return { palette, scanGrids, scanConfs, lowConfidenceTiles };
}

type Placement = Record<FaceId, number>; // FaceId -> scanIdx 0..5

function buildCornerKey(c0: string, c1: string, c2: string): string {
  // Cyclic canonical key preserves chirality!
  const k0 = `${c0}-${c1}-${c2}`;
  const k1 = `${c1}-${c2}-${c0}`;
  const k2 = `${c2}-${c0}-${c1}`;
  if (k0 <= k1 && k0 <= k2) return k0;
  return k1 <= k2 ? k1 : k2;
}

function buildEdgeKey(c0: string, c1: string): string {
  return c0 <= c1 ? `${c0}-${c1}` : `${c1}-${c0}`;
}

function enumerate30CubeTopologies(): Placement[] {
  const placements: Placement[] = [];
  for (let dIdx = 1; dIdx <= 5; dIdx++) {
    const rem: number[] = [];
    for (let s = 1; s <= 5; s++) {
      if (s !== dIdx) rem.push(s);
    }
    const fIdx = rem[0];
    const others = [rem[1], rem[2], rem[3]];
    const perms: Array<[number, number, number]> = [
      [others[0], others[1], others[2]],
      [others[0], others[2], others[1]],
      [others[1], others[0], others[2]],
      [others[1], others[2], others[0]],
      [others[2], others[0], others[1]],
      [others[2], others[1], others[0]],
    ];
    for (const [rIdx, bIdx, lIdx] of perms) {
      placements.push({ U: 0, D: dIdx, F: fIdx, R: rIdx, B: bIdx, L: lIdx });
    }
  }
  return placements;
}

const ALL_30_TOPOLOGIES = enumerate30CubeTopologies();

function rotateWholeCubeY(
  faces: CubeFaces,
  confs: CubeConfidenceMap,
  meta: Record<FaceId, { scanIdx: number; rotCW: number }>
): {
  faces: CubeFaces;
  confs: CubeConfidenceMap;
  meta: Record<FaceId, { scanIdx: number; rotCW: number }>;
} {
  return {
    faces: {
      U: rotateGridN(faces.U, 1) as FaceGrid,
      D: rotateGridN(faces.D, 3) as FaceGrid,
      F: faces.R,
      L: faces.F,
      B: faces.L,
      R: faces.B,
    },
    confs: {
      U: rotateGridN(confs.U, 1) as FaceConfidenceGrid,
      D: rotateGridN(confs.D, 3) as FaceConfidenceGrid,
      F: confs.R,
      L: confs.F,
      B: confs.L,
      R: confs.B,
    },
    meta: {
      U: { scanIdx: meta.U.scanIdx, rotCW: (meta.U.rotCW + 1) % 4 },
      D: { scanIdx: meta.D.scanIdx, rotCW: (meta.D.rotCW + 3) % 4 },
      F: meta.R,
      L: meta.F,
      B: meta.L,
      R: meta.B,
    },
  };
}

function rotateWholeCubeX(
  faces: CubeFaces,
  confs: CubeConfidenceMap,
  meta: Record<FaceId, { scanIdx: number; rotCW: number }>
): {
  faces: CubeFaces;
  confs: CubeConfidenceMap;
  meta: Record<FaceId, { scanIdx: number; rotCW: number }>;
} {
  return {
    faces: {
      U: faces.F,
      B: rotateGridN(faces.U, 2) as FaceGrid,
      D: rotateGridN(faces.B, 2) as FaceGrid,
      F: faces.D,
      R: rotateGridN(faces.R, 1) as FaceGrid,
      L: rotateGridN(faces.L, 3) as FaceGrid,
    },
    confs: {
      U: confs.F,
      B: rotateGridN(confs.U, 2) as FaceConfidenceGrid,
      D: rotateGridN(confs.B, 2) as FaceConfidenceGrid,
      F: confs.D,
      R: rotateGridN(confs.R, 1) as FaceConfidenceGrid,
      L: rotateGridN(confs.L, 3) as FaceConfidenceGrid,
    },
    meta: {
      U: meta.F,
      B: { scanIdx: meta.U.scanIdx, rotCW: (meta.U.rotCW + 2) % 4 },
      D: { scanIdx: meta.B.scanIdx, rotCW: (meta.B.rotCW + 2) % 4 },
      F: meta.D,
      R: { scanIdx: meta.R.scanIdx, rotCW: (meta.R.rotCW + 1) % 4 },
      L: { scanIdx: meta.L.scanIdx, rotCW: (meta.L.rotCW + 3) % 4 },
    },
  };
}

function orientCubeCanonically(
  faces: CubeFaces,
  confs: CubeConfidenceMap,
  meta: Record<FaceId, { scanIdx: number; rotCW: number }>,
  palette: CubePalette
): {
  faces: CubeFaces;
  confs: CubeConfidenceMap;
  meta: Record<FaceId, { scanIdx: number; rotCW: number }>;
} {
  const start = { faces, confs, meta };
  const visited = new Set<string>();
  const states: Array<typeof start> = [];
  const queue: Array<typeof start> = [start];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const sig = `${curr.faces.U[4]}-${curr.faces.F[4]}-${curr.faces.R[4]}`;
    if (visited.has(sig)) continue;
    visited.add(sig);
    states.push(curr);

    queue.push(rotateWholeCubeY(curr.faces, curr.confs, curr.meta));
    queue.push(rotateWholeCubeX(curr.faces, curr.confs, curr.meta));
  }

  let bestState = start;
  let bestScore = -Infinity;

  for (const st of states) {
    const nameOf = (f: FaceId) => {
      const c = st.faces[f][4];
      return c === '?' ? '' : palette[c].name.trim().toLowerCase();
    };
    const uName = nameOf('U');
    const dName = nameOf('D');
    const fName = nameOf('F');
    const bName = nameOf('B');
    const rName = nameOf('R');
    const lName = nameOf('L');

    let score = 0;
    if (uName === 'white') score += 300;
    if (dName === 'yellow') score += 120;
    if (fName === 'green') score += 180;
    if (bName === 'blue') score += 80;
    if (rName === 'red') score += 110;
    if (lName === 'orange') score += 70;

    // Prefer minimal scan rotation turns as gentle tiebreaker
    const turnPenalty = FACE_ORDER.reduce((acc, f) => acc + (st.meta[f].rotCW === 0 ? 0 : 1), 0);
    score -= turnPenalty * 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestState = st;
    }
  }

  return bestState;
}

export interface TopologySolveResult {
  faces: CubeFaces;
  confidences: CubeConfidenceMap;
  scanToFace: Array<{ face: FaceId; rotationCW: number }>;
  score: number;
}

/**
 * Deterministically finds which face (U, R, F, D, L, B) and clockwise rotation (0..3)
 * each of the 6 unordered scans belongs to, searching all 30 cube topologies and
 * pruning rotations via exact edge/corner cubie uniqueness & cyclic chirality.
 */
export function solveTopologyFromGrids(
  scanGrids: FaceGrid[],
  scanConfs: FaceConfidenceGrid[],
  palette: CubePalette,
  lang: 'en' | 'ru'
): TopologySolveResult | null {
  if (scanGrids.length !== 6) return null;

  const rotVariants: Array<Array<{ rotCW: number; grid: FaceGrid }>> = scanGrids.map((g) => {
    const seen = new Set<string>();
    const list: Array<{ rotCW: number; grid: FaceGrid }> = [];
    for (let rotCW = 0; rotCW < 4; rotCW++) {
      const grid = rotateGridN(g, rotCW) as FaceGrid;
      const sig = grid.join('');
      if (!seen.has(sig)) {
        seen.add(sig);
        list.push({ rotCW, grid });
      }
    }
    return list;
  });

  let bestResult: TopologySolveResult | null = null;
  let bestScore = -Infinity;

  for (const topo of ALL_30_TOPOLOGIES) {
    const cU = scanGrids[topo.U][4];
    const cD = scanGrids[topo.D][4];
    const cF = scanGrids[topo.F][4];
    const cB = scanGrids[topo.B][4];
    const cR = scanGrids[topo.R][4];
    const cL = scanGrids[topo.L][4];
    if (cU === '?' || cD === '?' || cF === '?' || cB === '?' || cR === '?' || cL === '?') {
      continue;
    }

    const opp: Record<string, string> = {
      [cU]: cD, [cD]: cU,
      [cF]: cB, [cB]: cF,
      [cR]: cL, [cL]: cR,
    };

    const validCorners = new Set<string>([
      buildCornerKey(cU, cR, cF),
      buildCornerKey(cU, cF, cL),
      buildCornerKey(cU, cL, cB),
      buildCornerKey(cU, cB, cR),
      buildCornerKey(cD, cF, cR),
      buildCornerKey(cD, cL, cF),
      buildCornerKey(cD, cB, cL),
      buildCornerKey(cD, cR, cB),
    ]);

    const nameOfScan = (s: number) => {
      const c = scanGrids[s][4];
      return c === '?' ? '' : palette[c].name.trim().toLowerCase();
    };
    const isPair = (a: string, b: string, x: string, y: string) =>
      (a === x && b === y) || (a === y && b === x);
    let topoBonus = 0;
    if (isPair(nameOfScan(topo.U), nameOfScan(topo.D), 'white', 'yellow')) topoBonus += 200;
    if (isPair(nameOfScan(topo.F), nameOfScan(topo.B), 'green', 'blue')) topoBonus += 200;
    if (isPair(nameOfScan(topo.R), nameOfScan(topo.L), 'red', 'orange')) topoBonus += 200;

    for (const vU of rotVariants[topo.U]) {
      const rU = vU.rotCW;
      const u = vU.grid;

      for (const vR of rotVariants[topo.R]) {
        const rR = vR.rotCW;
        const r = vR.grid;
        const ur0 = u[5];
        const ur1 = r[1];
        if (ur0 === ur1 || opp[ur0] === ur1) continue;
        const kUR = buildEdgeKey(ur0, ur1);

        for (const vF of rotVariants[topo.F]) {
          const rF = vF.rotCW;
          const f = vF.grid;
          const uf0 = u[7];
          const uf1 = f[1];
          if (uf0 === uf1 || opp[uf0] === uf1) continue;
          const kUF = buildEdgeKey(uf0, uf1);
          if (kUF === kUR) continue;

          const fr0 = f[5];
          const fr1 = r[3];
          if (fr0 === fr1 || opp[fr0] === fr1) continue;
          const kFR = buildEdgeKey(fr0, fr1);
          if (kFR === kUR || kFR === kUF) continue;

          const kUFR = buildCornerKey(u[8], r[0], f[2]);
          if (!validCorners.has(kUFR)) continue;

          for (const vL of rotVariants[topo.L]) {
            const rL = vL.rotCW;
            const l = vL.grid;
            const ul0 = u[3];
            const ul1 = l[1];
            if (ul0 === ul1 || opp[ul0] === ul1) continue;
            const kUL = buildEdgeKey(ul0, ul1);
            if (kUL === kUR || kUL === kUF || kUL === kFR) continue;

            const fl0 = f[3];
            const fl1 = l[5];
            if (fl0 === fl1 || opp[fl0] === fl1) continue;
            const kFL = buildEdgeKey(fl0, fl1);
            if (kFL === kUR || kFL === kUF || kFL === kFR || kFL === kUL) continue;

            const kUFL = buildCornerKey(u[6], f[0], l[2]);
            if (!validCorners.has(kUFL) || kUFL === kUFR) continue;

            for (const vB of rotVariants[topo.B]) {
              const rB = vB.rotCW;
              const b = vB.grid;
              const ub0 = u[1];
              const ub1 = b[1];
              if (ub0 === ub1 || opp[ub0] === ub1) continue;
              const kUB = buildEdgeKey(ub0, ub1);
              if (kUB === kUR || kUB === kUF || kUB === kFR || kUB === kUL || kUB === kFL) continue;

              const br0 = b[3];
              const br1 = r[5];
              if (br0 === br1 || opp[br0] === br1) continue;
              const kBR = buildEdgeKey(br0, br1);
              if (
                kBR === kUR || kBR === kUF || kBR === kFR ||
                kBR === kUL || kBR === kFL || kBR === kUB
              ) continue;

              const bl0 = b[5];
              const bl1 = l[3];
              if (bl0 === bl1 || opp[bl0] === bl1) continue;
              const kBL = buildEdgeKey(bl0, bl1);
              if (
                kBL === kUR || kBL === kUF || kBL === kFR ||
                kBL === kUL || kBL === kFL || kBL === kUB || kBL === kBR
              ) continue;

              const kUBL = buildCornerKey(u[0], l[0], b[2]);
              if (!validCorners.has(kUBL) || kUBL === kUFR || kUBL === kUFL) continue;

              const kUBR = buildCornerKey(u[2], b[0], r[2]);
              if (
                !validCorners.has(kUBR) ||
                kUBR === kUFR || kUBR === kUFL || kUBR === kUBL
              ) continue;

              for (const vD of rotVariants[topo.D]) {
                const rD = vD.rotCW;
                const d = vD.grid;

                const df0 = d[1], df1 = f[7];
                if (df0 === df1 || opp[df0] === df1) continue;
                const kDF = buildEdgeKey(df0, df1);

                const dr0 = d[5], dr1 = r[7];
                if (dr0 === dr1 || opp[dr0] === dr1) continue;
                const kDR = buildEdgeKey(dr0, dr1);

                const db0 = d[7], db1 = b[7];
                if (db0 === db1 || opp[db0] === db1) continue;
                const kDB = buildEdgeKey(db0, db1);

                const dl0 = d[3], dl1 = l[7];
                if (dl0 === dl1 || opp[dl0] === dl1) continue;
                const kDL = buildEdgeKey(dl0, dl1);

                const edgeSet = new Set([
                  kUR, kUF, kFR, kUL, kFL, kUB, kBR, kBL, kDF, kDR, kDB, kDL,
                ]);
                if (edgeSet.size !== 12) continue;

                const kDFR = buildCornerKey(d[2], f[8], r[6]);
                const kDFL = buildCornerKey(d[0], l[8], f[6]);
                const kDBL = buildCornerKey(d[6], b[8], l[6]);
                const kDBR = buildCornerKey(d[8], r[8], b[6]);
                if (
                  !validCorners.has(kDFR) ||
                  !validCorners.has(kDFL) ||
                  !validCorners.has(kDBL) ||
                  !validCorners.has(kDBR)
                ) continue;

                const cornerSet = new Set([
                  kUFR, kUFL, kUBL, kUBR, kDFR, kDFL, kDBL, kDBR,
                ]);
                if (cornerSet.size !== 8) continue;

                const candFaces: CubeFaces = { U: u, R: r, F: f, D: d, L: l, B: b };
                if (!verifyCubeState(candFaces, 'auto', palette, lang).isSolvable) {
                  continue;
                }

                const candConfs: CubeConfidenceMap = {
                  U: rotateGridN(scanConfs[topo.U], rU) as FaceConfidenceGrid,
                  R: rotateGridN(scanConfs[topo.R], rR) as FaceConfidenceGrid,
                  F: rotateGridN(scanConfs[topo.F], rF) as FaceConfidenceGrid,
                  D: rotateGridN(scanConfs[topo.D], rD) as FaceConfidenceGrid,
                  L: rotateGridN(scanConfs[topo.L], rL) as FaceConfidenceGrid,
                  B: rotateGridN(scanConfs[topo.B], rB) as FaceConfidenceGrid,
                };

                const rawMeta: Record<FaceId, { scanIdx: number; rotCW: number }> = {
                  U: { scanIdx: topo.U, rotCW: rU },
                  R: { scanIdx: topo.R, rotCW: rR },
                  F: { scanIdx: topo.F, rotCW: rF },
                  D: { scanIdx: topo.D, rotCW: rD },
                  L: { scanIdx: topo.L, rotCW: rL },
                  B: { scanIdx: topo.B, rotCW: rB },
                };

                const canonical = orientCubeCanonically(candFaces, candConfs, rawMeta, palette);
                let fullScore = topoBonus;
                if (canonical.faces.U[4] !== '?' && palette[canonical.faces.U[4]].name === 'White') {
                  fullScore += 150;
                }
                if (canonical.faces.F[4] !== '?' && palette[canonical.faces.F[4]].name === 'Green') {
                  fullScore += 150;
                }
                if (canonical.faces.R[4] !== '?' && palette[canonical.faces.R[4]].name === 'Red') {
                  fullScore += 150;
                }

                if (fullScore > bestScore) {
                  bestScore = fullScore;
                  const scanToFace: Array<{ face: FaceId; rotationCW: number }> = new Array(6);
                  for (const face of FACE_ORDER) {
                    const m = canonical.meta[face];
                    scanToFace[m.scanIdx] = { face, rotationCW: m.rotCW };
                  }
                  bestResult = {
                    faces: canonical.faces,
                    confidences: canonical.confs,
                    scanToFace,
                    score: fullScore,
                  };
                }
              }
            }
          }
        }
      }
    }
  }

  return bestResult;
}

function mapCentersProvisionallyToFaces(centerRgbs: Rgb[]): FaceId[] {
  const canonicalOrder: Array<{ face: FaceId; lab: Lab }> = [
    { face: 'U', lab: rgbToLab([245, 245, 245]) }, // White
    { face: 'F', lab: rgbToLab([24, 158, 70]) },   // Green
    { face: 'R', lab: rgbToLab([205, 32, 32]) },   // Red
    { face: 'D', lab: rgbToLab([245, 205, 25]) },  // Yellow
    { face: 'L', lab: rgbToLab([245, 118, 22]) },  // Orange
    { face: 'B', lab: rgbToLab([30, 88, 210]) },   // Blue
  ];

  const labs = centerRgbs.map(rgbToLab);
  const pairs: Array<{ scanIdx: number; face: FaceId; dist: number }> = [];
  labs.forEach((lab, scanIdx) => {
    canonicalOrder.forEach((canon) => {
      pairs.push({ scanIdx, face: canon.face, dist: chromaLabDistSq(lab, canon.lab) });
    });
  });
  pairs.sort((a, b) => a.dist - b.dist);

  const assignedFaces: Array<FaceId | null> = new Array(centerRgbs.length).fill(null);
  const usedFaces = new Set<FaceId>();
  for (const p of pairs) {
    if (assignedFaces[p.scanIdx] !== null || usedFaces.has(p.face)) continue;
    assignedFaces[p.scanIdx] = p.face;
    usedFaces.add(p.face);
  }

  return assignedFaces.map((f) => {
    if (f) return f;
    const fb = SCAN_CANONICAL_FACE_ORDER.find((c) => !usedFaces.has(c)) ?? 'U';
    usedFaces.add(fb);
    return fb;
  });
}

function solveBalancedUnordered6x4(
  scannedRgbs: Rgb[][] // 6 x 4
): BalancedScanOutput {
  interface Tile2x2 {
    scanIdx: number;
    tileIdx: number;
    rgb: Rgb;
    lab: Lab;
  }
  const tiles: Tile2x2[] = [];
  for (let s = 0; s < 6; s++) {
    for (let i = 0; i < 4; i++) {
      const rgb = scannedRgbs[s][i];
      tiles.push({ scanIdx: s, tileIdx: i, rgb, lab: rgbToLab(rgb) });
    }
  }

  // Furthest-point Lab seeding for 6 maximally separated cluster prototypes
  const seeds: Array<{ rgb: Rgb; lab: Lab }> = [{ rgb: tiles[0].rgb, lab: tiles[0].lab }];
  while (seeds.length < 6) {
    let bestTile = tiles[0];
    let bestDist = -1;
    for (const t of tiles) {
      let minD = Infinity;
      for (const sd of seeds) {
        minD = Math.min(minD, chromaLabDistSq(t.lab, sd.lab));
      }
      if (minD > bestDist) {
        bestDist = minD;
        bestTile = t;
      }
    }
    seeds.push({ rgb: bestTile.rgb, lab: bestTile.lab });
  }

  // 3 quick Lloyd k-means refinement iterations
  for (let iter = 0; iter < 3; iter++) {
    const groups: Tile2x2[][] = [[], [], [], [], [], []];
    for (const t of tiles) {
      let bestK = 0;
      let bestD = Infinity;
      for (let k = 0; k < 6; k++) {
        const d = chromaLabDistSq(t.lab, seeds[k].lab);
        if (d < bestD) {
          bestD = d;
          bestK = k;
        }
      }
      groups[bestK].push(t);
    }
    for (let k = 0; k < 6; k++) {
      const g = groups[k];
      if (g.length === 0) continue;
      seeds[k] = {
        rgb: [
          g.reduce((s, p) => s + p.rgb[0], 0) / g.length,
          g.reduce((s, p) => s + p.rgb[1], 0) / g.length,
          g.reduce((s, p) => s + p.rgb[2], 0) / g.length,
        ],
        lab: [
          g.reduce((s, p) => s + p.lab[0], 0) / g.length,
          g.reduce((s, p) => s + p.lab[1], 0) / g.length,
          g.reduce((s, p) => s + p.lab[2], 0) / g.length,
        ],
      };
    }
  }

  const palette: CubePalette = { ...DEFAULT_PALETTE };
  const usedNames = new Set<string>();
  const prototypes: Lab[] = [];
  for (let k = 0; k < 6; k++) {
    const id = KNOWN_COLORS[k];
    const name = inferColorNameFromRgb(seeds[k].rgb, usedNames);
    usedNames.add(name.toLowerCase());
    palette[id] = buildColorMeta(id, name, rgbToHex(seeds[k].rgb), DEFAULT_PALETTE[id].hex);
    prototypes.push(seeds[k].lab);
  }

  const costs: number[][] = tiles.map((t) => prototypes.map((p) => chromaLabDistSq(t.lab, p)));

  const order = tiles
    .map((_, idx) => {
      const sorted = [...costs[idx]].sort((a, b) => a - b);
      return { idx, regret: (sorted[1] ?? sorted[0]) - sorted[0] };
    })
    .sort((a, b) => b.regret - a.regret);

  const assign = new Array<number>(tiles.length).fill(0);
  const counts = [0, 0, 0, 0, 0, 0];

  for (const { idx } of order) {
    const ranked = costs[idx]
      .map((c, k) => ({ k, c }))
      .sort((a, b) => a.c - b.c);
    const chosen = ranked.find((r) => counts[r.k] < 4) ?? ranked[0];
    assign[idx] = chosen.k;
    counts[chosen.k] += 1;
  }

  for (let pass = 0; pass < 30; pass++) {
    let improved = false;
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const ki = assign[i];
        const kj = assign[j];
        if (ki === kj) continue;
        const curr = costs[i][ki] + costs[j][kj];
        const swapped = costs[i][kj] + costs[j][ki];
        if (swapped + 1e-6 < curr) {
          assign[i] = kj;
          assign[j] = ki;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  const scanGrids: FaceGrid[] = Array.from({ length: 6 }, () => ['?', '?', '?', '?']);
  const scanConfs: FaceConfidenceGrid[] = Array.from({ length: 6 }, () => [
    'high', 'high', 'high', 'high',
  ]);
  const lowConfidenceTiles: BalancedScanOutput['lowConfidenceTiles'] = [];

  tiles.forEach((t, idx) => {
    const chosenK = assign[idx];
    const chosenId = KNOWN_COLORS[chosenK];
    scanGrids[t.scanIdx][t.tileIdx] = chosenId;

    const ranked = costs[idx]
      .map((c, k) => ({ k, c }))
      .sort((a, b) => a.c - b.c);
    const alt = ranked.find((r) => r.k !== chosenK);
    const margin = alt ? Math.sqrt(alt.c) - Math.sqrt(costs[idx][chosenK]) : 999;

    if (margin < 8) {
      scanConfs[t.scanIdx][t.tileIdx] = 'low';
      if (alt) {
        lowConfidenceTiles.push({
          scanIdx: t.scanIdx,
          tileIdx: t.tileIdx,
          chosenColor: chosenId,
          altColor: KNOWN_COLORS[alt.k],
          margin,
        });
      }
    } else if (margin < 18) {
      scanConfs[t.scanIdx][t.tileIdx] = 'medium';
    } else {
      scanConfs[t.scanIdx][t.tileIdx] = 'high';
    }
  });

  lowConfidenceTiles.sort((a, b) => a.margin - b.margin);
  return { palette, scanGrids, scanConfs, lowConfidenceTiles };
}

function colorToBitIndex(c: string): number {
  switch (c) {
    case 'C1': return 0;
    case 'C2': return 1;
    case 'C3': return 2;
    case 'C4': return 3;
    case 'C5': return 4;
    case 'C6': return 5;
    default: return -1;
  }
}

function orientCube2x2Canonically(
  faces: CubeFaces,
  confs: CubeConfidenceMap,
  meta: Record<FaceId, { scanIdx: number; rotCW: number }>,
  palette: CubePalette
): {
  faces: CubeFaces;
  confs: CubeConfidenceMap;
  meta: Record<FaceId, { scanIdx: number; rotCW: number }>;
} {
  const start = { faces, confs, meta };
  const visited = new Set<string>();
  const states: Array<typeof start> = [];
  const queue: Array<typeof start> = [start];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const sig = FACE_ORDER.map((f) => curr.faces[f].join(',')).join('|');
    if (visited.has(sig)) continue;
    visited.add(sig);
    states.push(curr);

    queue.push(rotateWholeCubeY(curr.faces, curr.confs, curr.meta));
    queue.push(rotateWholeCubeX(curr.faces, curr.confs, curr.meta));
  }

  let bestState = start;
  let bestScore = -Infinity;

  for (const st of states) {
    let score = 0;
    const countName = (f: FaceId, targetName: string) =>
      st.faces[f].filter(
        (c) => c !== '?' && palette[c].name.trim().toLowerCase() === targetName
      ).length;

    score += countName('U', 'white') * 40;
    score += countName('D', 'yellow') * 25;
    score += countName('F', 'green') * 30;
    score += countName('B', 'blue') * 15;
    score += countName('R', 'red') * 20;
    score += countName('L', 'orange') * 12;

    // Gentle tiebreak preferring minimal scan rotations
    const turnPenalty = FACE_ORDER.reduce((acc, f) => acc + (st.meta[f].rotCW === 0 ? 0 : 1), 0);
    score -= turnPenalty * 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestState = st;
    }
  }

  return bestState;
}

/**
 * Unordered 2x2 topology & rotation solver: assigns the 6 scanned 2x2 faces
 * to (U, R, F, D, L, B) and finds exact clockwise rotations (0..3) such that
 * all 8 corner pieces form a mathematically valid, solvable 2x2x2 cube.
 */
export function solveTopology2x2FromGrids(
  scanGrids: FaceGrid[],
  scanConfs: FaceConfidenceGrid[],
  palette: CubePalette,
  lang: 'en' | 'ru'
): TopologySolveResult | null {
  if (scanGrids.length !== 6) return null;

  const rotVariants: Array<
    Array<{ rotCW: number; grid: FaceGrid; bits: [number, number, number, number] }>
  > = scanGrids.map((g) => {
    const seen = new Set<string>();
    const list: Array<{ rotCW: number; grid: FaceGrid; bits: [number, number, number, number] }> = [];
    for (let rotCW = 0; rotCW < 4; rotCW++) {
      const grid = rotateGridN(g, rotCW) as FaceGrid;
      const sig = grid.join('');
      if (!seen.has(sig)) {
        seen.add(sig);
        const b0 = colorToBitIndex(grid[0]);
        const b1 = colorToBitIndex(grid[1]);
        const b2 = colorToBitIndex(grid[2]);
        const b3 = colorToBitIndex(grid[3]);
        if (b0 < 0 || b1 < 0 || b2 < 0 || b3 < 0) continue;
        list.push({
          rotCW,
          grid,
          bits: [1 << b0, 1 << b1, 1 << b2, 1 << b3],
        });
      }
    }
    return list;
  });

  // Track 6-bit corner masks inside 2x32-bit integers (0 heap allocations in inner loop)
  let bestResult: TopologySolveResult | null = null;
  let bestScore = -Infinity;

  for (const topo of ALL_30_TOPOLOGIES) {
    for (const vU of rotVariants[topo.U]) {
      const ub = vU.bits;
      for (const vR of rotVariants[topo.R]) {
        const rb = vR.bits;
        for (const vF of rotVariants[topo.F]) {
          const fb = vF.bits;
          // UFR = (u[3], r[0], f[1])
          const mUFR = ub[3] | rb[0] | fb[1];
          if ((ub[3] === rb[0]) || (rb[0] === fb[1]) || (ub[3] === fb[1])) continue;

          for (const vL of rotVariants[topo.L]) {
            const lb = vL.bits;
            // UFL = (u[2], f[0], l[1])
            if (ub[2] === fb[0] || fb[0] === lb[1] || ub[2] === lb[1]) continue;
            const mUFL = ub[2] | fb[0] | lb[1];
            if (mUFL === mUFR) continue;

            for (const vB of rotVariants[topo.B]) {
              const bb = vB.bits;
              // UBL = (u[0], l[0], b[1]), UBR = (u[1], b[0], r[1])
              if (ub[0] === lb[0] || lb[0] === bb[1] || ub[0] === bb[1]) continue;
              if (ub[1] === bb[0] || bb[0] === rb[1] || ub[1] === rb[1]) continue;
              const mUBL = ub[0] | lb[0] | bb[1];
              const mUBR = ub[1] | bb[0] | rb[1];
              if (
                mUBL === mUFR || mUBL === mUFL ||
                mUBR === mUFR || mUBR === mUFL || mUBR === mUBL
              ) {
                continue;
              }

              let baseLo = 0;
              let baseHi = 0;
              for (const m of [mUFR, mUFL, mUBL, mUBR]) {
                if (m < 32) baseLo |= 1 << m;
                else baseHi |= 1 << (m - 32);
              }

              for (const vD of rotVariants[topo.D]) {
                const db = vD.bits;
                // DFR=(d[1],f[3],r[2]), DFL=(d[0],l[3],f[2]), DBL=(d[2],b[3],l[2]), DBR=(d[3],r[3],b[2])
                if (db[1] === fb[3] || fb[3] === rb[2] || db[1] === rb[2]) continue;
                const mDFR = db[1] | fb[3] | rb[2];
                const bDFR = 1 << (mDFR & 31);
                if (mDFR < 32 ? (baseLo & bDFR) !== 0 : (baseHi & bDFR) !== 0) continue;

                if (db[0] === lb[3] || lb[3] === fb[2] || db[0] === fb[2]) continue;
                const mDFL = db[0] | lb[3] | fb[2];
                if (mDFL === mDFR) continue;
                const bDFL = 1 << (mDFL & 31);
                if (mDFL < 32 ? (baseLo & bDFL) !== 0 : (baseHi & bDFL) !== 0) continue;

                if (db[2] === bb[3] || bb[3] === lb[2] || db[2] === lb[2]) continue;
                const mDBL = db[2] | bb[3] | lb[2];
                if (mDBL === mDFR || mDBL === mDFL) continue;
                const bDBL = 1 << (mDBL & 31);
                if (mDBL < 32 ? (baseLo & bDBL) !== 0 : (baseHi & bDBL) !== 0) continue;

                if (db[3] === rb[3] || rb[3] === bb[2] || db[3] === bb[2]) continue;
                const mDBR = db[3] | rb[3] | bb[2];
                if (mDBR === mDFR || mDBR === mDFL || mDBR === mDBL) continue;
                const bDBR = 1 << (mDBR & 31);
                if (mDBR < 32 ? (baseLo & bDBR) !== 0 : (baseHi & bDBR) !== 0) continue;

                // O(1) physical 2x2 invariant: each color c must appear on corners with 4 other colors
                // (never with its opposite color), forming 3 mutually symmetric opposite pairs.
                let adjInvalid = false;
                for (let cBit = 1; cBit < 64; cBit <<= 1) {
                  let unionMask = 0;
                  if ((mUFR & cBit) !== 0) unionMask |= mUFR;
                  if ((mUFL & cBit) !== 0) unionMask |= mUFL;
                  if ((mUBL & cBit) !== 0) unionMask |= mUBL;
                  if ((mUBR & cBit) !== 0) unionMask |= mUBR;
                  if ((mDFR & cBit) !== 0) unionMask |= mDFR;
                  if ((mDFL & cBit) !== 0) unionMask |= mDFL;
                  if ((mDBL & cBit) !== 0) unionMask |= mDBL;
                  if ((mDBR & cBit) !== 0) unionMask |= mDBR;
                  const missing = 63 ^ unionMask;
                  if (missing === 0 || (missing & (missing - 1)) !== 0) {
                    adjInvalid = true;
                    break;
                  }
                }
                if (adjInvalid) continue;

                const candFaces: CubeFaces = {
                  U: vU.grid,
                  R: vR.grid,
                  F: vF.grid,
                  D: vD.grid,
                  L: vL.grid,
                  B: vB.grid,
                };
                if (!verifyCubeState(candFaces, 'auto', palette, lang).isSolvable) {
                  continue;
                }

                const candConfs: CubeConfidenceMap = {
                  U: rotateGridN(scanConfs[topo.U], vU.rotCW) as FaceConfidenceGrid,
                  R: rotateGridN(scanConfs[topo.R], vR.rotCW) as FaceConfidenceGrid,
                  F: rotateGridN(scanConfs[topo.F], vF.rotCW) as FaceConfidenceGrid,
                  D: rotateGridN(scanConfs[topo.D], vD.rotCW) as FaceConfidenceGrid,
                  L: rotateGridN(scanConfs[topo.L], vL.rotCW) as FaceConfidenceGrid,
                  B: rotateGridN(scanConfs[topo.B], vB.rotCW) as FaceConfidenceGrid,
                };

                const rawMeta: Record<FaceId, { scanIdx: number; rotCW: number }> = {
                  U: { scanIdx: topo.U, rotCW: vU.rotCW },
                  R: { scanIdx: topo.R, rotCW: vR.rotCW },
                  F: { scanIdx: topo.F, rotCW: vF.rotCW },
                  D: { scanIdx: topo.D, rotCW: vD.rotCW },
                  L: { scanIdx: topo.L, rotCW: vL.rotCW },
                  B: { scanIdx: topo.B, rotCW: vB.rotCW },
                };

                const canonical = orientCube2x2Canonically(candFaces, candConfs, rawMeta, palette);
                const turnPenalty = FACE_ORDER.reduce(
                  (acc, face) => acc + (canonical.meta[face].rotCW === 0 ? 0 : 1),
                  0
                );
                let score = 500 - turnPenalty * 2;
                const countName = (face: FaceId, targetName: string) =>
                  canonical.faces[face].filter(
                    (c) => c !== '?' && palette[c].name.trim().toLowerCase() === targetName
                  ).length;
                score += countName('U', 'white') * 10 + countName('F', 'green') * 8;

                if (score > bestScore) {
                  bestScore = score;
                  const scanToFace: Array<{ face: FaceId; rotationCW: number }> = new Array(6);
                  for (const face of FACE_ORDER) {
                    const m = canonical.meta[face];
                    scanToFace[m.scanIdx] = { face, rotationCW: m.rotCW };
                  }
                  bestResult = {
                    faces: canonical.faces,
                    confidences: canonical.confs,
                    scanToFace,
                    score,
                  };
                }
              }
            }
          }
        }
      }
    }
  }

  return bestResult;
}

/**
 * Order-independent, rotation-independent ad-hoc color & side recognition for 2x2 or 3x3 cubes.
 * - 1..5 scans: Ad-hoc Lab clustering + provisional face layout as you scan side-by-side.
 * - 6 scans: Balanced clustering + exact 30-topology & 4^6 rotation solver so sides
 *   can be scanned in ANY order and ANY orientation.
 */
export async function sampleScansAdHoc(
  scans: UploadedPhoto[],
  lang: 'en' | 'ru',
  cubeSize: CubeSize = 3
): Promise<CanvasSampleOutput> {
  const tStart = performance.now();
  const activeScans = scans.slice(0, 6);
  const tileCount = cubeSize * cubeSize;

  if (activeScans.length === 0) {
    return {
      palette: { ...DEFAULT_PALETTE },
      faces: createEmptyFaces(cubeSize),
      confidences: createEmptyConfidences(cubeSize),
      photoAnalyses: [],
      ambiguousStickers: [],
      detectedAssignments: {},
      reasoningSummary: '',
      passCount: 1,
      selfCorrected: false,
      durationMs: 1,
    };
  }

  const sampledRgbs: Rgb[][] = await Promise.all(
    activeScans.map(async (scan) => {
      const px = await loadPhotoPixels(scan.dataUrl);
      return sampleSquareFromImageData(px.data, px.width, px.height, scan.squareAlign, cubeSize);
    })
  );

  // ALL 6 SIDES SCANNED -> Full Balanced Assignment + Unordered Topology & Rotation Solver
  if (activeScans.length === 6) {
    const balanced =
      cubeSize === 2
        ? solveBalancedUnordered6x4(sampledRgbs)
        : solveBalancedUnordered6x8(sampledRgbs);
    let topoSolution =
      cubeSize === 2
        ? solveTopology2x2FromGrids(
            balanced.scanGrids,
            balanced.scanConfs,
            balanced.palette,
            lang
          )
        : solveTopologyFromGrids(
            balanced.scanGrids,
            balanced.scanConfs,
            balanced.palette,
            lang
          );
    let selfCorrected = false;

    // If 1 ambiguous tile pair caused parity/chirality failure, test swapping top low-margin pairs
    if (!topoSolution && balanced.lowConfidenceTiles.length >= 2) {
      const topAmbiguous = balanced.lowConfidenceTiles.slice(0, 6);
      outer: for (let i = 0; i < topAmbiguous.length; i++) {
        for (let j = i + 1; j < topAmbiguous.length; j++) {
          const a = topAmbiguous[i];
          const b = topAmbiguous[j];
          if (a.chosenColor === b.chosenColor) continue;

          const trialGrids = balanced.scanGrids.map((g) => [...g] as FaceGrid);
          trialGrids[a.scanIdx][a.tileIdx] = b.chosenColor;
          trialGrids[b.scanIdx][b.tileIdx] = a.chosenColor;

          const cand =
            cubeSize === 2
              ? solveTopology2x2FromGrids(
                  trialGrids,
                  balanced.scanConfs,
                  balanced.palette,
                  lang
                )
              : solveTopologyFromGrids(
                  trialGrids,
                  balanced.scanConfs,
                  balanced.palette,
                  lang
                );
          if (cand) {
            topoSolution = cand;
            selfCorrected = true;
            break outer;
          }
        }
      }
    }

    if (topoSolution) {
      const detectedAssignments: Record<string, ScanAssignment> = {};
      const photoAnalyses: PhotoAnalysisSummary[] = activeScans.map((scan, idx) => {
        const m = topoSolution.scanToFace[idx];
        detectedAssignments[scan.id] = m;
        const rotNote = m.rotationCW > 0 ? ` (↻${m.rotationCW * 90}°)` : '';
        return {
          photoIndex: idx + 1,
          visibleFaces: [m.face],
          orientationNote:
            lang === 'ru'
              ? `Скан ${idx + 1} → грань ${m.face}${rotNote}`
              : `Scan ${idx + 1} → Face ${m.face}${rotNote}`,
        };
      });

      const identityIndices = Array.from({ length: tileCount }, (_, i) => i);
      const ambiguousStickers: AmbiguousStickerNote[] = balanced.lowConfidenceTiles.map((t) => {
        const m = topoSolution.scanToFace[t.scanIdx];
        const idxMap = rotateGridN(identityIndices, m.rotationCW);
        const finalIndex = idxMap.indexOf(t.tileIdx);
        return {
          face: m.face,
          index: finalIndex >= 0 ? finalIndex : t.tileIdx,
          chosenColor: t.chosenColor,
          alternativeColor: t.altColor,
          reason:
            lang === 'ru'
              ? 'Близкий оттенок при локальном считывании.'
              : 'Close color margin during local sampling.',
        };
      });

      const durationMs = Math.max(1, Math.round(performance.now() - tStart));
      return {
        palette: balanced.palette,
        faces: topoSolution.faces,
        confidences: topoSolution.confidences,
        photoAnalyses,
        ambiguousStickers,
        detectedAssignments,
        reasoningSummary:
          lang === 'ru'
            ? `Автоматически сопоставлены все 6 граней и повороты за ${durationMs} мс.`
            : `Auto-matched all 6 sides and face rotations in ${durationMs} ms.`,
        passCount: 1,
        selfCorrected,
        durationMs,
      };
    }

    // Fallback when scans cannot form a valid cube (e.g. duplicate side or off-grid alignment)
    const fallbackFacesList =
      cubeSize === 2
        ? SCAN_CANONICAL_FACE_ORDER
        : mapCentersProvisionallyToFaces(sampledRgbs.map((r) => r[4]));
    const faces = createEmptyFaces(cubeSize);
    const confidences = createEmptyConfidences(cubeSize);
    const detectedAssignments: Record<string, ScanAssignment> = {};
    const photoAnalyses: PhotoAnalysisSummary[] = [];

    activeScans.forEach((scan, idx) => {
      const face = fallbackFacesList[idx];
      faces[face] = balanced.scanGrids[idx];
      confidences[face] = balanced.scanConfs[idx];
      detectedAssignments[scan.id] = { face, rotationCW: 0 };
      photoAnalyses.push({
        photoIndex: idx + 1,
        visibleFaces: [face],
        orientationNote:
          lang === 'ru'
            ? `Скан ${idx + 1} → грань ${face} (требует проверки дублей/рамки)`
            : `Scan ${idx + 1} → Face ${face} (check alignment/duplicates)`,
      });
    });

    const ambiguousStickers: AmbiguousStickerNote[] = balanced.lowConfidenceTiles.map((t) => ({
      face: fallbackFacesList[t.scanIdx],
      index: t.tileIdx,
      chosenColor: t.chosenColor,
      alternativeColor: t.altColor,
      reason:
        lang === 'ru'
          ? 'Близкий оттенок при локальном считывании.'
          : 'Close color margin during local sampling.',
    }));

    const durationMs = Math.max(1, Math.round(performance.now() - tStart));
    return {
      palette: balanced.palette,
      faces,
      confidences,
      photoAnalyses,
      ambiguousStickers,
      detectedAssignments,
      reasoningSummary:
        lang === 'ru'
          ? `6 граней считаны за ${durationMs} мс (не удалось собрать замкнутый кубик — проверьте, что сняты 6 разных сторон).`
          : `6 faces sampled in ${durationMs} ms (could not form a closed cube — check that all 6 distinct sides were scanned).`,
      passCount: 1,
      selfCorrected: false,
      durationMs,
    };
  }

  // INCREMENTAL AD-HOC MODE (1..5 scans in ANY order)
  interface ClusterAnchor {
    id: KnownColorId;
    rgb: Rgb;
    lab: Lab;
    isCenter: boolean;
  }

  const anchors: ClusterAnchor[] = [];
  const allTiles: Array<{ scanIdx: number; tileIdx: number; rgb: Rgb; lab: Lab }> = [];

  sampledRgbs.forEach((rgbs, scanIdx) => {
    rgbs.forEach((rgb, i) => {
      allTiles.push({ scanIdx, tileIdx: i, rgb, lab: rgbToLab(rgb) });
    });
    if (cubeSize === 3) {
      const centerRgb = rgbs[4];
      const centerLab = rgbToLab(centerRgb);
      const matchesExistingCenter = anchors.some(
        (a) => chromaLabDistSq(centerLab, a.lab) < 160 && Math.abs(centerLab[0] - a.lab[0]) < 22
      );
      if (!matchesExistingCenter && anchors.length < 6) {
        anchors.push({
          id: KNOWN_COLORS[anchors.length],
          rgb: centerRgb,
          lab: centerLab,
          isCenter: true,
        });
      }
    }
  });

  if (anchors.length === 0 && allTiles.length > 0) {
    anchors.push({
      id: KNOWN_COLORS[0],
      rgb: allTiles[0].rgb,
      lab: allTiles[0].lab,
      isCenter: false,
    });
  }

  const NEW_COLOR_THRESHOLD_SQ = 550;
  while (anchors.length < 6 && allTiles.length > 0) {
    let bestTile = allTiles[0];
    let bestDist = -1;
    for (const tile of allTiles) {
      let minD = Infinity;
      for (const anchor of anchors) {
        minD = Math.min(minD, chromaLabDistSq(tile.lab, anchor.lab));
      }
      if (minD > bestDist) {
        bestDist = minD;
        bestTile = tile;
      }
    }
    if (bestDist < NEW_COLOR_THRESHOLD_SQ) break;
    anchors.push({
      id: KNOWN_COLORS[anchors.length],
      rgb: bestTile.rgb,
      lab: bestTile.lab,
      isCenter: false,
    });
  }

  // 2 quick Lab K-means refinement passes
  for (let iter = 0; iter < 2; iter++) {
    const groups: Array<Array<{ rgb: Rgb; lab: Lab }>> = anchors.map(() => []);
    for (const tile of allTiles) {
      let bestK = 0;
      let bestD = Infinity;
      for (let k = 0; k < anchors.length; k++) {
        const d = chromaLabDistSq(tile.lab, anchors[k].lab);
        if (d < bestD) {
          bestD = d;
          bestK = k;
        }
      }
      groups[bestK].push({ rgb: tile.rgb, lab: tile.lab });
    }
    for (let k = 0; k < anchors.length; k++) {
      const grp = groups[k];
      if (grp.length === 0) continue;
      const meanR = grp.reduce((s, p) => s + p.rgb[0], 0) / grp.length;
      const meanG = grp.reduce((s, p) => s + p.rgb[1], 0) / grp.length;
      const meanB = grp.reduce((s, p) => s + p.rgb[2], 0) / grp.length;
      const meanL = grp.reduce((s, p) => s + p.lab[0], 0) / grp.length;
      const meanA = grp.reduce((s, p) => s + p.lab[1], 0) / grp.length;
      const meanB_ = grp.reduce((s, p) => s + p.lab[2], 0) / grp.length;
      if (anchors[k].isCenter) {
        anchors[k].lab = [
          anchors[k].lab[0] * 0.65 + meanL * 0.35,
          anchors[k].lab[1] * 0.65 + meanA * 0.35,
          anchors[k].lab[2] * 0.65 + meanB_ * 0.35,
        ];
      } else {
        anchors[k].rgb = [meanR, meanG, meanB];
        anchors[k].lab = [meanL, meanA, meanB_];
      }
    }
  }

  const palette: CubePalette = { ...DEFAULT_PALETTE };
  const usedNames = new Set<string>();
  anchors.forEach((a) => {
    const name = inferColorNameFromRgb(a.rgb, usedNames);
    usedNames.add(name.toLowerCase());
    palette[a.id] = buildColorMeta(a.id, name, rgbToHex(a.rgb), DEFAULT_PALETTE[a.id].hex);
  });
  const unusedDefaults = KNOWN_COLORS.map((id) => DEFAULT_PALETTE[id]).filter(
    (meta) => !usedNames.has(meta.name.toLowerCase())
  );
  let fbIdx = 0;
  for (let i = anchors.length; i < 6; i++) {
    const id = KNOWN_COLORS[i];
    const fb = unusedDefaults[fbIdx++] ?? DEFAULT_PALETTE[id];
    palette[id] = buildColorMeta(id, fb.name, fb.hex, fb.hex);
  }

  const provisionalFaces =
    cubeSize === 2
      ? activeScans.map((_, i) => SCAN_CANONICAL_FACE_ORDER[i])
      : mapCentersProvisionallyToFaces(sampledRgbs.map((r) => r[4]));
  const faces = createEmptyFaces(cubeSize);
  const confidences = createEmptyConfidences(cubeSize);
  const ambiguousStickers: AmbiguousStickerNote[] = [];
  const detectedAssignments: Record<string, ScanAssignment> = {};
  const photoAnalyses: PhotoAnalysisSummary[] = [];

  sampledRgbs.forEach((rgbs, scanIdx) => {
    const face = provisionalFaces[scanIdx];
    const scanId = activeScans[scanIdx].id;
    detectedAssignments[scanId] = { face, rotationCW: 0 };
    photoAnalyses.push({
      photoIndex: scanIdx + 1,
      visibleFaces: [face],
      orientationNote:
        lang === 'ru'
          ? `Скан ${scanIdx + 1} (предв. ${face}, точная ориентация на 6/6)`
          : `Scan ${scanIdx + 1} (provisional ${face}; full layout locks at 6/6)`,
    });

    for (let i = 0; i < tileCount; i++) {
      const lab = rgbToLab(rgbs[i]);
      const ranked = anchors
        .map((a) => ({ id: a.id, dist: chromaLabDistSq(lab, a.lab) }))
        .sort((a, b) => a.dist - b.dist);
      const best = ranked[0];
      const second = ranked[1];
      faces[face][i] = best.id;
      const margin = second ? Math.sqrt(second.dist) - Math.sqrt(best.dist) : 999;
      if (cubeSize === 3 && i === 4) {
        confidences[face][4] = 'high';
      } else if (margin < 8) {
        confidences[face][i] = 'low';
        if (second) {
          ambiguousStickers.push({
            face,
            index: i,
            chosenColor: best.id,
            alternativeColor: second.id,
            reason:
              lang === 'ru'
                ? 'Близкий оттенок при ad-hoc чтении.'
                : 'Close color margin during ad-hoc scan.',
          });
        }
      } else if (margin < 18) {
        confidences[face][i] = 'medium';
      } else {
        confidences[face][i] = 'high';
      }
    }
  });

  const durationMs = Math.max(1, Math.round(performance.now() - tStart));
  return {
    palette,
    faces,
    confidences,
    photoAnalyses,
    ambiguousStickers,
    detectedAssignments,
    reasoningSummary:
      lang === 'ru'
        ? `Снято ${activeScans.length}/6 граней (цветов ad-hoc: ${anchors.length}). Точные стороны и поворот определятся на 6-й грани.`
        : `Scanned ${activeScans.length}/6 sides (${anchors.length} ad-hoc colors). Exact side placement & rotations lock in at 6/6.`,
    passCount: 1,
    selfCorrected: false,
    durationMs,
  };
}

// Legacy alias kept for compatibility if anything imports sampleFacesAdHoc
export async function sampleFacesAdHoc(
  facePhotos: Partial<Record<FaceId, UploadedPhoto>>,
  lang: 'en' | 'ru'
): Promise<CanvasSampleOutput> {
  const ordered = SCAN_CANONICAL_FACE_ORDER
    .map((f) => facePhotos[f])
    .filter((p): p is UploadedPhoto => Boolean(p));
  return sampleScansAdHoc(ordered, lang);
}
