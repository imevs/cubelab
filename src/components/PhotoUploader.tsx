import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
  type DragEvent,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Upload,
  Trash2,
  X,
  Scan,
  AlertCircle,
  Zap,
  Sparkles,
  RotateCcw,
  Check,
} from 'lucide-react';
import type {
  AiSpeedMode,
  CubeSize,
  PhotoCanvasAlign,
  RecognitionMode,
  RecognitionTimingBreakdown,
} from '../shared/cubeTypes.ts';
import { normalizeImageFile, type UploadedPhoto } from '../lib/imageUtils.ts';
import {
  DEFAULT_SQUARE_ALIGN,
  areSquareRgbsSteady,
  evaluateLiveSquareFrame,
  getSquareSamplePoints,
  isDuplicateFaceScan,
  previewSquareSamples,
  sampleSquareFromImageData,
  type LiveSquareEvaluation,
  type Rgb,
  type ScanAssignment,
} from '../lib/canvasSampler.ts';
import {
  formatTimingBreakdown,
  translatePhotoLabel,
  UI_TEXT,
  type Language,
} from '../lib/i18n.ts';

interface PhotoUploaderProps {
  lang: Language;
  cubeSize: CubeSize;
  photos: UploadedPhoto[];
  recognitionMode: RecognitionMode;
  aiSpeedMode: AiSpeedMode;
  skipPass2: boolean;
  detectedAssignments: Record<string, ScanAssignment>;
  onChangeRecognitionMode: (mode: RecognitionMode) => void;
  onChangeAiSpeedMode: (mode: AiSpeedMode) => void;
  onChangeSkipPass2: (skip: boolean) => void;
  onAddPhotos: (newPhotos: UploadedPhoto[]) => void;
  onRemovePhoto: (id: string) => void;
  onUpdatePhotoLabel: (id: string, label: string) => void;
  onAddCanvasScans: (newScans: UploadedPhoto[]) => void;
  onUpdateCanvasScanAlign: (id: string, align: PhotoCanvasAlign) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  analysisPhase: string;
  analysisProgress: number;
  analysisElapsedMs: number;
  analysisEstimateMs: number;
  lastRecognitionMs: number | null;
  lastTimingBreakdown: RecognitionTimingBreakdown | null;
  isCollapsed?: boolean;
  onSetCollapsed?: (collapsed: boolean) => void;
}

const ANGLE_OPTIONS = [
  'Auto-Detect Angle',
  'View 1: Top + Front + Right',
  'View 2: Bottom + Back + Left',
  'Single Face Only',
];

const HOLD_REQUIRED_MS = 2000;

function isCanvasScanPhoto(p: UploadedPhoto): boolean {
  return p.scanMode === 'canvas' || Boolean(p.targetFace);
}

function computeSquareOverlay(
  w: number,
  h: number,
  align: PhotoCanvasAlign | undefined,
  gridN: CubeSize
) {
  const { boxX, boxY, boxSize, points } = getSquareSamplePoints(w, h, align, gridN);
  const cellSize = boxSize / gridN;
  const lines = gridN === 2 ? [1] : [1, 2];
  return { boxX, boxY, boxSize, cellSize, lines, points };
}

function extractScanRgbsFromDataUrl(
  dataUrl: string,
  align: PhotoCanvasAlign | undefined,
  gridN: CubeSize
): Promise<Rgb[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve([]);
    img.onload = () => {
      const w = Math.min(160, img.naturalWidth || img.width || 160);
      const h = Math.min(120, img.naturalHeight || img.height || 120);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve([]);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      resolve(sampleSquareFromImageData(imgData.data, w, h, align, gridN));
    };
    img.src = dataUrl;
  });
}

