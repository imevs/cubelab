import type { CubeSize, FaceId, RecognitionTimingBreakdown, StickerConfidence } from '../shared/cubeTypes.ts';
import type { MoveToken } from '../shared/cubeSolver.ts';

export type Language = 'en' | 'ru';

export function formatTimingBreakdown(
  breakdown: RecognitionTimingBreakdown | null,
  totalClientMs: number | null,
  lang: Language
): string | null {
  if (!breakdown && totalClientMs === null) return null;
  const totalSec = ((totalClientMs ?? breakdown?.serverTotalMs ?? 0) / 1000).toFixed(1);

  if (breakdown?.mode === 'canvas') {
    const ms = breakdown.serverTotalMs || totalClientMs || 0;
    const base =
      lang === 'ru'
        ? `Локальный Canvas: ${(ms / 1000).toFixed(2)}с (${ms} мс · без сервера)`
        : `Offline Canvas: ${(ms / 1000).toFixed(2)}s (${ms} ms · 0 server calls)`;
    return breakdown.autoFixedRotation
      ? `${base} · ${lang === 'ru' ? 'авто-поворот' : 'auto-rot'}`
      : base;
  }

  if (breakdown) {
    const p1 = (breakdown.pass1Ms / 1000).toFixed(1);
    const speedTag =
      breakdown.aiSpeedMode === 'fast'
        ? lang === 'ru'
          ? 'Быстр.'
          : 'Fast'
        : breakdown.aiSpeedMode === 'accurate'
        ? lang === 'ru'
          ? 'Точн.'
          : 'Acc.'
        : null;
    const parts: string[] = [
      `${lang === 'ru' ? 'Итог' : 'Last'}: ${totalSec}${lang === 'ru' ? 'с' : 's'}${speedTag ? ` (${speedTag})` : ''}`,
      `${lang === 'ru' ? 'П1' : 'P1'} ${p1}${lang === 'ru' ? 'с' : 's'}`,
    ];
    if (breakdown.pass2Ms > 0) {
      parts.push(`${lang === 'ru' ? 'П2' : 'P2'} ${(breakdown.pass2Ms / 1000).toFixed(1)}${lang === 'ru' ? 'с' : 's'}`);
    } else if (breakdown.pass2Skipped) {
      parts.push(lang === 'ru' ? 'П2 пропущен' : 'P2 skipped');
    }
    if (breakdown.autoFixedRotation) {
      parts.push(lang === 'ru' ? 'авто-поворот' : 'auto-rot');
    }
    if (breakdown.retries > 0) {
      parts.push(`${lang === 'ru' ? 'повторы' : 'retries'}: ${breakdown.retries}`);
    }
    return parts.join(' · ');
  }

  return lang === 'ru'
    ? `Последнее распознавание: ${totalSec}с`
    : `Last recognition: ${totalSec}s`;
}

const LANG_STORAGE_KEY = 'cubenet-lab-lang-v1';

export function detectInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {
    // Ignore storage errors
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language?.toLowerCase() ?? '' : '';
  return nav.startsWith('ru') ? 'ru' : 'en';
}

export function saveLanguage(lang: Language): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Ignore storage errors
  }
}

