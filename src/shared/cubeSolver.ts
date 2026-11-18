import type { CubeColor, CubeFaces, FaceGrid, FaceId } from './cubeTypes.ts';
import { FACE_ORDER } from './cubeTypes.ts';
import { CORNER_SLOTS, EDGE_SLOTS, verifyCubeState } from './cubeVerifier.ts';

export type BaseMove = 'U' | 'D' | 'R' | 'L' | 'F' | 'B';
export type MoveToken =
  | 'U' | "U'" | 'U2'
  | 'D' | "D'" | 'D2'
  | 'R' | "R'" | 'R2'
  | 'L' | "L'" | 'L2'
  | 'F' | "F'" | 'F2'
  | 'B' | "B'" | 'B2';

export interface SolveStep {
  index: number; // 1-based step index
  move: MoveToken;
  stage: string;
  description: string;
  facesAfter: CubeFaces;
}

export type SolverMode = 'lbl' | 'kociemba';

export interface SolveResult {
  solvable: boolean;
  alreadySolved: boolean;
  moves: MoveToken[];
  steps: SolveStep[];
  solverMode?: SolverMode;
  error?: string;
}

export function cloneFaces(faces: CubeFaces): CubeFaces {
  return {
    U: [...faces.U] as FaceGrid,
    R: [...faces.R] as FaceGrid,
    F: [...faces.F] as FaceGrid,
    D: [...faces.D] as FaceGrid,
    L: [...faces.L] as FaceGrid,
    B: [...faces.B] as FaceGrid,
  };
}

function rotateGridCW(g: FaceGrid): FaceGrid {
  if (g.length === 4) {
    return [g[2], g[0], g[3], g[1]];
  }
  return [
    g[6], g[3], g[0],
    g[7], g[4], g[1],
    g[8], g[5], g[2],
  ];
}

