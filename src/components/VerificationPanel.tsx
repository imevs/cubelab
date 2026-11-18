import { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  Download,
  RefreshCw,
} from 'lucide-react';
import type {
  AmbiguousStickerNote,
  CubeFaces,
  CubePalette,
  CubeSize,
  PhotoAnalysisSummary,
  RecognitionTimingBreakdown,
  StickerRef,
} from '../shared/cubeTypes.ts';
import { KNOWN_COLORS, getColorMeta } from '../shared/cubeTypes.ts';
import type { VerificationResult } from '../shared/cubeVerifier.ts';
import { generateCubeNetSvg } from '../lib/imageUtils.ts';
import {
  formatTimingBreakdown,
  translateColorName,
  UI_TEXT,
  type Language,
} from '../lib/i18n.ts';

interface VerificationPanelProps {
  lang: Language;
  cubeSize: CubeSize;
  faces: CubeFaces;
  palette: CubePalette;
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
}

export function VerificationPanel({
  lang,
  cubeSize,
  faces,
  palette,
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
}: VerificationPanelProps) {
  const t = UI_TEXT[lang].verification;
  const [copiedKociemba, setCopiedKociemba] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const totalStickers = cubeSize * cubeSize * 6;
  const targetPerColor = cubeSize * cubeSize;

  const handleCopyKociemba = async () => {
    try {
      await navigator.clipboard.writeText(verification.kociembaString);
      setCopiedKociemba(true);
      setTimeout(() => setCopiedKociemba(false), 1800);
    } catch {
      // Clipboard blocked in some iframe contexts
    }
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ cubeSize, palette, faces }, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const handleDownloadSvg = () => {
    const svgContent = generateCubeNetSvg(faces, palette);
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rubiks-cube-${cubeSize}x${cubeSize}-2d-layout.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const statusMeta =
    verification.status === 'valid'
      ? {
          icon: CheckCircle2,
          toneClass:
            'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/80 text-emerald-900 dark:text-emerald-100',
          iconClass: 'text-emerald-600 dark:text-emerald-400',
          headline: t.validHeadline,
          subline: t.validSubline(cubeSize),
        }
      : verification.status === 'partial'
      ? {
          icon: AlertTriangle,
          toneClass:
            'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/80 text-amber-950 dark:text-amber-100',
          iconClass: 'text-amber-600 dark:text-amber-400',
          headline: t.partialHeadline(verification.knownStickerCount, totalStickers),
          subline:
            verification.knownStickerCount === 0
              ? t.partialEmptySub
              : t.partialMoreSub(verification.unscannedFaces.join(', ')),
        }
      : {
          icon: XCircle,
          toneClass:
            'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/80 text-rose-950 dark:text-rose-100',
          iconClass: 'text-rose-600 dark:text-rose-400',
          headline: t.invalidHeadline(verification.issues.length),
          subline: t.invalidSubline,
        };

  const StatusIcon = statusMeta.icon;

  return (
    <section
      id="verification"
      className="studio-card rounded-xl p-3.5 sm:p-4 flex flex-col gap-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            {t.title}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t.subtitle}
            {passInfo && timingBreakdown?.mode !== 'canvas' && (
              <>
                {' '}
                · {passInfo.passCount === 2 ? t.passTwo : t.passOne}
              </>
            )}
            {timingBreakdown && (
              <>
                {' '}
                ·{' '}
                <span className="font-mono tabular-nums">
                  {formatTimingBreakdown(timingBreakdown, null, lang)}
                </span>
              </>
            )}
          </p>
        </div>

        {hasPhotos && (
          <button
            type="button"
            onClick={onReverifyWithAi}
            disabled={isAnalyzing}
            className="px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
            {t.reverifyBtn}
          </button>
        )}
      </div>

      {/* Primary Status Feedback Banner */}
      <div className={`border rounded-lg p-4 flex items-start gap-3 ${statusMeta.toneClass}`}>
        <StatusIcon className={`w-5 h-5 shrink-0 mt-0.5 ${statusMeta.iconClass}`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{statusMeta.headline}</div>
          <p className="text-xs mt-1 leading-relaxed opacity-90">{statusMeta.subline}</p>
        </div>
      </div>

      {/* Actionable Conflict List when Invalid */}
      {verification.issues.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {t.detectedConflicts(verification.issues.length)}
          </div>
          <div className="flex flex-col gap-2">
            {verification.issues.map((issue) => (
              <div
                key={issue.id}
                onMouseEnter={() => onFocusStickers(issue.affectedStickers)}
                onMouseLeave={() => onFocusStickers([])}
                className="border border-rose-200 dark:border-rose-800/80 bg-rose-50/40 dark:bg-rose-950/40 rounded-lg p-3 flex flex-col gap-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-rose-900 dark:text-rose-200">
                    {issue.title}
                  </span>
                  {issue.affectedStickers.length > 0 && (
                    <span className="font-mono tabular-nums text-[11px] text-rose-700 dark:text-rose-300">
                      {t.tilesPrefix}{' '}
                      {issue.affectedStickers
                        .slice(0, 8)
                        .map((s) => `${s.face}${s.index}`)
                        .join(', ')}
                      {issue.affectedStickers.length > 8 ? '…' : ''}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{issue.message}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  <strong className="font-medium text-slate-800 dark:text-slate-100">{t.suggestedFix}</strong>{' '}
                  {issue.hint}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mathematical Invariant Metrics */}
      <div
        className={`grid gap-3 ${
          cubeSize === 2 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 lg:grid-cols-4'
        }`}
      >
        <div className="border border-slate-200 dark:border-slate-700/80 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t.stickersMapped}</div>
          <div className="font-mono tabular-nums text-lg font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
            {verification.knownStickerCount}
            <span className="text-xs text-slate-400 dark:text-slate-500 font-normal ml-0.5">/{totalStickers}</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {cubeSize === 2
              ? t.noCenters2x2
              : t.centersDistinct(verification.centerSummary.distinctCount)}
          </div>
        </div>

        {cubeSize === 3 && (
          <div className="border border-slate-200 dark:border-slate-700/80 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-800/50">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t.edgeCubies}</div>
            <div className="font-mono tabular-nums text-lg font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
              {verification.pieceSummary.validEdges}
              <span className="text-xs text-slate-400 dark:text-slate-500 font-normal ml-0.5">
                /{verification.pieceSummary.observedEdges || 12}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {verification.pieceSummary.edgeFlipSum === null
                ? t.flipAwaiting(totalStickers)
                : t.flipSum(
                    verification.pieceSummary.edgeFlipSum,
                    verification.pieceSummary.edgeFlipSum % 2 === 0
                  )}
            </div>
          </div>
        )}

        <div className="border border-slate-200 dark:border-slate-700/80 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t.cornerCubies}</div>
          <div className="font-mono tabular-nums text-lg font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
            {verification.pieceSummary.validCorners}
            <span className="text-xs text-slate-400 dark:text-slate-500 font-normal ml-0.5">
              /{verification.pieceSummary.observedCorners || 8}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {verification.pieceSummary.cornerTwistSum === null
              ? t.twistAwaiting(totalStickers)
              : t.twistSum(
                  verification.pieceSummary.cornerTwistSum,
                  verification.pieceSummary.cornerTwistSum % 3
                )}
          </div>
        </div>

        <div className="border border-slate-200 dark:border-slate-700/80 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t.permutationParity}</div>
          <div className="font-mono tabular-nums text-lg font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
            {verification.pieceSummary.permutationParityMatch === null
              ? t.pending
              : verification.pieceSummary.permutationParityMatch
              ? t.matched
              : t.mismatch}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {cubeSize === 2
              ? t.cornerInferred
              : verification.centerSummary.standardChiralValid === false
              ? t.wcaNonStd
              : verification.centerSummary.standardChiralValid === true
              ? t.wcaValid
              : t.centerInferred}
          </div>
        </div>
      </div>

      {/* Color Distribution Ledger */}
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
          {t.colorDistribution(targetPerColor)}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {KNOWN_COLORS.map((color) => {
            const count = verification.colorCounts[color];
            const meta = getColorMeta(palette, color);
            const isOver = count > targetPerColor;
            const isUnder = verification.isComplete && count < targetPerColor;
            return (
              <div
                key={color}
                className={`border rounded-lg px-2.5 py-2 flex items-center justify-between gap-2 ${
                  isOver || isUnder
                    ? 'border-rose-300 dark:border-rose-800/80 bg-rose-50/60 dark:bg-rose-950/40'
                    : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-3 h-3 rounded-[2px] border shrink-0"
                    style={{ backgroundColor: meta.hex, borderColor: meta.borderHex }}
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-200 truncate">
                    {translateColorName(meta.name, lang)}
                  </span>
                </div>
                <span
                  className={`font-mono tabular-nums text-xs font-semibold ${
                    isOver || isUnder
                      ? 'text-rose-700 dark:text-rose-300'
                      : count === targetPerColor
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Observation & Ambiguities */}
      {(reasoningSummary || photoAnalyses.length > 0 || ambiguousStickers.length > 0) && (
        <div className="border-t border-slate-200 dark:border-slate-800 pt-4 flex flex-col gap-3">
          {reasoningSummary && (
            <div>
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                {t.aiSummaryTitle}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{reasoningSummary}</p>
            </div>
          )}

          {photoAnalyses.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {photoAnalyses.map((p) => (
                <div
                  key={p.photoIndex}
                  className="text-xs border border-slate-200 dark:border-slate-700/80 rounded-lg px-3 py-2 bg-slate-50/60 dark:bg-slate-800/50"
                >
                  <div className="font-medium text-slate-800 dark:text-slate-100">
                    {t.photoFaces(p.photoIndex, p.visibleFaces.join(', ') || t.noFaces)}
                  </div>
                  <div className="text-slate-600 dark:text-slate-300 mt-0.5">{p.orientationNote}</div>
                </div>
              ))}
            </div>
          )}

          {ambiguousStickers.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                {t.lightingUncertain}
              </div>
              <div className="flex flex-col gap-1.5">
                {ambiguousStickers.map((a, idx) => (
                  <div
                    key={`${a.face}-${a.index}-${idx}`}
                    onMouseEnter={() => onFocusStickers([{ face: a.face, index: a.index }])}
                    onMouseLeave={() => onFocusStickers([])}
                    className="text-xs border border-amber-200 dark:border-amber-800/70 bg-amber-50/40 dark:bg-amber-950/35 rounded-lg px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 cursor-default"
                  >
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {a.face}
                      {a.index}: {translateColorName(getColorMeta(palette, a.chosenColor).name, lang)} ({t.orColor}{' '}
                      {translateColorName(getColorMeta(palette, a.alternativeColor).name, lang)})
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">{a.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Export & Facelet Notation */}
      <div className="border-t border-slate-200 dark:border-slate-800 pt-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {t.faceletStringTitle}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyKociemba}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              {copiedKociemba ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedKociemba ? t.copiedString : t.copyFacelets}
            </button>
            <button
              type="button"
              onClick={handleCopyJson}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedJson ? t.copiedJson : t.copyJson}
            </button>
            <button
              type="button"
              onClick={handleDownloadSvg}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              {t.exportSvg}
            </button>
          </div>
        </div>
        <div className="font-mono tabular-nums text-xs bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 overflow-x-auto select-all">
          {verification.kociembaString}
        </div>
      </div>
    </section>
  );
}