const COLOR_NAME_RU: Record<string, string> = {
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

const COLOR_SHORT_RU: Record<string, string> = {
  white: 'БЕ',
  red: 'КР',
  green: 'ЗЕ',
  yellow: 'ЖЁ',
  orange: 'ОР',
  blue: 'СИ',
  black: 'ЧЁ',
  pink: 'РО',
  purple: 'ФИ',
  violet: 'ФИ',
  cyan: 'ГО',
  'light blue': 'ГО',
  teal: 'БИ',
  gray: 'СЕ',
  grey: 'СЕ',
  magenta: 'ПУ',
  lime: 'ЛА',
  brown: 'КО',
  unscanned: '?',
};

export function translateColorName(name: string, lang: Language): string {
  if (lang === 'en') return name;
  const key = name.trim().toLowerCase();
  return COLOR_NAME_RU[key] ?? name;
}

export function translateColorShortLabel(
  name: string,
  fallbackShort: string,
  lang: Language
): string {
  if (lang === 'en') return fallbackShort;
  const key = name.trim().toLowerCase();
  return COLOR_SHORT_RU[key] ?? fallbackShort;
}

const FACE_LABELS_RU: Record<FaceId, string> = {
  U: 'Верхняя (U)',
  R: 'Правая (R)',
  F: 'Передняя (F)',
  D: 'Нижняя (D)',
  L: 'Левая (L)',
  B: 'Задняя (B)',
};

const FACE_SHORT_RU: Record<FaceId, string> = {
  U: 'Верх',
  R: 'Право',
  F: 'Перед',
  D: 'Низ',
  L: 'Лево',
  B: 'Зад',
};

const FACE_SHORT_EN: Record<FaceId, string> = {
  U: 'Up',
  R: 'Right',
  F: 'Front',
  D: 'Down',
  L: 'Left',
  B: 'Back',
};

export function translateFaceShortName(face: FaceId, lang: Language): string {
  return lang === 'ru' ? FACE_SHORT_RU[face] : FACE_SHORT_EN[face];
}

export function translateMoveDescription(move: MoveToken, lang: Language): string {
  const base = move[0] as FaceId;
  if (lang === 'en') {
    const faceNames: Record<FaceId, string> = {
      U: 'Up (Top)',
      D: 'Down (Bottom)',
      R: 'Right',
      L: 'Left',
      F: 'Front',
      B: 'Back',
    };
    if (move.endsWith('2')) return `Rotate ${faceNames[base]} face 180°`;
    if (move.endsWith("'")) return `Rotate ${faceNames[base]} face 90° counter-clockwise`;
    return `Rotate ${faceNames[base]} face 90° clockwise`;
  }

  const faceAccusative: Record<FaceId, string> = {
    U: 'верхнюю грань',
    D: 'нижнюю грань',
    R: 'правую грань',
    L: 'левую грань',
    F: 'переднюю грань',
    B: 'заднюю грань',
  };
  if (move.endsWith('2')) return `Повернуть ${faceAccusative[base]} на 180°`;
  if (move.endsWith("'")) return `Повернуть ${faceAccusative[base]} на 90° против часовой`;
  return `Повернуть ${faceAccusative[base]} на 90° по часовой`;
}

const STAGE_EN: Record<string, string> = {
  'Kociemba Phase 1': 'Phase 1 · Subgroup G1 Reduction',
  'Kociemba Phase 2': 'Phase 2 · Final G1 Solve',
  '2x2 Optimal': 'Optimal 2×2 Shortest Path',
};

const STAGE_RU: Record<string, string> = {
  '01. Top Cross': '01. Верхний крест',
  '02. Top Corners': '02. Верхние углы',
  '03. Middle Layer Edges': '03. Рёбра среднего слоя',
  '04. Bottom Cross': '04. Нижний крест',
  '05. Bottom Edge Alignment': '05. Совмещение нижних рёбер',
  '06. Bottom Corner Placement': '06. Расстановка нижних углов',
  '07. Final Corner Twists': '07. Разворот финальных углов',
  'Kociemba Phase 1': 'Фаза 1 · Сведение к подгруппе G1',
  'Kociemba Phase 2': 'Фаза 2 · Финальная сборка G1',
  '2x2 Optimal': 'Оптимальный кратчайший путь 2×2',
};

export function translateStageName(stage: string, lang: Language): string {
  if (lang === 'en') return STAGE_EN[stage] ?? stage;
  return STAGE_RU[stage] ?? stage;
}

const PHOTO_LABEL_RU: Record<string, string> = {
  'Auto-Detect Angle': 'Автоопределение ракурса',
  'View 1: Top + Front + Right': 'Ракурс 1: Верх + Перед + Право',
  'View 2: Bottom + Back + Left': 'Ракурс 2: Низ + Зад + Лево',
  'Single Face Only': 'Только одна грань',
};

export function translatePhotoLabel(label: string, lang: Language): string {
  if (lang === 'en') return label;
  return PHOTO_LABEL_RU[label] ?? label;
}

export function translateConfidence(conf: StickerConfidence, lang: Language): string {
  if (lang === 'en') return conf;
  const map: Record<StickerConfidence, string> = {
    high: 'высокая',
    medium: 'средняя',
    low: 'низкая',
    manual: 'вручную',
    unscanned: 'не отсканировано',
  };
  return map[conf];
}

export function getFaceLabelFull(face: FaceId, lang: Language): string {
  if (lang === 'ru') return FACE_LABELS_RU[face];
  const en: Record<FaceId, string> = {
    U: 'Up (Top)',
    R: 'Right',
    F: 'Front',
    D: 'Down (Bottom)',
    L: 'Left',
    B: 'Back',
  };
  return en[face];
}

export const UI_TEXT = {
  en: {
    docTitle: "CubeNet Lab — Rubik's Cube Photo Recognition & 2D Layout",
    topBar: {
      cubeSizeLabel: 'Cube type',
      size3x3: '3×3',
      size2x2: '2×2',
      scramble: 'Scramble',
      menu: 'Menu',
      switchLangLabel: 'Switch to Russian',
      switchToDark: 'Switch to dark mode',
      switchToLight: 'Switch to light mode',
      enterFullscreen: 'Fullscreen',
      exitFullscreen: 'Exit fullscreen',
      menuAria: (known: number, total = 54) =>
        `Open menu for timeline, 2D layout, and verification (${known}/${total} tiles)`,
    },
    app: {
      recognitionFailed: 'Recognition Failed',
      reverifyPhase: 'Re-examining conflicted tiles...',
      analyzePhase: 'Analyzing cube photos...',
      progressPrepare: 'Preparing cube photos...',
      progressPass1: 'Scanning faces & sticker colors...',
      progressReverify: 'Re-examining conflicted tiles...',
      progressVerify: 'Verifying cube geometry & parity...',
      progressPass2: 'Refining mismatched tiles (Pass 2)...',
      progressSolve: 'Computing step-by-step solution...',
      analyzeErrorFallback: "Unable to analyze Rubik's Cube photos.",
      turnLabel: (idx: number, total: number, move: string, desc: string) =>
        `Turn ${idx}/${total}: ${move} · ${desc}`,
      stepLabel: (idx: number, total: number, move: string, desc: string) =>
        `Step ${idx}/${total}: ${move} · ${desc}`,
      turnFallback: (move: string) => `Turn: ${move}`,
    },
    uploader: {
      title: 'Cube Photos',
      subtitle: (total = 54) => `1–6 photos (2 opposite corners cover all ${total} tiles)`,
      collapseAria: 'Collapse photo upload section',
      expandAria: 'Expand photo upload section',
      dropHint: 'Drop, paste, or capture cube angles',
      selectPhotos: 'Select Photos',
      selectPhotosAria: "Select Rubik's Cube photos",
      camera: 'Camera',
      closeCamera: 'Close Camera',
      closeCameraAria: 'Close camera',
      capturePhoto: 'Capture Photo',
      reticleHint: 'Center 3 visible faces inside reticle',
      cameraUnavailable: 'Camera access is not available in this browser context.',
      cameraDenied: 'Camera permission denied or no camera device detected.',
      maxPhotosError: 'Maximum of 6 photos reached. Remove a photo to add another.',
      invalidFileError: (name: string) => `Skipped "${name}": only image files are supported.`,
      imageProcessError: 'Failed to process image.',
      cameraCaptureName: (idx: number) => `Camera Capture ${idx}`,
      imageFallbackName: (idx: number) => `Image ${idx}`,
      photoAlt: (idx: number) => `Uploaded cube angle ${idx}`,
      angleAria: (idx: number) => `Angle label for photo ${idx}`,
      removePhotoAria: (idx: number) => `Remove photo ${idx}`,
      guideSummary: 'Recommended 2-photo capture angle guide',
      shot1Title: 'Shot 1',
      shot1Desc: 'Top (U), Front (F), Right (R)',
      shot2Title: 'Shot 2',
      shot2Desc: 'Flip 180° for D, B, L',
      recognizeBtn: 'Recognize Cube State',
      recognizingDefault: 'Recognizing Cube State...',
      canvasAnalyzing: 'Sampling cube colors locally...',
      recognitionModeLabel: 'Method',
      modeAi: 'AI Vision',
      modeCanvas: 'Offline Canvas (<1s)',
      aiSpeedLabel: 'Speed',
      aiSpeedFast: 'Fast (Flash Lite)',
      aiSpeedAccurate: 'Accurate (Flash)',
      skipPass2Label: 'Skip Pass 2 (faster, manual fix if needed)',
      canvasSubtitle: 'Scan all 6 sides in any order · Auto-detects sides & colors',
      canvasHint: 'Hold any side steady for 2s to auto-capture, or upload 1–6 photos in any order. Side positions & rotations are calculated automatically.',
      canvasAlignTitle: (size: CubeSize = 3) => `${size}×${size} Square Alignment`,
      canvasAlignDragHint: (size: CubeSize = 3) =>
        `Drag square over the ${size}×${size} face · dots show sampled colors`,
      canvasAlignSize: 'Size',
      canvasAlignReset: 'Reset',
      reticleCanvasHint: (size: CubeSize = 3) =>
        `Center any ${size}×${size} face inside the square grid`,
      autoCaptureLabel: 'Auto-capture (2s steady hold)',
      holdSteady: (secLeft: string, ready: number, total = 9) =>
        `${ready}/${total} tiles · Hold steady ${secLeft}s`,
      scanningTiles: (ready: number, total = 9) =>
        `Align face in grid (${ready}/${total} tiles ready)`,
      duplicateSideHold: 'Side already scanned — turn to another side',
      capturedFlash: 'Captured!',
      captureNowBtn: 'Capture Now',
      uploadFacesBtn: 'Upload 1–6 Photos',
      scanSlotLabel: (idx: number) => `Scan ${idx}`,
      clearScanAria: (idx: number) => `Remove scan ${idx}`,
      autoFacePending: 'Auto',
      scannedSides: (n: number) => `${n}/6 sides scanned`,
      livePreview: 'Live',
      canvasBtn: 'Re-calculate Sides & Colors (<1s)',
      preparingImages: (done: number, total: number) =>
        `Preparing photos (${done}/${total})...`,
      elapsedEstimate: (elapsedSec: string, estSec: string) =>
        `${elapsedSec}s / ~${estSec}s`,
      lastScanTime: (sec: string) => `Last recognition: ${sec}s`,
    },
    preview3d: {
      title: '3D Cube Stage',
      subtitle: 'Drag to orbit',
      resetViewAria: 'Reset 3D view',
      scramble: 'Scramble',
      scrambleAria: 'Scramble cube',
      soundMuteAria: 'Mute cube sounds',
      soundUnmuteAria: 'Unmute cube sounds',
      fullscreenExitAria: 'Exit fullscreen 3D stage',
      solverLabel: 'Solver',
      solverLbl: '7-Stage',
      solverKociemba: 'Shortest (Kociemba)',
      solver2x2Optimal: 'Optimal Shortest (≤11)',
      jumpStartAria: 'Jump to start',
      prevStepAria: 'Previous step',
      prev: 'Prev',
      play: 'Play',
      pause: 'Pause',
      replay: 'Replay',
      next: 'Next',
      nextStepAria: 'Next step',
      jumpEndAria: 'Jump to solved state',
      stepCount: (curr: number, total: number) => `Step ${curr}/${total}`,
      timeline: 'Timeline',
      solvedBanner: 'Cube Solved · Tap Scramble to Test',
      solveCube: 'Solve Cube',
      resolveConflicts: (count: number) =>
        `Resolve ${count} ${count === 1 ? 'Conflict' : 'Conflicts'} to Solve`,
      scanOrScramble: 'Scan or Scramble Cube to Solve',
      inspectConflictsLink: 'Inspect conflicts in Menu',
    },
    drawer: {
      dialogAria: 'Cube tools menu',
      closeAria: 'Close menu',
      tabTimeline: (totalSteps: number) =>
        totalSteps > 0 ? `Timeline (${totalSteps})` : 'Timeline',
      tabLayout: '2D Layout',
      tabVerify: (issues: number) => (issues > 0 ? `Verify (${issues})` : 'Verify'),
      scrambleCube: 'Scramble Cube',
      solvedReference: 'Solved Reference',
      resetAll: 'Reset All',
      inspectConflictsBtn: 'Inspect Conflict Tiles in 2D Layout',
    },
    solvePanel: {
      title: 'Solution Timeline',
      solvedZero: 'Cube is solved · 0 moves needed',
      movesCount: (total: number) => `${total} moves across 7 stages`,
      movesCountKociemba: (total: number) => `${total} moves · Kociemba Two-Phase`,
      movesCount2x2: (total: number) => `${total} moves · Optimal 2×2 Shortest Path`,
      stageBreakdown: 'Stage-by-stage move breakdown',
      optimal2x2Breakdown: 'Optimal 2×2 bidirectional BFS (≤11 HTM)',
      solverLbl: '7-Stage',
      solverKociemba: 'Shortest (Kociemba)',
      solver2x2Tag: 'Optimal ≤11',
      start: 'Start',
      recompute: 'Recompute',
      validSummary: (total = 54) => `Valid · ${total}/${total} tiles`,
      emptyPrompt: 'Upload photos or tap Scramble',
      partialSummary: (known: number, total = 54) => `Partial · ${known}/${total} tiles`,
      invalidSummary: (count: number) =>
        `Invalid · ${count} ${count === 1 ? 'conflict' : 'conflicts'}`,
      linkLayout: '2D Layout',
      linkVerification: 'Verification',
      alreadySolvedNote:
        'All 6 faces are uniform. Tap Scramble in the top bar or upload photos of an unsolved cube.',
      stepLabel: (curr: number, total: number) => `Step ${curr} / ${total}`,
      nextPrefix: (stage: string) => `Next: ${stage}`,
      complete: 'Complete',
      nextMoveLine: (move: string, desc: string) => `Next: ${move} · ${desc}`,
      finalMoveComplete: 'Final move complete — cube solved',
      startingState: 'Starting Cube State',
      startingHint: (move: string) => `Use Play or Step under the 3D view (${move})`,
      clear: 'Clear',
      stepTitle: (idx: number, desc: string) => `Step ${idx}: ${desc}`,
    },
    net2d: {
      title: '2D Unfolded Cube Layout',
      subtitle: 'Tap any tile to edit color · Hover corners/edges for seams',
      returnScanned: 'Return to Scanned State',
      coordinates: 'Coordinates',
      sharedSeam: 'Shared cubie seam:',
      fixedCenter: 'Fixed face center',
      tapHint: 'Tap any sticker to set its color, or use ↻ to rotate a face 90°.',
      editTile: (face: string, idx: number) => `Edit Tile ${face}${idx}`,
      done: 'Done',
      selectColorAria: (face: string, idx: number) => `Select color for ${face}${idx}`,
      setColorAria: (face: string, idx: number, color: string) =>
        `Set ${face}${idx} to ${color}`,
      rotateDisabledTitle: 'Return to scanned state to rotate faces',
      rotateTitle: (face: string) => `Rotate ${face} face 90° clockwise`,
      rotateAria: (face: string) => `Rotate ${face} face 90 degrees clockwise`,
      stickerAria: (face: string, idx: number, color: string, conflict: boolean) =>
        `${face} sticker ${idx}, ${color}${conflict ? ', conflict detected' : ''}`,
      aiConfidenceTitle: (conf: string) => `AI confidence: ${conf}`,
      conflictTitle: 'Physical validation conflict on this tile',
      detectedPalette: 'Detected Palette:',
      uncertainRead: 'Uncertain read',
      validationConflict: 'Validation conflict',
    },
    verification: {
      title: 'Validation & Solvability Verification',
      subtitle: 'Deterministic corner, edge, orientation, and permutation parity invariants',
      passTwo: '2-pass AI self-checked',
      passOne: '1-pass AI verified',
      reverifyBtn: 'Re-verify with AI',
      validHeadline: 'Valid & Solvable Cube State',
      validSubline: (size: CubeSize = 3) =>
        size === 2
          ? 'All 24 stickers, 8 unique corners, global chirality, and corner twist parity passed.'
          : 'All 54 stickers, 6 unique centers, 12 edges, 8 corners, and algebraic parity invariants passed.',
      partialHeadline: (known: number, total = 54) => `Partial Scan · ${known}/${total} Stickers Mapped`,
      partialEmptySub: "Upload 1 to 6 photos of your Rubik's Cube to begin recognition.",
      partialMoreSub: (unscanned: string) =>
        `Visible geometry is consistent. Unscanned faces: ${unscanned}. Upload another angle to verify full solvability.`,
      invalidHeadline: (count: number) =>
        `Invalid Cube State · ${count} ${count === 1 ? 'Conflict' : 'Conflicts'} Detected`,
      invalidSubline:
        "The current 2D layout violates physical Rubik's Cube constraints and cannot be solved as shown. Inspect the flagged tiles below or run AI re-verification.",
      detectedConflicts: (count: number) => `Detected Conflicts (${count})`,
      tilesPrefix: 'Tiles:',
      suggestedFix: 'Suggested fix:',
      stickersMapped: 'Stickers Mapped',
      centersDistinct: (n: number) => `Centers: ${n}/6 distinct`,
      noCenters2x2: '2×2 Pocket Cube (no centers)',
      edgeCubies: 'Edge Cubies',
      flipAwaiting: (total = 54) => `Flip parity: awaiting ${total} tiles`,
      flipSum: (sum: number, even: boolean) => `Flip sum: ${sum} (${even ? 'even' : 'odd'})`,
      cornerCubies: 'Corner Cubies',
      twistAwaiting: (total = 54) => `Twist parity: awaiting ${total} tiles`,
      twistSum: (sum: number, mod: number) => `Twist sum: ${sum} (${mod} mod 3)`,
      permutationParity: 'Permutation Parity',
      pending: 'Pending',
      matched: 'Matched',
      mismatch: 'Mismatch',
      wcaNonStd: 'WCA check: non-standard',
      wcaValid: 'WCA check: valid',
      centerInferred: 'Center-inferred',
      cornerInferred: 'Corner-inferred chirality',
      colorDistribution: (targetPerColor = 9) =>
        `Sticker Color Distribution (Target: ${targetPerColor} per color)`,
      aiSummaryTitle: 'AI Geometric Stitching Summary',
      photoFaces: (idx: number, faces: string) => `Photo ${idx} · Faces: ${faces}`,
      noFaces: 'None',
      lightingUncertain: 'Lighting-Uncertain Tiles (Hover to locate)',
      orColor: 'or',
      faceletStringTitle: 'Facelet State String (URFDLB)',
      copiedString: 'Copied String',
      copyFacelets: 'Copy Facelets',
      copiedJson: 'Copied JSON',
      copyJson: 'Copy JSON',
      exportSvg: 'Export 2D SVG',
    },
  },
  ru: {
    docTitle: 'CubeNet Lab — Распознавание и решение кубика Рубика',
    topBar: {
      cubeSizeLabel: 'Тип кубика',
      size3x3: '3×3',
      size2x2: '2×2',
      scramble: 'Перемешать',
      menu: 'Меню',
      switchLangLabel: 'Переключить на английский',
      switchToDark: 'Включить тёмную тему',
      switchToLight: 'Включить светлую тему',
      enterFullscreen: 'На весь экран',
      exitFullscreen: 'Выйти из полноэкранного режима',
      menuAria: (known: number, total = 54) =>
        `Открыть меню: шаги решения, 2D-развёртка и проверка (${known}/${total} плиток)`,
    },
    app: {
      recognitionFailed: 'Ошибка распознавания',
      reverifyPhase: 'Повторная проверка спорных плиток...',
      analyzePhase: 'Анализ фотографий кубика...',
      progressPrepare: 'Подготовка фотографий...',
      progressPass1: 'Распознавание граней и цветов...',
      progressReverify: 'Повторная проверка спорных плиток...',
      progressVerify: 'Проверка геометрии и чётности...',
      progressPass2: 'Уточнение спорных плиток (проход 2)...',
      progressSolve: 'Расчёт пошагового решения...',
      analyzeErrorFallback: 'Не удалось распознать фотографии кубика Рубика.',
      turnLabel: (idx: number, total: number, move: string, desc: string) =>
        `Ход ${idx}/${total}: ${move} · ${desc}`,
      stepLabel: (idx: number, total: number, move: string, desc: string) =>
        `Шаг ${idx}/${total}: ${move} · ${desc}`,
      turnFallback: (move: string) => `Ход: ${move}`,
    },
    uploader: {
      title: 'Фотографии кубика',
      subtitle: (total = 54) => `1–6 фото (2 противоположных угла покрывают все ${total} плиток)`,
      collapseAria: 'Свернуть блок загрузки фото',
      expandAria: 'Развернуть блок загрузки фото',
      dropHint: 'Перетащите, вставьте или снимите ракурсы кубика',
      selectPhotos: 'Выбрать фото',
      selectPhotosAria: 'Выбрать фотографии кубика Рубика',
      camera: 'Камера',
      closeCamera: 'Закрыть камеру',
      closeCameraAria: 'Закрыть камеру',
      capturePhoto: 'Сделать снимок',
      reticleHint: 'Разместите 3 видимые грани внутри рамки',
      cameraUnavailable: 'Доступ к камере недоступен в этом браузере.',
      cameraDenied: 'Доступ к камере запрещён или камера не найдена.',
      maxPhotosError: 'Достигнут лимит в 6 фото. Удалите снимок, чтобы добавить новый.',
      invalidFileError: (name: string) => `Пропущен «${name}»: поддерживаются только изображения.`,
      imageProcessError: 'Не удалось обработать изображение.',
      cameraCaptureName: (idx: number) => `Снимок с камеры ${idx}`,
      imageFallbackName: (idx: number) => `Изображение ${idx}`,
      photoAlt: (idx: number) => `Загруженный ракурс ${idx}`,
      angleAria: (idx: number) => `Ракурс для фото ${idx}`,
      removePhotoAria: (idx: number) => `Удалить фото ${idx}`,
      guideSummary: 'Подсказка: как сделать 2 снимка кубика',
      shot1Title: 'Снимок 1',
      shot1Desc: 'Верх (U), Перед (F), Право (R)',
      shot2Title: 'Снимок 2',
      shot2Desc: 'Переверните на 180° для D, B, L',
      recognizeBtn: 'Распознать кубик',
      canvasBtn: 'Пересчитать Ad-Hoc (<1с)',
      recognizingDefault: 'Распознавание кубика...',
      canvasAnalyzing: 'Локальное считывание цветов...',
      recognitionModeLabel: 'Метод',
      modeAi: 'ИИ-анализ',
      modeCanvas: 'Локальный Canvas (<1с)',
      aiSpeedLabel: 'Скорость',
      aiSpeedFast: 'Быстрая (Flash Lite)',
      aiSpeedAccurate: 'Точная (Flash)',
      skipPass2Label: 'Без 2-го прохода (быстрее, правка вручную)',
      canvasSubtitle: 'Скан 6 граней в любом порядке · Автоопределение сторон и цветов',
      canvasHint: 'Удерживайте любую грань 2 сек для автосъёмки или загрузите 1–6 фото в любом порядке. Стороны и поворот определятся автоматически.',
      canvasAlignTitle: (size: CubeSize = 3) => `Сетка ${size}×${size} по грани`,
      canvasAlignDragHint: (size: CubeSize = 3) =>
        `Перетащите квадрат на грань ${size}×${size} · точки показывают считанные цвета`,
      canvasAlignSize: 'Размер',
      canvasAlignReset: 'Сброс',
      reticleCanvasHint: (size: CubeSize = 3) =>
        `Наведите квадратную сетку ${size}×${size} на любую грань`,
      autoCaptureLabel: 'Автосъёмка при удержании 2с',
      holdSteady: (secLeft: string, ready: number, total = 9) =>
        `${ready}/${total} плиток · Держите ровно ${secLeft}с`,
      scanningTiles: (ready: number, total = 9) =>
        `Наведите грань в сетку (${ready}/${total} плиток)`,
      duplicateSideHold: 'Эта грань уже снята — поверните другую',
      capturedFlash: 'Снято!',
      captureNowBtn: 'Снять сейчас',
      uploadFacesBtn: 'Загрузить 1–6 фото',
      scanSlotLabel: (idx: number) => `Скан ${idx}`,
      clearScanAria: (idx: number) => `Удалить скан ${idx}`,
      autoFacePending: 'Авто',
      scannedSides: (n: number) => `Снято граней: ${n}/6`,
      livePreview: 'Превью',
      preparingImages: (done: number, total: number) =>
        `Обработка фото (${done}/${total})...`,
      elapsedEstimate: (elapsedSec: string, estSec: string) =>
        `${elapsedSec}с / ~${estSec}с`,
      lastScanTime: (sec: string) => `Последнее распознавание: ${sec}с`,
    },
    preview3d: {
      title: '3D-модель кубика',
      subtitle: 'Вращайте мышью/пальцем',
      resetViewAria: 'Сбросить ракурс 3D',
      scramble: 'Перемешать',
      scrambleAria: 'Перемешать кубик',
      soundMuteAria: 'Выключить звук кубика',
      soundUnmuteAria: 'Включить звук кубика',
      fullscreenExitAria: 'Свернуть 3D-сцену',
      solverLabel: 'Алгоритм',
      solverLbl: '7 этапов',
      solverKociemba: 'Кратчайший (Kociemba)',
      solver2x2Optimal: 'Оптимальный кратчайший (≤11)',
      jumpStartAria: 'К начальному состоянию',
      prevStepAria: 'Предыдущий шаг',
      prev: 'Назад',
      play: 'Старт',
      pause: 'Пауза',
      replay: 'Повтор',
      next: 'Вперёд',
      nextStepAria: 'Следующий шаг',
      jumpEndAria: 'К собранному состоянию',
      stepCount: (curr: number, total: number) => `Шаг ${curr}/${total}`,
      timeline: 'Этапы',
      solvedBanner: 'Кубик собран · Нажмите «Перемешать»',
      solveCube: 'Решить кубик',
      resolveConflicts: (count: number) =>
        count === 1 ? 'Исправьте 1 конфликт' : `Исправьте конфликты (${count})`,
      scanOrScramble: 'Загрузите фото или перемешайте',
      inspectConflictsLink: 'Проверить конфликты в Меню',
    },
    drawer: {
      dialogAria: 'Меню инструментов кубика',
      closeAria: 'Закрыть меню',
      tabTimeline: (totalSteps: number) =>
        totalSteps > 0 ? `Ходы (${totalSteps})` : 'Ходы',
      tabLayout: '2D-развёртка',
      tabVerify: (issues: number) => (issues > 0 ? `Проверка (${issues})` : 'Проверка'),
      scrambleCube: 'Перемешать',
      solvedReference: 'Собранный',
      resetAll: 'Сбросить всё',
      inspectConflictsBtn: 'Посмотреть конфликты на 2D-развёртке',
    },
    solvePanel: {
      title: 'Последовательность решения',
      solvedZero: 'Кубик уже собран · 0 ходов',
      movesCount: (total: number) => `${total} ходов за 7 этапов`,
      movesCountKociemba: (total: number) => `${total} ходов · Kociemba (2 фазы)`,
      movesCount2x2: (total: number) => `${total} ходов · Оптимальный поиск 2×2`,
      stageBreakdown: 'Поэтапный разбор ходов',
      optimal2x2Breakdown: 'Двунаправленный BFS для 2×2 (≤11 HTM)',
      solverLbl: '7 этапов',
      solverKociemba: 'Кратчайший (Kociemba)',
      solver2x2Tag: 'Оптимум ≤11',
      start: 'В начало',
      recompute: 'Пересчитать',
      validSummary: (total = 54) => `Корректно · ${total}/${total} плиток`,
      emptyPrompt: 'Загрузите фото или нажмите «Перемешать»',
      partialSummary: (known: number, total = 54) => `Частично · ${known}/${total} плиток`,
      invalidSummary: (count: number) => `Ошибки · конфликтов: ${count}`,
      linkLayout: '2D-развёртка',
      linkVerification: 'Проверка',
      alreadySolvedNote:
        'Все 6 граней одноцветные. Нажмите «Перемешать» сверху или загрузите фото разобранного кубика.',
      stepLabel: (curr: number, total: number) => `Шаг ${curr} / ${total}`,
      nextPrefix: (stage: string) => `Далее: ${stage}`,
      complete: 'Готово',
      nextMoveLine: (move: string, desc: string) => `Далее: ${move} · ${desc}`,
      finalMoveComplete: 'Финальный ход выполнен — кубик собран',
      startingState: 'Исходное состояние кубика',
      startingHint: (move: string) => `Используйте Старт или Вперёд под 3D-видом (${move})`,
      clear: 'Очистить',
      stepTitle: (idx: number, desc: string) => `Шаг ${idx}: ${desc}`,
    },
    net2d: {
      title: '2D-развёртка кубика',
      subtitle: 'Нажмите на плитку для правки · Наведите на рёбра/углы для стыков',
      returnScanned: 'Вернуться к исходному',
      coordinates: 'Индексы',
      sharedSeam: 'Стык элемента:',
      fixedCenter: 'Неподвижный центр грани',
      tapHint: 'Нажмите на любую плитку для смены цвета или ↻ для поворота грани на 90°.',
      editTile: (face: string, idx: number) => `Плитка ${face}${idx}`,
      done: 'Готово',
      selectColorAria: (face: string, idx: number) => `Выбрать цвет для ${face}${idx}`,
      setColorAria: (face: string, idx: number, color: string) =>
        `Задать для ${face}${idx} цвет: ${color}`,
      rotateDisabledTitle: 'Вернитесь к исходному состоянию для поворота граней',
      rotateTitle: (face: string) => `Повернуть грань ${face} на 90° по часовой`,
      rotateAria: (face: string) => `Повернуть грань ${face} на 90 градусов по часовой`,
      stickerAria: (face: string, idx: number, color: string, conflict: boolean) =>
        `Плитка ${face}${idx}, ${color}${conflict ? ', обнаружен конфликт' : ''}`,
      aiConfidenceTitle: (conf: string) => `Уверенность ИИ: ${conf}`,
      conflictTitle: 'Ошибка физической проверки на этой плитке',
      detectedPalette: 'Палитра кубика:',
      uncertainRead: 'Неуверенное распознавание',
      validationConflict: 'Конфликт проверки',
    },
    verification: {
      title: 'Проверка и математическая решаемость',
      subtitle: 'Проверка углов, рёбер, ориентации и чётности перестановок',
      passTwo: 'Двойная самопроверка ИИ',
      passOne: 'Проверено ИИ (1 проход)',
      reverifyBtn: 'Перепроверить с ИИ',
      validHeadline: 'Состояние корректно и решаемо',
      validSubline: (size: CubeSize = 3) =>
        size === 2
          ? 'Все 24 плитки, 8 уникальных углов, хиральность и чётность поворотов пройдены.'
          : 'Все 54 плитки, 6 уникальных центров, 12 рёбер, 8 углов и инварианты чётности пройдены.',
      partialHeadline: (known: number, total = 54) => `Частичный скан · ${known}/${total} плиток`,
      partialEmptySub: 'Загрузите 1–6 фотографий кубика Рубика для распознавания.',
      partialMoreSub: (unscanned: string) =>
        `Видимая геометрия согласована. Не отсканированы грани: ${unscanned}. Загрузите ещё ракурс для полной проверки.`,
      invalidHeadline: (count: number) => `Некорректное состояние · конфликтов: ${count}`,
      invalidSubline:
        'Текущая 2D-развёртка нарушает физические ограничения кубика и не может быть собрана. Проверьте отмеченные плитки или запустите перепроверку ИИ.',
      detectedConflicts: (count: number) => `Обнаруженные конфликты (${count})`,
      tilesPrefix: 'Плитки:',
      suggestedFix: 'Как исправить:',
      stickersMapped: 'Распознано плиток',
      centersDistinct: (n: number) => `Центров: ${n}/6 уникальных`,
      noCenters2x2: 'Кубик 2×2 (без центров)',
      edgeCubies: 'Рёбра',
      flipAwaiting: (total = 54) => `Чётность рёбер: ждёт ${total} плиток`,
      flipSum: (sum: number, even: boolean) =>
        `Сумма переворотов: ${sum} (${even ? 'чётная' : 'нечётная'})`,
      cornerCubies: 'Углы',
      twistAwaiting: (total = 54) => `Скручивание углов: ждёт ${total} плиток`,
      twistSum: (sum: number, mod: number) => `Сумма поворотов: ${sum} (${mod} mod 3)`,
      permutationParity: 'Чётность перестановок',
      pending: 'Ожидание',
      matched: 'Совпадает',
      mismatch: 'Несовпадение',
      wcaNonStd: 'Схема WCA: нестандартная',
      wcaValid: 'Схема WCA: стандартная',
      centerInferred: 'По центрам граней',
      cornerInferred: 'По углам 2×2',
      colorDistribution: (targetPerColor = 9) =>
        `Распределение цветов (цель: по ${targetPerColor} плиток)`,
      aiSummaryTitle: 'Отчёт ИИ о склейке ракурсов',
      photoFaces: (idx: number, faces: string) => `Фото ${idx} · Грани: ${faces}`,
      noFaces: 'Нет',
      lightingUncertain: 'Спорные по освещению плитки (наведите для подсветки)',
      orColor: 'или',
      faceletStringTitle: 'Строка состояния (URFDLB)',
      copiedString: 'Скопировано',
      copyFacelets: 'Копировать строку',
      copiedJson: 'JSON скопирован',
      copyJson: 'Копировать JSON',
      exportSvg: 'Экспорт 2D SVG',
    },
  },
} as const;