function applyQuarterCW(faces: CubeFaces, base: BaseMove): CubeFaces {
  const next = cloneFaces(faces);
  next[base] = rotateGridCW(faces[base]);

  if (faces[base].length === 4) {
    if (base === 'U') {
      for (const i of [0, 1]) {
        next.L[i] = faces.F[i];
        next.B[i] = faces.L[i];
        next.R[i] = faces.B[i];
        next.F[i] = faces.R[i];
      }
    } else if (base === 'D') {
      for (const i of [2, 3]) {
        next.R[i] = faces.F[i];
        next.B[i] = faces.R[i];
        next.L[i] = faces.B[i];
        next.F[i] = faces.L[i];
      }
    } else if (base === 'R') {
      const fCol = [faces.F[1], faces.F[3]];
      const uCol = [faces.U[1], faces.U[3]];
      const bCol = [faces.B[2], faces.B[0]];
      const dCol = [faces.D[1], faces.D[3]];
      [next.U[1], next.U[3]] = fCol;
      [next.B[2], next.B[0]] = uCol;
      [next.D[1], next.D[3]] = bCol;
      [next.F[1], next.F[3]] = dCol;
    } else if (base === 'L') {
      const uCol = [faces.U[0], faces.U[2]];
      const fCol = [faces.F[0], faces.F[2]];
      const dCol = [faces.D[0], faces.D[2]];
      const bCol = [faces.B[3], faces.B[1]];
      [next.F[0], next.F[2]] = uCol;
      [next.D[0], next.D[2]] = fCol;
      [next.B[3], next.B[1]] = dCol;
      [next.U[0], next.U[2]] = bCol;
    } else if (base === 'F') {
      const uRow = [faces.U[2], faces.U[3]];
      const rCol = [faces.R[0], faces.R[2]];
      const dRow = [faces.D[1], faces.D[0]];
      const lCol = [faces.L[3], faces.L[1]];
      [next.R[0], next.R[2]] = uRow;
      [next.D[1], next.D[0]] = rCol;
      [next.L[3], next.L[1]] = dRow;
      [next.U[2], next.U[3]] = lCol;
    } else if (base === 'B') {
      const uRow = [faces.U[1], faces.U[0]];
      const lCol = [faces.L[0], faces.L[2]];
      const dRow = [faces.D[2], faces.D[3]];
      const rCol = [faces.R[3], faces.R[1]];
      [next.L[0], next.L[2]] = uRow;
      [next.D[2], next.D[3]] = lCol;
      [next.R[3], next.R[1]] = dRow;
      [next.U[1], next.U[0]] = rCol;
    }
    return next;
  }

  if (base === 'U') {
    for (const i of [0, 1, 2]) {
      next.L[i] = faces.F[i];
      next.B[i] = faces.L[i];
      next.R[i] = faces.B[i];
      next.F[i] = faces.R[i];
    }
  } else if (base === 'D') {
    for (const i of [6, 7, 8]) {
      next.R[i] = faces.F[i];
      next.B[i] = faces.R[i];
      next.L[i] = faces.B[i];
      next.F[i] = faces.L[i];
    }
  } else if (base === 'R') {
    const fCol = [faces.F[2], faces.F[5], faces.F[8]];
    const uCol = [faces.U[2], faces.U[5], faces.U[8]];
    const bCol = [faces.B[6], faces.B[3], faces.B[0]];
    const dCol = [faces.D[2], faces.D[5], faces.D[8]];
    [next.U[2], next.U[5], next.U[8]] = fCol;
    [next.B[6], next.B[3], next.B[0]] = uCol;
    [next.D[2], next.D[5], next.D[8]] = bCol;
    [next.F[2], next.F[5], next.F[8]] = dCol;
  } else if (base === 'L') {
    const uCol = [faces.U[0], faces.U[3], faces.U[6]];
    const fCol = [faces.F[0], faces.F[3], faces.F[6]];
    const dCol = [faces.D[0], faces.D[3], faces.D[6]];
    const bCol = [faces.B[8], faces.B[5], faces.B[2]];
    [next.F[0], next.F[3], next.F[6]] = uCol;
    [next.D[0], next.D[3], next.D[6]] = fCol;
    [next.B[8], next.B[5], next.B[2]] = dCol;
    [next.U[0], next.U[3], next.U[6]] = bCol;
  } else if (base === 'F') {
    const uRow = [faces.U[6], faces.U[7], faces.U[8]];
    const rCol = [faces.R[0], faces.R[3], faces.R[6]];
    const dRow = [faces.D[2], faces.D[1], faces.D[0]];
    const lCol = [faces.L[8], faces.L[5], faces.L[2]];
    [next.R[0], next.R[3], next.R[6]] = uRow;
    [next.D[2], next.D[1], next.D[0]] = rCol;
    [next.L[8], next.L[5], next.L[2]] = dRow;
    [next.U[6], next.U[7], next.U[8]] = lCol;
  } else if (base === 'B') {
    const uRow = [faces.U[2], faces.U[1], faces.U[0]];
    const lCol = [faces.L[0], faces.L[3], faces.L[6]];
    const dRow = [faces.D[6], faces.D[7], faces.D[8]];
    const rCol = [faces.R[8], faces.R[5], faces.R[2]];
    [next.L[0], next.L[3], next.L[6]] = uRow;
    [next.D[6], next.D[7], next.D[8]] = lCol;
    [next.R[8], next.R[5], next.R[2]] = dRow;
    [next.U[2], next.U[1], next.U[0]] = rCol;
  }

  return next;
}

export function applyMoveToFaces(faces: CubeFaces, move: MoveToken): CubeFaces {
  const base = move[0] as BaseMove;
  const count = move.endsWith('2') ? 2 : move.endsWith("'") ? 3 : 1;
  let curr = faces;
  for (let i = 0; i < count; i++) {
    curr = applyQuarterCW(curr, base);
  }
  return curr;
}

export function isFacesSolved(faces: CubeFaces): boolean {
  return FACE_ORDER.every((f) => {
    const first = faces[f][0];
    if (!first || first === '?') return false;
    return faces[f].every((c) => c === first);
  });
}

function edgeSolved(faces: CubeFaces, edgeName: string): boolean {
  const slot = EDGE_SLOTS.find((e) => e.name === edgeName)!;
  const s0 = slot.stickers[0];
  const s1 = slot.stickers[1];
  return (
    faces[s0.face][s0.index] === faces[s0.face][4] &&
    faces[s1.face][s1.index] === faces[s1.face][4]
  );
}

function cornerSolved(faces: CubeFaces, cornerName: string): boolean {
  const slot = CORNER_SLOTS.find((c) => c.name === cornerName)!;
  return slot.stickers.every((s) => faces[s.face][s.index] === faces[s.face][4]);
}

function findEdgeSlot(
  faces: CubeFaces,
  cA: CubeColor,
  cB: CubeColor
): { name: string; c0: CubeColor; c1: CubeColor } | null {
  for (const slot of EDGE_SLOTS) {
    const c0 = faces[slot.stickers[0].face][slot.stickers[0].index];
    const c1 = faces[slot.stickers[1].face][slot.stickers[1].index];
    if ((c0 === cA && c1 === cB) || (c0 === cB && c1 === cA)) {
      return { name: slot.name, c0, c1 };
    }
  }
  return null;
}

