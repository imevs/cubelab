import { useEffect } from 'react';
import {
  Grid3X3,
  ListOrdered,
  RotateCcw,
  ShieldCheck,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AmbiguousStickerNote,
  CubeColor,
  CubeConfidenceMap,
  CubeFaces,
  CubePalette,
  CubeSize,
  FaceId,
  PhotoAnalysisSummary,
  RecognitionTimingBreakdown,
  StickerRef,
} from '../shared/cubeTypes.ts';
import type { SolveResult, SolverMode } from '../shared/cubeSolver.ts';
import type { VerificationResult } from '../shared/cubeVerifier.ts';
import { UI_TEXT, type Language } from '../lib/i18n.ts';
import { CubeNet2D } from './CubeNet2D.tsx';
import { SolvePanel } from './SolvePanel.tsx';
import { VerificationPanel } from './VerificationPanel.tsx';

export type MenuTab = 'timeline' | 'layout' | 'verification';

interface WorkspaceMenuDrawerProps {
  lang: Language;
  cubeSize: CubeSize;
  isOpen: boolean;
  activeTab: MenuTab;
  onChangeTab: (tab: MenuTab) => void;
  onClose: () => void;
  // SolvePanel (Solution Timeline) props
  solveResult: SolveResult | null;
  solverMode: SolverMode;
  activeStepIndex: number;
  isAnimating: boolean;
  onComputeSolution: () => void;
  onChangeSolverMode: (mode: SolverMode) => void;
  onJumpToStep: (stepIndex: number) => void;
  onClearSolution: () => void;
  // CubeNet2D props
  displayedFaces: CubeFaces;
  rawFaces: CubeFaces;
  palette: CubePalette;
  confidences: CubeConfidenceMap;
  conflictStickers: StickerRef[];
  focusedStickers: StickerRef[];
  activeMoveFace: FaceId | null;
  isSolvePreviewLocked: boolean;
  onExitSolvePreview: () => void;
  onStickerChange: (face: FaceId, index: number, color: CubeColor) => void;
  onRotateFaceClockwise: (face: FaceId) => void;
  // VerificationPanel props
  verification: VerificationResult;
  photoAnalyses: PhotoAnalysisSummary[];
  ambiguousStickers: AmbiguousStickerNote[];
  reasoningSummary: string;
  passInfo: { passCount: number; selfCorrected: boolean } | null;
  timingBreakdown?: RecognitionTimingBreakdown | null;
  hasPhotos: boolean;
  isAnalyzing: boolean;
  onFocusStickers: (stickers: StickerRef[]) => void;
  onReverifyWithAi: () => void;
  // Workspace actions
  hasPhotosOrData: boolean;
  onScrambleCube: () => void;
  onLoadSolvedBase: () => void;
  onResetAll: () => void;
}

