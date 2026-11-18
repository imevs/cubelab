import type {
  ColorSchemeMode,
  CubeColor,
  CubeFaces,
  CubePalette,
  CubeSize,
  FaceId,
  KnownColorId,
  StickerRef,
} from './cubeTypes.ts';
import {
  DEFAULT_PALETTE,
  FACE_ORDER,
  KNOWN_COLORS,
  getColorMeta,
  inferCubeSizeFromFaces,
} from './cubeTypes.ts';

export type ValidationStatus = 'valid' | 'partial' | 'invalid';

export interface ValidationIssue {
  id: string;
  severity: 'error' | 'warning';
  code:
    | 'DUPLICATE_CENTER'
    | 'INVALID_STANDARD_OPPOSITES'
    | 'INVALID_CHIRAL_CENTERS'
    | 'COLOR_COUNT_EXCEEDED'
    | 'COLOR_COUNT_MISMATCH'
    | 'INVALID_EDGE'
    | 'DUPLICATE_EDGE'
    | 'INVALID_CORNER'
    | 'MIRRORED_CORNER'
    | 'DUPLICATE_CORNER'
    | 'EDGE_ORIENTATION_PARITY'
    | 'CORNER_ORIENTATION_PARITY'
    | 'PERMUTATION_PARITY';
  title: string;
  message: string;
  hint: string;
  affectedStickers: StickerRef[];
}

export interface VerificationResult {
  cubeSize: CubeSize;
  status: ValidationStatus;
  isComplete: boolean;
  isSolvable: boolean;
  knownStickerCount: number;
  scannedFaces: FaceId[];
  unscannedFaces: FaceId[];
  colorCounts: Record<CubeColor, number>;
  centerSummary: {
    distinctCount: number;
    allCentersKnown: boolean;
    standardChiralValid: boolean | null;
  };
  pieceSummary: {
    observedEdges: number;
    validEdges: number;
    observedCorners: number;
    validCorners: number;
    edgeFlipSum: number | null;
    cornerTwistSum: number | null;
    permutationParityMatch: boolean | null;
  };
  issues: ValidationIssue[];
  kociembaString: string;
}

export interface EdgeSlotDef {
  name: string;
  stickers: [StickerRef, StickerRef];
}

export interface CornerSlotDef {
  name: string;
  stickers: [StickerRef, StickerRef, StickerRef];
}

export const EDGE_SLOTS: EdgeSlotDef[] = [
  { name: 'UF', stickers: [{ face: 'U', index: 7 }, { face: 'F', index: 1 }] },
  { name: 'UR', stickers: [{ face: 'U', index: 5 }, { face: 'R', index: 1 }] },
  { name: 'UB', stickers: [{ face: 'U', index: 1 }, { face: 'B', index: 1 }] },
  { name: 'UL', stickers: [{ face: 'U', index: 3 }, { face: 'L', index: 1 }] },
  { name: 'DF', stickers: [{ face: 'D', index: 1 }, { face: 'F', index: 7 }] },
  { name: 'DR', stickers: [{ face: 'D', index: 5 }, { face: 'R', index: 7 }] },
  { name: 'DB', stickers: [{ face: 'D', index: 7 }, { face: 'B', index: 7 }] },
  { name: 'DL', stickers: [{ face: 'D', index: 3 }, { face: 'L', index: 7 }] },
  { name: 'FR', stickers: [{ face: 'F', index: 5 }, { face: 'R', index: 3 }] },
  { name: 'FL', stickers: [{ face: 'F', index: 3 }, { face: 'L', index: 5 }] },
  { name: 'BR', stickers: [{ face: 'B', index: 3 }, { face: 'R', index: 5 }] },
  { name: 'BL', stickers: [{ face: 'B', index: 5 }, { face: 'L', index: 3 }] },
];

export const CORNER_SLOTS: CornerSlotDef[] = [
  { name: 'UFR', stickers: [{ face: 'U', index: 8 }, { face: 'R', index: 0 }, { face: 'F', index: 2 }] },
  { name: 'UFL', stickers: [{ face: 'U', index: 6 }, { face: 'F', index: 0 }, { face: 'L', index: 2 }] },
  { name: 'UBL', stickers: [{ face: 'U', index: 0 }, { face: 'L', index: 0 }, { face: 'B', index: 2 }] },
  { name: 'UBR', stickers: [{ face: 'U', index: 2 }, { face: 'B', index: 0 }, { face: 'R', index: 2 }] },
  { name: 'DFR', stickers: [{ face: 'D', index: 2 }, { face: 'F', index: 8 }, { face: 'R', index: 6 }] },
  { name: 'DFL', stickers: [{ face: 'D', index: 0 }, { face: 'L', index: 8 }, { face: 'F', index: 6 }] },
  { name: 'DBL', stickers: [{ face: 'D', index: 6 }, { face: 'B', index: 8 }, { face: 'L', index: 6 }] },
  { name: 'DBR', stickers: [{ face: 'D', index: 8 }, { face: 'R', index: 8 }, { face: 'B', index: 6 }] },
];

export const CORNER_SLOTS_2X2: CornerSlotDef[] = [
  { name: 'UFR', stickers: [{ face: 'U', index: 3 }, { face: 'R', index: 0 }, { face: 'F', index: 1 }] },
  { name: 'UFL', stickers: [{ face: 'U', index: 2 }, { face: 'F', index: 0 }, { face: 'L', index: 1 }] },
  { name: 'UBL', stickers: [{ face: 'U', index: 0 }, { face: 'L', index: 0 }, { face: 'B', index: 1 }] },
  { name: 'UBR', stickers: [{ face: 'U', index: 1 }, { face: 'B', index: 0 }, { face: 'R', index: 1 }] },
  { name: 'DFR', stickers: [{ face: 'D', index: 1 }, { face: 'F', index: 3 }, { face: 'R', index: 2 }] },
  { name: 'DFL', stickers: [{ face: 'D', index: 0 }, { face: 'L', index: 3 }, { face: 'F', index: 2 }] },
  { name: 'DBL', stickers: [{ face: 'D', index: 2 }, { face: 'B', index: 3 }, { face: 'L', index: 2 }] },
  { name: 'DBR', stickers: [{ face: 'D', index: 3 }, { face: 'R', index: 3 }, { face: 'B', index: 2 }] },
];

type StandardKey = 'W' | 'Y' | 'G' | 'B' | 'R' | 'O';

const STANDARD_COLOR_VEC: Record<StandardKey, [number, number, number]> = {
  R: [1, 0, 0],
  O: [-1, 0, 0],
  W: [0, 1, 0],
  Y: [0, -1, 0],
  G: [0, 0, 1],
  B: [0, 0, -1],
};

