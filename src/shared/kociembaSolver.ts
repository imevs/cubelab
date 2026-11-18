import {
  createSolvedStandardFaces,
  type CubeFaces,
  type KnownColorId,
} from './cubeTypes.ts';
import { CORNER_SLOTS, EDGE_SLOTS, verifyCubeState } from './cubeVerifier.ts';
import {
  applyMoveToFaces,
  cloneFaces,
  describeMove,
  isFacesSolved,
  simplifyStageMoves,
  type MoveToken,
  type SolveResult,
  type SolveStep,
} from './cubeSolver.ts';

interface CubieState {
  cp: Uint8Array; // length 8
  co: Uint8Array; // length 8
  ep: Uint8Array; // length 12
  eo: Uint8Array; // length 12
}

const ALL_MOVES: MoveToken[] = [
  'U', 'U2', "U'",
  'R', 'R2', "R'",
  'F', 'F2', "F'",
  'D', 'D2', "D'",
  'L', 'L2', "L'",
  'B', 'B2', "B'",
];

// Phase 2 G1 subgroup moves: U, U2, U', R2, F2, D, D2, D', L2, B2
const PHASE2_MOVE_INDICES = [0, 1, 2, 4, 7, 9, 10, 11, 13, 16] as const;

const N_TWIST = 2187; // 3^7
const N_FLIP = 2048; // 2^11
const N_SLICE = 495; // C(12, 4)
const N_CP = 40320; // 8!
const N_EP = 40320; // 8!
const N_SLICE_PERM = 24; // 4!

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];

function extractCubieState(faces: CubeFaces): CubieState | null {
  const refEdges: [KnownColorId, KnownColorId][] = EDGE_SLOTS.map((slot) => [
    faces[slot.stickers[0].face][4] as KnownColorId,
    faces[slot.stickers[1].face][4] as KnownColorId,
  ]);
  const refCorners: [KnownColorId, KnownColorId, KnownColorId][] = CORNER_SLOTS.map((slot) => [
    faces[slot.stickers[0].face][4] as KnownColorId,
    faces[slot.stickers[1].face][4] as KnownColorId,
    faces[slot.stickers[2].face][4] as KnownColorId,
  ]);

  const cp = new Uint8Array(8);
  const co = new Uint8Array(8);
  const ep = new Uint8Array(12);
  const eo = new Uint8Array(12);

  for (let i = 0; i < 12; i++) {
    const slot = EDGE_SLOTS[i];
    const c0 = faces[slot.stickers[0].face][slot.stickers[0].index];
    const c1 = faces[slot.stickers[1].face][slot.stickers[1].index];
    let matched = -1;
    let orient = 0;
    for (let k = 0; k < 12; k++) {
      const [r0, r1] = refEdges[k];
      if (r0 === c0 && r1 === c1) {
        matched = k;
        orient = 0;
        break;
      }
      if (r0 === c1 && r1 === c0) {
        matched = k;
        orient = 1;
        break;
      }
    }
    if (matched === -1) return null;
    ep[i] = matched;
    eo[i] = orient;
  }

  for (let i = 0; i < 8; i++) {
    const slot = CORNER_SLOTS[i];
    const c0 = faces[slot.stickers[0].face][slot.stickers[0].index];
    const c1 = faces[slot.stickers[1].face][slot.stickers[1].index];
    const c2 = faces[slot.stickers[2].face][slot.stickers[2].index];
    let matched = -1;
    let twist = 0;
    for (let k = 0; k < 8; k++) {
      const [r0, r1, r2] = refCorners[k];
      if (c0 === r0 && c1 === r1 && c2 === r2) {
        matched = k;
        twist = 0;
        break;
      }
      if (c1 === r0 && c2 === r1 && c0 === r2) {
        matched = k;
        twist = 1;
        break;
      }
      if (c2 === r0 && c0 === r1 && c1 === r2) {
        matched = k;
        twist = 2;
        break;
      }
    }
    if (matched === -1) return null;
    cp[i] = matched;
    co[i] = twist;
  }

  return { cp, co, ep, eo };
}

function multiplyCubie(a: CubieState, b: CubieState): CubieState {
  const cp = new Uint8Array(8);
  const co = new Uint8Array(8);
  const ep = new Uint8Array(12);
  const eo = new Uint8Array(12);

  for (let i = 0; i < 8; i++) {
    const src = b.cp[i];
    cp[i] = a.cp[src];
    co[i] = (a.co[src] + b.co[i]) % 3;
  }
  for (let i = 0; i < 12; i++) {
    const src = b.ep[i];
    ep[i] = a.ep[src];
    eo[i] = (a.eo[src] + b.eo[i]) & 1;
  }
  return { cp, co, ep, eo };
}

