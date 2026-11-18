import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type {
  AmbiguousStickerNote,
  CubeColor,
  CubeConfidenceMap,
  CubeFaces,
  CubePalette,
  CubeSize,
  FaceId,
  PhotoAnalysisSummary,
  PhotoCanvasAlign,
  AiSpeedMode,
  RecognitionMode,
  RecognitionTimingBreakdown,
  StickerRef,
} from './shared/cubeTypes.ts';
import {
  DEFAULT_PALETTE,
  createEmptyConfidences,
  createEmptyFaces,
  createSolvedStandardFaces,
  createUniformConfidences,
  inferCubeSizeFromFaces,
} from './shared/cubeTypes.ts';
import { verifyCubeState } from './shared/cubeVerifier.ts';
import {
  applyMoveToFaces,
  solveCube,
  type BaseMove,
  type MoveToken,
  type SolveResult,
  type SolverMode,
} from './shared/cubeSolver.ts';
import { solveCubeKociemba } from './shared/kociembaSolver.ts';
import { solveCube2x2 } from './shared/cube2Solver.ts';
import {
  downscaleDataUrl,
  rotateFaceClockwise,
  type UploadedPhoto,
} from './lib/imageUtils.ts';
import { sampleScansAdHoc, type ScanAssignment } from './lib/canvasSampler.ts';
import { clearPhotosFromDb, loadPhotosFromDb, savePhotosToDb } from './lib/photoStorage.ts';
import {
  detectInitialLanguage,
  saveLanguage,
  translateMoveDescription,
  UI_TEXT,
  type Language,
} from './lib/i18n.ts';
import {
  applyThemeToDocument,
  detectInitialTheme,
  saveTheme,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from './lib/theme.ts';
import { TopBar } from './components/TopBar.tsx';
import { PhotoUploader } from './components/PhotoUploader.tsx';
import { CubePreview3D, type AnimatingMoveState } from './components/CubePreview3D.tsx';
import type { PlaybackSpeed } from './components/SolvePanel.tsx';
import { WorkspaceMenuDrawer, type MenuTab } from './components/WorkspaceMenuDrawer.tsx';

interface AnalyzeApiResponse {
  palette?: CubePalette;
  faces: CubeFaces;
  confidences: CubeConfidenceMap;
  photoAnalyses: PhotoAnalysisSummary[];
  ambiguousStickers: AmbiguousStickerNote[];
  reasoningSummary: string;
  passCount: number;
  selfCorrected: boolean;
  recognitionDurationMs?: number;
  timingBreakdown?: RecognitionTimingBreakdown;
  error?: string;
}

interface RecognitionTimingStats {
  lastDurationMs: number;
  avgDurationMs: number;
  lastPhotoCount: number;
  sampleCount: number;
}

interface CubeWorkspaceSnapshot {
  palette: CubePalette;
  faces: CubeFaces;
  confidences: CubeConfidenceMap;
  photoAnalyses: PhotoAnalysisSummary[];
  ambiguousStickers: AmbiguousStickerNote[];
  reasoningSummary: string;
  passInfo: { passCount: number; selfCorrected: boolean } | null;
  lastTimingBreakdown?: RecognitionTimingBreakdown | null;
  detectedAssignments?: Record<string, ScanAssignment>;
  solveResult: SolveResult | null;
  activeStepIndex: number;
}

interface PersistedWorkspace {
  version: 1;
  cubeSize?: CubeSize;
  photos?: UploadedPhoto[]; // Legacy field only; photos are now stored in IndexedDB
  palette: CubePalette;
  faces: CubeFaces;
  confidences: CubeConfidenceMap;
  photoAnalyses: PhotoAnalysisSummary[];
  ambiguousStickers: AmbiguousStickerNote[];
  reasoningSummary: string;
  passInfo: { passCount: number; selfCorrected: boolean } | null;
  lastTimingBreakdown?: RecognitionTimingBreakdown | null;
  detectedAssignments?: Record<string, { face: FaceId; rotationCW: number }>;
  snapshotsBySize?: Partial<Record<'2' | '3', CubeWorkspaceSnapshot>>;
  recognitionMode?: RecognitionMode;
  aiSpeedMode?: AiSpeedMode;
  skipPass2?: boolean;
  solveResult: SolveResult | null;
  solverMode?: SolverMode;
  activeStepIndex: number;
  playbackSpeed: PlaybackSpeed;
}

const STORAGE_KEY = 'cubenet-lab-workspace-v1';
const TIMING_STORAGE_KEY = 'cubenet-lab-recognition-timing-v1';

const SCRAMBLE_MOVES: MoveToken[] = [
  'U', "U'", 'U2',
  'D', "D'", 'D2',
  'R', "R'", 'R2',
  'L', "L'", 'L2',
  'F', "F'", 'F2',
  'B', "B'", 'B2',
];

function invertMove(move: MoveToken): MoveToken {
  if (move.endsWith('2')) return move;
  if (move.endsWith("'")) return move[0] as MoveToken;
  return `${move}'` as MoveToken;
}

function getSpeedDurationMs(speed: PlaybackSpeed, move: MoveToken): number {
  const base = speed === 0.5 ? 885 : speed === 2 ? 250 : 495;
  return move.endsWith('2') ? Math.round(base * 2.15) : base;
}

function createEmptyWorkspaceSnapshot(size: CubeSize): CubeWorkspaceSnapshot {
  return {
    palette: { ...DEFAULT_PALETTE },
    faces: createEmptyFaces(size),
    confidences: createEmptyConfidences(size),
    photoAnalyses: [],
    ambiguousStickers: [],
    reasoningSummary: '',
    passInfo: null,
    lastTimingBreakdown: null,
    detectedAssignments: {},
    solveResult: null,
    activeStepIndex: 0,
  };
}

function loadRecognitionTiming(): RecognitionTimingStats | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TIMING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RecognitionTimingStats>;
    if (
      typeof parsed.lastDurationMs === 'number' &&
      typeof parsed.avgDurationMs === 'number' &&
      parsed.avgDurationMs > 0
    ) {
      return {
        lastDurationMs: parsed.lastDurationMs,
        avgDurationMs: parsed.avgDurationMs,
        lastPhotoCount: typeof parsed.lastPhotoCount === 'number' ? parsed.lastPhotoCount : 2,
        sampleCount: typeof parsed.sampleCount === 'number' ? parsed.sampleCount : 1,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function saveRecognitionTiming(stats: RecognitionTimingStats): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TIMING_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Ignore storage errors
  }
}

function estimateRecognitionDurationMs(
  photoCount: number,
  timing: RecognitionTimingStats | null
): number {
  if (timing && timing.avgDurationMs > 0) {
    const baseCount = Math.max(1, timing.lastPhotoCount || 2);
    const scale = 0.65 + 0.35 * (Math.max(1, photoCount) / baseCount);
    return Math.max(1800, Math.min(60000, Math.round(timing.avgDurationMs * scale)));
  }
  return 3000 + Math.max(1, photoCount) * 1100;
}

function loadPersistedWorkspace(): Partial<PersistedWorkspace> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedWorkspace>;
    if (!parsed || parsed.version !== 1 || !parsed.faces || !parsed.palette) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function filterPhotosBySize(list: UploadedPhoto[], size: CubeSize): UploadedPhoto[] {
  return list.filter((p) => (p.cubeSize ?? 3) === size);
}

function getCanvasScans(list: UploadedPhoto[], size: CubeSize): UploadedPhoto[] {
  return filterPhotosBySize(list, size)
    .filter((p) => p.scanMode === 'canvas' || Boolean(p.targetFace))
    .slice(0, 6);
}

function getAiPhotos(list: UploadedPhoto[], size: CubeSize): UploadedPhoto[] {
  return filterPhotosBySize(list, size)
    .filter((p) => p.scanMode !== 'canvas' && !p.targetFace)
    .slice(0, 6);
}

export default function App() {
  const [lang, setLang] = useState<Language>(() => detectInitialLanguage());
  const [theme, setTheme] = useState<ThemeMode>(() => detectInitialTheme());
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);
  const nativeTriggeredByStageRef = useRef(false);
  const [initialSaved] = useState<Partial<PersistedWorkspace> | null>(() =>
    loadPersistedWorkspace()
  );
  const tApp = UI_TEXT[lang].app;

  const initialCubeSize: CubeSize =
    initialSaved?.cubeSize === 2 || initialSaved?.cubeSize === 3
      ? initialSaved.cubeSize
      : inferCubeSizeFromFaces(initialSaved?.faces);

  const [cubeSize, setCubeSize] = useState<CubeSize>(initialCubeSize);
  const cubeSizeRef = useRef<CubeSize>(initialCubeSize);
  cubeSizeRef.current = cubeSize;

  const [photos, setPhotos] = useState<UploadedPhoto[]>(() => initialSaved?.photos ?? []);
  const photosHydratedRef = useRef(false);
  const photosTouchedRef = useRef(false);
  const colorSchemeMode = 'auto' as const;

  const [snapshotsBySize, setSnapshotsBySize] = useState<
    Partial<Record<'2' | '3', CubeWorkspaceSnapshot>>
  >(() => initialSaved?.snapshotsBySize ?? {});

  const [palette, setPalette] = useState<CubePalette>(
    () => initialSaved?.palette ?? { ...DEFAULT_PALETTE }
  );
  const [faces, setFaces] = useState<CubeFaces>(
    () =>
      initialSaved?.faces && inferCubeSizeFromFaces(initialSaved.faces) === initialCubeSize
        ? initialSaved.faces
        : createEmptyFaces(initialCubeSize)
  );
  const [confidences, setConfidences] = useState<CubeConfidenceMap>(
    () =>
      initialSaved?.confidences &&
      initialSaved.confidences.U?.length === initialCubeSize * initialCubeSize
        ? initialSaved.confidences
        : createEmptyConfidences(initialCubeSize)
  );
  const [photoAnalyses, setPhotoAnalyses] = useState<PhotoAnalysisSummary[]>(
    () => initialSaved?.photoAnalyses ?? []
  );
  const [ambiguousStickers, setAmbiguousStickers] = useState<AmbiguousStickerNote[]>(
    () => initialSaved?.ambiguousStickers ?? []
  );
  const [reasoningSummary, setReasoningSummary] = useState(
    () => initialSaved?.reasoningSummary ?? ''
  );
  const [passInfo, setPassInfo] = useState<{
    passCount: number;
    selfCorrected: boolean;
  } | null>(() => initialSaved?.passInfo ?? null);

  const [solverMode, setSolverMode] = useState<SolverMode>(
    () => initialSaved?.solverMode ?? initialSaved?.solveResult?.solverMode ?? 'lbl'
  );
  const [solveResult, setSolveResult] = useState<SolveResult | null>(
    () => initialSaved?.solveResult ?? null
  );
  const [activeStepIndex, setActiveStepIndex] = useState<number>(() => {
    const idx = initialSaved?.activeStepIndex ?? 0;
    const max = initialSaved?.solveResult?.steps?.length ?? 0;
    return Math.max(0, Math.min(idx, max));
  });
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(
    () => initialSaved?.playbackSpeed ?? 1
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [animatingMove, setAnimatingMove] = useState<AnimatingMoveState | null>(null);
  const [isScannerCollapsed, setIsScannerCollapsed] = useState(false);
  const lastSolveComputedAtRef = useRef(0);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTab, setMenuTab] = useState<MenuTab>('layout');
  const [focusedStickers, setFocusedStickers] = useState<StickerRef[]>([]);
  const [recognitionMode, setRecognitionMode] = useState<RecognitionMode>(
    () => initialSaved?.recognitionMode ?? 'ai'
  );
  const [aiSpeedMode, setAiSpeedMode] = useState<AiSpeedMode>(
    () => initialSaved?.aiSpeedMode ?? 'fast'
  );
  const [skipPass2, setSkipPass2] = useState<boolean>(
    () => initialSaved?.skipPass2 ?? false
  );
  const [lastTimingBreakdown, setLastTimingBreakdown] =
    useState<RecognitionTimingBreakdown | null>(
      () => initialSaved?.lastTimingBreakdown ?? null
    );
  const [detectedAssignments, setDetectedAssignments] = useState<
    Record<string, ScanAssignment>
  >(() => initialSaved?.detectedAssignments ?? {});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisElapsedMs, setAnalysisElapsedMs] = useState(0);
  const [analysisEstimateMs, setAnalysisEstimateMs] = useState(0);
  const [lastRecognitionMs, setLastRecognitionMs] = useState<number | null>(
    () => loadRecognitionTiming()?.lastDurationMs ?? null
  );
  const [apiError, setApiError] = useState<string | null>(null);
  const progressFloorRef = useRef(0);
  const analysisStartPerfRef = useRef(0);
  const analysisEstimateRef = useRef(5000);
  const timingStatsRef = useRef<RecognitionTimingStats | null>(loadRecognitionTiming());

  const animatingMoveRef = useRef<AnimatingMoveState | null>(null);
  animatingMoveRef.current = animatingMove;
  const playNextTimerRef = useRef<number | null>(null);
  const animKeyRef = useRef(0);
  const photosRef = useRef<UploadedPhoto[]>(photos);
  photosRef.current = photos;
  const canvasRunSeqRef = useRef(0);
  const alignDebounceTimerRef = useRef<number | null>(null);

  const clearPlaybackTimers = useCallback(() => {
    if (playNextTimerRef.current !== null) {
      window.clearTimeout(playNextTimerRef.current);
      playNextTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearPlaybackTimers();
  }, [clearPlaybackTimers]);

  // Hydrate photos from IndexedDB on mount (with seamless migration from legacy localStorage)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const dbPhotos = await loadPhotosFromDb();
      if (cancelled) return;
      photosHydratedRef.current = true;
      if (!photosTouchedRef.current) {
        if (dbPhotos.length > 0) {
          setPhotos(dbPhotos);
        } else if (initialSaved?.photos && initialSaved.photos.length > 0) {
          await savePhotosToDb(initialSaved.photos);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialSaved]);

  // Persist photos to IndexedDB whenever they change
  useEffect(() => {
    if (!photosHydratedRef.current && !photosTouchedRef.current) return;
    void savePhotosToDb(photos);
  }, [photos]);

  // Persist lightweight workspace metadata (excluding binary/base64 photos) to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload: PersistedWorkspace = {
      version: 1,
      cubeSize,
      palette,
      faces,
      confidences,
      photoAnalyses,
      ambiguousStickers,
      reasoningSummary,
      passInfo,
      lastTimingBreakdown,
      detectedAssignments,
      snapshotsBySize,
      recognitionMode,
      aiSpeedMode,
      skipPass2,
      solveResult,
      solverMode,
      activeStepIndex,
      playbackSpeed,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage disabled or full
    }
  }, [
    cubeSize,
    palette,
    faces,
    confidences,
    photoAnalyses,
    ambiguousStickers,
    reasoningSummary,
    passInfo,
    lastTimingBreakdown,
    detectedAssignments,
    snapshotsBySize,
    recognitionMode,
    aiSpeedMode,
    skipPass2,
    solveResult,
    solverMode,
    activeStepIndex,
    playbackSpeed,
  ]);

  useEffect(() => {
    saveLanguage(lang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.title = UI_TEXT[lang].docTitle;
    }
  }, [lang]);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      try {
        const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'dark' || saved === 'light') return;
      } catch {
        // Ignore storage errors
      }
      setTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const handleToggleLang = () => {
    setLang((prev) => (prev === 'en' ? 'ru' : 'en'));
  };

  const handleToggleTheme = () => {
    setTheme((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      saveTheme(next);
      return next;
    });
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const getFsElement = () =>
      document.fullscreenElement ||
      (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ||
      null;

    const syncFullscreen = () => {
      const active = Boolean(getFsElement());
      setIsBrowserFullscreen(active);
      if (!active && nativeTriggeredByStageRef.current) {
        nativeTriggeredByStageRef.current = false;
        setIsStageFullscreen(false);
      }
    };

    syncFullscreen();
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen as EventListener);
    };
  }, []);

  const tryEnterNativeFullscreen = useCallback(async (): Promise<boolean> => {
    if (typeof document === 'undefined') return false;
    const doc = document as Document & {
      webkitFullscreenEnabled?: boolean;
      webkitFullscreenElement?: Element | null;
    };
    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    try {
      if (root.requestFullscreen) {
        await root.requestFullscreen();
        return Boolean(document.fullscreenElement);
      }
      if (root.webkitRequestFullscreen) {
        await Promise.resolve(root.webkitRequestFullscreen());
        return Boolean(doc.webkitFullscreenElement ?? document.fullscreenElement);
      }
    } catch {
      return false;
    }
    return false;
  }, []);

  const tryExitNativeFullscreen = useCallback(async (): Promise<void> => {
    if (typeof document === 'undefined') return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
        await Promise.resolve(doc.webkitExitFullscreen());
      }
    } catch {
      // Ignore exit errors
    }
  }, []);

  const handleToggleAppFullscreen = useCallback(() => {
    void (async () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      const nativeActive = Boolean(document.fullscreenElement || doc.webkitFullscreenElement);

      if (nativeActive) {
        nativeTriggeredByStageRef.current = false;
        await tryExitNativeFullscreen();
        setIsStageFullscreen(false);
        return;
      }

      if (isStageFullscreen) {
        setIsStageFullscreen(false);
        return;
      }

      nativeTriggeredByStageRef.current = false;
      const entered = await tryEnterNativeFullscreen();
      if (!entered) {
        // Fallback for iOS Safari / restricted iframes without Fullscreen API support
        setIsStageFullscreen(true);
      }
    })();
  }, [isStageFullscreen, tryEnterNativeFullscreen, tryExitNativeFullscreen]);

  const handleToggleStageFullscreen = useCallback(() => {
    void (async () => {
      if (isStageFullscreen) {
        const shouldExitNative = nativeTriggeredByStageRef.current;
        nativeTriggeredByStageRef.current = false;
        setIsStageFullscreen(false);
        if (shouldExitNative) {
          await tryExitNativeFullscreen();
        }
        return;
      }

      setIsStageFullscreen(true);
      const isCompactViewport =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(max-width: 1023px), (max-height: 500px)').matches;
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      const alreadyNative = Boolean(document.fullscreenElement || doc.webkitFullscreenElement);

      if (isCompactViewport && !alreadyNative) {
        const entered = await tryEnterNativeFullscreen();
        if (entered) {
          nativeTriggeredByStageRef.current = true;
        }
      }
    })();
  }, [isStageFullscreen, tryEnterNativeFullscreen, tryExitNativeFullscreen]);

  const scopedPhotos = useMemo(
    () => filterPhotosBySize(photos, cubeSize),
    [photos, cubeSize]
  );

  const verification = useMemo(
    () => verifyCubeState(faces, colorSchemeMode, palette, lang),
    [faces, palette, lang]
  );

  const conflictStickers = useMemo(
    () => verification.issues.flatMap((issue) => issue.affectedStickers),
    [verification.issues]
  );

  const invalidateSolveState = useCallback(() => {
    clearPlaybackTimers();
    setIsPlaying(false);
    setAnimatingMove(null);
    setSolveResult(null);
    setActiveStepIndex(0);
  }, [clearPlaybackTimers]);

  const handleChangeCubeSize = useCallback(
    (nextSize: CubeSize) => {
      if (nextSize === cubeSize || animatingMove !== null || isAnalyzing) return;
      if (alignDebounceTimerRef.current !== null) {
        window.clearTimeout(alignDebounceTimerRef.current);
        alignDebounceTimerRef.current = null;
      }
      clearPlaybackTimers();
      setIsPlaying(false);
      setAnimatingMove(null);
      setFocusedStickers([]);
      setApiError(null);

      const currentSnap: CubeWorkspaceSnapshot = {
        palette,
        faces,
        confidences,
        photoAnalyses,
        ambiguousStickers,
        reasoningSummary,
        passInfo,
        lastTimingBreakdown,
        detectedAssignments,
        solveResult,
        activeStepIndex,
      };
      const targetKey = String(nextSize) as '2' | '3';
      const currentKey = String(cubeSize) as '2' | '3';
      const restored = snapshotsBySize[targetKey] ?? createEmptyWorkspaceSnapshot(nextSize);

      setSnapshotsBySize((prev) => ({
        ...prev,
        [currentKey]: currentSnap,
      }));
      cubeSizeRef.current = nextSize;
      setCubeSize(nextSize);
      setPalette(restored.palette);
      setFaces(
        inferCubeSizeFromFaces(restored.faces) === nextSize
          ? restored.faces
          : createEmptyFaces(nextSize)
      );
      setConfidences(
        restored.confidences?.U?.length === nextSize * nextSize
          ? restored.confidences
          : createEmptyConfidences(nextSize)
      );
      setPhotoAnalyses(restored.photoAnalyses ?? []);
      setAmbiguousStickers(restored.ambiguousStickers ?? []);
      setReasoningSummary(restored.reasoningSummary ?? '');
      setPassInfo(restored.passInfo ?? null);
      setLastTimingBreakdown(restored.lastTimingBreakdown ?? null);
      setDetectedAssignments(restored.detectedAssignments ?? {});
      setSolveResult(restored.solveResult ?? null);
      setActiveStepIndex(
        Math.max(
          0,
          Math.min(restored.activeStepIndex ?? 0, restored.solveResult?.steps?.length ?? 0)
        )
      );
    },
    [
      activeStepIndex,
      ambiguousStickers,
      animatingMove,
      clearPlaybackTimers,
      confidences,
      cubeSize,
      detectedAssignments,
      faces,
      isAnalyzing,
      lastTimingBreakdown,
      palette,
      passInfo,
      photoAnalyses,
      reasoningSummary,
      snapshotsBySize,
      solveResult,
    ]
  );

  const getFacesAtStep = useCallback(
    (stepIdx: number): CubeFaces => {
      if (!solveResult || stepIdx <= 0 || !solveResult.steps.length) {
        return faces;
      }
      const clamped = Math.min(stepIdx, solveResult.steps.length);
      return solveResult.steps[clamped - 1].facesAfter;
    },
    [faces, solveResult]
  );

  const displayedFaces = useMemo(
    () => getFacesAtStep(activeStepIndex),
    [activeStepIndex, getFacesAtStep]
  );

  const runAnimatedMove = useCallback(
    (move: MoveToken, baseFaces: CubeFaces, targetStepIndex: number) => {
      clearPlaybackTimers();
      const durationMs = getSpeedDurationMs(playbackSpeed, move);
      animKeyRef.current += 1;
      setAnimatingMove({
        move,
        durationMs,
        key: animKeyRef.current,
        baseFaces,
        targetStepIndex,
      });
    },
    [clearPlaybackTimers, playbackSpeed]
  );

  const handleMoveAnimationComplete = useCallback((completedKey: number) => {
    const curr = animatingMoveRef.current;
    if (!curr || curr.key !== completedKey) return;
    setActiveStepIndex(curr.targetStepIndex);
    setAnimatingMove(null);
  }, []);

  useEffect(() => {
    if (!isPlaying || animatingMove !== null) return;
    if (!solveResult || !solveResult.solvable || solveResult.steps.length === 0) {
      setIsPlaying(false);
      return;
    }
    if (activeStepIndex >= solveResult.steps.length) {
      setIsPlaying(false);
      return;
    }

    const pauseMs = playbackSpeed === 2 ? 30 : playbackSpeed === 0.5 ? 90 : 55;
    playNextTimerRef.current = window.setTimeout(() => {
      playNextTimerRef.current = null;
      const step = solveResult.steps[activeStepIndex];
      const baseFaces = getFacesAtStep(activeStepIndex);
      runAnimatedMove(step.move, baseFaces, activeStepIndex + 1);
    }, pauseMs);

    return () => {
      if (playNextTimerRef.current !== null) {
        window.clearTimeout(playNextTimerRef.current);
        playNextTimerRef.current = null;
      }
    };
  }, [
    isPlaying,
    animatingMove,
    solveResult,
    activeStepIndex,
    playbackSpeed,
    getFacesAtStep,
    runAnimatedMove,
  ]);

  const handleOpenMenu = (tab: MenuTab) => {
    setMenuTab(tab);
    setMenuOpen(true);
  };

  const computeSolutionForFaces = useCallback(
    (targetFaces: CubeFaces, mode: SolverMode, targetLang: Language): SolveResult => {
      const size = inferCubeSizeFromFaces(targetFaces);
      if (size === 2) {
        return solveCube2x2(targetFaces, targetLang);
      }
      return mode === 'kociemba'
        ? solveCubeKociemba(targetFaces, targetLang)
        : solveCube(targetFaces, targetLang);
    },
    []
  );

  const runCanvasAdHocAnalysis = useCallback(
    async (targetPhotos: UploadedPhoto[], targetSize: CubeSize = cubeSizeRef.current) => {
      const seq = ++canvasRunSeqRef.current;
      const canvasScans = getCanvasScans(targetPhotos, targetSize);

      try {
        const sampled = await sampleScansAdHoc(canvasScans, lang, targetSize);
        if (seq !== canvasRunSeqRef.current || cubeSizeRef.current !== targetSize) return;

        setApiError(null);
        setPalette(sampled.palette);
        setFaces(sampled.faces);
        setConfidences(sampled.confidences);
        setPhotoAnalyses(sampled.photoAnalyses);
        setAmbiguousStickers(sampled.ambiguousStickers);
        setDetectedAssignments(sampled.detectedAssignments);
        setReasoningSummary(sampled.reasoningSummary);
        setPassInfo({
          passCount: sampled.passCount,
          selfCorrected: sampled.selfCorrected,
        });

        if (canvasScans.length === 0) {
          invalidateSolveState();
          setPassInfo(null);
          setLastTimingBreakdown(null);
          return;
        }

        const canvasBreakdown: RecognitionTimingBreakdown = {
          mode: 'canvas',
          pass1Ms: 0,
          pass2Ms: 0,
          retries: 0,
          autoFixedRotation: sampled.selfCorrected,
          pass2Skipped: false,
          serverTotalMs: sampled.durationMs,
        };
        setLastTimingBreakdown(canvasBreakdown);

        const recognizedVerification = verifyCubeState(
          sampled.faces,
          colorSchemeMode,
          sampled.palette,
          lang
        );
        if (recognizedVerification.isSolvable) {
          clearPlaybackTimers();
          setIsPlaying(false);
          setAnimatingMove(null);
          const autoSolution = computeSolutionForFaces(sampled.faces, solverMode, lang);
          setSolveResult(autoSolution);
          setActiveStepIndex(0);
        } else {
          invalidateSolveState();
        }
      } catch (err) {
        if (seq !== canvasRunSeqRef.current || cubeSizeRef.current !== targetSize) return;
        setApiError(
          err instanceof Error ? err.message : UI_TEXT[lang].app.analyzeErrorFallback
        );
      }
    },
    [
      clearPlaybackTimers,
      colorSchemeMode,
      computeSolutionForFaces,
      invalidateSolveState,
      lang,
      solverMode,
    ]
  );

  useEffect(() => {
    return () => {
      if (alignDebounceTimerRef.current !== null) {
        window.clearTimeout(alignDebounceTimerRef.current);
      }
    };
  }, []);

  const handleAddPhotos = (newPhotos: UploadedPhoto[]) => {
    const activeSize = cubeSizeRef.current;
    photosTouchedRef.current = true;
    setApiError(null);
    const tagged = newPhotos.map((p) => ({ ...p, cubeSize: activeSize, scanMode: 'ai' as const }));
    const otherSizes = photosRef.current.filter((p) => (p.cubeSize ?? 3) !== activeSize);
    const canvasPart = getCanvasScans(photosRef.current, activeSize);
    const aiPart = [...getAiPhotos(photosRef.current, activeSize), ...tagged].slice(0, 6);
    const nextPhotos = [...otherSizes, ...aiPart, ...canvasPart];
    photosRef.current = nextPhotos;
    setPhotos(nextPhotos);
  };

  const handleRemovePhoto = (id: string) => {
    const activeSize = cubeSizeRef.current;
    const removed = photosRef.current.find((p) => p.id === id);
    photosTouchedRef.current = true;
    const nextPhotos = photosRef.current.filter((p) => p.id !== id);
    photosRef.current = nextPhotos;
    setPhotos(nextPhotos);

    if (
      removed &&
      (removed.cubeSize ?? 3) === activeSize &&
      (removed.scanMode === 'canvas' || Boolean(removed.targetFace))
    ) {
      if (alignDebounceTimerRef.current !== null) {
        window.clearTimeout(alignDebounceTimerRef.current);
        alignDebounceTimerRef.current = null;
      }
      void runCanvasAdHocAnalysis(nextPhotos, activeSize);
    }
  };

  const handleUpdatePhotoLabel = (id: string, label: string) => {
    photosTouchedRef.current = true;
    const nextPhotos = photosRef.current.map((p) => (p.id === id ? { ...p, label } : p));
    photosRef.current = nextPhotos;
    setPhotos(nextPhotos);
  };

  const handleAddCanvasScans = (newScans: UploadedPhoto[]) => {
    const activeSize = cubeSizeRef.current;
    if (alignDebounceTimerRef.current !== null) {
      window.clearTimeout(alignDebounceTimerRef.current);
      alignDebounceTimerRef.current = null;
    }
    photosTouchedRef.current = true;
    setApiError(null);
    const taggedScans = newScans.map((s) => ({
      ...s,
      cubeSize: activeSize,
      scanMode: 'canvas' as const,
    }));
    const otherSizes = photosRef.current.filter((p) => (p.cubeSize ?? 3) !== activeSize);
    const aiPart = getAiPhotos(photosRef.current, activeSize);
    const canvasPart = [...getCanvasScans(photosRef.current, activeSize), ...taggedScans].slice(0, 6);
    const nextPhotos = [...otherSizes, ...aiPart, ...canvasPart];
    photosRef.current = nextPhotos;
    setPhotos(nextPhotos);
    void runCanvasAdHocAnalysis(nextPhotos, activeSize);
  };

  const handleUpdateCanvasScanAlign = (id: string, squareAlign: PhotoCanvasAlign) => {
    const activeSize = cubeSizeRef.current;
    photosTouchedRef.current = true;
    const nextPhotos = photosRef.current.map((p) =>
      p.id === id ? { ...p, squareAlign } : p
    );
    photosRef.current = nextPhotos;
    setPhotos(nextPhotos);

    if (alignDebounceTimerRef.current !== null) {
      window.clearTimeout(alignDebounceTimerRef.current);
    }
    alignDebounceTimerRef.current = window.setTimeout(() => {
      alignDebounceTimerRef.current = null;
      void runCanvasAdHocAnalysis(photosRef.current, activeSize);
    }, 45);
  };

  const handleStickerChange = (face: FaceId, index: number, color: CubeColor) => {
    invalidateSolveState();
    setFaces((prev) => {
      const nextFace = [...prev[face]] as CubeFaces[FaceId];
      nextFace[index] = color;
      return { ...prev, [face]: nextFace };
    });
    setConfidences((prev) => {
      const nextConf = [...prev[face]] as CubeConfidenceMap[FaceId];
      nextConf[index] = color === '?' ? 'unscanned' : 'manual';
      return { ...prev, [face]: nextConf };
    });
  };

  const handleRotateFaceClockwise = (face: FaceId) => {
    invalidateSolveState();
    setFaces((prev) => ({
      ...prev,
      [face]: rotateFaceClockwise(prev[face]),
    }));
  };

  const handleLoadSolvedBase = () => {
    invalidateSolveState();
    setPalette({ ...DEFAULT_PALETTE });
    setFaces(createSolvedStandardFaces(cubeSize));
    setConfidences(createUniformConfidences('manual', cubeSize));
    setPhotoAnalyses([]);
    setAmbiguousStickers([]);
    setReasoningSummary('');
    setPassInfo(null);
    setLastTimingBreakdown(null);
    setApiError(null);
  };

  const handleScrambleCube = () => {
    invalidateSolveState();
    const canReuse =
      verification.isComplete && inferCubeSizeFromFaces(faces) === cubeSize;
    let base = canReuse ? faces : createSolvedStandardFaces(cubeSize);
    if (!canReuse) {
      setPalette({ ...DEFAULT_PALETTE });
    }
    const moveCount = cubeSize === 2 ? 12 : 18;
    let lastBase: BaseMove | null = null;
    for (let i = 0; i < moveCount; i++) {
      const choices = SCRAMBLE_MOVES.filter((m) => m[0] !== lastBase);
      const mv = choices[Math.floor(Math.random() * choices.length)];
      lastBase = mv[0] as BaseMove;
      base = applyMoveToFaces(base, mv);
    }
    setFaces(base);
    setConfidences(createUniformConfidences('manual', cubeSize));
    setPhotoAnalyses([]);
    setAmbiguousStickers([]);
    setReasoningSummary('');
    setPassInfo(null);
    setLastTimingBreakdown(null);
    setApiError(null);
  };

  const handleResetAll = () => {
    const activeSize = cubeSizeRef.current;
    if (alignDebounceTimerRef.current !== null) {
      window.clearTimeout(alignDebounceTimerRef.current);
      alignDebounceTimerRef.current = null;
    }
    canvasRunSeqRef.current += 1;
    invalidateSolveState();
    photosTouchedRef.current = true;
    const remainingPhotos = photosRef.current.filter((p) => (p.cubeSize ?? 3) !== activeSize);
    photosRef.current = remainingPhotos;
    setPhotos(remainingPhotos);
    if (remainingPhotos.length === 0) {
      void clearPhotosFromDb();
    }
    setPalette({ ...DEFAULT_PALETTE });
    setFaces(createEmptyFaces(activeSize));
    setConfidences(createEmptyConfidences(activeSize));
    setPhotoAnalyses([]);
    setAmbiguousStickers([]);
    setDetectedAssignments({});
    setReasoningSummary('');
    setPassInfo(null);
    setLastTimingBreakdown(null);
    setFocusedStickers([]);
    setApiError(null);
    const activeKey = String(activeSize) as '2' | '3';
    setSnapshotsBySize((prev) => ({
      ...prev,
      [activeKey]: createEmptyWorkspaceSnapshot(activeSize),
    }));
  };

  const handleComputeSolution = () => {
    clearPlaybackTimers();
    setIsPlaying(false);
    setAnimatingMove(null);
    lastSolveComputedAtRef.current = performance.now();
    const result = computeSolutionForFaces(faces, solverMode, lang);
    setSolveResult(result);
    setActiveStepIndex(0);
  };

  const handleChangeSolverMode = (nextMode: SolverMode) => {
    if (nextMode === solverMode || animatingMove !== null) return;
    clearPlaybackTimers();
    setIsPlaying(false);
    setAnimatingMove(null);
    setSolverMode(nextMode);
    if (verification.isSolvable) {
      const result = computeSolutionForFaces(faces, nextMode, lang);
      setSolveResult(result);
      setActiveStepIndex(0);
    } else {
      setSolveResult(null);
      setActiveStepIndex(0);
    }
  };

  const handleTogglePlay = () => {
    if (!solveResult || !solveResult.solvable || solveResult.steps.length === 0) return;
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (performance.now() - lastSolveComputedAtRef.current < 350) {
      return;
    }
    if (activeStepIndex >= solveResult.steps.length) {
      clearPlaybackTimers();
      setAnimatingMove(null);
      setActiveStepIndex(0);
    }
    setIsPlaying(true);
  };

  const handleStepForward = () => {
    if (!solveResult || !solveResult.solvable || isPlaying || animatingMove) return;
    if (activeStepIndex >= solveResult.steps.length) return;
    const step = solveResult.steps[activeStepIndex];
    runAnimatedMove(step.move, getFacesAtStep(activeStepIndex), activeStepIndex + 1);
  };

  const handleStepBackward = () => {
    if (!solveResult || !solveResult.solvable || isPlaying || animatingMove) return;
    if (activeStepIndex <= 0) return;
    const step = solveResult.steps[activeStepIndex - 1];
    runAnimatedMove(
      invertMove(step.move),
      getFacesAtStep(activeStepIndex),
      activeStepIndex - 1
    );
  };

  const handleJumpToStep = (stepIndex: number) => {
    clearPlaybackTimers();
    setIsPlaying(false);
    setAnimatingMove(null);
    const max = solveResult?.steps.length ?? 0;
    setActiveStepIndex(Math.max(0, Math.min(stepIndex, max)));
  };

  const handleClearSolution = () => {
    invalidateSolveState();
  };

  // Smooth 60ms time-driven progress loop based on previous measured recognition duration
  useEffect(() => {
    if (!isAnalyzing) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.max(0, performance.now() - analysisStartPerfRef.current);
      setAnalysisElapsedMs(elapsed);

      const est = Math.max(1200, analysisEstimateRef.current);
      const ratio = elapsed / est;
      const timePct =
        ratio <= 0.88
          ? 4 + (ratio / 0.88) * 84
          : 88 + 8 * (1 - Math.exp(-(ratio - 0.88) * 2.5));

      const target = Math.min(97, Math.max(progressFloorRef.current, timePct));
      setAnalysisProgress((prev) => Math.max(prev, Number(target.toFixed(1))));
    }, 60);
    return () => window.clearInterval(timer);
  }, [isAnalyzing]);

  const mapServerStageLabel = useCallback(
    (stageKey: string): { label: string; floor: number } => {
      if (stageKey === 'prepare') return { label: tApp.progressPrepare, floor: 8 };
      if (stageKey === 'reverify') return { label: tApp.progressReverify, floor: 16 };
      if (stageKey === 'pass1') return { label: tApp.progressPass1, floor: 14 };
      if (stageKey === 'verify') return { label: tApp.progressVerify, floor: 86 };
      if (stageKey === 'pass2') return { label: tApp.progressPass2, floor: 72 };
      return { label: tApp.analyzePhase, floor: 12 };
    },
    [tApp]
  );

  const runAnalysis = async (useExistingForReverify: boolean) => {
    if (isAnalyzing) return;
    const activeSize = cubeSizeRef.current;

    // Option 2 (comparison mode): Offline <1s unordered per-side ad-hoc CIE Lab + topology solver
    if (recognitionMode === 'canvas' && !useExistingForReverify) {
      const canvasScans = getCanvasScans(photosRef.current, activeSize);
      if (canvasScans.length === 0) return;
      if (alignDebounceTimerRef.current !== null) {
        window.clearTimeout(alignDebounceTimerRef.current);
        alignDebounceTimerRef.current = null;
      }

      analysisStartPerfRef.current = performance.now();
      analysisEstimateRef.current = 250;
      progressFloorRef.current = 25;
      setAnalysisEstimateMs(250);
      setAnalysisElapsedMs(0);
      setIsAnalyzing(true);
      setApiError(null);
      setAnalysisProgress(30);
      setAnalysisPhase(UI_TEXT[lang].uploader.canvasAnalyzing);

      try {
        await runCanvasAdHocAnalysis(photosRef.current, activeSize);
        const elapsed = Math.max(1, Math.round(performance.now() - analysisStartPerfRef.current));
        setAnalysisElapsedMs(elapsed);
        setAnalysisProgress(100);
      } finally {
        setIsAnalyzing(false);
        setAnalysisPhase('');
        setAnalysisProgress(0);
        setAnalysisElapsedMs(0);
        progressFloorRef.current = 0;
      }
      return;
    }

    const aiList = getAiPhotos(photosRef.current, activeSize);
    const aiInput =
      aiList.length > 0
        ? aiList
        : useExistingForReverify
        ? filterPhotosBySize(photosRef.current, activeSize)
        : [];
    if (aiInput.length === 0) return;
    invalidateSolveState();

    const estMs = estimateRecognitionDurationMs(aiInput.length, timingStatsRef.current);
    analysisStartPerfRef.current = performance.now();
    analysisEstimateRef.current = estMs;
    progressFloorRef.current = 4;

    setAnalysisEstimateMs(estMs);
    setAnalysisElapsedMs(0);
    setIsAnalyzing(true);
    setApiError(null);
    setAnalysisProgress(4);
    setAnalysisPhase(
      useExistingForReverify ? tApp.progressReverify : tApp.progressPrepare
    );

    try {
      // Automatically normalize oversized (>768px) cached photos without blurring stickers
      const preparedImages = await Promise.all(
        aiInput.map(async (p) => ({
          dataUrl: await downscaleDataUrl(p.dataUrl, 768, 0.85),
          label: p.label,
        }))
      );

      const response = await fetch('/api/analyze-cube?stream=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cubeSize: activeSize,
          images: preparedImages,
          colorSchemeMode,
          existingFaces: useExistingForReverify ? faces : undefined,
          existingPalette: useExistingForReverify ? palette : undefined,
          skipPass2: useExistingForReverify ? false : skipPass2,
          aiSpeedMode,
          lang,
        }),
      });

      let data: AnalyzeApiResponse | null = null;
      const contentType = response.headers.get('content-type') ?? '';

      if (contentType.includes('application/x-ndjson') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;
            const evt = JSON.parse(line) as
              | { type: 'progress'; percent: number; stageKey: string }
              | { type: 'result'; data: AnalyzeApiResponse }
              | { type: 'error'; error?: string };

            if (evt.type === 'progress') {
              const info = mapServerStageLabel(evt.stageKey);
              progressFloorRef.current = Math.max(progressFloorRef.current, info.floor);
              if (evt.stageKey === 'pass2') {
                // Pass 2 extends total expected run time dynamically if Pass 1 had conflicts
                const elapsedNow = Math.max(1000, performance.now() - analysisStartPerfRef.current);
                const extendedEst = Math.max(analysisEstimateRef.current, Math.round(elapsedNow * 1.45));
                analysisEstimateRef.current = extendedEst;
                setAnalysisEstimateMs(extendedEst);
              }
              setAnalysisPhase(info.label);
              setAnalysisProgress((prev) => Math.max(prev, info.floor));
            } else if (evt.type === 'error') {
              throw new Error(evt.error || `Server error (${response.status})`);
            } else if (evt.type === 'result') {
              data = evt.data;
            }
          }
        }
      } else {
        const parsed = (await response.json()) as AnalyzeApiResponse;
        if (!response.ok) {
          throw new Error(parsed.error || `Server error (${response.status})`);
        }
        data = parsed;
      }

      if (!data) {
        throw new Error(tApp.analyzeErrorFallback);
      }

      const nextPalette = data.palette ?? palette;
      if (data.palette) {
        setPalette(data.palette);
      }
      setFaces(data.faces);
      setConfidences(data.confidences);
      setPhotoAnalyses(data.photoAnalyses ?? []);
      setAmbiguousStickers(data.ambiguousStickers ?? []);
      setReasoningSummary(data.reasoningSummary ?? '');
      setPassInfo({
        passCount: data.passCount ?? 1,
        selfCorrected: Boolean(data.selfCorrected),
      });

      const recognizedVerification = verifyCubeState(
        data.faces,
        colorSchemeMode,
        nextPalette,
        lang
      );
      if (recognizedVerification.isSolvable) {
        progressFloorRef.current = 96;
        setAnalysisProgress((prev) => Math.max(prev, 96));
        setAnalysisPhase(tApp.progressSolve);
        const autoSolution = computeSolutionForFaces(data.faces, solverMode, lang);
        setSolveResult(autoSolution);
        setActiveStepIndex(0);
      }

      const totalElapsedMs = Math.max(
        200,
        Math.round(performance.now() - analysisStartPerfRef.current)
      );
      const breakdown: RecognitionTimingBreakdown = data.timingBreakdown ?? {
        mode: 'ai',
        pass1Ms: data.recognitionDurationMs ?? totalElapsedMs,
        pass2Ms: 0,
        retries: 0,
        autoFixedRotation: Boolean(data.selfCorrected),
        pass2Skipped: false,
        serverTotalMs: data.recognitionDurationMs ?? totalElapsedMs,
      };
      setLastTimingBreakdown(breakdown);

      const prevStats = timingStatsRef.current;
      const nextAvg = prevStats
        ? Math.round(prevStats.avgDurationMs * 0.4 + totalElapsedMs * 0.6)
        : totalElapsedMs;
      const updatedStats: RecognitionTimingStats = {
        lastDurationMs: totalElapsedMs,
        avgDurationMs: nextAvg,
        lastPhotoCount: aiInput.length,
        sampleCount: (prevStats?.sampleCount ?? 0) + 1,
      };
      timingStatsRef.current = updatedStats;
      saveRecognitionTiming(updatedStats);
      setLastRecognitionMs(totalElapsedMs);
      setAnalysisElapsedMs(totalElapsedMs);
      setAnalysisProgress(100);
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : tApp.analyzeErrorFallback
      );
    } finally {
      setIsAnalyzing(false);
      setAnalysisPhase('');
      setAnalysisProgress(0);
      setAnalysisElapsedMs(0);
      progressFloorRef.current = 0;
    }
  };

  const hasPhotosOrData = scopedPhotos.length > 0 || verification.knownStickerCount > 0;
  const isSolvePreviewLocked = activeStepIndex > 0 || animatingMove !== null || isPlaying;

  const activeMoveFace: FaceId | null = useMemo(() => {
    if (animatingMove) return animatingMove.move[0] as FaceId;
    if (solveResult && activeStepIndex > 0 && solveResult.steps[activeStepIndex - 1]) {
      return solveResult.steps[activeStepIndex - 1].move[0] as FaceId;
    }
    return null;
  }, [animatingMove, solveResult, activeStepIndex]);

  const activeStepLabel: string | null = useMemo(() => {
    if (animatingMove) {
      const nextStep = solveResult?.steps[activeStepIndex];
      return nextStep
        ? tApp.turnLabel(
            nextStep.index,
            solveResult?.steps.length ?? 0,
            animatingMove.move,
            translateMoveDescription(animatingMove.move, lang)
          )
        : tApp.turnFallback(animatingMove.move);
    }
    if (solveResult && activeStepIndex > 0 && solveResult.steps[activeStepIndex - 1]) {
      const curr = solveResult.steps[activeStepIndex - 1];
      return tApp.stepLabel(
        curr.index,
        solveResult.steps.length,
        curr.move,
        translateMoveDescription(curr.move, lang)
      );
    }
    return null;
  }, [animatingMove, solveResult, activeStepIndex, lang, tApp]);

  const hasPlayableSolution = Boolean(
    solveResult?.solvable && !solveResult.alreadySolved && solveResult.steps.length > 0
  );

  return (
    <div className="min-h-screen flex flex-col text-slate-900 dark:text-slate-100">
      <TopBar
        lang={lang}
        theme={theme}
        isFullscreen={isBrowserFullscreen || isStageFullscreen}
        cubeSize={cubeSize}
        issueCount={verification.issues.length}
        knownStickerCount={verification.knownStickerCount}
        totalStickerCount={cubeSize * cubeSize * 6}
        hasPlayableSolution={hasPlayableSolution}
        isAnimating={animatingMove !== null}
        isAnalyzing={isAnalyzing}
        onChangeCubeSize={handleChangeCubeSize}
        onOpenMenu={handleOpenMenu}
        onToggleLang={handleToggleLang}
        onToggleTheme={handleToggleTheme}
        onToggleFullscreen={handleToggleAppFullscreen}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-5 py-3.5 sm:py-5 [@media(max-height:500px)]:py-2.5 flex flex-col gap-3.5 [@media(max-height:500px)]:gap-2.5">
        {apiError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/80 text-rose-900 dark:text-rose-100 rounded-xl text-xs sm:text-sm"
          >
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold">{tApp.recognitionFailed}</div>
              <div className="text-xs mt-0.5 text-rose-800 dark:text-rose-200">{apiError}</div>
            </div>
          </div>
        )}

        {/* Compact 2-panel Workspace (Portrait stacked; Landscape/Desktop side-by-side) */}
        <div
          className={`grid grid-cols-1 gap-3.5 sm:gap-5 [@media(max-height:500px)]:gap-3 items-start ${
            isScannerCollapsed
              ? 'sm:grid-cols-[52px_1fr]'
              : 'sm:grid-cols-[300px_1fr] lg:grid-cols-[356px_1fr]'
          }`}
        >
          <div className={`min-w-0 ${isScannerCollapsed ? 'sm:sticky sm:top-16 [@media(max-height:500px)]:sm:top-13' : ''}`}>
            <PhotoUploader
              lang={lang}
              cubeSize={cubeSize}
              photos={scopedPhotos}
              recognitionMode={recognitionMode}
              aiSpeedMode={aiSpeedMode}
              skipPass2={skipPass2}
              detectedAssignments={detectedAssignments}
              onChangeRecognitionMode={setRecognitionMode}
              onChangeAiSpeedMode={setAiSpeedMode}
              onChangeSkipPass2={setSkipPass2}
              onAddPhotos={handleAddPhotos}
              onRemovePhoto={handleRemovePhoto}
              onUpdatePhotoLabel={handleUpdatePhotoLabel}
              onAddCanvasScans={handleAddCanvasScans}
              onUpdateCanvasScanAlign={handleUpdateCanvasScanAlign}
              onAnalyze={() => void runAnalysis(false)}
              isAnalyzing={isAnalyzing}
              analysisPhase={analysisPhase}
              analysisProgress={analysisProgress}
              analysisElapsedMs={analysisElapsedMs}
              analysisEstimateMs={analysisEstimateMs}
              lastRecognitionMs={lastRecognitionMs}
              lastTimingBreakdown={lastTimingBreakdown}
              isCollapsed={isScannerCollapsed}
              onSetCollapsed={setIsScannerCollapsed}
            />
          </div>

          <div className="sm:sticky sm:top-16 [@media(max-height:500px)]:sm:top-13 min-w-0">
            <CubePreview3D
              lang={lang}
              appTheme={theme}
              cubeSize={cubeSize}
              faces={displayedFaces}
              palette={palette}
              animatingMove={animatingMove}
              activeStepLabel={activeStepLabel}
              canSolve={verification.isSolvable}
              issueCount={verification.issues.length}
              solveResult={solveResult}
              solverMode={solverMode}
              activeStepIndex={activeStepIndex}
              isPlaying={isPlaying}
              isAnimating={animatingMove !== null}
              playbackSpeed={playbackSpeed}
              onMoveAnimationComplete={handleMoveAnimationComplete}
              onComputeSolution={handleComputeSolution}
              onChangeSolverMode={handleChangeSolverMode}
              onTogglePlay={handleTogglePlay}
              onStepForward={handleStepForward}
              onStepBackward={handleStepBackward}
              onJumpToStep={handleJumpToStep}
              onChangeSpeed={setPlaybackSpeed}
              onScrambleCube={handleScrambleCube}
              onOpenMenu={handleOpenMenu}
              isFullscreen={isStageFullscreen}
              onToggleFullscreen={handleToggleStageFullscreen}
            />
          </div>
        </div>
      </main>

      <WorkspaceMenuDrawer
        lang={lang}
        cubeSize={cubeSize}
        isOpen={menuOpen}
        activeTab={menuTab}
        onChangeTab={setMenuTab}
        onClose={() => setMenuOpen(false)}
        solveResult={solveResult}
        solverMode={solverMode}
        activeStepIndex={activeStepIndex}
        isAnimating={animatingMove !== null}
        onComputeSolution={handleComputeSolution}
        onChangeSolverMode={handleChangeSolverMode}
        onJumpToStep={handleJumpToStep}
        onClearSolution={handleClearSolution}
        displayedFaces={displayedFaces}
        rawFaces={faces}
        palette={palette}
        confidences={confidences}
        conflictStickers={conflictStickers}
        focusedStickers={focusedStickers}
        activeMoveFace={activeMoveFace}
        isSolvePreviewLocked={isSolvePreviewLocked}
        onExitSolvePreview={() => handleJumpToStep(0)}
        onStickerChange={handleStickerChange}
        onRotateFaceClockwise={handleRotateFaceClockwise}
        verification={verification}
        photoAnalyses={photoAnalyses}
        ambiguousStickers={ambiguousStickers}
        reasoningSummary={reasoningSummary}
        passInfo={passInfo}
        timingBreakdown={lastTimingBreakdown}
        hasPhotos={scopedPhotos.length > 0}
        isAnalyzing={isAnalyzing}
        onFocusStickers={setFocusedStickers}
        onReverifyWithAi={() => void runAnalysis(true)}
        hasPhotosOrData={hasPhotosOrData}
        onScrambleCube={handleScrambleCube}
        onLoadSolvedBase={handleLoadSolvedBase}
        onResetAll={handleResetAll}
      />
    </div>
  );
}