export function PhotoUploader({
  lang,
  cubeSize,
  photos,
  recognitionMode,
  aiSpeedMode,
  skipPass2,
  detectedAssignments,
  onChangeRecognitionMode,
  onChangeAiSpeedMode,
  onChangeSkipPass2,
  onAddPhotos,
  onRemovePhoto,
  onUpdatePhotoLabel,
  onAddCanvasScans,
  onUpdateCanvasScanAlign,
  onAnalyze,
  isAnalyzing,
  analysisPhase,
  analysisProgress,
  analysisElapsedMs,
  analysisEstimateMs,
  lastRecognitionMs,
  lastTimingBreakdown,
  isCollapsed: controlledCollapsed,
  onSetCollapsed,
}: PhotoUploaderProps) {
  const t = UI_TEXT[lang].uploader;
  const tileCount = cubeSize * cubeSize;
  const totalStickers = tileCount * 6;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasFileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = controlledCollapsed ?? internalCollapsed;
  const setCollapsed = useCallback(
    (next: boolean) => {
      if (onSetCollapsed) {
        onSetCollapsed(next);
      } else {
        setInternalCollapsed(next);
      }
    },
    [onSetCollapsed]
  );
  const [isDragging, setIsDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileProgress, setFileProgress] = useState<{ done: number; total: number } | null>(null);

  // Offline Canvas unordered per-side state
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const [liveEval, setLiveEval] = useState<LiveSquareEvaluation | null>(null);
  const [holdProgressMs, setHoldProgressMs] = useState(0);
  const [duplicateHoldWarning, setDuplicateHoldWarning] = useState(false);
  const [capturedFlash, setCapturedFlash] = useState(false);
  const [alignDims, setAlignDims] = useState<{ w: number; h: number }>({ w: 400, h: 300 });
  const [previewHexes, setPreviewHexes] = useState<string[] | null>(null);

  const aiPhotos = useMemo(() => photos.filter((p) => !isCanvasScanPhoto(p)), [photos]);
  const canvasScans = useMemo(() => photos.filter(isCanvasScanPhoto), [photos]);

  const canvasScansRef = useRef<UploadedPhoto[]>(canvasScans);
  canvasScansRef.current = canvasScans;
  const existingScanRgbsRef = useRef<Rgb[][]>([]);
  const holdAnchorRgbsRef = useRef<Rgb[] | null>(null);
  const holdStartTimeRef = useRef<number | null>(null);
  const missedFramesRef = useRef(0);
  const captureCooldownUntilRef = useRef(0);
  const flashTimerRef = useRef<number | null>(null);
  const captureFromCameraRef = useRef<() => void>(() => {});
  const stopCameraRef = useRef<() => void>(() => {});

  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origCx: number;
    origCy: number;
  } | null>(null);

  // Reset live camera hold anchors whenever cubeSize switches
  useEffect(() => {
    holdAnchorRgbsRef.current = null;
    holdStartTimeRef.current = null;
    missedFramesRef.current = 0;
    setHoldProgressMs(0);
    setDuplicateHoldWarning(false);
    setLiveEval(null);
  }, [cubeSize]);

  // Keep selectedScanId pointing at a valid scan when scans are added/removed
  useEffect(() => {
    if (canvasScans.length === 0) {
      setSelectedScanId(null);
      return;
    }
    if (!selectedScanId || !canvasScans.some((s) => s.id === selectedScanId)) {
      setSelectedScanId(canvasScans[canvasScans.length - 1].id);
    }
  }, [canvasScans, selectedScanId]);

  const selectedScan = useMemo(
    () => canvasScans.find((s) => s.id === selectedScanId) ?? null,
    [canvasScans, selectedScanId]
  );
  const activeSquareAlign: PhotoCanvasAlign = selectedScan?.squareAlign ?? DEFAULT_SQUARE_ALIGN;

  // Precompute RGB signatures of existing scans for duplicate-side guard during live camera hold
  useEffect(() => {
    let cancelled = false;
    if (canvasScans.length === 0) {
      existingScanRgbsRef.current = [];
      return;
    }
    void Promise.all(
      canvasScans.map((s) => extractScanRgbsFromDataUrl(s.dataUrl, s.squareAlign, cubeSize))
    ).then((rgbsList) => {
      if (!cancelled) {
        existingScanRgbsRef.current = rgbsList.filter((r) => r.length === tileCount);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [canvasScans, cubeSize, tileCount]);

  const cameraSquareOverlay = useMemo(
    () => computeSquareOverlay(400, 300, undefined, cubeSize),
    [cubeSize]
  );
  const activeAlignOverlay = useMemo(
    () => computeSquareOverlay(alignDims.w, alignDims.h, activeSquareAlign, cubeSize),
    [alignDims.w, alignDims.h, activeSquareAlign, cubeSize]
  );

  // Preview 4 (2x2) or 9 (3x3) sampled dots inside the alignment editor when a scan thumbnail is selected
  useEffect(() => {
    if (recognitionMode !== 'canvas' || !selectedScan) {
      setPreviewHexes(null);
      return;
    }
    let cancelled = false;
    void previewSquareSamples(selectedScan.dataUrl, activeSquareAlign, cubeSize)
      .then((hexes) => {
        if (!cancelled) setPreviewHexes(hexes);
      })
      .catch(() => {
        if (!cancelled) setPreviewHexes(null);
      });
    return () => {
      cancelled = true;
    };
  }, [recognitionMode, selectedScan, activeSquareAlign, cubeSize]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((tr) => tr.stop());
      }
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
    holdAnchorRgbsRef.current = null;
    holdStartTimeRef.current = null;
    missedFramesRef.current = 0;
    setHoldProgressMs(0);
    setDuplicateHoldWarning(false);
    setLiveEval(null);
    setCameraOpen(false);
  }, []);

  const openCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(t.cameraUnavailable);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      holdAnchorRgbsRef.current = null;
      holdStartTimeRef.current = null;
      missedFramesRef.current = 0;
      setHoldProgressMs(0);
      setDuplicateHoldWarning(false);
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
    } catch {
      setCameraError(t.cameraDenied);
    }
  };

  const captureFromCamera = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (recognitionMode === 'canvas') {
      if (canvasScansRef.current.length >= 6) {
        stopCamera();
        return;
      }
    } else if (aiPhotos.length >= 6) {
      return;
    }

    const rawW = video.videoWidth || 640;
    const rawH = video.videoHeight || 480;
    const targetRatio = 4 / 3;
    const srcRatio = rawW / rawH;
    let sx = 0;
    let sy = 0;
    let sW = rawW;
    let sH = rawH;
    if (srcRatio > targetRatio) {
      sW = Math.round(rawH * targetRatio);
      sx = Math.round((rawW - sW) / 2);
    } else if (srcRatio < targetRatio) {
      sH = Math.round(rawW / targetRatio);
      sy = Math.round((rawH - sH) / 2);
    }

    const outW = Math.min(768, sW);
    const outH = Math.round((outW * 3) / 4);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, sx, sy, sW, sH, 0, 0, outW, outH);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    if (recognitionMode === 'canvas') {
      const scanNum = canvasScansRef.current.length + 1;
      const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newScan: UploadedPhoto = {
        id: scanId,
        dataUrl,
        name: t.scanSlotLabel(scanNum),
        label: 'Single Face Only',
        scanMode: 'canvas',
        cubeSize,
        squareAlign: { ...DEFAULT_SQUARE_ALIGN },
      };

      // Reset hold state & flash feedback immediately
      holdAnchorRgbsRef.current = null;
      holdStartTimeRef.current = null;
      missedFramesRef.current = 0;
      captureCooldownUntilRef.current = performance.now() + 700;
      setHoldProgressMs(0);
      setCapturedFlash(true);
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => setCapturedFlash(false), 650);

      setSelectedScanId(scanId);
      onAddCanvasScans([newScan]);

      if (canvasScansRef.current.length + 1 >= 6) {
        stopCamera();
      }
      return;
    }

    const nextIndex = aiPhotos.length + 1;
    onAddPhotos([
      {
        id: `cam-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        dataUrl,
        name: t.cameraCaptureName(nextIndex),
        label:
          nextIndex === 1
            ? 'View 1: Top + Front + Right'
            : nextIndex === 2
            ? 'View 2: Bottom + Back + Left'
            : 'Auto-Detect Angle',
        scanMode: 'ai',
        cubeSize,
      },
    ]);
    if (aiPhotos.length + 1 >= 6) {
      stopCamera();
    }
  }, [aiPhotos.length, cubeSize, onAddCanvasScans, onAddPhotos, recognitionMode, stopCamera, t]);

  captureFromCameraRef.current = captureFromCamera;
  stopCameraRef.current = stopCamera;

  // Real-time 2x2 or 3x3 recognition & 2-second steady-hold auto-capture loop in Offline Canvas mode
  useEffect(() => {
    if (!cameraOpen || recognitionMode !== 'canvas') {
      return;
    }
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      if (canvasScansRef.current.length >= 6) {
        stopCameraRef.current();
        return;
      }

      if (!liveCanvasRef.current) {
        liveCanvasRef.current = document.createElement('canvas');
      }
      const c = liveCanvasRef.current;
      const w = 160;
      const h = 120;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const rawW = video.videoWidth;
      const rawH = video.videoHeight;
      const targetRatio = 4 / 3;
      const srcRatio = rawW / rawH;
      let sx = 0;
      let sy = 0;
      let sW = rawW;
      let sH = rawH;
      if (srcRatio > targetRatio) {
        sW = Math.round(rawH * targetRatio);
        sx = Math.round((rawW - sW) / 2);
      } else if (srcRatio < targetRatio) {
        sH = Math.round(rawW / targetRatio);
        sy = Math.round((rawH - sH) / 2);
      }

      ctx.drawImage(video, sx, sy, sW, sH, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const evaluation = evaluateLiveSquareFrame(imgData.data, w, h, undefined, cubeSize);
      setLiveEval(evaluation);

      const now = performance.now();
      if (now < captureCooldownUntilRef.current) {
        holdAnchorRgbsRef.current = null;
        holdStartTimeRef.current = null;
        setHoldProgressMs(0);
        return;
      }

      const isDup =
        evaluation.allReady &&
        isDuplicateFaceScan(evaluation.rgbs, existingScanRgbsRef.current);
      setDuplicateHoldWarning(isDup);

      if (!autoCaptureEnabled || isDup) {
        holdAnchorRgbsRef.current = null;
        holdStartTimeRef.current = null;
        missedFramesRef.current = 0;
        setHoldProgressMs(0);
        return;
      }

      if (!evaluation.allReady) {
        missedFramesRef.current += 1;
        if (missedFramesRef.current > 2) {
          holdAnchorRgbsRef.current = null;
          holdStartTimeRef.current = null;
          setHoldProgressMs(0);
        }
        return;
      }

      if (!holdAnchorRgbsRef.current || !holdStartTimeRef.current) {
        missedFramesRef.current = 0;
        holdAnchorRgbsRef.current = evaluation.rgbs;
        holdStartTimeRef.current = now;
        setHoldProgressMs(0);
        return;
      }

      if (!areSquareRgbsSteady(holdAnchorRgbsRef.current, evaluation.rgbs)) {
        missedFramesRef.current += 1;
        if (missedFramesRef.current > 2) {
          missedFramesRef.current = 0;
          holdAnchorRgbsRef.current = evaluation.rgbs;
          holdStartTimeRef.current = now;
          setHoldProgressMs(0);
        }
        return;
      }

      missedFramesRef.current = 0;
      const heldMs = now - holdStartTimeRef.current;
      setHoldProgressMs(Math.min(HOLD_REQUIRED_MS, heldMs));
      if (heldMs >= HOLD_REQUIRED_MS) {
        captureFromCameraRef.current();
      }
    }, 120);

    return () => window.clearInterval(timer);
  }, [autoCaptureEnabled, cameraOpen, cubeSize, recognitionMode]);

  const handleFiles = async (fileList: FileList | File[] | null) => {
    const incoming = fileList ? Array.from(fileList) : [];
    if (incoming.length === 0) return;
    setUploadError(null);

    const isCanvas = recognitionMode === 'canvas';
    const currentCount = isCanvas ? canvasScans.length : aiPhotos.length;
    const remaining = 6 - currentCount;
    if (remaining <= 0) {
      setUploadError(t.maxPhotosError);
      return;
    }

    const files = incoming.slice(0, remaining);
    let doneCount = 0;
    setFileProgress({ done: 0, total: files.length });

    try {
      const results = await Promise.all(
        files.map(async (file, i): Promise<UploadedPhoto | null> => {
          const looksLikeImage =
            file.type.startsWith('image/') ||
            /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(file.name);
          if (!looksLikeImage) {
            setUploadError(t.invalidFileError(file.name));
            doneCount += 1;
            setFileProgress({ done: doneCount, total: files.length });
            return null;
          }
          try {
            const dataUrl = await normalizeImageFile(file);
            if (isCanvas) {
              return {
                id: `scan-file-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
                dataUrl,
                name: file.name || t.scanSlotLabel(currentCount + i + 1),
                label: 'Single Face Only',
                scanMode: 'canvas',
                cubeSize,
                squareAlign: { ...DEFAULT_SQUARE_ALIGN },
              };
            }
            return {
              id: `file-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
              dataUrl,
              name: file.name || t.imageFallbackName(aiPhotos.length + i + 1),
              label: 'Auto-Detect Angle',
              scanMode: 'ai',
              cubeSize,
            };
          } catch (err) {
            setUploadError(err instanceof Error ? err.message : t.imageProcessError);
            return null;
          } finally {
            doneCount += 1;
            setFileProgress({ done: doneCount, total: files.length });
          }
        })
      );

      const processed = results.filter((p): p is UploadedPhoto => p !== null);
      if (processed.length > 0) {
        if (isCanvas) {
          setSelectedScanId(processed[processed.length - 1].id);
          onAddCanvasScans(processed);
        } else {
          onAddPhotos(processed);
        }
      }
    } finally {
      setFileProgress(null);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    void handleFiles(droppedFiles);
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const selectedFiles = input.files ? Array.from(input.files) : [];
    await handleFiles(selectedFiles);
    input.value = '';
  };

  const handleAlignPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!selectedScan || isAnalyzing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origCx: activeSquareAlign.cx,
      origCy: activeSquareAlign.cy,
    };
  };

  const handleAlignPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ds = dragStateRef.current;
    if (!ds || ds.pointerId !== e.pointerId || !selectedScan) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nextCx = Math.max(0.15, Math.min(0.85, ds.origCx + (e.clientX - ds.startX) / rect.width));
    const nextCy = Math.max(0.15, Math.min(0.85, ds.origCy + (e.clientY - ds.startY) / rect.height));
    onUpdateCanvasScanAlign(selectedScan.id, {
      ...activeSquareAlign,
      cx: Number(nextCx.toFixed(3)),
      cy: Number(nextCy.toFixed(3)),
    });
  };

  const handleAlignPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId === e.pointerId) {
      dragStateRef.current = null;
    }
  };

  const isAiUploadDisabled = aiPhotos.length >= 6 || isAnalyzing;
  const isCanvasFull = canvasScans.length >= 6 || isAnalyzing;
  const holdPct = Math.round((holdProgressMs / HOLD_REQUIRED_MS) * 100);
  const holdSecRemaining = Math.max(0, (HOLD_REQUIRED_MS - holdProgressMs) / 1000).toFixed(1);
  const readyTiles = liveEval?.recognizedCount ?? 0;

  const photoCount = recognitionMode === 'canvas' ? canvasScans.length : aiPhotos.length;

  const handleToggleCollapse = () => {
    const next = !isCollapsed;
    if (next && cameraOpen) {
      stopCameraRef.current();
    }
    setCollapsed(next);
  };

  return (
    <section
      id="scanner"
      onPaste={(e) => {
        const items = e.clipboardData?.files;
        if (items && items.length > 0) {
          if (isCollapsed) setCollapsed(false);
          void handleFiles(Array.from(items));
        }
      }}
      className={
        isCollapsed
          ? 'studio-card rounded-xl p-3 sm:p-1.5 sm:w-[52px] flex flex-col'
          : 'studio-card rounded-xl p-3.5 sm:p-4 flex flex-col gap-3'
      }
    >
      {isCollapsed ? (
        <>
          {/* Portrait Collapsed Header Bar */}
          <button
            type="button"
            onClick={handleToggleCollapse}
            aria-expanded={false}
            aria-controls="scanner-body"
            aria-label={t.expandAria}
            className="sm:hidden w-full flex items-center justify-between gap-3 text-left rounded-lg -m-1 p-1 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 tracking-tight truncate">
              {t.title}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {isAnalyzing && (
                <span className="font-mono tabular-nums text-[11px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {Math.max(0, Math.min(100, Math.round(analysisProgress)))}%
                </span>
              )}
              <span className="font-mono tabular-nums text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {photoCount}/6
              </span>
              <span className="w-7 h-7 rounded-md border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 inline-flex items-center justify-center">
                <ChevronDown className="w-4 h-4" />
              </span>
            </div>
          </button>

          {/* Landscape / Desktop Left-Docked Vertical Rail */}
          <button
            type="button"
            onClick={handleToggleCollapse}
            aria-expanded={false}
            aria-controls="scanner-body"
            aria-label={t.expandAria}
            title={t.expandAria}
            className="hidden sm:flex w-full min-h-[220px] [@media(max-height:500px)]:min-h-[188px] py-2 px-1 flex-col items-center justify-between gap-3 rounded-lg hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <span className="w-8 h-8 rounded-md border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 inline-flex items-center justify-center shrink-0">
              <ChevronRight className="w-4 h-4" />
            </span>

            <span className="[writing-mode:vertical-rl] rotate-180 text-xs font-semibold tracking-tight text-slate-800 dark:text-slate-100 whitespace-nowrap select-none">
              {t.title}
            </span>

            <div className="flex flex-col items-center gap-1 shrink-0">
              {isAnalyzing && (
                <span className="font-mono tabular-nums text-[10px] font-semibold px-1 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {Math.max(0, Math.min(100, Math.round(analysisProgress)))}%
                </span>
              )}
              <span className="font-mono tabular-nums text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {photoCount}/6
              </span>
            </div>
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={handleToggleCollapse}
          aria-expanded={true}
          aria-controls="scanner-body"
          aria-label={t.collapseAria}
          className="w-full flex items-center justify-between gap-3 text-left rounded-lg -m-1 p-1 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
              {t.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {recognitionMode === 'canvas' ? t.canvasSubtitle : t.subtitle(totalStickers)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono tabular-nums text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
              {photoCount}/6
            </span>
            <span className="w-7 h-7 rounded-md border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 inline-flex items-center justify-center">
              <ChevronDown className="w-4 h-4 rotate-180 sm:hidden" />
              <ChevronLeft className="w-4 h-4 hidden sm:block" />
            </span>
          </div>
        </button>
      )}

      {!isCollapsed && (
        <div id="scanner-body" className="flex flex-col gap-3">
      {/* Recognition Mode Switcher */}
      <div className="grid grid-cols-2 p-0.5 bg-slate-100 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800 rounded-lg">
        <button
          type="button"
          disabled={isAnalyzing}
          onClick={() => {
            if (cameraOpen) stopCamera();
            onChangeRecognitionMode('ai');
          }}
          className={`min-h-[34px] px-2 py-1 text-[11px] font-semibold rounded-md inline-flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
            recognitionMode === 'ai'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3 h-3 shrink-0" />
          <span className="truncate">{t.modeAi}</span>
        </button>
        <button
          type="button"
          disabled={isAnalyzing}
          onClick={() => {
            if (cameraOpen) stopCamera();
            onChangeRecognitionMode('canvas');
          }}
          className={`min-h-[34px] px-2 py-1 text-[11px] font-semibold rounded-md inline-flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
            recognitionMode === 'canvas'
              ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Zap className="w-3 h-3 shrink-0" />
          <span className="truncate">{t.modeCanvas}</span>
        </button>
      </div>

      {recognitionMode === 'canvas' ? (
        /* OFFLINE CANVAS MODE: Unordered 6-Side Auto-Capture + Automatic Topology & Rotation Solver */
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex flex-col gap-2.5 rounded-lg transition-colors ${
            isDragging ? 'ring-2 ring-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/30' : ''
          }`}
        >
          {/* 6 Unordered Scan Slots */}
          <div className="grid grid-cols-6 gap-1.5">
            {Array.from({ length: 6 }, (_, idx) => {
              const scan = canvasScans[idx] ?? null;
              const isSelected = scan !== null && selectedScan?.id === scan.id;
              const assign = scan ? detectedAssignments[scan.id] : undefined;
              const badgeLabel = assign
                ? canvasScans.length === 6
                  ? assign.face
                  : `~${assign.face}`
                : t.autoFacePending;
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!scan || isAnalyzing}
                  onClick={() => scan && setSelectedScanId(scan.id)}
                  className={`relative aspect-square rounded-lg border overflow-hidden transition-all flex flex-col items-center justify-center ${
                    scan
                      ? isSelected
                        ? 'border-emerald-600 dark:border-emerald-500 ring-2 ring-emerald-500/40 bg-slate-900'
                        : 'border-emerald-300 dark:border-emerald-700 bg-slate-900 hover:border-emerald-500'
                      : 'border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 cursor-default'
                  }`}
                >
                  {scan ? (
                    <>
                      <img
                        src={scan.dataUrl}
                        alt={t.scanSlotLabel(idx + 1)}
                        className="w-full h-full object-cover opacity-90"
                      />
                      <span className="absolute bottom-0.5 inset-x-0.5 bg-slate-950/80 text-white text-[9px] font-mono font-bold leading-tight py-0.5 rounded-[3px] text-center truncate">
                        {badgeLabel}
                      </span>
                      <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                    </>
                  ) : (
                    <span className="font-mono text-xs font-semibold">{idx + 1}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Camera + Upload 1-6 Photos */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={cameraOpen ? stopCamera : openCamera}
              disabled={!cameraOpen && isCanvasFull}
              className={`min-h-[42px] px-3 py-2 text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap border disabled:opacity-50 ${
                cameraOpen
                  ? 'bg-slate-900 dark:bg-slate-700 text-white border-slate-900 dark:border-slate-600'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-xs'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              {cameraOpen ? t.closeCamera : t.camera}
            </button>

            <div
              className={`relative overflow-hidden min-h-[42px] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap inline-flex items-center justify-center focus-within:ring-2 focus-within:ring-emerald-600 ${
                isCanvasFull ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 dark:hover:bg-slate-700/80 cursor-pointer'
              }`}
            >
              <span className="pointer-events-none select-none inline-flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                {t.uploadFacesBtn}
              </span>
              <input
                ref={canvasFileInputRef}
                type="file"
                accept="image/*"
                multiple
                disabled={isCanvasFull}
                onChange={(e) => void handleFileChange(e)}
                aria-label={t.uploadFacesBtn}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-[0px] file:w-full file:h-full file:border-0 file:cursor-pointer disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer select-none px-0.5">
            <input
              type="checkbox"
              checked={autoCaptureEnabled}
              disabled={isAnalyzing}
              onChange={(e) => setAutoCaptureEnabled(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 text-emerald-600 focus:ring-emerald-600 shrink-0"
            />
            <span>{t.autoCaptureLabel}</span>
          </label>

          {/* Live Camera Viewfinder with 2x2 or 3x3 Recognition + 2.0s Steady Hold Countdown */}
          {cameraOpen && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-950 shadow-sm">
              <div className="relative aspect-[4/3] max-h-[45dvh] w-full">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <svg
                  viewBox="0 0 400 300"
                  preserveAspectRatio="xMidYMid slice"
                  className="pointer-events-none absolute inset-0 w-full h-full"
                  aria-hidden="true"
                >
                  <rect
                    x={cameraSquareOverlay.boxX}
                    y={cameraSquareOverlay.boxY}
                    width={cameraSquareOverlay.boxSize}
                    height={cameraSquareOverlay.boxSize}
                    rx="6"
                    fill="none"
                    stroke={
                      duplicateHoldWarning
                        ? '#F59E0B'
                        : liveEval?.allReady
                        ? '#34D399'
                        : '#94A3B8'
                    }
                    strokeWidth={liveEval?.allReady ? '3' : '2'}
                  />
                  {cameraSquareOverlay.lines.map((k) => (
                    <g key={k}>
                      <line
                        x1={cameraSquareOverlay.boxX + k * cameraSquareOverlay.cellSize}
                        y1={cameraSquareOverlay.boxY}
                        x2={cameraSquareOverlay.boxX + k * cameraSquareOverlay.cellSize}
                        y2={cameraSquareOverlay.boxY + cameraSquareOverlay.boxSize}
                        stroke="rgba(52,211,153,0.55)"
                        strokeWidth="1.2"
                        strokeDasharray="4 3"
                      />
                      <line
                        x1={cameraSquareOverlay.boxX}
                        y1={cameraSquareOverlay.boxY + k * cameraSquareOverlay.cellSize}
                        x2={cameraSquareOverlay.boxX + cameraSquareOverlay.boxSize}
                        y2={cameraSquareOverlay.boxY + k * cameraSquareOverlay.cellSize}
                        stroke="rgba(52,211,153,0.55)"
                        strokeWidth="1.2"
                        strokeDasharray="4 3"
                      />
                    </g>
                  ))}
                  {cameraSquareOverlay.points.map((pt, i) => {
                    const isTileReady = liveEval?.tileReady[i] ?? false;
                    return (
                      <circle
                        key={i}
                        cx={pt.x}
                        cy={pt.y}
                        r={isTileReady ? '6' : '4.5'}
                        fill={liveEval?.hexes[i] ?? '#34D399'}
                        stroke={isTileReady ? '#FFFFFF' : '#F59E0B'}
                        strokeWidth={isTileReady ? '1.8' : '1.4'}
                        opacity={isTileReady ? 1 : 0.7}
                      />
                    );
                  })}
                </svg>

                {/* Capture flash effect */}
                {capturedFlash && (
                  <div className="pointer-events-none absolute inset-0 bg-emerald-400/35 flex items-center justify-center">
                    <span className="px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-bold shadow">
                      {t.capturedFlash}
                    </span>
                  </div>
                )}

                {/* Live 2x2 or 3x3 Preview Badge */}
                {liveEval && (
                  <div className="pointer-events-none absolute top-2 right-2 bg-slate-900/85 border border-slate-700 rounded-md p-1.5 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-mono text-emerald-300 leading-none">
                      {t.livePreview} · {readyTiles}/{tileCount}
                    </span>
                    <div
                      className={`grid gap-0.5 ${
                        cubeSize === 2 ? 'grid-cols-2' : 'grid-cols-3'
                      }`}
                    >
                      {liveEval.hexes.slice(0, tileCount).map((hex, i) => (
                        <span
                          key={i}
                          className={`w-3 h-3 rounded-[2px] border ${
                            liveEval.tileReady[i] ? 'border-white/60' : 'border-amber-400/70 opacity-60'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 2-second Steady Hold Progress Bar */}
              {autoCaptureEnabled && (
                <div className="px-3 pt-2 pb-1 bg-slate-900 border-t border-slate-800 flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                    <span
                      className={
                        duplicateHoldWarning
                          ? 'text-amber-300'
                          : liveEval?.allReady
                          ? 'text-emerald-300'
                          : 'text-slate-300'
                      }
                    >
                      {duplicateHoldWarning
                        ? t.duplicateSideHold
                        : liveEval?.allReady
                        ? t.holdSteady(holdSecRemaining, readyTiles, tileCount)
                        : t.scanningTiles(readyTiles, tileCount)}
                    </span>
                    {!duplicateHoldWarning && liveEval?.allReady && (
                      <span className="text-emerald-300 font-semibold">{holdPct}%</span>
                    )}
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
                        duplicateHoldWarning ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${duplicateHoldWarning ? 100 : holdPct}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-900 text-white">
                <span className="text-xs text-slate-300 truncate">
                  {t.reticleCanvasHint(cubeSize)}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="p-1.5 text-slate-300 hover:text-white rounded"
                    aria-label={t.closeCameraAria}
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={captureFromCamera}
                    className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md whitespace-nowrap"
                  >
                    {t.captureNowBtn}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Selected Scan Square Alignment & Delete */}
          {selectedScan && (
            <div className="border border-slate-200 dark:border-slate-700/80 rounded-lg p-2.5 bg-slate-50/70 dark:bg-slate-800/50 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {t.scanSlotLabel(canvasScans.findIndex((s) => s.id === selectedScan.id) + 1)}
                  {detectedAssignments[selectedScan.id]
                    ? ` → ${detectedAssignments[selectedScan.id].face}${
                        detectedAssignments[selectedScan.id].rotationCW > 0
                          ? ` (↻${detectedAssignments[selectedScan.id].rotationCW * 90}°)`
                          : ''
                      }`
                    : ''}{' '}
                  · {t.canvasAlignTitle(cubeSize)}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateCanvasScanAlign(selectedScan.id, { ...DEFAULT_SQUARE_ALIGN })
                    }
                    title={t.canvasAlignReset}
                    className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemovePhoto(selectedScan.id)}
                    aria-label={t.clearScanAria(
                      canvasScans.findIndex((s) => s.id === selectedScan.id) + 1
                    )}
                    className="p-1 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div
                onPointerDown={handleAlignPointerDown}
                onPointerMove={handleAlignPointerMove}
                onPointerUp={handleAlignPointerUp}
                onPointerCancel={handleAlignPointerUp}
                className="relative w-full rounded-md overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-900 cursor-grab active:cursor-grabbing touch-none select-none"
              >
                <img
                  src={selectedScan.dataUrl}
                  alt={selectedScan.name}
                  draggable={false}
                  onLoad={(e) =>
                    setAlignDims({
                      w: e.currentTarget.naturalWidth || 400,
                      h: e.currentTarget.naturalHeight || 300,
                    })
                  }
                  className="w-full h-auto block pointer-events-none select-none"
                />
                <svg
                  viewBox={`0 0 ${alignDims.w} ${alignDims.h}`}
                  className="pointer-events-none absolute inset-0 w-full h-full"
                  aria-hidden="true"
                >
                  <rect
                    x={activeAlignOverlay.boxX}
                    y={activeAlignOverlay.boxY}
                    width={activeAlignOverlay.boxSize}
                    height={activeAlignOverlay.boxSize}
                    rx={Math.max(4, alignDims.w * 0.01)}
                    fill="none"
                    stroke="#34D399"
                    strokeWidth={Math.max(1.8, alignDims.w * 0.005)}
                  />
                  {activeAlignOverlay.lines.map((k) => (
                    <g key={k}>
                      <line
                        x1={activeAlignOverlay.boxX + k * activeAlignOverlay.cellSize}
                        y1={activeAlignOverlay.boxY}
                        x2={activeAlignOverlay.boxX + k * activeAlignOverlay.cellSize}
                        y2={activeAlignOverlay.boxY + activeAlignOverlay.boxSize}
                        stroke="rgba(52,211,153,0.65)"
                        strokeWidth={Math.max(1, alignDims.w * 0.003)}
                        strokeDasharray="4 3"
                      />
                      <line
                        x1={activeAlignOverlay.boxX}
                        y1={activeAlignOverlay.boxY + k * activeAlignOverlay.cellSize}
                        x2={activeAlignOverlay.boxX + activeAlignOverlay.boxSize}
                        y2={activeAlignOverlay.boxY + k * activeAlignOverlay.cellSize}
                        stroke="rgba(52,211,153,0.65)"
                        strokeWidth={Math.max(1, alignDims.w * 0.003)}
                        strokeDasharray="4 3"
                      />
                    </g>
                  ))}
                  {activeAlignOverlay.points.map((pt, i) => (
                    <circle
                      key={i}
                      cx={pt.x}
                      cy={pt.y}
                      r={Math.max(5, alignDims.w * 0.018)}
                      fill={previewHexes?.[i] ?? '#34D399'}
                      stroke="#FFFFFF"
                      strokeWidth={Math.max(1.4, alignDims.w * 0.004)}
                    />
                  ))}
                </svg>
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-600 dark:text-slate-300 shrink-0">{t.canvasAlignSize}</span>
                <input
                  type="range"
                  min="0.45"
                  max="1.45"
                  step="0.02"
                  value={activeSquareAlign.scale}
                  onChange={(e) =>
                    onUpdateCanvasScanAlign(selectedScan.id, {
                      ...activeSquareAlign,
                      scale: Number(e.target.value),
                    })
                  }
                  className="flex-1 accent-emerald-600"
                />
                <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200 w-10 text-right">
                  {Math.round(activeSquareAlign.scale * 100)}%
                </span>
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 text-center">
                {t.canvasAlignDragHint(cubeSize)}
              </div>
            </div>
          )}

          {canvasScans.length === 0 && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 px-0.5 leading-snug">
              {t.canvasHint}
            </p>
          )}
        </div>
      ) : (
        /* AI VISION MODE: Multi-angle dropzone + Camera + Queue + AI Speed Options */
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border border-dashed rounded-lg p-3 sm:p-3.5 transition-colors text-center ${
              isDragging
                ? 'border-blue-600 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                : 'border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-400 dark:hover:border-slate-600'
            }`}
          >
            <div className="flex flex-col items-center gap-2.5">
              <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                <span>{t.dropHint}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full">
                <div
                  className={`relative overflow-hidden min-h-[42px] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap inline-flex items-center justify-center focus-within:ring-2 focus-within:ring-blue-600 ${
                    isAiUploadDisabled
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-700/80 cursor-pointer'
                  }`}
                >
                  <span className="pointer-events-none select-none">{t.selectPhotos}</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={isAiUploadDisabled}
                    onChange={(e) => void handleFileChange(e)}
                    aria-label={t.selectPhotosAria}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-[0px] file:w-full file:h-full file:border-0 file:cursor-pointer disabled:cursor-not-allowed"
                  />
                </div>
                <button
                  type="button"
                  onClick={cameraOpen ? stopCamera : openCamera}
                  disabled={isAiUploadDisabled}
                  className="min-h-[42px] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/80 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Camera className="w-3.5 h-3.5" />
                  {cameraOpen ? t.closeCamera : t.camera}
                </button>
              </div>
            </div>
          </div>

          {cameraOpen && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-950 shadow-sm">
              <div className="relative aspect-[4/3] max-h-[45dvh] w-full">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="w-40 h-40 border border-white/60 rounded-lg" />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-slate-900 text-white">
                <span className="text-xs text-slate-300">{t.reticleHint}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="p-1.5 text-slate-300 hover:text-white rounded"
                    aria-label={t.closeCameraAria}
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={captureFromCamera}
                    className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-md whitespace-nowrap shrink-0"
                  >
                    {t.capturePhoto}
                  </button>
                </div>
              </div>
            </div>
          )}

          {aiPhotos.length > 0 && (
            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-0.5">
              {aiPhotos.map((photo, idx) => (
                <div
                  key={photo.id}
                  className="flex items-center gap-2.5 p-1.5 border border-slate-200 dark:border-slate-700/80 rounded-lg bg-slate-50/70 dark:bg-slate-800/50"
                >
                  <img
                    src={photo.dataUrl}
                    alt={t.photoAlt(idx + 1)}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 object-cover rounded-md border border-slate-200 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-900"
                  />
                  <div className="min-w-0 flex-1 flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-slate-800 dark:text-slate-100 truncate">
                      {idx + 1}. {photo.name}
                    </span>
                    <select
                      value={photo.label}
                      onChange={(e) => onUpdatePhotoLabel(photo.id, e.target.value)}
                      disabled={isAnalyzing}
                      aria-label={t.angleAria(idx + 1)}
                      className="w-full text-[11px] text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      {ANGLE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {translatePhotoLabel(opt, lang)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemovePhoto(photo.id)}
                    disabled={isAnalyzing}
                    aria-label={t.removePhotoAria(idx + 1)}
                    className="min-w-[38px] min-h-[38px] flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-40 rounded-md transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Collapsible 2-Photo Guide */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <details className="text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 rounded-lg px-3 py-2 bg-slate-50/60 dark:bg-slate-800/50">
              <summary className="font-medium text-slate-700 dark:text-slate-200 cursor-pointer select-none">
                {t.guideSummary}
              </summary>
              <div className="grid grid-cols-2 gap-2.5 pt-2 mt-2 border-t border-slate-200/80 dark:border-slate-700/80 text-[11px] leading-snug">
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 44 44" className="w-8 h-8 shrink-0" aria-hidden="true">
                    <polygon points="22,4 38,13 22,22 6,13" fill="#F8FAFC" stroke="#475569" strokeWidth="1.5" />
                    <polygon points="6,13 22,22 22,40 6,31" fill="#CBD5E1" stroke="#475569" strokeWidth="1.5" />
                    <polygon points="38,13 38,31 22,40 22,22" fill="#94A3B8" stroke="#475569" strokeWidth="1.5" />
                  </svg>
                  <span>
                    <strong className="text-slate-800 dark:text-slate-100 block">{t.shot1Title}</strong>
                    {t.shot1Desc}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 44 44" className="w-8 h-8 shrink-0" aria-hidden="true">
                    <polygon points="22,4 38,13 22,22 6,13" fill="#CBD5E1" stroke="#475569" strokeWidth="1.5" />
                    <polygon points="6,13 22,22 22,40 6,31" fill="#64748B" stroke="#475569" strokeWidth="1.5" />
                    <polygon points="38,13 38,31 22,40 22,22" fill="#E2E8F0" stroke="#475569" strokeWidth="1.5" />
                  </svg>
                  <span>
                    <strong className="text-slate-800 dark:text-slate-100 block">{t.shot2Title}</strong>
                    {t.shot2Desc}
                  </span>
                </div>
              </div>
            </details>
          </div>

          {/* AI Speed + Pass 2 Options */}
          <div className="flex flex-col gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {t.aiSpeedLabel}
              </span>
              <div className="grid grid-cols-2 p-0.5 bg-slate-100 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800 rounded-lg flex-1">
                <button
                  type="button"
                  disabled={isAnalyzing}
                  onClick={() => onChangeAiSpeedMode('fast')}
                  className={`min-h-[28px] px-2 py-0.5 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap truncate ${
                    aiSpeedMode === 'fast'
                      ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {t.aiSpeedFast}
                </button>
                <button
                  type="button"
                  disabled={isAnalyzing}
                  onClick={() => onChangeAiSpeedMode('accurate')}
                  className={`min-h-[28px] px-2 py-0.5 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap truncate ${
                    aiSpeedMode === 'accurate'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {t.aiSpeedAccurate}
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer select-none px-0.5">
              <input
                type="checkbox"
                checked={skipPass2}
                disabled={isAnalyzing}
                onChange={(e) => onChangeSkipPass2(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 text-blue-600 focus:ring-blue-600 shrink-0"
              />
              <span>{t.skipPass2Label}</span>
            </label>
          </div>
        </>
      )}

      {(cameraError || uploadError) && (
        <div
          role="alert"
          className="flex items-start gap-2 p-3 text-xs text-rose-700 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/80 rounded-lg"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{cameraError ?? uploadError}</span>
        </div>
      )}

      {/* Progress Bar */}
      {(fileProgress !== null || isAnalyzing) && (
        <div
          className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-lg flex flex-col gap-1.5"
          aria-live="polite"
        >
          {(() => {
            const pct =
              fileProgress !== null
                ? Math.round((fileProgress.done / Math.max(1, fileProgress.total)) * 100)
                : Math.max(0, Math.min(100, Math.round(analysisProgress)));
            const label =
              fileProgress !== null
                ? t.preparingImages(fileProgress.done, fileProgress.total)
                : analysisPhase ||
                  (recognitionMode === 'canvas' ? t.canvasAnalyzing : t.recognizingDefault);
            const elapsedSec = (analysisElapsedMs / 1000).toFixed(1);
            const estSec = (Math.max(1000, analysisEstimateMs) / 1000).toFixed(1);
            return (
              <>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{label}</span>
                  <div className="flex items-center gap-2 font-mono tabular-nums shrink-0">
                    {fileProgress === null && analysisEstimateMs > 0 && recognitionMode === 'ai' && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t.elapsedEstimate(elapsedSec, estSec)}
                      </span>
                    )}
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{pct}%</span>
                  </div>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={label}
                  className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden"
                >
                  <div
                    className={`h-full rounded-full progress-bar-animated transition-[width] duration-150 ease-linear ${
                      recognitionMode === 'canvas' ? 'bg-emerald-600' : 'bg-blue-600'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Primary Action */}
      <button
        type="button"
        onClick={onAnalyze}
        disabled={
          (recognitionMode === 'canvas' ? canvasScans.length === 0 : aiPhotos.length === 0) ||
          isAnalyzing ||
          fileProgress !== null
        }
        className={`w-full min-h-[44px] py-2.5 px-4 text-sm font-semibold text-white disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed rounded-lg shadow-xs transition-colors inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
          recognitionMode === 'canvas'
            ? 'bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-600'
            : 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-600'
        }`}
      >
        {recognitionMode === 'canvas' ? (
          <Zap className="w-4 h-4" />
        ) : (
          <Scan className="w-4 h-4" />
        )}
        {isAnalyzing
          ? analysisPhase ||
            (recognitionMode === 'canvas' ? t.canvasAnalyzing : t.recognizingDefault)
          : recognitionMode === 'canvas'
          ? t.canvasBtn
          : t.recognizeBtn}
      </button>

      {!isAnalyzing &&
        (() => {
          const timingSummary = formatTimingBreakdown(
            lastTimingBreakdown,
            lastRecognitionMs,
            lang
          );
          if (!timingSummary) return null;
          return (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums text-center leading-snug">
              {timingSummary}
            </div>
          );
        })()}
        </div>
      )}
    </section>
  );
}
