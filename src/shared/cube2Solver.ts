import type { CubeFaces, FaceGrid } from './cubeTypes.ts';
import { FACE_ORDER } from './cubeTypes.ts';
import { infer2x2SolvedColors, verifyCubeState } from './cubeVerifier.ts';
import {
  applyMoveToFaces,
  cloneFaces,
  describeMove,
  isFacesSolved,
  type BaseMove,
  type MoveToken,
  type SolveResult,
  type SolveStep,
} from './cubeSolver.ts';

const URF_MOVES: MoveToken[] = [
  'U', "U'", 'U2',
  'R', "R'", 'R2',
  'F', "F'", 'F2',
];

function invertMove(move: MoveToken): MoveToken {
  if (move.endsWith('2')) return move;
  if (move.endsWith("'")) return move[0] as MoveToken;
  return `${move}'` as MoveToken;
}

function encode2x2State(faces: CubeFaces): string {
  return FACE_ORDER.map((f) => faces[f].join(',')).join('|');
}

function decode2x2State(key: string): CubeFaces {
  const parts = key.split('|');
  return {
    U: parts[0].split(',') as FaceGrid,
    R: parts[1].split(',') as FaceGrid,
    F: parts[2].split(',') as FaceGrid,
    D: parts[3].split(',') as FaceGrid,
    L: parts[4].split(',') as FaceGrid,
    B: parts[5].split(',') as FaceGrid,
  };
}

interface SearchNode {
  parentKey: string | null;
  moveFromParent: MoveToken | null;
  lastBase: BaseMove | null;
}

function traceForwardPath(
  meetKey: string,
  fwdVisited: Map<string, SearchNode>
): MoveToken[] {
  const path: MoveToken[] = [];
  let cursor: string | null = meetKey;
  while (cursor !== null) {
    const node = fwdVisited.get(cursor);
    if (!node || node.moveFromParent === null) break;
    path.push(node.moveFromParent);
    cursor = node.parentKey;
  }
  path.reverse();
  return path;
}

function traceBackwardPath(
  meetKey: string,
  bwdVisited: Map<string, SearchNode>
): MoveToken[] {
  const path: MoveToken[] = [];
  let cursor: string | null = meetKey;
  while (cursor !== null) {
    const node = bwdVisited.get(cursor);
    if (!node || node.moveFromParent === null) break;
    path.push(invertMove(node.moveFromParent));
    cursor = node.parentKey;
  }
  return path;
}

/**
 * Exact shortest-path solver for 2x2x2 (Pocket Cube).
 * Anchors DBL to fix whole-cube orientation and runs alternating smaller-frontier
 * bidirectional BFS over <U, R, F> (God's number <= 11 HTM moves).
 */
export function solveCube2x2(
  initialFaces: CubeFaces,
  lang: 'en' | 'ru' = 'en'
): SolveResult {
  const verification = verifyCubeState(initialFaces, 'auto', undefined, lang);
  if (verification.cubeSize !== 2 || !verification.isComplete || !verification.isSolvable) {
    return {
      solvable: false,
      alreadySolved: false,
      moves: [],
      steps: [],
      solverMode: 'kociemba',
      error:
        verification.issues[0]?.message ??
        (lang === 'ru'
          ? 'Для решения кубика 2×2 требуются все 24 корректные плитки.'
          : 'Cube 2×2 state must have all 24 valid stickers before solving.'),
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

  const solvedColorMap = infer2x2SolvedColors(initialFaces);
  if (!solvedColorMap) {
    return {
      solvable: false,
      alreadySolved: false,
      moves: [],
      steps: [],
      solverMode: 'kociemba',
      error:
        lang === 'ru'
          ? 'Не удалось определить противоположные цвета граней 2×2.'
          : 'Could not infer opposite face colors for this 2×2 configuration.',
    };
  }

  const solvedFaces: CubeFaces = {
    U: new Array(4).fill(solvedColorMap.U),
    R: new Array(4).fill(solvedColorMap.R),
    F: new Array(4).fill(solvedColorMap.F),
    D: new Array(4).fill(solvedColorMap.D),
    L: new Array(4).fill(solvedColorMap.L),
    B: new Array(4).fill(solvedColorMap.B),
  };

  const startKey = encode2x2State(initialFaces);
  const goalKey = encode2x2State(solvedFaces);
  if (startKey === goalKey) {
    return {
      solvable: true,
      alreadySolved: true,
      moves: [],
      steps: [],
      solverMode: 'kociemba',
    };
  }

  const fwdVisited = new Map<string, SearchNode>([
    [startKey, { parentKey: null, moveFromParent: null, lastBase: null }],
  ]);
  const bwdVisited = new Map<string, SearchNode>([
    [goalKey, { parentKey: null, moveFromParent: null, lastBase: null }],
  ]);

  let fwdFrontier: string[] = [startKey];
  let bwdFrontier: string[] = [goalKey];
  let meetKey: string | null = null;

  for (let depth = 0; depth < 12 && fwdFrontier.length > 0 && bwdFrontier.length > 0; depth++) {
    const expandForward = fwdFrontier.length <= bwdFrontier.length;
    const activeFrontier = expandForward ? fwdFrontier : bwdFrontier;
    const activeVisited = expandForward ? fwdVisited : bwdVisited;
    const otherVisited = expandForward ? bwdVisited : fwdVisited;
    const nextFrontier: string[] = [];

    for (const key of activeFrontier) {
      const node = activeVisited.get(key)!;
      const faces = decode2x2State(key);

      for (const mv of URF_MOVES) {
        const base = mv[0] as BaseMove;
        if (node.lastBase === base) continue;

        const nextKey = encode2x2State(applyMoveToFaces(faces, mv));
        if (activeVisited.has(nextKey)) continue;

        activeVisited.set(nextKey, {
          parentKey: key,
          moveFromParent: mv,
          lastBase: base,
        });

        if (otherVisited.has(nextKey)) {
          meetKey = nextKey;
          break;
        }
        nextFrontier.push(nextKey);
      }

      if (meetKey !== null) break;
    }

    if (meetKey !== null) break;
    if (expandForward) {
      fwdFrontier = nextFrontier;
    } else {
      bwdFrontier = nextFrontier;
    }
  }

  if (meetKey === null) {
    return {
      solvable: false,
      alreadySolved: false,
      moves: [],
      steps: [],
      solverMode: 'kociemba',
      error:
        lang === 'ru'
          ? 'Не удалось найти кратчайшее решение 2×2.'
          : 'Could not converge to a shortest 2×2 solution.',
    };
  }

  const forwardMoves = traceForwardPath(meetKey, fwdVisited);
  const backwardMoves = traceBackwardPath(meetKey, bwdVisited);
  const fullMoves = [...forwardMoves, ...backwardMoves];

  let cursor = cloneFaces(initialFaces);
  const steps: SolveStep[] = fullMoves.map((mv, idx) => {
    cursor = applyMoveToFaces(cursor, mv);
    return {
      index: idx + 1,
      move: mv,
      stage: '2x2 Optimal',
      description: describeMove(mv),
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
          ? 'Ошибка проверки финального состояния 2×2.'
          : 'Post-solve verification failed for 2×2 sequence.',
    };
  }

  return {
    solvable: true,
    alreadySolved: false,
    moves: fullMoves,
    steps,
    solverMode: 'kociemba',
  };
}