function encodeTwist(co: Uint8Array): number {
  let res = 0;
  for (let i = 0; i < 7; i++) {
    res = res * 3 + co[i];
  }
  return res;
}

function decodeTwist(twist: number, co: Uint8Array): void {
  let sum = 0;
  let t = twist;
  for (let i = 6; i >= 0; i--) {
    const val = t % 3;
    co[i] = val;
    sum += val;
    t = Math.floor(t / 3);
  }
  co[7] = (3 - (sum % 3)) % 3;
}

function encodeFlip(eo: Uint8Array): number {
  let res = 0;
  for (let i = 0; i < 11; i++) {
    res = (res << 1) | eo[i];
  }
  return res;
}

function decodeFlip(flip: number, eo: Uint8Array): void {
  let sum = 0;
  let f = flip;
  for (let i = 10; i >= 0; i--) {
    const val = f & 1;
    eo[i] = val;
    sum += val;
    f >>= 1;
  }
  eo[11] = sum & 1;
}

function encodePerm(arr: Uint8Array | number[], len: number, offset = 0): number {
  let code = 0;
  for (let i = 0; i < len - 1; i++) {
    let smaller = 0;
    const val = arr[offset + i];
    for (let j = i + 1; j < len; j++) {
      if (arr[offset + j] < val) smaller++;
    }
    code += smaller * FACT[len - 1 - i];
  }
  return code;
}

function decodePerm(code: number, len: number, out: Uint8Array, baseVal = 0): void {
  const pool: number[] = [];
  for (let i = 0; i < len; i++) pool.push(baseVal + i);
  let rem = code;
  for (let i = 0; i < len; i++) {
    const f = FACT[len - 1 - i];
    const idx = Math.floor(rem / f);
    rem %= f;
    out[i] = pool[idx];
    pool.splice(idx, 1);
  }
}

interface KociembaTables {
  moveCubies: CubieState[];
  maskToSlice: Int16Array;
  twistMove: Int16Array;
  flipMove: Int16Array;
  sliceMove: Int16Array;
  twistSlicePrun: Uint8Array;
  flipSlicePrun: Uint8Array;
  cpMove: Int32Array;
  epMove: Int32Array;
  slicePermMove: Int8Array;
  cpSlicePrun: Uint8Array;
  epSlicePrun: Uint8Array;
}

let cachedTables: KociembaTables | null = null;

function buildPrunTableFast(
  nA: number,
  nB: number,
  nCols: number,
  moveA: Int16Array | Int32Array,
  moveB: Int16Array | Int8Array
): Uint8Array {
  const size = nA * nB;
  const table = new Uint8Array(size);
  table.fill(255);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;

  table[0] = 0;
  queue[tail++] = 0;

  while (head < tail) {
    const curr = queue[head++];
    const nextDepth = table[curr] + 1;
    const a = (curr / nB) | 0;
    const b = curr - a * nB;
    const aOff = a * nCols;
    const bOff = b * nCols;

    for (let col = 0; col < nCols; col++) {
      const nextIdx = moveA[aOff + col] * nB + moveB[bOff + col];
      if (table[nextIdx] === 255) {
        table[nextIdx] = nextDepth;
        queue[tail++] = nextIdx;
      }
    }
  }

  return table;
}

