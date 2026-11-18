import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { CubeFaces, CubePalette, CubeSize, FaceId } from '../shared/cubeTypes.ts';
import { getColorMeta } from '../shared/cubeTypes.ts';
import type { BaseMove, MoveToken, SolveResult, SolverMode } from '../shared/cubeSolver.ts';
import { UI_TEXT, type Language } from '../lib/i18n.ts';
import type { ThemeMode } from '../lib/theme.ts';
import {
  loadSoundEnabled,
  playSolvedChime,
  playTurnSnap,
  primeCubeAudio,
  saveSoundEnabled,
} from '../lib/cubeAudio.ts';
import type { PlaybackSpeed } from './SolvePanel.tsx';
import type { MenuTab } from './WorkspaceMenuDrawer.tsx';

export interface AnimatingMoveState {
  move: MoveToken;
  durationMs: number;
  key: number;
  baseFaces: CubeFaces;
  targetStepIndex: number;
}

interface CubePreview3DProps {
  lang: Language;
  appTheme?: ThemeMode;
  cubeSize: CubeSize;
  faces: CubeFaces;
  palette: CubePalette;
  animatingMove?: AnimatingMoveState | null;
  activeStepLabel?: string | null;
  canSolve: boolean;
  issueCount: number;
  solveResult: SolveResult | null;
  solverMode: SolverMode;
  activeStepIndex: number;
  isPlaying: boolean;
  isAnimating: boolean;
  playbackSpeed: PlaybackSpeed;
  onMoveAnimationComplete?: (key: number) => void;
  onComputeSolution: () => void;
  onChangeSolverMode: (mode: SolverMode) => void;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onJumpToStep: (stepIndex: number) => void;
  onChangeSpeed: (speed: PlaybackSpeed) => void;
  onScrambleCube: () => void;
  onOpenMenu: (tab: MenuTab) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const SPEED_OPTIONS: PlaybackSpeed[] = [0.5, 1, 2];

type Coord3 = -1 | 0 | 1;

const CUBIE_COORDS_3X3: Array<{ x: Coord3; y: Coord3; z: Coord3 }> = [];
for (const x of [-1, 0, 1] as const) {
  for (const y of [-1, 0, 1] as const) {
    for (const z of [-1, 0, 1] as const) {
      CUBIE_COORDS_3X3.push({ x, y, z });
    }
  }
}

const CUBIE_COORDS_2X2: Array<{ x: Coord3; y: Coord3; z: Coord3 }> = [];
for (const x of [-1, 1] as const) {
  for (const y of [-1, 1] as const) {
    for (const z of [-1, 1] as const) {
      CUBIE_COORDS_2X2.push({ x, y, z });
    }
  }
}

const FACE_NORMALS: Record<FaceId, readonly [number, number, number]> = {
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
  U: [0, -1, 0],
  D: [0, 1, 0],
};

const FACE_PLANE_AXES: Record<
  FaceId,
  { u: readonly [number, number, number]; v: readonly [number, number, number] }
> = {
  F: { u: [1, 0, 0], v: [0, 1, 0] },
  B: { u: [-1, 0, 0], v: [0, 1, 0] },
  R: { u: [0, 0, -1], v: [0, 1, 0] },
  L: { u: [0, 0, 1], v: [0, 1, 0] },
  U: { u: [1, 0, 0], v: [0, 0, 1] },
  D: { u: [1, 0, 0], v: [0, 0, -1] },
};

// Overhead-left-front studio key light direction (unit length)
const KEY_LIGHT = [-0.35, -0.78, 0.52] as const;

function rotateNormalByCubeView(
  normal: readonly [number, number, number],
  rotXDeg: number,
  rotYDeg: number
): [number, number, number] {
  const rx = (rotXDeg * Math.PI) / 180;
  const ry = (rotYDeg * Math.PI) / 180;
  const [nx, ny, nz] = normal;

  // CSS evaluates rotateX(rx) rotateY(ry) right-to-left: Y first, then X
  const x1 = nx * Math.cos(ry) + nz * Math.sin(ry);
  const y1 = ny;
  const z1 = -nx * Math.sin(ry) + nz * Math.cos(ry);

  const x2 = x1;
  const y2 = y1 * Math.cos(rx) - z1 * Math.sin(rx);
  const z2 = y1 * Math.sin(rx) + z1 * Math.cos(rx);
  return [x2, y2, z2];
}

function computeFaceLighting(
  rotXDeg: number,
  rotYDeg: number,
  darkStudio: boolean
): { brightness: Record<FaceId, number>; facingZ: Record<FaceId, number> } {
  const brightness = {} as Record<FaceId, number>;
  const facingZ = {} as Record<FaceId, number>;

  (Object.keys(FACE_NORMALS) as FaceId[]).forEach((face) => {
    const [x2, y2, z2] = rotateNormalByCubeView(FACE_NORMALS[face], rotXDeg, rotYDeg);
    facingZ[face] = z2;
    const dot = Math.max(
      -1,
      Math.min(1, x2 * KEY_LIGHT[0] + y2 * KEY_LIGHT[1] + z2 * KEY_LIGHT[2])
    );
    const t = (dot + 1) * 0.5; // 0..1
    brightness[face] = darkStudio ? 0.8 + 0.28 * t : 0.9 + 0.14 * t;
  });

  return { brightness, facingZ };
}

function computeOuterArrowCenterDeg(face: FaceId, rotXDeg: number, rotYDeg: number): number {
  const cn = rotateNormalByCubeView(FACE_NORMALS[face], rotXDeg, rotYDeg);
  const { u, v } = FACE_PLANE_AXES[face];
  const cu = rotateNormalByCubeView(u, rotXDeg, rotYDeg);
  const cv = rotateNormalByCubeView(v, rotXDeg, rotYDeg);

  const du = cn[0] * cu[0] + cn[1] * cu[1];
  const dv = cn[0] * cv[0] + cn[1] * cv[1];
  if (du * du + dv * dv < 1e-4) return -90;
  return (Math.atan2(dv, du) * 180) / Math.PI;
}

function getFacePlaneTransform(face: FaceId, distancePx: number): string {
  switch (face) {
    case 'F':
      return `translateZ(${distancePx}px)`;
    case 'B':
      return `rotateY(180deg) translateZ(${distancePx}px)`;
    case 'R':
      return `rotateY(90deg) translateZ(${distancePx}px)`;
    case 'L':
      return `rotateY(-90deg) translateZ(${distancePx}px)`;
    case 'U':
      return `rotateX(90deg) translateZ(${distancePx}px)`;
    case 'D':
      return `rotateX(-90deg) translateZ(${distancePx}px)`;
  }
}

function getCubieFaceIndex(
  face: FaceId,
  x: Coord3,
  y: Coord3,
  z: Coord3,
  cubeSize: CubeSize
): number {
  if (cubeSize === 2) {
    const xb = x === -1 ? 0 : 1;
    const yb = y === -1 ? 0 : 1;
    const zb = z === -1 ? 0 : 1;
    switch (face) {
      case 'F':
        return yb * 2 + xb;
      case 'B':
        return yb * 2 + (1 - xb);
      case 'R':
        return yb * 2 + (1 - zb);
      case 'L':
        return yb * 2 + zb;
      case 'U':
        return zb * 2 + xb;
      case 'D':
        return (1 - zb) * 2 + xb;
    }
  }

  switch (face) {
    case 'F':
      return (y + 1) * 3 + (x + 1);
    case 'B':
      return (y + 1) * 3 + (1 - x);
    case 'R':
      return (y + 1) * 3 + (1 - z);
    case 'L':
      return (y + 1) * 3 + (z + 1);
    case 'U':
      return (z + 1) * 3 + (x + 1);
    case 'D':
      return (1 - z) * 3 + (x + 1);
  }
}

function isCubieInMoveSlice(
  move: MoveToken,
  x: Coord3,
  y: Coord3,
  z: Coord3
): boolean {
  const base = move[0] as BaseMove;
  if (base === 'U') return y === -1;
  if (base === 'D') return y === 1;
  if (base === 'R') return x === 1;
  if (base === 'L') return x === -1;
  if (base === 'F') return z === 1;
  return z === -1;
}

function getMoveAxisAndDegrees(move: MoveToken): { axis: 'X' | 'Y' | 'Z'; deg: number } {
  const base = move[0] as BaseMove;
  const isPrime = move.endsWith("'");
  const isDouble = move.endsWith('2');

  if (base === 'R') {
    return { axis: 'X', deg: isDouble ? 180 : isPrime ? -90 : 90 };
  }
  if (base === 'L') {
    return { axis: 'X', deg: isDouble ? -180 : isPrime ? 90 : -90 };
  }
  if (base === 'U') {
    return { axis: 'Y', deg: isDouble ? -180 : isPrime ? 90 : -90 };
  }
  if (base === 'D') {
    return { axis: 'Y', deg: isDouble ? 180 : isPrime ? -90 : 90 };
  }
  if (base === 'F') {
    return { axis: 'Z', deg: isDouble ? 180 : isPrime ? -90 : 90 };
  }
  return { axis: 'Z', deg: isDouble ? -180 : isPrime ? 90 : -90 };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function buildCubieFaces(halfCubie: number): Array<{
  face: FaceId;
  transform: string;
  isOutward: (x: number, y: number, z: number) => boolean;
}> {
  return [
    { face: 'F', transform: `translateZ(${halfCubie}px)`, isOutward: (_x, _y, z) => z === 1 },
    {
      face: 'B',
      transform: `rotateY(180deg) translateZ(${halfCubie}px)`,
      isOutward: (_x, _y, z) => z === -1,
    },
    {
      face: 'R',
      transform: `rotateY(90deg) translateZ(${halfCubie}px)`,
      isOutward: (x) => x === 1,
    },
    {
      face: 'L',
      transform: `rotateY(-90deg) translateZ(${halfCubie}px)`,
      isOutward: (x) => x === -1,
    },
    {
      face: 'U',
      transform: `rotateX(90deg) translateZ(${halfCubie}px)`,
      isOutward: (_x, y) => y === -1,
    },
    {
      face: 'D',
      transform: `rotateX(-90deg) translateZ(${halfCubie}px)`,
      isOutward: (_x, y) => y === 1,
    },
  ];
}

const CUBIE_FACES_3X3 = buildCubieFaces(26);
const CUBIE_FACES_2X2 = buildCubieFaces(37);

function CurvedMoveArrow3D({
  move,
  isActiveTurn,
  planeDist,
  cubeSize,
  isFrontVisible,
  outerCenterDeg,
}: {
  move: MoveToken;
  isActiveTurn: boolean;
  planeDist: number;
  cubeSize: CubeSize;
  isFrontVisible: boolean;
  outerCenterDeg: number;
}) {
  const face = move[0] as FaceId;
  const isPrime = move.endsWith("'");
  const isDouble = move.endsWith('2');

  const coreColor = isActiveTurn ? '#10B981' : '#38BDF8';
  const casingColor = '#0F172A';
  const opacity = isActiveTurn ? 0.98 : 0.92;

  if (isFrontVisible) {
    return (
      <div
        className="cube-3d-object cube-3d-face absolute left-1/2 top-1/2 w-[148px] h-[148px] -ml-[74px] -mt-[74px] pointer-events-none"
        style={{
          transform: getFacePlaneTransform(face, planeDist),
          opacity,
          transition: 'opacity 140ms ease-out',
        }}
      >
        <svg
          viewBox="0 0 120 120"
          className="w-full h-full cube-arrow-enter overflow-visible"
          style={{
            filter: isActiveTurn
              ? 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.45))'
              : 'drop-shadow(0 0 6px rgba(56, 189, 248, 0.35))',
          }}
          aria-hidden="true"
        >
          {/* Subtle dashed orbit ring indicating the active face layer */}
          <circle
            cx="60"
            cy="60"
            r="40"
            fill="none"
            stroke={coreColor}
            strokeOpacity={isActiveTurn ? 0.28 : 0.18}
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* Mirror horizontally for prime (counter-clockwise) moves */}
          <g transform={isPrime ? 'translate(120, 0) scale(-1, 1)' : undefined}>
            {isDouble ? (
              <>
                {[0, 180].map((angle) => (
                  <g key={angle} transform={angle ? `rotate(${angle} 60 60)` : undefined}>
                    <path
                      d="M 21.4 49.6 A 40 40 0 0 1 97.1 45.0"
                      fill="none"
                      stroke={casingColor}
                      strokeWidth="8.5"
                      strokeLinecap="round"
                    />
                    <polygon
                      points="99.7,55.1 90.1,46.6 102.9,40.9"
                      fill={casingColor}
                      stroke={casingColor}
                      strokeWidth="3.2"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M 21.4 49.6 A 40 40 0 0 1 97.1 45.0"
                      fill="none"
                      stroke={coreColor}
                      strokeWidth="4.4"
                      strokeLinecap="round"
                    />
                    <polygon
                      points="99.7,55.1 90.1,46.6 102.9,40.9"
                      fill={coreColor}
                    />
                  </g>
                ))}
              </>
            ) : (
              <>
                <path
                  d="M 22.4 73.7 A 40 40 0 1 1 99.5 53.7"
                  fill="none"
                  stroke={casingColor}
                  strokeWidth="8.5"
                  strokeLinecap="round"
                />
                <polygon
                  points="99.8,64.2 91.9,53.8 106.6,50.9"
                  fill={casingColor}
                  stroke={casingColor}
                  strokeWidth="3.2"
                  strokeLinejoin="round"
                />
                <path
                  d="M 22.4 73.7 A 40 40 0 1 1 99.5 53.7"
                  fill="none"
                  stroke={coreColor}
                  strokeWidth="4.4"
                  strokeLinecap="round"
                />
                <polygon
                  points="99.8,64.2 91.9,53.8 106.6,50.9"
                  fill={coreColor}
                />
              </>
            )}
          </g>
        </svg>
      </div>
    );
  }

  const sizeClass =
    cubeSize === 2
      ? 'w-[260px] h-[260px] -ml-[130px] -mt-[130px]'
      : 'w-[276px] h-[276px] -ml-[138px] -mt-[138px]';
  const arcCenterDeg = isPrime ? 180 - outerCenterDeg : outerCenterDeg;

  return (
    <div
      className={`cube-3d-object cube-3d-face absolute left-1/2 top-1/2 ${sizeClass} pointer-events-none`}
      style={{
        transform: getFacePlaneTransform(face, planeDist),
        opacity,
        transition: 'opacity 140ms ease-out',
      }}
    >
      <svg
        viewBox="0 0 260 260"
        className="w-full h-full cube-arrow-enter overflow-visible"
        style={{
          filter: isActiveTurn
            ? 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.42))'
            : 'drop-shadow(0 0 6px rgba(56, 189, 248, 0.32))',
        }}
        aria-hidden="true"
      >
        {/* Mirror horizontally for prime (counter-clockwise) moves */}
        <g transform={isPrime ? 'translate(260, 0) scale(-1, 1)' : undefined}>
          {[-46, 46].map((offset) => (
            <g key={offset} transform={`rotate(${(arcCenterDeg + offset).toFixed(1)} 130 130)`}>
              <path
                d="M 226.7 69.6 A 114 114 0 0 1 237.1 169.0"
                fill="none"
                stroke={casingColor}
                strokeWidth="12.5"
                strokeLinecap="round"
              />
              <polygon
                points="225.6,192.1 229.5,160.4 248.6,166.3"
                fill={casingColor}
                stroke={casingColor}
                strokeWidth="4.2"
                strokeLinejoin="round"
              />
              <path
                d="M 226.7 69.6 A 114 114 0 0 1 237.1 169.0"
                fill="none"
                stroke={coreColor}
                strokeWidth="6.6"
                strokeLinecap="round"
              />
              <polygon points="225.6,192.1 229.5,160.4 248.6,166.3" fill={coreColor} />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

export function CubePreview3D({
  lang,
  appTheme = 'light',
  cubeSize,
  faces,
  palette,
  animatingMove = null,
  activeStepLabel = null,
  canSolve,
  issueCount,
  solveResult,
  solverMode,
  activeStepIndex,
  isPlaying,
  isAnimating,
  playbackSpeed,
  onMoveAnimationComplete,
  onComputeSolution,
  onChangeSolverMode,
  onTogglePlay,
  onStepForward,
  onStepBackward,
  onJumpToStep,
  onChangeSpeed,
  onScrambleCube,
  onOpenMenu,
  isFullscreen = false,
  onToggleFullscreen,
}: CubePreview3DProps) {
  const t = UI_TEXT[lang].preview3d;
  const [rot, setRot] = useState({ x: -26, y: -38 });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(loadSoundEnabled);
  const darkStudio = appTheme === 'dark';

  useEffect(() => {
    if (!isFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onToggleFullscreen?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullscreen, onToggleFullscreen]);

  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const totalStepsRef = useRef(solveResult?.steps.length ?? 0);
  totalStepsRef.current = solveResult?.steps.length ?? 0;

  const slicePivotRef = useRef<HTMLDivElement | null>(null);
  const onCompleteRef = useRef(onMoveAnimationComplete);
  onCompleteRef.current = onMoveAnimationComplete;

  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null
  );

  // High-FPS per-frame requestAnimationFrame slice rotation driver + Web Audio snap sync
  useEffect(() => {
    if (!animatingMove) return;

    const { move, durationMs, key, targetStepIndex } = animatingMove;
    const { axis, deg } = getMoveAxisAndDegrees(move);
    const isDouble = move.endsWith('2');

    const DOUBLE_PHASE = 0.42;
    const DOUBLE_PAUSE_END = 0.58;

    const timers: number[] = [];
    if (soundEnabledRef.current) {
      if (isDouble && durationMs > 0) {
        timers.push(
          window.setTimeout(() => {
            if (soundEnabledRef.current) playTurnSnap(0);
          }, Math.round(durationMs * 0.14))
        );
        timers.push(
          window.setTimeout(() => {
            if (soundEnabledRef.current) playTurnSnap(0.45);
          }, Math.round(durationMs * (DOUBLE_PAUSE_END + 0.14)))
        );
      } else {
        const snap1Delay = durationMs > 0 ? Math.min(85, Math.round(durationMs * 0.2)) : 0;
        timers.push(
          window.setTimeout(() => {
            if (soundEnabledRef.current) playTurnSnap(0);
          }, snap1Delay)
        );
      }
    }

    const triggerSolvedChimeIfFinal = () => {
      const total = totalStepsRef.current;
      if (soundEnabledRef.current && total > 0 && targetStepIndex === total) {
        window.setTimeout(() => {
          if (soundEnabledRef.current) playSolvedChime();
        }, 70);
      }
    };

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion || durationMs <= 0) {
      if (slicePivotRef.current) {
        slicePivotRef.current.style.transform = `rotate${axis}(${deg}deg)`;
      }
      const raf = requestAnimationFrame(() => {
        triggerSolvedChimeIfFinal();
        onCompleteRef.current?.(key);
      });
      return () => {
        cancelAnimationFrame(raf);
        timers.forEach((id) => window.clearTimeout(id));
      };
    }

    if (slicePivotRef.current) {
      slicePivotRef.current.style.transform = `rotate${axis}(0deg)`;
    }

    let rafId = 0;
    let startTime: number | null = null;

    const tick = (now: number) => {
      if (startTime === null) {
        startTime = now;
      }
      const elapsed = now - startTime;
      const rawT = Math.min(1, elapsed / durationMs);

      let currentDeg: number;
      if (isDouble) {
        const halfDeg = deg / 2;
        if (rawT <= DOUBLE_PHASE) {
          currentDeg = halfDeg * easeInOutCubic(rawT / DOUBLE_PHASE);
        } else if (rawT <= DOUBLE_PAUSE_END) {
          currentDeg = halfDeg;
        } else {
          const p2 = Math.min(1, (rawT - DOUBLE_PAUSE_END) / DOUBLE_PHASE);
          currentDeg = halfDeg + halfDeg * easeInOutCubic(p2);
        }
      } else {
        currentDeg = deg * easeInOutCubic(rawT);
      }

      if (slicePivotRef.current) {
        slicePivotRef.current.style.transform = `rotate${axis}(${currentDeg.toFixed(3)}deg)`;
      }

      if (rawT < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        triggerSolvedChimeIfFinal();
        onCompleteRef.current?.(key);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [animatingMove]);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    saveSoundEnabled(next);
    if (next) {
      primeCubeAudio();
      playTurnSnap(0.35);
    }
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: rot.x,
      baseY: rot.y,
    };
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setRot({
      x: Math.max(-85, Math.min(85, dragRef.current.baseX - dy * 0.45)),
      y: dragRef.current.baseY + dx * 0.45,
    });
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  };

  const cubieSize = cubeSize === 2 ? 74 : 52;
  const halfCubie = cubieSize / 2;
  const cubieStep = cubeSize === 2 ? 38 : 54;
  const cubieCoords = cubeSize === 2 ? CUBIE_COORDS_2X2 : CUBIE_COORDS_3X3;
  const cubieFaces = cubeSize === 2 ? CUBIE_FACES_2X2 : CUBIE_FACES_3X3;
  const { brightness: faceBrightness, facingZ } = computeFaceLighting(rot.x, rot.y, darkStudio);
  const renderFaces = animatingMove ? animatingMove.baseFaces : faces;

  const renderCubie = (x: Coord3, y: Coord3, z: Coord3) => {
    const key = `${cubeSize}:${x},${y},${z}`;
    const isCenterCubie = cubeSize === 3 && Math.abs(x) + Math.abs(y) + Math.abs(z) === 1;

    return (
      <div
        key={key}
        className="cube-3d-object absolute"
        style={{
          width: `${cubieSize}px`,
          height: `${cubieSize}px`,
          left: '50%',
          top: '50%',
          marginLeft: `-${halfCubie}px`,
          marginTop: `-${halfCubie}px`,
          transform: `translate3d(${x * cubieStep}px, ${y * cubieStep}px, ${z * cubieStep}px)`,
        }}
      >
        {cubieFaces.map(({ face, transform, isOutward }) => {
          const outward = isOutward(x, y, z);
          if (!outward) {
            return (
              <div
                key={face}
                className="cube-3d-face absolute inset-0 bg-slate-900 dark:bg-[#0B1120] border border-slate-800/80 dark:border-slate-700/75 rounded-[4px]"
                style={{ transform }}
              />
            );
          }

          const idx = getCubieFaceIndex(face, x, y, z, cubeSize);
          const color = renderFaces[face][idx] ?? '?';
          const meta = getColorMeta(palette, color);
          const lit = faceBrightness[face];

          return (
            <div
              key={face}
              className="cube-3d-face absolute inset-0 bg-slate-900 dark:bg-[#0B1120] p-[3.5px] rounded-[6px] border border-slate-800 dark:border-slate-700/80"
              style={{ transform }}
            >
              <div
                className={`w-full h-full rounded-[4px] border flex items-center justify-center ${
                  color === '?' ? 'unscanned-hatch border-slate-300 dark:border-slate-600' : 'sticker-tile-sheen'
                }`}
                style={{
                  backgroundColor: color === '?' ? undefined : meta.hex,
                  borderColor: color === '?' ? undefined : meta.borderHex,
                  filter: `brightness(${lit.toFixed(3)})`,
                }}
              >
                {isCenterCubie && (
                  <span
                    style={color === '?' ? undefined : { color: meta.textOnHex }}
                    className={`font-mono text-[10px] font-bold opacity-85 select-none ${
                      color === '?' ? 'text-slate-600 dark:text-slate-300' : ''
                    }`}
                  >
                    {face}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const activeSliceCubies = animatingMove
    ? cubieCoords.filter((c) => isCubieInMoveSlice(animatingMove.move, c.x, c.y, c.z))
    : [];
  const staticCubies = animatingMove
    ? cubieCoords.filter((c) => !isCubieInMoveSlice(animatingMove.move, c.x, c.y, c.z))
    : cubieCoords;

  const totalSteps = solveResult?.steps.length ?? 0;
  const hasPlayableSolution = Boolean(solveResult?.solvable && !solveResult.alreadySolved && totalSteps > 0);

  const arrowMove: { move: MoveToken; active: boolean; key: string } | null = animatingMove
    ? { move: animatingMove.move, active: true, key: `anim-${animatingMove.key}` }
    : hasPlayableSolution && activeStepIndex < totalSteps
    ? {
        move: solveResult!.steps[activeStepIndex].move,
        active: false,
        key: `next-${activeStepIndex}-${solveResult!.steps[activeStepIndex].move}`,
      }
    : null;

  const arrowFace = arrowMove ? (arrowMove.move[0] as FaceId) : null;
  const isArrowFrontVisible = arrowFace ? facingZ[arrowFace] >= 0.12 : true;
  const outerArrowCenterDeg = arrowFace ? computeOuterArrowCenterDeg(arrowFace, rot.x, rot.y) : 0;
  const arrowPlaneDist = isArrowFrontVisible
    ? cubeSize === 2
      ? 84
      : 90
    : cubeSize === 2
    ? 78
    : 84;

  const pitchScale = 0.88 + 0.18 * Math.cos((rot.x * Math.PI) / 180);
  const shadowWidthPx = cubeSize === 2 ? 148 : 166;

  return (
    <section
      id="cube-3d"
      className={
        isFullscreen
          ? 'fixed inset-0 z-40 h-[100dvh] w-screen bg-[#F4F7FB] dark:bg-[#090E1A] pt-[max(0.625rem,env(safe-area-inset-top))] pb-[max(0.625rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] [@media(max-height:500px)]:py-2 flex flex-col gap-2.5 sm:gap-3 [@media(max-height:500px)]:gap-1.5'
          : 'studio-card rounded-xl p-3.5 sm:p-4 [@media(max-height:500px)]:p-3 flex flex-col gap-3 [@media(max-height:500px)]:gap-2'
      }
    >
      <div
        className={`@container flex items-center justify-between gap-2 shrink-0 ${
          isFullscreen ? 'w-full max-w-4xl mx-auto' : ''
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 tracking-tight truncate">
              {t.title}
            </h3>
            <span className="font-mono tabular-nums text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {cubeSize}×{cubeSize}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {t.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleToggleSound}
            aria-label={soundEnabled ? t.soundMuteAria : t.soundUnmuteAria}
            title={soundEnabled ? t.soundMuteAria : t.soundUnmuteAria}
            className={`min-w-[36px] min-h-[36px] flex items-center justify-center border rounded-lg transition-colors ${
              soundEnabled
                ? 'text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700/80 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                : 'text-slate-400 dark:text-slate-500 border-slate-200/80 dark:border-slate-700/60 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onScrambleCube}
            disabled={isAnimating}
            aria-label={t.scrambleAria}
            title={t.scrambleAria}
            className="min-w-[36px] min-h-[36px] @[390px]:px-2.5 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700/80 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
          >
            <Shuffle className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden @[390px]:inline">{t.scramble}</span>
          </button>
          <button
            type="button"
            onClick={() => setRot({ x: -26, y: -38 })}
            aria-label={t.resetViewAria}
            title={t.resetViewAria}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700/80 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          {isFullscreen && onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              aria-label={t.fullscreenExitAria}
              title={t.fullscreenExitAria}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition-colors"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Interactive Studio 3D Viewport */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`${
          isFullscreen
            ? 'flex-1 min-h-0 w-full max-w-4xl mx-auto rounded-xl'
            : 'h-[352px] sm:h-[364px] lg:h-[420px] [@media(max-height:500px)]:h-48 w-full rounded-lg'
        } relative flex items-center justify-center cursor-grab active:cursor-grabbing select-none touch-none overflow-hidden transition-colors duration-200 ${
          darkStudio
            ? 'studio-stage-dark border border-slate-800 dark:border-slate-700/80'
            : 'studio-stage-backdrop border border-slate-200/90 dark:border-slate-700'
        }`}
      >
        {/* Subtle top-left studio key light & rim glow behind cube */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background: darkStudio
              ? 'radial-gradient(circle at 38% 26%, rgba(56, 189, 248, 0.14) 0%, rgba(15, 23, 42, 0) 56%)'
              : 'radial-gradient(circle at 36% 24%, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0) 58%)',
          }}
        />

        <div
          className={`cube-3d-stage relative ${
            isFullscreen
              ? '-translate-y-4 [@media(max-height:500px)]:-translate-y-2 scale-[1.16] sm:scale-[1.28] [@media(max-height:500px)]:scale-[0.82] [@media(min-height:390px)_and_(max-height:500px)]:scale-[0.94]'
              : '-translate-y-5 sm:-translate-y-5 lg:-translate-y-6 [@media(max-height:500px)]:-translate-y-3 scale-105 lg:scale-[1.18] [@media(max-height:500px)]:scale-[0.76]'
          }`}
        >
          {/* Soft 3D Ground Shadow beneath levitating cube */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 -translate-x-1/2"
            style={{
              top: '184px',
              width: `${shadowWidthPx}px`,
              height: '28px',
              transform: `scaleX(${((animatingMove ? 1.07 : 1) * pitchScale).toFixed(3)}) scaleY(${(
                animatingMove ? 1.04 : 1
              ).toFixed(2)})`,
              transition: 'transform 160ms ease-out',
            }}
          >
            {/* Outer soft penumbra */}
            <div
              className="absolute inset-0 rounded-full blur-[11px]"
              style={{
                background: darkStudio
                  ? 'radial-gradient(ellipse at center, rgba(2, 6, 23, 0.86) 0%, rgba(2, 6, 23, 0.32) 55%, rgba(2, 6, 23, 0) 78%)'
                  : 'radial-gradient(ellipse at center, rgba(15, 23, 42, 0.24) 0%, rgba(15, 23, 42, 0.08) 56%, rgba(15, 23, 42, 0) 78%)',
              }}
            />
            {/* Tighter core contact shadow */}
            <div
              className="absolute inset-x-5 inset-y-1.5 rounded-full blur-[5px]"
              style={{
                background: darkStudio
                  ? 'radial-gradient(ellipse at center, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0) 75%)'
                  : 'radial-gradient(ellipse at center, rgba(15, 23, 42, 0.26) 0%, rgba(15, 23, 42, 0) 75%)',
              }}
            />
          </div>

          <div
            className="cube-3d-object relative w-[164px] h-[164px]"
            style={{
              transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`,
              transition: dragRef.current ? 'none' : 'transform 120ms ease-out',
            }}
          >
            {staticCubies.map((c) => renderCubie(c.x, c.y, c.z))}

            {animatingMove && (
              <div
                ref={slicePivotRef}
                key={animatingMove.key}
                className="cube-3d-object absolute inset-0"
                style={{ willChange: 'transform' }}
              >
                {activeSliceCubies.map((c) => renderCubie(c.x, c.y, c.z))}
              </div>
            )}

            {arrowMove && (
              <CurvedMoveArrow3D
                key={arrowMove.key}
                move={arrowMove.move}
                isActiveTurn={arrowMove.active}
                planeDist={arrowPlaneDist}
                cubeSize={cubeSize}
                isFrontVisible={isArrowFrontVisible}
                outerCenterDeg={outerArrowCenterDeg}
              />
            )}
          </div>
        </div>

        {activeStepLabel && (
          <div
            className={`absolute bottom-2 left-2 right-2 px-2.5 py-1.5 backdrop-blur-xs rounded-md shadow-xs text-[11px] font-mono tabular-nums font-medium text-center truncate pointer-events-none border ${
              darkStudio
                ? 'bg-slate-900/85 border-slate-700/80 text-slate-100'
                : 'bg-white/92 border-slate-200/90 text-slate-800'
            }`}
          >
            {activeStepLabel}
          </div>
        )}
      </div>

      {/* Compact Solver Algorithm Switcher & Controls */}
      <div
        className={`flex flex-col gap-2.5 [@media(max-height:500px)]:gap-1.5 shrink-0 ${
          isFullscreen ? 'w-full max-w-4xl mx-auto' : ''
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
            {t.solverLabel}
          </span>
          {cubeSize === 3 ? (
            <div
              role="group"
              aria-label={t.solverLabel}
              className="grid grid-cols-2 gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800 rounded-lg min-w-0 max-w-full"
            >
              {(['lbl', 'kociemba'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={isAnimating}
                  onClick={() => onChangeSolverMode(mode)}
                  className={`min-h-[30px] px-2 sm:px-2.5 py-0.5 text-[11px] font-medium rounded-md transition-all whitespace-nowrap truncate disabled:opacity-50 ${
                    solverMode === mode
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {mode === 'kociemba' ? t.solverKociemba : t.solverLbl}
                </button>
              ))}
            </div>
          ) : (
            <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200 px-2.5 py-1 bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 rounded-lg whitespace-nowrap">
              {t.solver2x2Optimal}
            </span>
          )}
        </div>

        {/* Docked Navigator Controls Directly Beneath 3D Cube */}
        {hasPlayableSolution ? (
          <div className="flex flex-col gap-2 [@media(max-height:500px)]:gap-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onJumpToStep(0)}
                disabled={activeStepIndex === 0 && !isPlaying}
                aria-label={t.jumpStartAria}
                className="min-h-[44px] [@media(max-height:500px)]:min-h-[38px] min-w-[38px] sm:min-w-[40px] px-1.5 sm:px-2 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg inline-flex items-center justify-center transition-colors shrink-0"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (soundEnabled) primeCubeAudio();
                  onStepBackward();
                }}
                disabled={activeStepIndex === 0 || isPlaying || isAnimating}
                aria-label={t.prevStepAria}
                className="min-h-[44px] [@media(max-height:500px)]:min-h-[38px] flex-1 px-1 sm:px-3 text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
              >
                <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>{t.prev}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (soundEnabled) primeCubeAudio();
                  onTogglePlay();
                }}
                className="min-h-[44px] [@media(max-height:500px)]:min-h-[38px] flex-1 px-1 sm:px-3 text-[11px] sm:text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg shadow-xs inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span>{t.pause}</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span>{activeStepIndex >= totalSteps ? t.replay : t.play}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (soundEnabled) primeCubeAudio();
                  onStepForward();
                }}
                disabled={activeStepIndex >= totalSteps || isPlaying || isAnimating}
                aria-label={t.nextStepAria}
                className="min-h-[44px] [@media(max-height:500px)]:min-h-[38px] flex-1 px-1 sm:px-3 text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
              >
                <span>{t.next}</span>
                <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => onJumpToStep(totalSteps)}
                disabled={activeStepIndex >= totalSteps && !isPlaying}
                aria-label={t.jumpEndAria}
                className="min-h-[44px] [@media(max-height:500px)]:min-h-[38px] min-w-[38px] sm:min-w-[40px] px-1.5 sm:px-2 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg inline-flex items-center justify-center transition-colors shrink-0"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono tabular-nums text-[11px] font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                  {t.stepCount(activeStepIndex, totalSteps)}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenMenu('timeline')}
                  className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:underline underline-offset-2 whitespace-nowrap"
                >
                  {t.timeline}
                </button>
              </div>
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800 rounded-lg shrink-0">
                {SPEED_OPTIONS.map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => onChangeSpeed(spd)}
                    className={`min-h-[30px] px-2 py-0.5 text-[11px] font-mono tabular-nums font-medium rounded-md transition-all whitespace-nowrap ${
                      playbackSpeed === spd
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {spd}×
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={onComputeSolution}
              disabled={!canSolve || isAnimating || Boolean(solveResult?.alreadySolved)}
              className="w-full min-h-[42px] [@media(max-height:500px)]:min-h-[38px] px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:border disabled:border-slate-200 dark:disabled:border-slate-700 disabled:cursor-not-allowed rounded-lg shadow-xs transition-colors whitespace-nowrap"
            >
              {solveResult?.alreadySolved
                ? t.solvedBanner
                : canSolve
                ? t.solveCube
                : issueCount > 0
                ? t.resolveConflicts(issueCount)
                : t.scanOrScramble}
            </button>
            {issueCount > 0 && !canSolve && (
              <button
                type="button"
                onClick={() => onOpenMenu('verification')}
                className="text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:underline underline-offset-2 text-center"
              >
                {t.inspectConflictsLink}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