export function WorkspaceMenuDrawer({
  lang,
  cubeSize,
  isOpen,
  activeTab,
  onChangeTab,
  onClose,
  solveResult,
  solverMode,
  activeStepIndex,
  isAnimating,
  onComputeSolution,
  onChangeSolverMode,
  onJumpToStep,
  onClearSolution,
  displayedFaces,
  rawFaces,
  palette,
  confidences,
  conflictStickers,
  focusedStickers,
  activeMoveFace,
  isSolvePreviewLocked,
  onExitSolvePreview,
  onStickerChange,
  onRotateFaceClockwise,
  verification,
  photoAnalyses,
  ambiguousStickers,
  reasoningSummary,
  passInfo,
  timingBreakdown = null,
  hasPhotos,
  isAnalyzing,
  onFocusStickers,
  onReverifyWithAi,
  hasPhotosOrData,
  onScrambleCube,
  onLoadSolvedBase,
  onResetAll,
}: WorkspaceMenuDrawerProps) {
  const t = UI_TEXT[lang].drawer;
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const issueCount = verification.issues.length;
  const totalSteps = solveResult?.solvable && !solveResult.alreadySolved ? solveResult.steps.length : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:flex-row sm:justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={t.dialogAria}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label={t.closeAria}
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/45 dark:bg-black/65 backdrop-blur-[2px] cursor-default"
      />

      {/* Drawer / Mobile Portrait Bottom Sheet */}
      <div className="relative z-10 w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl h-[92dvh] sm:h-full bg-[#F4F7FB] dark:bg-[#0B1120] rounded-t-2xl sm:rounded-none sm:border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden shadow-2xl">
        {/* Mobile portrait grab indicator */}
        <div className="sm:hidden pt-2 pb-0.5 flex justify-center bg-white dark:bg-slate-900">
          <span className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
        </div>

        {/* Sticky Menu Header */}
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 px-3.5 sm:px-5 py-2.5 sm:py-3 [@media(max-height:500px)]:py-1.5 flex flex-col gap-2.5 [@media(max-height:500px)]:gap-1.5 shrink-0">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-950/80 rounded-lg flex-1 max-w-lg border border-slate-200/70 dark:border-slate-800">
              <button
                type="button"
                onClick={() => onChangeTab('timeline')}
                className={`min-h-[40px] [@media(max-height:500px)]:min-h-[34px] px-1.5 sm:px-3 py-1.5 [@media(max-height:500px)]:py-1 text-[11px] sm:text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1 sm:gap-1.5 transition-all whitespace-nowrap ${
                  activeTab === 'timeline'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <ListOrdered className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {t.tabTimeline(totalSteps)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onChangeTab('layout')}
                className={`min-h-[40px] [@media(max-height:500px)]:min-h-[34px] px-1.5 sm:px-3 py-1.5 [@media(max-height:500px)]:py-1 text-[11px] sm:text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1 sm:gap-1.5 transition-all whitespace-nowrap ${
                  activeTab === 'layout'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Grid3X3 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{t.tabLayout}</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeTab('verification')}
                className={`min-h-[40px] [@media(max-height:500px)]:min-h-[34px] px-1.5 sm:px-3 py-1.5 [@media(max-height:500px)]:py-1 text-[11px] sm:text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1 sm:gap-1.5 transition-all whitespace-nowrap ${
                  activeTab === 'verification'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {t.tabVerify(issueCount)}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label={t.closeAria}
              className="min-w-[44px] min-h-[44px] [@media(max-height:500px)]:min-w-[36px] [@media(max-height:500px)]:min-h-[36px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Workspace Actions */}
          <div className="flex flex-wrap items-center gap-2 [@media(max-height:500px)]:gap-1.5">
            <button
              type="button"
              onClick={() => {
                onScrambleCube();
                onClose();
              }}
              className="min-h-[38px] [@media(max-height:500px)]:min-h-[32px] px-3 py-1.5 [@media(max-height:500px)]:py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Shuffle className="w-3.5 h-3.5" />
              {t.scrambleCube}
            </button>
            <button
              type="button"
              onClick={onLoadSolvedBase}
              className="min-h-[38px] [@media(max-height:500px)]:min-h-[32px] px-3 py-1.5 [@media(max-height:500px)]:py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t.solvedReference}
            </button>
            <button
              type="button"
              onClick={() => {
                onResetAll();
                onClose();
              }}
              disabled={!hasPhotosOrData}
              className="min-h-[38px] [@media(max-height:500px)]:min-h-[32px] px-3 py-1.5 [@media(max-height:500px)]:py-1 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50/70 dark:bg-rose-950/40 hover:bg-rose-100/70 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ml-auto"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t.resetAll}
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 [@media(max-height:500px)]:p-3 flex flex-col gap-4">
          {activeTab === 'timeline' ? (
            <SolvePanel
              lang={lang}
              cubeSize={cubeSize}
              verification={verification}
              solveResult={solveResult}
              solverMode={solverMode}
              activeStepIndex={activeStepIndex}
              isAnimating={isAnimating}
              onComputeSolution={onComputeSolution}
              onChangeSolverMode={onChangeSolverMode}
              onJumpToStep={onJumpToStep}
              onClearSolution={onClearSolution}
              onOpenMenu={onChangeTab}
            />
          ) : activeTab === 'layout' ? (
            <CubeNet2D
              lang={lang}
              cubeSize={cubeSize}
              faces={displayedFaces}
              palette={palette}
              confidences={confidences}
              conflictStickers={isSolvePreviewLocked ? [] : conflictStickers}
              focusedStickers={isSolvePreviewLocked ? [] : focusedStickers}
              activeMoveFace={activeMoveFace}
              isSolvePreviewLocked={isSolvePreviewLocked}
              onExitSolvePreview={onExitSolvePreview}
              onStickerChange={onStickerChange}
              onRotateFaceClockwise={onRotateFaceClockwise}
            />
          ) : (
            <>
              <VerificationPanel
                lang={lang}
                cubeSize={cubeSize}
                faces={rawFaces}
                palette={palette}
                verification={verification}
                photoAnalyses={photoAnalyses}
                ambiguousStickers={ambiguousStickers}
                reasoningSummary={reasoningSummary}
                passInfo={passInfo}
                timingBreakdown={timingBreakdown}
                hasPhotos={hasPhotos}
                isAnalyzing={isAnalyzing}
                onFocusStickers={(stickers) => {
                  onFocusStickers(stickers);
                }}
                onReverifyWithAi={onReverifyWithAi}
              />

              {verification.issues.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onFocusStickers(conflictStickers);
                    onChangeTab('layout');
                  }}
                  className="w-full min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors"
                >
                  {t.inspectConflictsBtn}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