function getTables(): KociembaTables {
  if (cachedTables) return cachedTables;

  // 1. Canonical move cubies derived directly from applyMoveToFaces
  const solvedFaces = createSolvedStandardFaces();
  const moveCubies: CubieState[] = ALL_MOVES.map((m) => {
    const after = applyMoveToFaces(solvedFaces, m);
    const cubie = extractCubieState(after);
    if (!cubie) throw new Error(`Failed to extract move cubie for ${m}`);
    return cubie;
  });

  // 2. 12-bit mask <-> UD-slice index (0..494), with solved mask (bits 8..11 = 0b111100000000 = 3840) mapped to 0!
  const maskToSlice = new Int16Array(4096);
  maskToSlice.fill(-1);
  const sliceMasks = new Int16Array(N_SLICE);

  const solvedMask = (1 << 8) | (1 << 9) | (1 << 10) | (1 << 11);
  maskToSlice[solvedMask] = 0;
  sliceMasks[0] = solvedMask;

  let sliceCounter = 1;
  for (let a = 0; a < 12; a++) {
    for (let b = a + 1; b < 12; b++) {
      for (let c = b + 1; c < 12; c++) {
        for (let d = c + 1; d < 12; d++) {
          const mask = (1 << a) | (1 << b) | (1 << c) | (1 << d);
          if (mask === solvedMask) continue;
          maskToSlice[mask] = sliceCounter;
          sliceMasks[sliceCounter] = mask;
          sliceCounter++;
        }
      }
    }
  }

  // 3. Phase 1 move tables
  const twistMove = new Int16Array(N_TWIST * 18);
  const tmpState: CubieState = {
    cp: new Uint8Array(8),
    co: new Uint8Array(8),
    ep: new Uint8Array(12),
    eo: new Uint8Array(12),
  };

  for (let t = 0; t < N_TWIST; t++) {
    decodeTwist(t, tmpState.co);
    for (let m = 0; m < 18; m++) {
      const mv = moveCubies[m];
      let next = 0;
      for (let i = 0; i < 7; i++) {
        const ori = (tmpState.co[mv.cp[i]] + mv.co[i]) % 3;
        next = next * 3 + ori;
      }
      twistMove[t * 18 + m] = next;
    }
  }

  const flipMove = new Int16Array(N_FLIP * 18);
  for (let f = 0; f < N_FLIP; f++) {
    decodeFlip(f, tmpState.eo);
    for (let m = 0; m < 18; m++) {
      const mv = moveCubies[m];
      let next = 0;
      for (let i = 0; i < 11; i++) {
        const ori = (tmpState.eo[mv.ep[i]] + mv.eo[i]) & 1;
        next = (next << 1) | ori;
      }
      flipMove[f * 18 + m] = next;
    }
  }

  const sliceMove = new Int16Array(N_SLICE * 18);
  for (let s = 0; s < N_SLICE; s++) {
    const mask = sliceMasks[s];
    let lo = 0;
    let hi = 8;
    for (let i = 0; i < 12; i++) {
      tmpState.ep[i] = (mask & (1 << i)) !== 0 ? hi++ : lo++;
    }
    for (let m = 0; m < 18; m++) {
      const mv = moveCubies[m];
      let nextMask = 0;
      for (let i = 0; i < 12; i++) {
        if (tmpState.ep[mv.ep[i]] >= 8) {
          nextMask |= 1 << i;
        }
      }
      sliceMove[s * 18 + m] = maskToSlice[nextMask];
    }
  }

  // 4. Phase 1 pruning tables (BFS from 0)
  const twistSlicePrun = buildPrunTableFast(N_TWIST, N_SLICE, 18, twistMove, sliceMove);
  const flipSlicePrun = buildPrunTableFast(N_FLIP, N_SLICE, 18, flipMove, sliceMove);

  // 5. Phase 2 move tables (10 moves)
  const cpMove = new Int32Array(N_CP * 10);
  const nextCp = new Uint8Array(8);
  for (let c = 0; c < N_CP; c++) {
    decodePerm(c, 8, tmpState.cp, 0);
    for (let p2 = 0; p2 < 10; p2++) {
      const mv = moveCubies[PHASE2_MOVE_INDICES[p2]];
      for (let i = 0; i < 8; i++) nextCp[i] = tmpState.cp[mv.cp[i]];
      cpMove[c * 10 + p2] = encodePerm(nextCp, 8, 0);
    }
  }

  const epMove = new Int32Array(N_EP * 10);
  const nextEp8 = new Uint8Array(8);
  for (let e = 0; e < N_EP; e++) {
    decodePerm(e, 8, tmpState.ep, 0);
    for (let p2 = 0; p2 < 10; p2++) {
      const mv = moveCubies[PHASE2_MOVE_INDICES[p2]];
      for (let i = 0; i < 8; i++) nextEp8[i] = tmpState.ep[mv.ep[i]];
      epMove[e * 10 + p2] = encodePerm(nextEp8, 8, 0);
    }
  }

  const slicePermMove = new Int8Array(N_SLICE_PERM * 10);
  const sliceArr = new Uint8Array(4);
  const nextSlice4 = new Uint8Array(4);
  for (let sp = 0; sp < N_SLICE_PERM; sp++) {
    decodePerm(sp, 4, sliceArr, 8);
    for (let p2 = 0; p2 < 10; p2++) {
      const mv = moveCubies[PHASE2_MOVE_INDICES[p2]];
      for (let i = 0; i < 4; i++) nextSlice4[i] = sliceArr[mv.ep[8 + i] - 8];
      slicePermMove[sp * 10 + p2] = encodePerm(nextSlice4, 4, 0);
    }
  }

  // 6. Phase 2 pruning tables
  const cpSlicePrun = buildPrunTableFast(N_CP, N_SLICE_PERM, 10, cpMove, slicePermMove);
  const epSlicePrun = buildPrunTableFast(N_EP, N_SLICE_PERM, 10, epMove, slicePermMove);

  cachedTables = {
    moveCubies,
    maskToSlice,
    twistMove,
    flipMove,
    sliceMove,
    twistSlicePrun,
    flipSlicePrun,
    cpMove,
    epMove,
    slicePermMove,
    cpSlicePrun,
    epSlicePrun,
  };
  return cachedTables;
}