const STANDARD_OPPOSITE: Record<StandardKey, StandardKey> = {
  W: 'Y',
  Y: 'W',
  G: 'B',
  B: 'G',
  R: 'O',
  O: 'R',
};

function toStandardKey(palette: CubePalette, color: KnownColorId): StandardKey | null {
  const n = palette[color]?.name.trim().toLowerCase() ?? '';
  if (n === 'white') return 'W';
  if (n === 'yellow') return 'Y';
  if (n === 'green') return 'G';
  if (n === 'blue') return 'B';
  if (n === 'red') return 'R';
  if (n === 'orange') return 'O';
  return null;
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vecEqual(a: [number, number, number], b: [number, number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function getSticker(faces: CubeFaces, ref: StickerRef): CubeColor {
  return faces[ref.face][ref.index];
}

function permutationParity(perm: number[]): number {
  const visited = new Array<boolean>(perm.length).fill(false);
  let cycles = 0;
  for (let i = 0; i < perm.length; i++) {
    if (!visited[i]) {
      cycles++;
      let curr = i;
      while (!visited[curr]) {
        visited[curr] = true;
        curr = perm[curr];
      }
    }
  }
  return (perm.length - cycles) % 2;
}

export function getCubiePartnerStickers(ref: StickerRef, cubeSize: CubeSize = 3): StickerRef[] {
  if (cubeSize === 2) {
    for (const corner of CORNER_SLOTS_2X2) {
      if (corner.stickers.some((s) => s.face === ref.face && s.index === ref.index)) {
        return corner.stickers.filter((s) => !(s.face === ref.face && s.index === ref.index));
      }
    }
    return [];
  }

  if (ref.index === 4) return [];

  for (const edge of EDGE_SLOTS) {
    if (edge.stickers.some((s) => s.face === ref.face && s.index === ref.index)) {
      return edge.stickers.filter((s) => !(s.face === ref.face && s.index === ref.index));
    }
  }

  for (const corner of CORNER_SLOTS) {
    if (corner.stickers.some((s) => s.face === ref.face && s.index === ref.index)) {
      return corner.stickers.filter((s) => !(s.face === ref.face && s.index === ref.index));
    }
  }

  return [];
}

/**
 * Infers the solved target face colors (U, R, F, D, L, B -> KnownColorId) for a 2x2 cube
 * by anchoring the DBL corner (so DBL stays fixed under <U, R, F> moves) and deducing
 * opposite colors from observed non-co-occurring pairs across corners.
 */
export function infer2x2SolvedColors(faces: CubeFaces): Record<FaceId, KnownColorId> | null {
  const dblD = faces.D[2];
  const dblB = faces.B[3];
  const dblL = faces.L[2];
  if (
    dblD === '?' || dblB === '?' || dblL === '?' ||
    dblD === dblB || dblB === dblL || dblD === dblL
  ) {
    return null;
  }

  const coOccurs = new Map<KnownColorId, Set<KnownColorId>>();
  for (const c of KNOWN_COLORS) coOccurs.set(c, new Set<KnownColorId>());

  for (const slot of CORNER_SLOTS_2X2) {
    const cs = slot.stickers.map((s) => faces[s.face][s.index]);
    if (cs.some((c) => c === '?')) continue;
    const [a, b, c] = cs as [KnownColorId, KnownColorId, KnownColorId];
    coOccurs.get(a)!.add(b);
    coOccurs.get(a)!.add(c);
    coOccurs.get(b)!.add(a);
    coOccurs.get(b)!.add(c);
    coOccurs.get(c)!.add(a);
    coOccurs.get(c)!.add(b);
  }

  const findOpp = (target: KnownColorId, exclude: Set<KnownColorId>): KnownColorId | null => {
    const cands = KNOWN_COLORS.filter(
      (c) => c !== target && !exclude.has(c) && !coOccurs.get(target)!.has(c)
    );
    return cands.length === 1 ? cands[0] : null;
  };

  const dblSet = new Set<KnownColorId>([dblD, dblB, dblL]);
  const oppU = findOpp(dblD, dblSet);
  const oppF = findOpp(dblB, dblSet);
  const oppR = findOpp(dblL, dblSet);

  if (oppU && oppF && oppR && oppU !== oppF && oppF !== oppR && oppU !== oppR) {
    return { D: dblD, B: dblB, L: dblL, U: oppU, F: oppF, R: oppR };
  }

  // Fallback: verify candidate opposite triples against all 8 chiral reference corners
  const remaining = KNOWN_COLORS.filter((c) => !dblSet.has(c));
  if (remaining.length !== 3) return null;
  const perms: Array<[KnownColorId, KnownColorId, KnownColorId]> = [
    [remaining[0], remaining[1], remaining[2]],
    [remaining[0], remaining[2], remaining[1]],
    [remaining[1], remaining[0], remaining[2]],
    [remaining[1], remaining[2], remaining[0]],
    [remaining[2], remaining[0], remaining[1]],
    [remaining[2], remaining[1], remaining[0]],
  ];

  for (const [cU, cF, cR] of perms) {
    if (
      coOccurs.get(dblD)!.has(cU) ||
      coOccurs.get(dblB)!.has(cF) ||
      coOccurs.get(dblL)!.has(cR)
    ) {
      continue;
    }
    const refMap: Record<FaceId, KnownColorId> = { D: dblD, B: dblB, L: dblL, U: cU, F: cF, R: cR };
    const refCorners = CORNER_SLOTS_2X2.map((slot) => [
      refMap[slot.stickers[0].face],
      refMap[slot.stickers[1].face],
      refMap[slot.stickers[2].face],
    ]);
    let allCyclicValid = true;
    for (const slot of CORNER_SLOTS_2X2) {
      const a = faces[slot.stickers[0].face][slot.stickers[0].index];
      const b = faces[slot.stickers[1].face][slot.stickers[1].index];
      const c = faces[slot.stickers[2].face][slot.stickers[2].index];
      if (a === '?' || b === '?' || c === '?') {
        allCyclicValid = false;
        break;
      }
      const ok = refCorners.some(
        ([r0, r1, r2]) =>
          (a === r0 && b === r1 && c === r2) ||
          (b === r0 && c === r1 && a === r2) ||
          (c === r0 && a === r1 && b === r2)
      );
      if (!ok) {
        allCyclicValid = false;
        break;
      }
    }
    if (allCyclicValid) return refMap;
  }

  return null;
}

export function toKociembaString(faces: CubeFaces): string {
  const cubeSize = inferCubeSizeFromFaces(faces);
  const colorToFace = new Map<CubeColor, FaceId>();

  if (cubeSize === 2) {
    const solvedMap = infer2x2SolvedColors(faces);
    if (solvedMap) {
      for (const f of FACE_ORDER) {
        colorToFace.set(solvedMap[f], f);
      }
    }
  } else {
    for (const f of FACE_ORDER) {
      const c = faces[f][4];
      if (c !== '?' && !colorToFace.has(c)) {
        colorToFace.set(c, f);
      }
    }
  }

  return FACE_ORDER.map((face) =>
    faces[face]
      .map((color) => {
        if (color === '?') return '?';
        return colorToFace.get(color) ?? color;
      })
      .join('')
  ).join('');
}

const COLOR_RU_MAP: Record<string, string> = {
  white: 'Белый',
  red: 'Красный',
  green: 'Зелёный',
  yellow: 'Жёлтый',
  orange: 'Оранжевый',
  blue: 'Синий',
  black: 'Чёрный',
  pink: 'Розовый',
  purple: 'Фиолетовый',
  violet: 'Фиолетовый',
  cyan: 'Голубой',
  'light blue': 'Голубой',
  teal: 'Бирюзовый',
  gray: 'Серый',
  grey: 'Серый',
  magenta: 'Пурпурный',
  lime: 'Лаймовый',
  brown: 'Коричневый',
  unscanned: 'Пусто',
};

function colorDisplayName(palette: CubePalette, color: CubeColor, lang: 'en' | 'ru'): string {
  const raw = getColorMeta(palette, color).name;
  if (lang === 'en') return raw;
  return COLOR_RU_MAP[raw.trim().toLowerCase()] ?? raw;
}

function buildAll30ColorSchemes(): Array<Record<FaceId, KnownColorId>> {
  const out: Array<Record<FaceId, KnownColorId>> = [];
  const u = KNOWN_COLORS[0];
  for (let dIdx = 1; dIdx < 6; dIdx++) {
    const d = KNOWN_COLORS[dIdx];
    const rem = KNOWN_COLORS.filter((c) => c !== u && c !== d);
    const f = rem[0];
    const others = [rem[1], rem[2], rem[3]];
    const perms: Array<[KnownColorId, KnownColorId, KnownColorId]> = [
      [others[0], others[1], others[2]],
      [others[0], others[2], others[1]],
      [others[1], others[0], others[2]],
      [others[1], others[2], others[0]],
      [others[2], others[0], others[1]],
      [others[2], others[1], others[0]],
    ];
    for (const [r, b, l] of perms) {
      out.push({ U: u, D: d, F: f, R: r, B: b, L: l });
    }
  }
  return out;
}

const ALL_30_COLOR_SCHEMES = buildAll30ColorSchemes();

function verify2x2State(
  faces: CubeFaces,
  colorSchemeMode: ColorSchemeMode,
  palette: CubePalette,
  lang: 'en' | 'ru'
): VerificationResult {
  const isRu = lang === 'ru';
  const issues: ValidationIssue[] = [];
  const colorCounts: Record<CubeColor, number> = {
    C1: 0,
    C2: 0,
    C3: 0,
    C4: 0,
    C5: 0,
    C6: 0,
    '?': 0,
  };

  const scannedFaces: FaceId[] = [];
  const unscannedFaces: FaceId[] = [];

  for (const face of FACE_ORDER) {
    let faceKnown = 0;
    for (let i = 0; i < 4; i++) {
      const c = faces[face][i] ?? '?';
      colorCounts[c]++;
      if (c !== '?') faceKnown++;
    }
    if (faceKnown > 0) scannedFaces.push(face);
    if (faceKnown < 4) unscannedFaces.push(face);
  }

  const knownStickerCount = 24 - colorCounts['?'];
  const isComplete = knownStickerCount === 24;

  for (const color of KNOWN_COLORS) {
    const count = colorCounts[color];
    const colorName = colorDisplayName(palette, color, lang);
    if (count > 4) {
      const affected: StickerRef[] = [];
      for (const face of FACE_ORDER) {
        for (let i = 0; i < 4; i++) {
          if (faces[face][i] === color) affected.push({ face, index: i });
        }
      }
      issues.push({
        id: `count-over-${color}`,
        severity: 'error',
        code: 'COLOR_COUNT_EXCEEDED',
        title: isRu
          ? `Слишком много плиток цвета «${colorName}» (${count}/4)`
          : `Too many ${colorName} stickers (${count}/4)`,
        message: isRu
          ? `Цвет «${colorName}» встречается ${count} раз — больше физического максимума в 4 плитки для кубика 2×2.`
          : `${colorName} appears ${count} times, exceeding the physical maximum of 4 stickers per color on a 2×2 cube.`,
        hint: isRu
          ? `Проверьте плитки цвета «${colorName}» в тени или бликах.`
          : `Inspect ${colorName} tiles in warm light or shadow.`,
        affectedStickers: affected,
      });
    } else if (isComplete && count < 4) {
      issues.push({
        id: `count-under-${color}`,
        severity: 'error',
        code: 'COLOR_COUNT_MISMATCH',
        title: isRu
          ? `Не хватает плиток цвета «${colorName}» (${count}/4)`
          : `Missing ${colorName} stickers (${count}/4)`,
        message: isRu
          ? `Цвет «${colorName}» встречается ${count} раз из 4 обязательных на полном кубике 2×2.`
          : `${colorName} appears ${count} times out of 4 required on a complete 24-sticker 2×2 cube.`,
        hint: isRu
          ? 'Проверьте плитки, где другой цвет встретился больше 4 раз.'
          : 'Check tiles where another color appeared more than 4 times.',
        affectedStickers: [],
      });
    }
  }

  // Standard WCA opposite color map if requested
  const stdOpp = new Map<KnownColorId, KnownColorId>();
  if (colorSchemeMode === 'standard') {
    for (const c of KNOWN_COLORS) {
      const k = toStandardKey(palette, c);
      if (k) {
        const oppId = KNOWN_COLORS.find((id) => toStandardKey(palette, id) === STANDARD_OPPOSITE[k]);
        if (oppId) stdOpp.set(c, oppId);
      }
    }
  }

  let observedCorners = 0;
  let validCorners = 0;
  const seenCornerKeys = new Map<string, CornerSlotDef>();
  const completeSlots: Array<{
    slotIdx: number;
    slot: CornerSlotDef;
    colors: [KnownColorId, KnownColorId, KnownColorId];
  }> = [];

  for (let slotIdx = 0; slotIdx < CORNER_SLOTS_2X2.length; slotIdx++) {
    const slot = CORNER_SLOTS_2X2[slotIdx];
    const c0 = getSticker(faces, slot.stickers[0]);
    const c1 = getSticker(faces, slot.stickers[1]);
    const c2 = getSticker(faces, slot.stickers[2]);
    if (c0 === '?' || c1 === '?' || c2 === '?') continue;

    observedCorners++;
    const colors: [KnownColorId, KnownColorId, KnownColorId] = [c0, c1, c2];
    const names = colors.map((c) => colorDisplayName(palette, c, lang));

    const hasDup = c0 === c1 || c1 === c2 || c0 === c2;
    const hasStdOpp =
      stdOpp.get(c0) === c1 || stdOpp.get(c1) === c2 || stdOpp.get(c0) === c2;

    if (hasDup || hasStdOpp) {
      issues.push({
        id: `invalid-corner-${slot.name}`,
        severity: 'error',
        code: 'INVALID_CORNER',
        title: isRu
          ? `Невозможный угол ${slot.name} (${names.join('–')})`
          : `Impossible ${slot.name} corner (${names.join('–')})`,
        message: isRu
          ? `Угол ${slot.name} содержит цвета ${names.join(', ')}, которые не могут находиться на одном углу.`
          : `Corner ${slot.name} combines ${names.join(', ')}, which cannot coexist on one corner piece.`,
        hint: isRu
          ? 'Проверьте 3 плитки этого угла или поворот соседних граней.'
          : 'Re-check the 3 stickers meeting at this corner or adjacent face rotations.',
        affectedStickers: slot.stickers,
      });
      continue;
    }

    const sortedKey = [...colors].sort().join('-');
    const prevSlot = seenCornerKeys.get(sortedKey);
    if (prevSlot) {
      issues.push({
        id: `dup-corner-${sortedKey}-${slot.name}`,
        severity: 'error',
        code: 'DUPLICATE_CORNER',
        title: isRu
          ? `Дублирующийся угол (${names.join('/')})`
          : `Duplicate corner piece (${names.join('/')})`,
        message: isRu
          ? `Угол ${names.join('–')} присутствует сразу в позициях ${prevSlot.name} и ${slot.name}.`
          : `The ${names.join('–')} corner appears at both ${prevSlot.name} and ${slot.name}.`,
        hint: isRu
          ? 'Проверьте, не повёрнута ли грань или не перепутаны ли похожие оттенки.'
          : 'Check if a face is rotated or two similar shades were swapped.',
        affectedStickers: [...prevSlot.stickers, ...slot.stickers],
      });
      continue;
    }
    seenCornerKeys.set(sortedKey, slot);
    completeSlots.push({ slotIdx, slot, colors });
  }

  // Deduce valid global chiral color scheme from observed corners
  let bestScheme: Record<FaceId, KnownColorId> | null = null;
  let bestMatchCount = -1;
  let bestMatches: Array<{ slotIdx: number; twist: number }> = [];
  let bestFailed: Array<{ slot: CornerSlotDef; colors: [KnownColorId, KnownColorId, KnownColorId]; mirrored: boolean }> = [];

  if (completeSlots.length > 0) {
    const dblSlot = completeSlots.find((s) => s.slot.name === 'DBL');
    for (const scheme of ALL_30_COLOR_SCHEMES) {
      if (colorSchemeMode === 'standard') {
        const oppMatchesStd =
          (!stdOpp.has(scheme.U) || stdOpp.get(scheme.U) === scheme.D) &&
          (!stdOpp.has(scheme.F) || stdOpp.get(scheme.F) === scheme.B) &&
          (!stdOpp.has(scheme.R) || stdOpp.get(scheme.R) === scheme.L);
        if (!oppMatchesStd) continue;
      }

      const refCorners = CORNER_SLOTS_2X2.map((slot) => [
        scheme[slot.stickers[0].face],
        scheme[slot.stickers[1].face],
        scheme[slot.stickers[2].face],
      ]);

      const matches: Array<{ slotIdx: number; twist: number }> = [];
      const failed: Array<{ slot: CornerSlotDef; colors: [KnownColorId, KnownColorId, KnownColorId]; mirrored: boolean }> = [];

      for (const item of completeSlots) {
        const [c0, c1, c2] = item.colors;
        let matchedTwist = -1;
        let mirrored = false;
        for (let k = 0; k < refCorners.length; k++) {
          const [r0, r1, r2] = refCorners[k];
          if (c0 === r0 && c1 === r1 && c2 === r2) {
            matchedTwist = 0;
            break;
          }
          if (c1 === r0 && c2 === r1 && c0 === r2) {
            matchedTwist = 1;
            break;
          }
          if (c2 === r0 && c0 === r1 && c1 === r2) {
            matchedTwist = 2;
            break;
          }
          if (
            (r0 === c0 || r1 === c0 || r2 === c0) &&
            (r0 === c1 || r1 === c1 || r2 === c1) &&
            (r0 === c2 || r1 === c2 || r2 === c2)
          ) {
            mirrored = true;
          }
        }
        if (matchedTwist !== -1) {
          matches.push({ slotIdx: item.slotIdx, twist: matchedTwist });
        } else {
          failed.push({ slot: item.slot, colors: item.colors, mirrored });
        }
      }

      // Tie-break preferring schemes where DBL matches its current home face colors (natural twist 0)
      let score = matches.length * 10;
      if (dblSlot && scheme.D === dblSlot.colors[0] && scheme.B === dblSlot.colors[1] && scheme.L === dblSlot.colors[2]) {
        score += 3;
      }

      if (score > bestMatchCount) {
        bestMatchCount = score;
        bestScheme = scheme;
        bestMatches = matches;
        bestFailed = failed;
      }
    }
  }

  validCorners = bestMatches.length;

  if (bestFailed.length > 0) {
    for (const f of bestFailed) {
      const names = f.colors.map((c) => colorDisplayName(palette, c, lang));
      if (f.mirrored) {
        issues.push({
          id: `mirrored-corner-${f.slot.name}`,
          severity: 'error',
          code: 'MIRRORED_CORNER',
          title: isRu
            ? `Зеркальный порядок цветов на углу ${f.slot.name} (${names.join('–')})`
            : `Mirrored ${f.slot.name} corner chirality (${names.join('–')})`,
          message: isRu
            ? `Угол ${f.slot.name} имеет обратный циклический порядок цветов и несовместим с остальными углами.`
            : `Corner ${f.slot.name} has reverse cyclic color order incompatible with the remaining corners.`,
          hint: isRu
            ? 'Возможно, одна из граней отзеркалена или перепутаны две угловые плитки.'
            : 'A face may be rotated/mirrored or two corner stickers were swapped.',
          affectedStickers: f.slot.stickers,
        });
      } else {
        issues.push({
          id: `unmatched-corner-${f.slot.name}`,
          severity: 'error',
          code: 'INVALID_CORNER',
          title: isRu
            ? `Несовместимый угол ${f.slot.name} (${names.join('–')})`
            : `Incompatible ${f.slot.name} corner (${names.join('–')})`,
          message: isRu
            ? `Угол ${f.slot.name} (${names.join('–')}) конфликтует с противоположными цветами кубика 2×2.`
            : `Corner ${f.slot.name} (${names.join('–')}) conflicts with the cube's inferred opposite color pairs.`,
          hint: isRu
            ? 'Проверьте цвета этого угла и поворот граней.'
            : 'Verify the 3 corner stickers and adjacent face rotations.',
          affectedStickers: f.slot.stickers,
        });
      }
    }
  }

  let cornerTwistSum: number | null = null;
  const canCheckAlgebra =
    isComplete &&
    issues.length === 0 &&
    bestScheme !== null &&
    bestMatches.length === 8;

  if (canCheckAlgebra) {
    cornerTwistSum = bestMatches.reduce((acc, m) => acc + m.twist, 0);
    if (cornerTwistSum % 3 !== 0) {
      issues.push({
        id: 'corner-twist-parity',
        severity: 'error',
        code: 'CORNER_ORIENTATION_PARITY',
        title: isRu ? 'Нарушение чётности скручивания углов' : 'Corner twist parity violation',
        message: isRu
          ? `Сумма поворотов углов равна ${cornerTwistSum} (${cornerTwistSum % 3} mod 3). Для решаемости кубика 2×2 требуется сумма ≡ 0 mod 3.`
          : `Total corner twist sum is ${cornerTwistSum} (${cornerTwistSum % 3} mod 3). A solvable 2×2 cube requires corner twist sum ≡ 0 mod 3.`,
        hint: isRu
          ? 'Как минимум одна угловая плитка распознана неверно или угол скручен.'
          : 'At least one corner sticker is misclassified or physically twisted in place.',
        affectedStickers: CORNER_SLOTS_2X2.flatMap((c) => c.stickers),
      });
    }
  }

  const distinctColorsPresent = KNOWN_COLORS.filter((c) => colorCounts[c] > 0).length;
  const hasErrors = issues.some((i) => i.severity === 'error');
  const isSolvable = isComplete && !hasErrors && canCheckAlgebra;

  const status: ValidationStatus = hasErrors ? 'invalid' : !isComplete ? 'partial' : 'valid';

  return {
    cubeSize: 2,
    status,
    isComplete,
    isSolvable,
    knownStickerCount,
    scannedFaces,
    unscannedFaces,
    colorCounts,
    centerSummary: {
      distinctCount: distinctColorsPresent,
      allCentersKnown: distinctColorsPresent === 6,
      standardChiralValid: colorSchemeMode === 'standard' ? bestScheme !== null && !hasErrors : null,
    },
    pieceSummary: {
      observedEdges: 0,
      validEdges: 0,
      observedCorners,
      validCorners,
      edgeFlipSum: null,
      cornerTwistSum,
      permutationParityMatch: isSolvable ? true : null,
    },
    issues,
    kociembaString: toKociembaString(faces),
  };
}

export function verifyCubeState(
  faces: CubeFaces,
  colorSchemeMode: ColorSchemeMode = 'auto',
  palette: CubePalette = DEFAULT_PALETTE,
  lang: 'en' | 'ru' = 'en'
): VerificationResult {
  if (inferCubeSizeFromFaces(faces) === 2) {
    return verify2x2State(faces, colorSchemeMode, palette, lang);
  }
  const isRu = lang === 'ru';
  const issues: ValidationIssue[] = [];
  const colorCounts: Record<CubeColor, number> = {
    C1: 0,
    C2: 0,
    C3: 0,
    C4: 0,
    C5: 0,
    C6: 0,
    '?': 0,
  };

  const scannedFaces: FaceId[] = [];
  const unscannedFaces: FaceId[] = [];

  for (const face of FACE_ORDER) {
    let faceKnown = 0;
    for (let i = 0; i < 9; i++) {
      const c = faces[face][i];
      colorCounts[c]++;
      if (c !== '?') faceKnown++;
    }
    if (faceKnown > 0) scannedFaces.push(face);
    if (faceKnown < 9) unscannedFaces.push(face);
  }

  const knownStickerCount = 54 - colorCounts['?'];
  const isComplete = knownStickerCount === 54;

  // 1. Center Uniqueness & Optional Standard WCA Chiral Check
  const centerMap = new Map<KnownColorId, FaceId[]>();
  let knownCenterCount = 0;
  for (const face of FACE_ORDER) {
    const c = faces[face][4];
    if (c !== '?') {
      knownCenterCount++;
      const list = centerMap.get(c) ?? [];
      list.push(face);
      centerMap.set(c, list);
    }
  }

  const duplicateCenters = Array.from(centerMap.entries()).filter(([, fs]) => fs.length > 1);
  for (const [color, fs] of duplicateCenters) {
    const colorName = colorDisplayName(palette, color, lang);
    issues.push({
      id: `dup-center-${color}`,
      severity: 'error',
      code: 'DUPLICATE_CENTER',
      title: isRu ? `Дублирующийся центр: ${colorName}` : `Duplicate ${colorName} center`,
      message: isRu
        ? `Цвет «${colorName}» указан в центре сразу нескольких граней: ${fs.join(', ')}.`
        : `${colorName} appears as the center sticker on multiple faces: ${fs.join(', ')}.`,
      hint: isRu
        ? 'У всех 6 центров граней должны быть разные цвета. Проверьте, не перепутаны ли грани на фото.'
        : 'Each of the 6 center tiles must be a distinct color. Check if two photos were mapped to the wrong faces.',
      affectedStickers: fs.map((face) => ({ face, index: 4 })),
    });
  }

  const allCentersKnown = knownCenterCount === 6 && duplicateCenters.length === 0;
  let standardChiralValid: boolean | null = null;

  if (colorSchemeMode === 'standard') {
    const oppositePairs: [FaceId, FaceId][] = [
      ['U', 'D'],
      ['F', 'B'],
      ['R', 'L'],
    ];

    for (const [f1, f2] of oppositePairs) {
      const c1 = faces[f1][4];
      const c2 = faces[f2][4];
      if (c1 !== '?' && c2 !== '?') {
        const k1 = toStandardKey(palette, c1);
        const k2 = toStandardKey(palette, c2);
        if (k1 && k2 && STANDARD_OPPOSITE[k1] !== k2) {
          standardChiralValid = false;
          const n1 = colorDisplayName(palette, c1, lang);
          const n2 = colorDisplayName(palette, c2, lang);
          issues.push({
            id: `std-opp-${f1}-${f2}`,
            severity: 'error',
            code: 'INVALID_STANDARD_OPPOSITES',
            title: isRu
              ? `Противоположные центры ${f1}/${f2} отличаются от WCA`
              : `Opposite centers ${f1}/${f2} differ from Western WCA`,
            message: isRu
              ? `В стандартной схеме WCA цвет «${n1}» (${f1}) не может быть напротив «${n2}» (${f2}).`
              : `On a standard Western WCA cube, ${n1} (${f1}) cannot be opposite ${n2} (${f2}).`,
            hint: isRu
              ? 'Используйте режим произвольных цветов, если у кубика нестандартная расцветка.'
              : 'Switch to Any Colors (Auto) if your cube uses a non-standard or custom color scheme.',
            affectedStickers: [
              { face: f1, index: 4 },
              { face: f2, index: 4 },
            ],
          });
        }
      }
    }

    const uC = faces.U[4];
    const fC = faces.F[4];
    const rC = faces.R[4];
    if (uC !== '?' && fC !== '?' && rC !== '?') {
      const uK = toStandardKey(palette, uC);
      const fK = toStandardKey(palette, fC);
      const rK = toStandardKey(palette, rC);
      if (uK && fK && rK) {
        const expectedR = cross(STANDARD_COLOR_VEC[uK], STANDARD_COLOR_VEC[fK]);
        const actualR = STANDARD_COLOR_VEC[rK];
        if (!vecEqual(expectedR, actualR)) {
          standardChiralValid = false;
          const uN = colorDisplayName(palette, uC, lang);
          const fN = colorDisplayName(palette, fC, lang);
          const rN = colorDisplayName(palette, rC, lang);
          issues.push({
            id: 'chiral-ufr',
            severity: 'error',
            code: 'INVALID_CHIRAL_CENTERS',
            title: isRu ? 'Нестандартная хиральность центров (U/F/R)' : 'Non-Western center chirality (U/F/R)',
            message: isRu
              ? `При верхе «${uN}» и переде «${fN}» стандартная раскладка WCA не размещает «${rN}» справа.`
              : `With ${uN} on Up and ${fN} on Front, standard WCA layout does not place ${rN} on Right.`,
            hint: isRu
              ? 'Проверьте, не перепутаны ли левая и правая грани.'
              : 'Check if Left/Right were mirrored, or switch to Any Colors (Auto) for non-standard cubes.',
            affectedStickers: [
              { face: 'U', index: 4 },
              { face: 'F', index: 4 },
              { face: 'R', index: 4 },
            ],
          });
        } else if (standardChiralValid !== false) {
          standardChiralValid = true;
        }
      }
    }
  }

  // 2. Color Frequency Invariant (exactly 9 stickers per color)
  for (const color of KNOWN_COLORS) {
    const count = colorCounts[color];
    const colorName = colorDisplayName(palette, color, lang);
    if (count > 9) {
      const affected: StickerRef[] = [];
      for (const face of FACE_ORDER) {
        for (let i = 0; i < 9; i++) {
          if (faces[face][i] === color) affected.push({ face, index: i });
        }
      }
      issues.push({
        id: `count-over-${color}`,
        severity: 'error',
        code: 'COLOR_COUNT_EXCEEDED',
        title: isRu
          ? `Слишком много плиток цвета «${colorName}» (${count}/9)`
          : `Too many ${colorName} stickers (${count}/9)`,
        message: isRu
          ? `Цвет «${colorName}» встречается ${count} раз — больше физического максимума в 9 плиток.`
          : `${colorName} appears ${count} times, exceeding the physical maximum of 9 stickers per color.`,
        hint: isRu
          ? `Проверьте плитки цвета «${colorName}» в тени или бликах — часть из них может относиться к похожему оттенку.`
          : `Inspect ${colorName} tiles in warm light or shadow — one or more may belong to another shade on this cube.`,
        affectedStickers: affected,
      });
    } else if (isComplete && count < 9) {
      issues.push({
        id: `count-under-${color}`,
        severity: 'error',
        code: 'COLOR_COUNT_MISMATCH',
        title: isRu
          ? `Не хватает плиток цвета «${colorName}» (${count}/9)`
          : `Missing ${colorName} stickers (${count}/9)`,
        message: isRu
          ? `Цвет «${colorName}» встречается ${count} раз из 9 обязательных на полном кубике.`
          : `${colorName} appears ${count} times out of 9 required on a complete 54-sticker cube.`,
        hint: isRu
          ? 'Проверьте плитки, где другой цвет встретился больше 9 раз.'
          : 'Check tiles where another color appeared more than 9 times.',
        affectedStickers: [],
      });
    }
  }

  // 3. Infer opposite colors strictly from detected centers (color-agnostic!)
  const oppositeColor = new Map<KnownColorId, KnownColorId>();
  const oppFacePairs: [FaceId, FaceId][] = [
    ['U', 'D'],
    ['F', 'B'],
    ['R', 'L'],
  ];
  for (const [f1, f2] of oppFacePairs) {
    const c1 = faces[f1][4];
    const c2 = faces[f2][4];
    if (c1 !== '?' && c2 !== '?' && c1 !== c2) {
      oppositeColor.set(c1, c2);
      oppositeColor.set(c2, c1);
    }
  }

  if (colorSchemeMode === 'standard') {
    for (const c of KNOWN_COLORS) {
      if (!oppositeColor.has(c)) {
        const k = toStandardKey(palette, c);
        if (k) {
          const oppK = STANDARD_OPPOSITE[k];
          const oppId = KNOWN_COLORS.find((id) => toStandardKey(palette, id) === oppK);
          if (oppId) oppositeColor.set(c, oppId);
        }
      }
    }
  }

  // Build reference pieces from the 6 face center stickers (index 4)
  const refEdges: [KnownColorId, KnownColorId][] | null = allCentersKnown
    ? EDGE_SLOTS.map((slot) => [
        faces[slot.stickers[0].face][4] as KnownColorId,
        faces[slot.stickers[1].face][4] as KnownColorId,
      ])
    : null;

  const refCorners: [KnownColorId, KnownColorId, KnownColorId][] | null = allCentersKnown
    ? CORNER_SLOTS.map((slot) => [
        faces[slot.stickers[0].face][4] as KnownColorId,
        faces[slot.stickers[1].face][4] as KnownColorId,
        faces[slot.stickers[2].face][4] as KnownColorId,
      ])
    : null;

  // 4. Edge Validation
  let observedEdges = 0;
  let validEdges = 0;
  const seenEdgeKeys = new Map<string, EdgeSlotDef>();
  const edgePerm: number[] = [];
  const edgeOrient: number[] = [];
  let allEdgesValid = true;

  for (let slotIdx = 0; slotIdx < EDGE_SLOTS.length; slotIdx++) {
    const slot = EDGE_SLOTS[slotIdx];
    const c0 = getSticker(faces, slot.stickers[0]);
    const c1 = getSticker(faces, slot.stickers[1]);

    if (c0 === '?' || c1 === '?') {
      allEdgesValid = false;
      continue;
    }

    observedEdges++;
    const n0 = colorDisplayName(palette, c0, lang);
    const n1 = colorDisplayName(palette, c1, lang);

    if (c0 === c1 || oppositeColor.get(c0) === c1) {
      allEdgesValid = false;
      issues.push({
        id: `invalid-edge-${slot.name}`,
        severity: 'error',
        code: 'INVALID_EDGE',
        title: isRu ? `Невозможное ребро ${slot.name} (${n0}–${n1})` : `Impossible ${slot.name} edge (${n0}–${n1})`,
        message: isRu
          ? `Ребро ${slot.name} сочетает цвета «${n0}» и «${n1}», которые принадлежат одной или противоположным граням и не могут быть на одном ребре.`
          : `The ${slot.name} edge combines ${n0} and ${n1}, which belong to identical or opposite center faces and cannot share an edge cubie.`,
        hint: isRu
          ? 'Проверьте обе плитки этого стыка или угол поворота соседней грани.'
          : 'Check both stickers on this seam or verify whether one of the two faces was rotated.',
        affectedStickers: slot.stickers,
      });
      continue;
    }

    const sortedKey = [c0, c1].sort().join('-');
    const prevSlot = seenEdgeKeys.get(sortedKey);
    if (prevSlot) {
      allEdgesValid = false;
      issues.push({
        id: `dup-edge-${sortedKey}-${slot.name}`,
        severity: 'error',
        code: 'DUPLICATE_EDGE',
        title: isRu ? `Дублирующееся ребро (${n0}/${n1})` : `Duplicate edge piece (${n0}/${n1})`,
        message: isRu
          ? `Ребро ${n0}–${n1} встречается сразу в позициях ${prevSlot.name} и ${slot.name}.`
          : `The ${n0}–${n1} edge appears at both ${prevSlot.name} and ${slot.name}.`,
        hint: isRu
          ? 'Одна из плиток распознана неверно, либо одна из граней повёрнута на 90°/180°.'
          : 'One of these edge stickers was misread or a face is rotated 90°/180° relative to its neighbors.',
        affectedStickers: [...prevSlot.stickers, ...slot.stickers],
      });
      continue;
    }
    seenEdgeKeys.set(sortedKey, slot);

    if (refEdges) {
      const matchIdx = refEdges.findIndex(
        ([r0, r1]) => (r0 === c0 && r1 === c1) || (r0 === c1 && r1 === c0)
      );
      if (matchIdx === -1) {
        allEdgesValid = false;
        issues.push({
          id: `unmatched-edge-${slot.name}`,
          severity: 'error',
          code: 'INVALID_EDGE',
          title: isRu ? `Неопознанное ребро ${slot.name} (${n0}–${n1})` : `Unrecognized ${slot.name} edge (${n0}–${n1})`,
          message: isRu
            ? `Ребро ${n0}–${n1} не соответствует 6 распознанным цветам центров.`
            : `The ${n0}–${n1} edge does not exist given the 6 detected center colors.`,
          hint: isRu
            ? 'Проверьте цвета центров и плиток ребра на этом стыке.'
            : 'Check center colors and edge stickers on this boundary.',
          affectedStickers: slot.stickers,
        });
        continue;
      }
      edgePerm[slotIdx] = matchIdx;
      edgeOrient[slotIdx] = refEdges[matchIdx][0] === c0 ? 0 : 1;
    }

    validEdges++;
  }

  // 5. Corner Validation
  let observedCorners = 0;
  let validCorners = 0;
  const seenCornerKeys = new Map<string, CornerSlotDef>();
  const cornerPerm: number[] = [];
  const cornerTwist: number[] = [];
  let allCornersValid = true;

  for (let slotIdx = 0; slotIdx < CORNER_SLOTS.length; slotIdx++) {
    const slot = CORNER_SLOTS[slotIdx];
    const c0 = getSticker(faces, slot.stickers[0]);
    const c1 = getSticker(faces, slot.stickers[1]);
    const c2 = getSticker(faces, slot.stickers[2]);

    if (c0 === '?' || c1 === '?' || c2 === '?') {
      allCornersValid = false;
      continue;
    }

    observedCorners++;
    const colors: [KnownColorId, KnownColorId, KnownColorId] = [c0, c1, c2];
    const names = colors.map((c) => colorDisplayName(palette, c, lang));

    const hasDup = c0 === c1 || c1 === c2 || c0 === c2;
    const hasOpp =
      oppositeColor.get(c0) === c1 ||
      oppositeColor.get(c1) === c2 ||
      oppositeColor.get(c0) === c2;

    if (hasDup || hasOpp) {
      allCornersValid = false;
      issues.push({
        id: `invalid-corner-${slot.name}`,
        severity: 'error',
        code: 'INVALID_CORNER',
        title: isRu ? `Невозможный угол ${slot.name} (${names.join('–')})` : `Impossible ${slot.name} corner (${names.join('–')})`,
        message: isRu
          ? `Угол ${slot.name} содержит цвета ${names.join(', ')}, которые не могут находиться на одном углу.`
          : `Corner ${slot.name} combines ${names.join(', ')}, which cannot coexist on one corner piece.`,
        hint: isRu
          ? 'Перепроверьте 3 плитки этого угла или ориентацию прилегающих граней.'
          : 'Re-check the 3 stickers meeting at this corner or verify adjacent face rotations.',
        affectedStickers: slot.stickers,
      });
      continue;
    }

    const sortedKey = [...colors].sort().join('-');
    const prevSlot = seenCornerKeys.get(sortedKey);
    if (prevSlot) {
      allCornersValid = false;
      issues.push({
        id: `dup-corner-${sortedKey}-${slot.name}`,
        severity: 'error',
        code: 'DUPLICATE_CORNER',
        title: isRu ? `Дублирующийся угол (${names.join('/')})` : `Duplicate corner piece (${names.join('/')})`,
        message: isRu
          ? `Угол ${names.join('–')} присутствует сразу в позициях ${prevSlot.name} и ${slot.name}.`
          : `The ${names.join('–')} corner appears at both ${prevSlot.name} and ${slot.name}.`,
        hint: isRu
          ? 'Проверьте, не повёрнута ли грань или не перепутаны ли два близких оттенка.'
          : 'Check if a face is rotated or if two similar shades were swapped.',
        affectedStickers: [...prevSlot.stickers, ...slot.stickers],
      });
      continue;
    }
    seenCornerKeys.set(sortedKey, slot);

    if (refCorners) {
      let matchedIdx = -1;
      let matchedTwist = -1;
      let matchedSetButMirrored = false;

      for (let k = 0; k < refCorners.length; k++) {
        const [r0, r1, r2] = refCorners[k];
        if (c0 === r0 && c1 === r1 && c2 === r2) {
          matchedIdx = k;
          matchedTwist = 0;
          break;
        }
        if (c1 === r0 && c2 === r1 && c0 === r2) {
          matchedIdx = k;
          matchedTwist = 1;
          break;
        }
        if (c2 === r0 && c0 === r1 && c1 === r2) {
          matchedIdx = k;
          matchedTwist = 2;
          break;
        }
        if (
          (r0 === c0 || r1 === c0 || r2 === c0) &&
          (r0 === c1 || r1 === c1 || r2 === c1) &&
          (r0 === c2 || r1 === c2 || r2 === c2)
        ) {
          matchedSetButMirrored = true;
        }
      }

      if (matchedIdx === -1) {
        allCornersValid = false;
        if (matchedSetButMirrored) {
          issues.push({
            id: `mirrored-corner-${slot.name}`,
            severity: 'error',
            code: 'MIRRORED_CORNER',
            title: isRu
              ? `Зеркальный порядок цветов на углу ${slot.name} (${names.join('–')})`
              : `Mirrored ${slot.name} corner chirality (${names.join('–')})`,
            message: isRu
              ? `На углу ${slot.name} 3 допустимых цвета идут в обратном циклическом порядке — угол зеркально отражён относительно 6 центров.`
              : `Corner ${slot.name} has 3 valid colors in reverse cyclic order — this corner is physically mirrored relative to the 6 centers.`,
            hint: isRu
              ? 'Возможно, одна из 3 граней отзеркалена или две соседние плитки перепутаны местами.'
              : 'One of the 3 faces meeting at this corner may be flipped/mirrored or two adjacent stickers were transposed.',
            affectedStickers: slot.stickers,
          });
        } else {
          issues.push({
            id: `unmatched-corner-${slot.name}`,
            severity: 'error',
            code: 'INVALID_CORNER',
            title: isRu ? `Неопознанный угол ${slot.name} (${names.join('–')})` : `Unrecognized ${slot.name} corner (${names.join('–')})`,
            message: isRu
              ? `Угол ${slot.name} (${names.join('–')}) не совпадает ни с одним углом для 6 центров.`
              : `Corner ${slot.name} (${names.join('–')}) does not match any valid corner for the 6 center colors.`,
            hint: isRu
              ? 'Проверьте 3 плитки этого угла и цвета 6 центров.'
              : 'Verify the 3 corner stickers and the 6 center colors.',
            affectedStickers: slot.stickers,
          });
        }
        continue;
      }

      cornerPerm[slotIdx] = matchedIdx;
      cornerTwist[slotIdx] = matchedTwist;
    }

    validCorners++;
  }

  // 6. Full Algebraic Solvability Invariants
  let edgeFlipSum: number | null = null;
  let cornerTwistSum: number | null = null;
  let permutationParityMatch: boolean | null = null;

  const canCheckAlgebra =
    isComplete &&
    allCentersKnown &&
    issues.length === 0 &&
    allEdgesValid &&
    allCornersValid &&
    edgePerm.length === 12 &&
    cornerPerm.length === 8;

  if (canCheckAlgebra) {
    edgeFlipSum = edgeOrient.reduce((acc, v) => acc + v, 0);
    if (edgeFlipSum % 2 !== 0) {
      issues.push({
        id: 'edge-flip-parity',
        severity: 'error',
        code: 'EDGE_ORIENTATION_PARITY',
        title: isRu ? 'Нарушение чётности ориентации рёбер' : 'Edge orientation parity violation',
        message: isRu
          ? `Сумма переворотов рёбер равна ${edgeFlipSum} (нечётная). У решаемого кубика количество перевёрнутых рёбер всегда чётное (sum ≡ 0 mod 2).`
          : `Total edge flip sum is ${edgeFlipSum} (odd). A solvable Rubik's Cube always has an even number of flipped edges (sum ≡ 0 mod 2).`,
        hint: isRu
          ? 'Вероятно, у одного из рёбер перепутаны 2 цвета или одна из граней повёрнута на 90°.'
          : 'An edge piece likely has its two colors swapped, or a face is rotated 90° relative to the net.',
        affectedStickers: EDGE_SLOTS.flatMap((e) => e.stickers),
      });
    }

    cornerTwistSum = cornerTwist.reduce((acc, v) => acc + v, 0);
    if (cornerTwistSum % 3 !== 0) {
      issues.push({
        id: 'corner-twist-parity',
        severity: 'error',
        code: 'CORNER_ORIENTATION_PARITY',
        title: isRu ? 'Нарушение чётности скручивания углов' : 'Corner twist parity violation',
        message: isRu
          ? `Сумма поворотов углов равна ${cornerTwistSum} (${cornerTwistSum % 3} mod 3). Для решаемости требуется сумма ≡ 0 mod 3.`
          : `Total corner twist sum is ${cornerTwistSum} (${cornerTwistSum % 3} mod 3). A solvable cube requires corner twist sum ≡ 0 mod 3.`,
        hint: isRu
          ? 'Как минимум одна угловая плитка распознана неверно или угол скручен на месте.'
          : 'At least one corner sticker is misclassified or twisted in place.',
        affectedStickers: CORNER_SLOTS.flatMap((c) => c.stickers),
      });
    }

    const ePar = permutationParity(edgePerm);
    const cPar = permutationParity(cornerPerm);
    permutationParityMatch = ePar === cPar;
    if (!permutationParityMatch) {
      issues.push({
        id: 'perm-parity',
        severity: 'error',
        code: 'PERMUTATION_PARITY',
        title: isRu ? 'Несовпадение чётности перестановок' : 'Permutation parity mismatch',
        message: isRu
          ? `Чётность углов (${cPar === 0 ? 'чётная' : 'нечётная'}) не совпадает с чётностью рёбер (${ePar === 0 ? 'чётная' : 'нечётная'}). Это эквивалентно перестановке двух элементов и не имеет решения.`
          : `Corner permutation parity (${cPar === 0 ? 'even' : 'odd'}) does not match edge permutation parity (${ePar === 0 ? 'even' : 'odd'}). This represents a single swapped pair of pieces, which is unsolvable.`,
        hint: isRu
          ? 'Возможно, перепутаны два ребра/угла или одна из граней повёрнута на 90°.'
          : 'Two edges or corners may be swapped, or one face was rotated 90°.',
        affectedStickers: [],
      });
    }
  }

  const hasErrors = issues.some((i) => i.severity === 'error');
  const isSolvable = isComplete && !hasErrors && canCheckAlgebra;

  let status: ValidationStatus;
  if (hasErrors) {
    status = 'invalid';
  } else if (!isComplete) {
    status = 'partial';
  } else {
    status = 'valid';
  }

  return {
    cubeSize: 3,
    status,
    isComplete,
    isSolvable,
    knownStickerCount,
    scannedFaces,
    unscannedFaces,
    colorCounts,
    centerSummary: {
      distinctCount: centerMap.size,
      allCentersKnown,
      standardChiralValid,
    },
    pieceSummary: {
      observedEdges,
      validEdges,
      observedCorners,
      validCorners,
      edgeFlipSum,
      cornerTwistSum,
      permutationParityMatch,
    },
    issues,
    kociembaString: toKociembaString(faces),
  };
}
