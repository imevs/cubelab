import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import type { CubeSize } from '../shared/cubeTypes.ts';
import type { SolveResult, SolveStep, SolverMode } from '../shared/cubeSolver.ts';
import type { VerificationResult } from '../shared/cubeVerifier.ts';
import {
  translateMoveDescription,
  translateStageName,
  UI_TEXT,
  type Language,
} from '../lib/i18n.ts';
import type { MenuTab } from './WorkspaceMenuDrawer.tsx';

export type PlaybackSpeed = 0.5 | 1 | 2;

interface SolvePanelProps {
  lang: Language;
  cubeSize: CubeSize;
  verification: VerificationResult;
  solveResult: SolveResult | null;
  solverMode: SolverMode;
  activeStepIndex: number;
  isAnimating: boolean;
  onComputeSolution: () => void;
  onChangeSolverMode: (mode: SolverMode) => void;
  onJumpToStep: (stepIndex: number) => void;
  onClearSolution: () => void;
  onOpenMenu: (tab: MenuTab) => void;
}

export function SolvePanel({
  lang,
  cubeSize,
  verification,
  solveResult,
  solverMode,
  activeStepIndex,
  isAnimating,
  onComputeSolution,
  onChangeSolverMode,
  onJumpToStep,
  onClearSolution,
  onOpenMenu,
}: SolvePanelProps) {
  const t = UI_TEXT[lang].solvePanel;
  const totalSteps = solveResult?.steps.length ?? 0;
  const totalTiles = cubeSize * cubeSize * 6;
  const currentStep: SolveStep | null =
    solveResult && activeStepIndex > 0 && activeStepIndex <= totalSteps
      ? solveResult.steps[activeStepIndex - 1]
      : null;
  const nextStep: SolveStep | null =
    solveResult && activeStepIndex < totalSteps
      ? solveResult.steps[activeStepIndex]
      : null;

  const stageGroups = useMemo(() => {
    if (!solveResult || !solveResult.steps.length) return [];
    const groups: Array<{ stage: string; steps: SolveStep[] }> = [];
    for (const step of solveResult.steps) {
      const last = groups[groups.length - 1];
      if (!last || last.stage !== step.stage) {
        groups.push({ stage: step.stage, steps: [step] });
      } else {
        last.steps.push(step);
      }
    }
    return groups;
  }, [solveResult]);

  const progressPct = totalSteps > 0 ? Math.round((activeStepIndex / totalSteps) * 100) : 0;

  return (
    <section
      id="solver"
      className="studio-card rounded-xl p-3.5 sm:p-4 flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            {t.title}
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {solveResult?.solvable
              ? solveResult.alreadySolved
                ? t.solvedZero
                : cubeSize === 2
                ? t.movesCount2x2(totalSteps)
                : (solveResult.solverMode ?? solverMode) === 'kociemba'
                ? t.movesCountKociemba(totalSteps)
                : t.movesCount(totalSteps)
              : cubeSize === 2
              ? t.optimal2x2Breakdown
              : t.stageBreakdown}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {cubeSize === 3 ? (
            <div className="grid grid-cols-2 gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-950/70 rounded-lg border border-slate-200/70 dark:border-slate-800">
              {(['lbl', 'kociemba'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={isAnimating}
                  onClick={() => onChangeSolverMode(mode)}
                  className={`min-h-[30px] px-2.5 py-0.5 text-[11px] font-medium rounded-md transition-all whitespace-nowrap disabled:opacity-50 ${
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
            <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300 px-2.5 py-1 bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 rounded-lg whitespace-nowrap">
              {t.solver2x2Tag}
            </span>
          )}

          {solveResult?.solvable && activeStepIndex > 0 && (
            <button
              type="button"
              onClick={() => onJumpToStep(0)}
              className="min-h-[36px] px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg inline-flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t.start}
            </button>
          )}

          {solveResult?.solvable && !solveResult.alreadySolved && (
            <button
              type="button"
              onClick={onComputeSolution}
              disabled={!verification.isSolvable || isAnimating}
              className="min-h-[36px] px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap"
            >
              {t.recompute}
            </button>
          )}
        </div>
      </div>

      {/* Compact Inline Validation Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-lg text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          {verification.status === 'valid' ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-slate-800 dark:text-slate-100 font-medium truncate">
                {t.validSummary(totalTiles)}
              </span>
            </>
          ) : verification.status === 'partial' ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-slate-700 dark:text-slate-300 truncate">
                {verification.knownStickerCount === 0
                  ? t.emptyPrompt
                  : t.partialSummary(verification.knownStickerCount, totalTiles)}
              </span>
            </>
          ) : (
            <>
              <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
              <span className="text-rose-900 dark:text-rose-200 font-medium truncate">
                {t.invalidSummary(verification.issues.length)}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onOpenMenu('layout')}
            className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline underline-offset-2 whitespace-nowrap"
          >
            {t.linkLayout}
          </button>
          <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            onClick={() => onOpenMenu('verification')}
            className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline underline-offset-2 whitespace-nowrap"
          >
            {t.linkVerification}
          </button>
        </div>
      </div>

      {solveResult && !solveResult.solvable && solveResult.error && (
        <div className="px-3 py-2 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/80 rounded-lg text-xs text-rose-900 dark:text-rose-100">
          {solveResult.error}
        </div>
      )}

      {solveResult?.solvable && solveResult.alreadySolved && (
        <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/80 rounded-lg text-xs text-emerald-900 dark:text-emerald-100">
          {t.alreadySolvedNote}
        </div>
      )}

      {solveResult?.solvable && !solveResult.alreadySolved && (
        <div className="flex flex-col gap-2.5">
          {/* Progress & Active Step Card */}
          <div className="border border-slate-200 dark:border-slate-700/80 rounded-lg p-3 bg-slate-50/70 dark:bg-slate-800/50 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {t.stepLabel(activeStepIndex, totalSteps)}
              </span>
              <span className="text-slate-600 dark:text-slate-300">
                {currentStep
                  ? translateStageName(currentStep.stage, lang)
                  : nextStep
                  ? t.nextPrefix(translateStageName(nextStep.stage, lang))
                  : t.complete}
                <span className="mx-1 text-slate-400 dark:text-slate-500" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono tabular-nums">{progressPct}%</span>
              </span>
            </div>

            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-slate-900 dark:bg-blue-500 transition-transform duration-150 origin-left"
                style={{
                  transform: `scaleX(${totalSteps > 0 ? activeStepIndex / totalSteps : 0})`,
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-0.5">
              {currentStep ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-md bg-slate-900 dark:bg-blue-600 text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                    {currentStep.move}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {translateMoveDescription(currentStep.move, lang)}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {nextStep
                        ? t.nextMoveLine(
                            nextStep.move,
                            translateMoveDescription(nextStep.move, lang)
                          )
                        : t.finalMoveComplete}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-md bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                    0
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {t.startingState}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {t.startingHint(nextStep?.move ?? '')}
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={onClearSolution}
                className="min-h-[32px] px-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white dark:hover:bg-slate-700 border border-transparent hover:border-slate-200 dark:hover:border-slate-600 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                {t.clear}
              </button>
            </div>
          </div>

          {/* Interactive Stage-Grouped Move Sequence */}
          <div className="flex flex-col gap-2 max-h-[50dvh] overflow-y-auto pr-1 pt-2 border-t border-slate-200 dark:border-slate-800">
            {stageGroups.map((group) => (
              <div key={group.stage} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {translateStageName(group.stage, lang)}
                  </span>
                  <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {group.steps.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.steps.map((step) => {
                    const isCurrent = step.index === activeStepIndex;
                    const isDone = step.index < activeStepIndex;
                    return (
                      <button
                        key={step.index}
                        type="button"
                        onClick={() => onJumpToStep(step.index)}
                        title={t.stepTitle(step.index, translateMoveDescription(step.move, lang))}
                        className={`min-w-[36px] min-h-[34px] px-2 py-0.5 text-xs font-mono tabular-nums font-semibold rounded-md border transition-all whitespace-nowrap shrink-0 ${
                          isCurrent
                            ? 'bg-slate-900 dark:bg-blue-600 text-white border-slate-900 dark:border-blue-500 shadow-xs'
                            : isDone
                            ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/80 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                            : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        {step.move}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