function canFollowFace(prevFace: number, nextFace: number): boolean {
  if (prevFace === nextFace) return false;
  // Canonical order for commutative opposite faces: U(0)<D(3), R(1)<L(4), F(2)<B(5)
  if (prevFace === 3 && nextFace === 0) return false;
  if (prevFace === 4 && nextFace === 1) return false;
  if (prevFace === 5 && nextFace === 2) return false;
  return true;
}

function getSliceCoord(ep: Uint8Array, maskToSlice: Int16Array): number {
  let mask = 0;
  for (let i = 0; i < 12; i++) {
    if (ep[i] >= 8) mask |= 1 << i;
  }
  return maskToSlice[mask];
}

function searchPhase2(
  tables: KociembaTables,
  startCp: number,
  startEp: number,
  startSp: number,
  maxDepth2: number,
  prevFacePhase1: number
): number[] | null {
  const { cpMove, epMove, slicePermMove, cpSlicePrun, epSlicePrun } = tables;
  const path: number[] = [];

  const minInit = Math.max(
    cpSlicePrun[startCp * N_SLICE_PERM + startSp],
    epSlicePrun[startEp * N_SLICE_PERM + startSp]
  );
  if (minInit === 255 || minInit > maxDepth2) return null;

  const dfs = (cp: number, ep: number, sp: number, rem: number, prevFace: number): boolean => {
    const h = Math.max(
      cpSlicePrun[cp * N_SLICE_PERM + sp],
      epSlicePrun[ep * N_SLICE_PERM + sp]
    );
    if (h > rem) return false;
    if (rem === 0) return cp === 0 && ep === 0 && sp === 0;

    for (let p2 = 0; p2 < 10; p2++) {
      const mIdx = PHASE2_MOVE_INDICES[p2];
      const face = Math.floor(mIdx / 3);
      if (!canFollowFace(prevFace, face)) continue;

      const nCp = cpMove[cp * 10 + p2];
      const nEp = epMove[ep * 10 + p2];
      const nSp = slicePermMove[sp * 10 + p2];
      path.push(mIdx);
      if (dfs(nCp, nEp, nSp, rem - 1, face)) return true;
      path.pop();
    }
    return false;
  };

  for (let depth = minInit; depth <= maxDepth2; depth++) {
    if (dfs(startCp, startEp, startSp, depth, prevFacePhase1)) {
      return path;
    }
  }
  return null;
}