function findCornerSlot(
  faces: CubeFaces,
  cA: CubeColor,
  cB: CubeColor,
  cC: CubeColor
): { name: string; colors: [CubeColor, CubeColor, CubeColor] } | null {
  const target = new Set([cA, cB, cC]);
  for (const slot of CORNER_SLOTS) {
    const colors: [CubeColor, CubeColor, CubeColor] = [
      faces[slot.stickers[0].face][slot.stickers[0].index],
      faces[slot.stickers[1].face][slot.stickers[1].index],
      faces[slot.stickers[2].face][slot.stickers[2].index],
    ];
    if (target.has(colors[0]) && target.has(colors[1]) && target.has(colors[2])) {
      return { name: slot.name, colors };
    }
  }
  return null;
}

interface RawStep {
  move: MoveToken;
  stage: string;
}

const ALL_MOVES: MoveToken[] = [
  'U', "U'", 'U2',
  'D', "D'", 'D2',
  'R', "R'", 'R2',
  'L', "L'", 'L2',
  'F', "F'" , 'F2',
  'B', "B'", 'B2',
];

function bfsSolveGoal(
  start: CubeFaces,
  maxDepth: number,
  allowedMoves: MoveToken[],
  goalFn: (f: CubeFaces) => boolean
): MoveToken[] | null {
  if (goalFn(start)) return [];
  interface Node {
    faces: CubeFaces;
    moves: MoveToken[];
    lastBase: BaseMove | null;
  }
  const queue: Node[] = [{ faces: start, moves: [], lastBase: null }];
  let head = 0;

  while (head < queue.length) {
    const node = queue[head++];
    if (node.moves.length >= maxDepth) continue;

    for (const mv of allowedMoves) {
      const base = mv[0] as BaseMove;
      if (node.lastBase === base) continue;
      // Avoid commuting redundant order on opposite faces
      if (
        (node.lastBase === 'D' && base === 'U') ||
        (node.lastBase === 'L' && base === 'R') ||
        (node.lastBase === 'B' && base === 'F')
      ) {
        continue;
      }
      const nextFaces = applyMoveToFaces(node.faces, mv);
      const nextMoves = [...node.moves, mv];
      if (goalFn(nextFaces)) {
        return nextMoves;
      }
      if (nextMoves.length < maxDepth) {
        queue.push({ faces: nextFaces, moves: nextMoves, lastBase: base });
      }
    }
  }
  return null;
}

export function simplifyStageMoves(steps: RawStep[]): RawStep[] {
  const out: RawStep[] = [];
  for (const step of steps) {
    if (out.length === 0) {
      out.push(step);
      continue;
    }
    const prev = out[out.length - 1];
    if (prev.move[0] === step.move[0]) {
      const toNum = (m: MoveToken) => (m.endsWith('2') ? 2 : m.endsWith("'") ? 3 : 1);
      const sum = (toNum(prev.move) + toNum(step.move)) % 4;
      out.pop();
      if (sum === 1) out.push({ move: prev.move[0] as MoveToken, stage: step.stage });
      else if (sum === 2) out.push({ move: `${prev.move[0]}2` as MoveToken, stage: step.stage });
      else if (sum === 3) out.push({ move: `${prev.move[0]}'` as MoveToken, stage: step.stage });
    } else {
      out.push(step);
    }
  }
  return out;
}

export function describeMove(move: MoveToken): string {
  const faceNames: Record<BaseMove, string> = {
    U: 'Up (Top)',
    D: 'Down (Bottom)',
    R: 'Right',
    L: 'Left',
    F: 'Front',
    B: 'Back',
  };
  const base = move[0] as BaseMove;
  if (move.endsWith('2')) return `Rotate ${faceNames[base]} face 180°`;
  if (move.endsWith("'")) return `Rotate ${faceNames[base]} face 90° counter-clockwise`;
  return `Rotate ${faceNames[base]} face 90° clockwise`;
}

export function solveCube(initialFaces: CubeFaces, lang: 'en' | 'ru' = 'en'): SolveResult {
  const verification = verifyCubeState(initialFaces, 'auto', undefined, lang);
  if (!verification.isComplete || !verification.isSolvable) {
    return {
      solvable: false,
      alreadySolved: false,
      moves: [],
      steps: [],
      solverMode: 'lbl',
      error:
        verification.issues[0]?.message ??
        (lang === 'ru'
          ? 'Для решения кубик должен содержать все 54 корректные плитки.'
          : 'Cube state must have all 54 valid stickers before solving.'),
    };
  }

  if (isFacesSolved(initialFaces)) {
    return {
      solvable: true,
      alreadySolved: true,
      moves: [],
      steps: [],
      solverMode: 'lbl',
    };
  }

  let state = cloneFaces(initialFaces);
  const rawSteps: RawStep[] = [];

  const pushMoves = (moves: MoveToken[], stage: string) => {
    for (const m of moves) {
      state = applyMoveToFaces(state, m);
      rawSteps.push({ move: m, stage });
    }
  };

  // --- STAGE 1: Top Cross (UF, UR, UB, UL) ---
  const topEdges: Array<{ name: string; sideFace: FaceId; cwSide: MoveToken; ccwSide: MoveToken; d2Side: MoveToken }> = [
    { name: 'UF', sideFace: 'F', cwSide: 'F', ccwSide: "F'", d2Side: 'F2' },
    { name: 'UR', sideFace: 'R', cwSide: 'R', ccwSide: "R'", d2Side: 'R2' },
    { name: 'UB', sideFace: 'B', cwSide: 'B', ccwSide: "B'", d2Side: 'B2' },
    { name: 'UL', sideFace: 'L', cwSide: 'L', ccwSide: "L'", d2Side: 'L2' },
  ];

  // Solve first top edge freely with short BFS, then subsequent ones preserving prior top edges
  for (let idx = 0; idx < topEdges.length; idx++) {
    const target = topEdges[idx];
    const preserved = topEdges.slice(0, idx).map((e) => e.name);
    if (edgeSolved(state, target.name)) continue;

    // Try fast bounded BFS preserving prior U-edges
    const fast = bfsSolveGoal(state, idx === 0 ? 4 : 5, ALL_MOVES, (f) => {
      if (!edgeSolved(f, target.name)) return false;
      return preserved.every((p) => edgeSolved(f, p));
    });

    if (fast) {
      pushMoves(fast, '01. Top Cross');
      continue;
    }

    // Deterministic fallback: bring piece to D layer without breaking preserved U-edges, align, insert
    const uColor = state.U[4];
    const sColor = state[target.sideFace][4];
    let guard = 0;
    while (!edgeSolved(state, target.name) && guard++ < 8) {
      const loc = findEdgeSlot(state, uColor, sColor)!;
      if (loc.name.startsWith('U')) {
        // Eject from wrong U slot to D layer
        const sideMap: Record<string, MoveToken> = { UF: 'F2', UR: 'R2', UB: 'B2', UL: 'L2' };
        pushMoves([sideMap[loc.name]], '01. Top Cross');
      } else if (!loc.name.startsWith('D')) {
        // Middle layer edge (FR, FL, BR, BL): eject cleanly to D and restore
        const ejectMap: Record<string, MoveToken[]> = {
          FR: ["R'", 'D', 'R'],
          FL: ['L', 'D', "L'"],
          BR: ['R', 'D', "R'"],
          BL: ["L'", 'D', 'L'],
        };
        const sliceSide: Record<string, string> = { FR: 'UR', FL: 'UL', BR: 'UR', BL: 'UL' };
        const seq = ejectMap[loc.name];
        if (preserved.includes(sliceSide[loc.name])) {
          pushMoves(seq, '01. Top Cross');
        } else {
          pushMoves([seq[0], 'D'], '01. Top Cross');
        }
      } else {
        // On D layer: rotate D until under target.sideFace
        const dOrder = ['DF', 'DR', 'DB', 'DL'];
        const currIdx = dOrder.indexOf(loc.name);
        const targetIdx = dOrder.indexOf(`D${target.sideFace}`);
        const diff = (targetIdx - currIdx + 4) % 4;
        if (diff === 1) pushMoves(['D'], '01. Top Cross');
        else if (diff === 2) pushMoves(['D2'], '01. Top Cross');
        else if (diff === 3) pushMoves(["D'"], '01. Top Cross');

        const slotNow = EDGE_SLOTS.find((e) => e.name === `D${target.sideFace}`)!;
        const dSticker = state[slotNow.stickers[0].face][slotNow.stickers[0].index];
        if (dSticker === uColor) {
          pushMoves([target.d2Side], '01. Top Cross');
        } else {
          // Flipped on D layer: insert cleanly while restoring adjacent U edge
          const flipInsert: Record<string, MoveToken[]> = {
            UF: ['D', 'R', "F'", "R'"],
            UR: ['D', 'B', "R'", "B'"],
            UB: ['D', 'L', "B'", "L'"],
            UL: ['D', 'F', "L'", "F'"],
          };
          pushMoves(flipInsert[target.name], '01. Top Cross');
        }
      }
    }
  }

  // --- STAGE 2: Top Corners (UFR, UFL, UBL, UBR) ---
  const topCorners: Array<{
    name: string;
    fA: FaceId;
    fB: FaceId;
    // Right-hand & left-hand triggers to insert from DFR-equivalent slot below `name`
    // Slot below each U corner: UFR -> DFR, UFL -> DFL, UBL -> DBL, UBR -> DBR
    belowName: string;
    ejectSeq: MoveToken[];
    insertU: MoveToken[]; // when U-color is on side fB (right of corner looking from outside)
    insertSideA: MoveToken[]; // when U-color is on side fA (left of corner)
    insertDown: MoveToken[]; // when U-color faces D
  }> = [
    {
      name: 'UFR',
      fA: 'F',
      fB: 'R',
      belowName: 'DFR',
      ejectSeq: ["R'", "D'", 'R'],
      insertU: ['D', 'F', "D'", "F'"],
      insertSideA: ["D'", "R'", 'D', 'R'],
      insertDown: ["R'", 'D2', 'R', 'D', "R'", "D'", 'R'],
    },
    {
      name: 'UFL',
      fA: 'L',
      fB: 'F',
      belowName: 'DFL',
      ejectSeq: ["F'", "D'", 'F'],
      insertU: ['D', 'L', "D'", "L'"],
      insertSideA: ["D'", "F'", 'D', 'F'],
      insertDown: ["F'", 'D2', 'F', 'D', "F'", "D'", 'F'],
    },
    {
      name: 'UBL',
      fA: 'B',
      fB: 'L',
      belowName: 'DBL',
      ejectSeq: ["L'", "D'", 'L'],
      insertU: ['D', 'B', "D'", "B'"],
      insertSideA: ["D'", "L'", 'D', 'L'],
      insertDown: ["L'", 'D2', 'L', 'D', "L'", "D'", 'L'],
    },
    {
      name: 'UBR',
      fA: 'R',
      fB: 'B',
      belowName: 'DBR',
      ejectSeq: ["B'", "D'", 'B'],
      insertU: ['D', 'R', "D'", "R'"],
      insertSideA: ["D'", "B'", 'D', 'B'],
      insertDown: ["B'", 'D2', 'B', 'D', "B'", "D'", 'B'],
    },
  ];

  const dCornerRing = ['DFR', 'DBR', 'DBL', 'DFL'];
  const uCornerEject: Record<string, MoveToken[]> = {
    UFR: ["R'", "D'", 'R'],
    UFL: ["F'", "D'", 'F'],
    UBL: ["L'", "D'", 'L'],
    UBR: ["B'", "D'", 'B'],
  };

  for (const tc of topCorners) {
    let guard = 0;
    const uColor = state.U[4];
    const cA = state[tc.fA][4];
    const cB = state[tc.fB][4];

    while (!cornerSolved(state, tc.name) && guard++ < 6) {
      const loc = findCornerSlot(state, uColor, cA, cB)!;
      if (loc.name.startsWith('U')) {
        pushMoves(uCornerEject[loc.name], '02. Top Corners');
        continue;
      }
      // Rotate D to move corner into tc.belowName
      const currIdx = dCornerRing.indexOf(loc.name);
      const targetIdx = dCornerRing.indexOf(tc.belowName);
      // Note: D cw sends DFL -> DFR -> DBR -> DBL -> DFL!
      const cwOrder = ['DFL', 'DFR', 'DBR', 'DBL'];
      const diff = (cwOrder.indexOf(tc.belowName) - cwOrder.indexOf(loc.name) + 4) % 4;
      if (diff === 1) pushMoves(['D'], '02. Top Corners');
      else if (diff === 2) pushMoves(['D2'], '02. Top Corners');
      else if (diff === 3) pushMoves(["D'"], '02. Top Corners');
      void currIdx;
      void targetIdx;

      // Inspect where uColor sits in tc.belowName
      const slot = CORNER_SLOTS.find((s) => s.name === tc.belowName)!;
      const dFaceCol = state[slot.stickers[0].face][slot.stickers[0].index];
      const leftFaceCol = state[slot.stickers[1].face][slot.stickers[1].index];
      // Note: in CORNER_SLOTS for D: DFR=[D2, F8, R6], DFL=[D0, L8, F6], DBL=[D6, B8, L6], DBR=[D8, R8, B6]
      // stickers[1] is ALWAYS fA (left face looking from outside at D-corner: F for DFR, L for DFL, B for DBL, R for DBR)!
      // stickers[2] is ALWAYS fB (right face: R for DFR, F for DFL, L for DBL, B for DBR)!
      if (dFaceCol === uColor) {
        pushMoves(tc.insertDown, '02. Top Corners');
      } else if (leftFaceCol === uColor) {
        pushMoves(tc.insertSideA, '02. Top Corners');
      } else {
        pushMoves(tc.insertU, '02. Top Corners');
      }
    }
  }

  // --- STAGE 3: Middle Layer Edges (FR, FL, BR, BL) ---
  // Working with U on top & D on bottom:
  // To insert from DF -> FR: D' R' D R D F D' F'
  // Wait: verify! Looking at F with D on bottom:
  // D' brings DF to DR? No, D cw sends F6->R6 (DF->DR), so D' sends DF->DL!
  // Let's verify insert from `DF` into `FR` (so F1->F5? No, F7->F5, D1->R3):
  // Standard U-top/D-bottom right-insertion from `DF` -> `FR`:
  // Wait: flip cube mentally so D is on top! On D-top, `F` is still front, `R` becomes LEFT (`L_view`)!
  // Inserting from `UF_view` into `FL_view` (left slot!): `U' L' U L U F U' F'` -> in our cube where `U_view = D` and `L_view = R`:
  // **`D' R' D R D F D' F'`**!! Let's double check!
  // And inserting from `DF` -> `FL` (right slot in D-top view!): **`D L D' L' D' F' D F`**!
  const midEdges: Array<{
    name: string;
    fLeft: FaceId; // primary face of EDGE_SLOT (F for FR/FL, B for BR/BL)
    fRight: FaceId;
    fromLeftEdge: string; // D-edge whose side matches fLeft center
    insertFromLeft: MoveToken[];
    fromRightEdge: string;
    insertFromRight: MoveToken[];
  }> = [
    {
      name: 'FR',
      fLeft: 'F',
      fRight: 'R',
      fromLeftEdge: 'DF',
      insertFromLeft: ["D'", "R'", 'D', 'R', 'D', 'F', "D'", "F'"],
      fromRightEdge: 'DR',
      insertFromRight: ['D', 'F', "D'", "F'", "D'", "R'", 'D', 'R'],
    },
    {
      name: 'FL',
      fLeft: 'L',
      fRight: 'F',
      fromLeftEdge: 'DL',
      insertFromLeft: ["D'", "F'", 'D', 'F', 'D', 'L', "D'", "L'"],
      fromRightEdge: 'DF',
      insertFromRight: ['D', 'L', "D'", "L'", "D'", "F'", 'D', 'F'],
    },
    {
      name: 'BL',
      fLeft: 'B',
      fRight: 'L',
      fromLeftEdge: 'DB',
      insertFromLeft: ["D'", "L'", 'D', 'L', 'D', 'B', "D'", "B'"],
      fromRightEdge: 'DL',
      insertFromRight: ['D', 'B', "D'", "B'", "D'", "L'", 'D', 'L'],
    },
    {
      name: 'BR',
      fLeft: 'R',
      fRight: 'B',
      fromLeftEdge: 'DR',
      insertFromLeft: ["D'", "B'", 'D', 'B', 'D', 'R', "D'", "R'"],
      fromRightEdge: 'DB',
      insertFromRight: ['D', 'R', "D'", "R'", "D'", "B'", 'D', 'B'],
    },
  ];

  const midEjectSeq: Record<string, MoveToken[]> = {
    FR: ["D'", "R'", 'D', 'R', 'D', 'F', "D'", "F'"],
    FL: ['D', 'L', "D'", "L'", "D'", "F'", 'D', 'F'],
    BL: ["D'", "L'", 'D', 'L', 'D', 'B', "D'", "B'"],
    BR: ['D', 'R', "D'", "R'", "D'", "B'", 'D', 'B'],
  };

  for (const me of midEdges) {
    let guard = 0;
    const cL = state[me.fLeft][4];
    const cR = state[me.fRight][4];
    while (!edgeSolved(state, me.name) && guard++ < 5) {
      const loc = findEdgeSlot(state, cL, cR)!;
      if (!loc.name.startsWith('D')) {
        // Eject from wrong middle slot (or flipped in place)
        pushMoves(midEjectSeq[loc.name], '03. Middle Layer Edges');
        continue;
      }
      // Look at which color is on the side (NOT D face)
      const dSlot = EDGE_SLOTS.find((s) => s.name === loc.name)!;
      const sideCol = state[dSlot.stickers[1].face][dSlot.stickers[1].index];
      const targetDEdge = sideCol === cL ? me.fromLeftEdge : me.fromRightEdge;

      const dOrder = ['DF', 'DR', 'DB', 'DL'];
      const diff = (dOrder.indexOf(targetDEdge) - dOrder.indexOf(loc.name) + 4) % 4;
      if (diff === 1) pushMoves(['D'], '03. Middle Layer Edges');
      else if (diff === 2) pushMoves(['D2'], '03. Middle Layer Edges');
      else if (diff === 3) pushMoves(["D'"], '03. Middle Layer Edges');

      pushMoves(
        sideCol === cL ? me.insertFromLeft : me.insertFromRight,
        '03. Middle Layer Edges'
      );
    }
  }

  // --- STAGE 4: Bottom Cross Orientation (D[1], D[3], D[5], D[7] == D[4]) ---
  // With D on top (z2), F R U R' U' F' becomes F L D L' D' F'
  {
    const dColor = state.D[4];
    let guard = 0;
    while (guard++ < 4) {
      const top = state.D[1] === dColor; // DF
      const right = state.D[5] === dColor; // DR
      const bottom = state.D[7] === dColor; // DB
      const left = state.D[3] === dColor; // DL
      if (top && right && bottom && left) break;

      if (!top && !right && !bottom && !left) {
        pushMoves(['F', 'L', 'D', "L'", "D'", "F'"], '04. Bottom Cross');
      } else if (left && right && !top && !bottom) {
        // Horizontal line in D-view: apply F L D L' D' F'
        pushMoves(['F', 'L', 'D', "L'", "D'", "F'"], '04. Bottom Cross');
      } else if (top && bottom && !left && !right) {
        pushMoves(['D', 'F', 'L', 'D', "L'", "D'", "F'"], '04. Bottom Cross');
      } else {
        // L-shape: put the two oriented edges at left (D[3]) and bottom (D[7]) or top-left in D-view?
        // F L D L' D' F' on D-top (with F front, L right):
        // Check: in standard U-top, F R U R' U' F' needs L-shape at Back (U1) and Left (U3).
        // Under z2 (D-top, F-front, L-right, R-left, B-back): Back=D[7], Left=D[5]!
        // So rotate D until D[7] and D[5] are the L-shape!
        if (top && left) pushMoves(['D2'], '04. Bottom Cross');
        else if (top && right) pushMoves(['D'], '04. Bottom Cross');
        else if (bottom && left) pushMoves(["D'"], '04. Bottom Cross');
        pushMoves(['F', 'L', 'D', "L'", "D'", "F'"], '04. Bottom Cross');
      }
    }
  }

  // --- STAGE 5: Bottom Cross Permutation (align DF, DR, DB, DL with centers) ---
  {
    let guard = 0;
    const fCol = state.F[4];
    const rCol = state.R[4];
    const bCol = state.B[4];
    const lCol = state.L[4];

    while (guard++ < 8) {
      // Try rotating D to match >= 2 edges
      let bestRot = 0;
      let bestMatches = -1;
      for (let r = 0; r < 4; r++) {
        let test = state;
        for (let k = 0; k < r; k++) test = applyMoveToFaces(test, 'D');
        const matches =
          (test.F[7] === fCol ? 1 : 0) +
          (test.R[7] === rCol ? 1 : 0) +
          (test.B[7] === bCol ? 1 : 0) +
          (test.L[7] === lCol ? 1 : 0);
        if (matches > bestMatches) {
          bestMatches = matches;
          bestRot = r;
        }
      }
      if (bestRot === 1) pushMoves(['D'], '05. Bottom Edge Alignment');
      else if (bestRot === 2) pushMoves(['D2'], '05. Bottom Edge Alignment');
      else if (bestRot === 3) pushMoves(["D'"], '05. Bottom Edge Alignment');

      const mF = state.F[7] === fCol;
      const mR = state.R[7] === rCol;
      const mB = state.B[7] === bCol;
      const mL = state.L[7] === lCol;

      if (mF && mR && mB && mL) break;

      // Sune on D (z2 of R U R' U R U2 R'): L D L' D L D2 L'
      // Standard U-top Sune fixes Back (U1) & Right (U5) and cycles Front, Left, Back? Wait:
      // Standard R U R' U R U2 R' keeps U5 (Right)? No: keeps U1 (Back) & U5 (Right)? Let's apply and let loop converge with D!
      // Specifically: if opposite edges match (mF && mB, or mL && mR), apply Sune once to get adjacent match!
      // If adjacent edges match: put the two matching edges at Back (B7) and Right (R7? under z2: Left is L7? Wait: let's just orient so matching pair is at B7 & L7, or test which D rotation + Sune yields 4 matches!).
      let applied = false;
      const sune: MoveToken[] = ['L', 'D', "L'", 'D', 'L', 'D2', "L'"];
      for (let pre = 0; pre < 4; pre++) {
        let cand = state;
        const preMoves: MoveToken[] = pre === 1 ? ['D'] : pre === 2 ? ['D2'] : pre === 3 ? ["D'"] : [];
        for (const m of preMoves) cand = applyMoveToFaces(cand, m);
        for (const m of sune) cand = applyMoveToFaces(cand, m);
        // Check if any D rotation after Sune solves all 4 edges
        for (let post = 0; post < 4; post++) {
          let after = cand;
          const postMoves: MoveToken[] = post === 1 ? ['D'] : post === 2 ? ['D2'] : post === 3 ? ["D'"] : [];
          for (const m of postMoves) after = applyMoveToFaces(after, m);
          if (
            after.F[7] === fCol &&
            after.R[7] === rCol &&
            after.B[7] === bCol &&
            after.L[7] === lCol
          ) {
            pushMoves([...preMoves, ...sune, ...postMoves], '05. Bottom Edge Alignment');
            applied = true;
            break;
          }
        }
        if (applied) break;
      }
      if (!applied) {
        pushMoves(sune, '05. Bottom Edge Alignment');
      }
    }
  }

  // --- STAGE 6: Bottom Corner Permutation (place DFR, DFL, DBL, DBR in home slots) ---
  {
    const dCol = state.D[4];
    const inHomeCornerSlot = (f: CubeFaces, cornerName: string): boolean => {
      const slot = CORNER_SLOTS.find((c) => c.name === cornerName)!;
      const expected = new Set(slot.stickers.map((s) => f[s.face][4]));
      return slot.stickers.every((s) => expected.has(f[s.face][s.index]));
    };

    const allBottomCornersPlaced = (f: CubeFaces) =>
      inHomeCornerSlot(f, 'DFR') &&
      inHomeCornerSlot(f, 'DFL') &&
      inHomeCornerSlot(f, 'DBL') &&
      inHomeCornerSlot(f, 'DBR');

    // Niklas variants on D layer: D L D' R' D L' D' R keeps DFL fixed and 3-cycles DFR, DBL, DBR
    const niklasKeep: Record<string, MoveToken[]> = {
      DFL: ['D', 'L', "D'", "R'", 'D', "L'", "D'", 'R'],
      DBL: ['D', 'B', "D'", "F'", 'D', "B'", "D'", 'F'],
      DBR: ['D', 'R', "D'", "L'", 'D', "R'", "D'", 'L'],
      DFR: ['D', 'F', "D'", "B'", 'D', "F'", "D'", 'B'],
    };

    let guard = 0;
    while (!allBottomCornersPlaced(state) && guard++ < 6) {
      const homeKey = (['DFR', 'DFL', 'DBL', 'DBR'] as const).find((c) =>
        inHomeCornerSlot(state, c)
      );
      pushMoves(niklasKeep[homeKey ?? 'DFL'], '06. Bottom Corner Placement');
    }
    void dCol;
  }

  // --- STAGE 7: Bottom Corner Orientation (twist D corners with (R U R' U') at DFR) ---
  {
    const dCol = state.D[4];
    const sexy: MoveToken[] = ['R', 'U', "R'", "U'"];
    for (let step = 0; step < 4; step++) {
      let twistGuard = 0;
      while (state.D[2] !== dCol && twistGuard++ < 4) {
        pushMoves(sexy, '07. Final Corner Twists');
      }
      if (step < 3) {
        pushMoves(['D'], '07. Final Corner Twists');
      }
    }

    // Final D alignment
    const fCol = state.F[4];
    for (let r = 0; r < 4; r++) {
      if (isFacesSolved(state)) break;
      if (state.F[7] === fCol && isFacesSolved(state)) break;
      pushMoves(['D'], '07. Final Corner Twists');
    }
  }

  const simplified = simplifyStageMoves(rawSteps);

  // Build step-by-step trajectory
  let cursor = cloneFaces(initialFaces);
  const steps: SolveStep[] = simplified.map((item, idx) => {
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
      error:
        lang === 'ru'
          ? 'Не удалось свести данную конфигурацию к собранному состоянию.'
          : 'Solver could not converge to a solved state for this configuration.',
    };
  }

  return {
    solvable: true,
    alreadySolved: false,
    moves: simplified.map((s) => s.move),
    steps,
    solverMode: 'lbl',
  };
}