export function solveCubeKociemba(
  initialFaces: CubeFaces,
  lang: 'en' | 'ru' = 'en'
): SolveResult {
  const verification = verifyCubeState(initialFaces, 'auto', undefined, lang);
  if (!verification.isSolvable) {
    return {
      solvable: false,
      alreadySolved: false,
      moves: [],
      steps: [],
      solverMode: 'kociemba',
      error:
        verification.issues[0]?.message ??
        (lang === 'ru'
          ? 'Состояние кубика неполное или некорректное.'
          : 'Cube state is incomplete or invalid.'),
    };
  }

  if (isFacesSolved(initialFaces)) {
    return {
      solvable: true,
      alreadySolved: true,
      moves: [],
      steps: [],
      solverMode: 'kociemba',
    };
  }

  const initCubie = extractCubieState(initialFaces);
  if (!initCubie) {
    return {
      solvable: false,
      alreadySolved: false,
      moves: [],
      steps: [],
      solverMode: 'kociemba',
      error:
        lang === 'ru'
          ? 'Не удалось преобразовать развёртку в модель кубика.'
          : 'Could not map stickers to cubie coordinates.',
    };
  }

  const tables = getTables();
  const { moveCubies, maskToSlice, twistMove, flipMove, sliceMove, twistSlicePrun, flipSlicePrun } =
    tables;

  const startTwist = encodeTwist(initCubie.co);
  const startFlip = encodeFlip(initCubie.eo);
  const startSlice = getSliceCoord(initCubie.ep, maskToSlice);

  const minDepth1 = Math.max(
    twistSlicePrun[startTwist * N_SLICE + startSlice],
    flipSlicePrun[startFlip * N_SLICE + startSlice]
  );

  const best: {
    solution: { phase1: number[]; phase2: number[] } | null;
    len: number;
  } = { solution: null, len: 999 };
  const searchStartMs = Date.now();
  const TIME_BUDGET_MS = 180;
  const TARGET_OPTIMAL_LEN = 20;

  const p1Path: number[] = [];

  const searchPhase1 = (
    twist: number,
    flip: number,
    slice: number,
    rem: number,
    prevFace: number,
    depth1Total: number
  ): void => {
    if (best.solution && best.len <= TARGET_OPTIMAL_LEN) return;
    if (best.solution && Date.now() - searchStartMs > TIME_BUDGET_MS) return;

    const h = Math.max(
      twistSlicePrun[twist * N_SLICE + slice],
      flipSlicePrun[flip * N_SLICE + slice]
    );
    if (h > rem) return;

    if (rem === 0) {
      if (twist !== 0 || flip !== 0 || slice !== 0) return;

      // Apply p1Path to initCubie to get exact Phase 2 starting coordinates
      let cur = initCubie;
      for (let i = 0; i < p1Path.length; i++) {
        cur = multiplyCubie(cur, moveCubies[p1Path[i]]);
      }

      const cpCoord = encodePerm(cur.cp, 8, 0);
      const epCoord = encodePerm(cur.ep, 8, 0);
      const spCoord = encodePerm(
        [cur.ep[8] - 8, cur.ep[9] - 8, cur.ep[10] - 8, cur.ep[11] - 8],
        4,
        0
      );

      const maxD2 = Math.min(18, best.len - 1 - depth1Total);
      if (maxD2 < 0) return;

      const p2 = searchPhase2(tables, cpCoord, epCoord, spCoord, maxD2, prevFace);
      if (p2) {
        const total = depth1Total + p2.length;
        if (total < best.len) {
          best.len = total;
          best.solution = { phase1: [...p1Path], phase2: p2 };
        }
      }
      return;
    }

    // Do not re-enter G1 strictly before the final move of Phase 1
    if (twist === 0 && flip === 0 && slice === 0 && rem < depth1Total) return;

    for (let m = 0; m < 18; m++) {
      const face = Math.floor(m / 3);
      if (!canFollowFace(prevFace, face)) continue;

      p1Path.push(m);
      searchPhase1(
        twistMove[twist * 18 + m],
        flipMove[flip * 18 + m],
        sliceMove[slice * 18 + m],
        rem - 1,
        face,
        depth1Total
      );
      p1Path.pop();

      if (best.solution && best.len <= TARGET_OPTIMAL_LEN) return;
      if (best.solution && Date.now() - searchStartMs > TIME_BUDGET_MS) return;
    }
  };

  for (let d1 = minDepth1; d1 <= 14; d1++) {
    if (best.solution && d1 >= best.len) break;
    if (best.solution && best.len <= TARGET_OPTIMAL_LEN) break;
    if (best.solution && Date.now() - searchStartMs > TIME_BUDGET_MS) break;
    searchPhase1(startTwist, startFlip, startSlice, d1, -1, d1);
  }

  const foundSolution = best.solution;
  if (!foundSolution) {
    return {
      solvable: false,
      alreadySolved: false,
      moves: [],
      steps: [],
      solverMode: 'kociemba',
      error:
        lang === 'ru'
          ? 'Двухфазный решатель не смог найти решение в рамках лимита времени.'
          : 'Two-Phase solver could not find a solution within the time budget.',
    };
  }

  const rawItems = simplifyStageMoves([
    ...foundSolution.phase1.map((m) => ({
      move: ALL_MOVES[m],
      stage: 'Kociemba Phase 1',
    })),
    ...foundSolution.phase2.map((m) => ({
      move: ALL_MOVES[m],
      stage: 'Kociemba Phase 2',
    })),
  ]);

  let cursor = cloneFaces(initialFaces);
  const steps: SolveStep[] = rawItems.map((item, idx) => {
    cursor = applyMoveToFaces(cursor, item.move);
    return {
      index: idx + 1,
      move: item.move,
      stage: item.stage,
      description: describeMove(item.move),
      facesAfter: cloneFaces(cursor),
    };
  });

  if (!isFacesSolved(cursor)) {
    return {
      solvable: false,
      alreadySolved: false,
      moves: [],
      steps: [],
      solverMode: 'kociemba',
      error:
        lang === 'ru'
          ? 'Внутренняя ошибка проверки решения Kociemba.'
          : 'Internal verification error for Kociemba solution.',
    };
  }

  return {
    solvable: true,
    alreadySolved: false,
    moves: steps.map((s) => s.move),
    steps,
    solverMode: 'kociemba',
  };
}
