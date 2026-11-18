import { useState } from 'react';
import { RotateCw, Hash } from 'lucide-react';
import type {
  CubeColor,
  CubeConfidenceMap,
  CubeFaces,
  CubePalette,
  CubeSize,
  FaceId,
  StickerRef,
} from '../shared/cubeTypes.ts';
import {
  KNOWN_COLORS,
  getColorMeta,
} from '../shared/cubeTypes.ts';
import { getCubiePartnerStickers } from '../shared/cubeVerifier.ts';
import {
  translateColorName,
  translateColorShortLabel,
  translateConfidence,
  translateFaceShortName,
  UI_TEXT,
  type Language,
} from '../lib/i18n.ts';

interface CubeNet2DProps {
  lang: Language;
  cubeSize: CubeSize;
  faces: CubeFaces;
  palette: CubePalette;
  confidences: CubeConfidenceMap;
  conflictStickers: StickerRef[];
  focusedStickers: StickerRef[];
  activeMoveFace?: FaceId | null;
  isSolvePreviewLocked?: boolean;
  onExitSolvePreview?: () => void;
  onStickerChange: (face: FaceId, index: number, color: CubeColor) => void;
  onRotateFaceClockwise: (face: FaceId) => void;
}

const NET_POSITIONS: Array<{ face: FaceId; col: number; row: number }> = [
  { face: 'U', col: 2, row: 1 },
  { face: 'L', col: 1, row: 2 },
  { face: 'F', col: 2, row: 2 },
  { face: 'R', col: 3, row: 2 },
  { face: 'B', col: 4, row: 2 },
  { face: 'D', col: 2, row: 3 },
];

const PALETTE_OPTIONS: CubeColor[] = [...KNOWN_COLORS, '?'];

function stickerKey(face: FaceId, index: number): string {
  return `${face}:${index}`;
}

export function CubeNet2D({
  lang,
  cubeSize,
  faces,
  palette,
  confidences,
  conflictStickers,
  focusedStickers,
  activeMoveFace = null,
  isSolvePreviewLocked = false,
  onExitSolvePreview,
  onStickerChange,
  onRotateFaceClockwise,
}: CubeNet2DProps) {
  const t = UI_TEXT[lang].net2d;
  const [showIndices, setShowIndices] = useState(false);
  const [hoveredSticker, setHoveredSticker] = useState<StickerRef | null>(null);
  const [editingSticker, setEditingSticker] = useState<StickerRef | null>(null);

  const conflictSet = new Set(conflictStickers.map((s) => stickerKey(s.face, s.index)));
  const focusedSet = new Set(focusedStickers.map((s) => stickerKey(s.face, s.index)));
  const partnerSet = new Set(
    hoveredSticker
      ? getCubiePartnerStickers(hoveredSticker, cubeSize).map((s) => stickerKey(s.face, s.index))
      : []
  );

  const hoveredPartners = hoveredSticker ? getCubiePartnerStickers(hoveredSticker, cubeSize) : [];

  return (
    <section
      id="layout-2d"
      className="studio-card rounded-xl p-3.5 sm:p-4 flex flex-col gap-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            {t.title}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isSolvePreviewLocked && onExitSolvePreview && (
            <button
              type="button"
              onClick={onExitSolvePreview}
              className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {t.returnScanned}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowIndices((v) => !v)}
            className={`min-h-[38px] px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              showIndices
                ? 'bg-slate-900 dark:bg-blue-600 text-white border-slate-900 dark:border-blue-500'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <Hash className="w-3.5 h-3.5" />
            {t.coordinates}
          </button>
        </div>
      </div>

      {/* Seam Inspection Readout */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-lg text-xs text-slate-600 dark:text-slate-300 min-h-[36px]">
        {hoveredSticker ? (
          <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {hoveredSticker.face}
              {hoveredSticker.index} (
              {translateColorName(
                getColorMeta(palette, faces[hoveredSticker.face][hoveredSticker.index]).name,
                lang
              )}
              )
            </span>
            {hoveredPartners.length > 0 ? (
              <>
                <span className="text-slate-400 dark:text-slate-500">·</span>
                <span className="text-slate-600 dark:text-slate-300">
                  {t.sharedSeam}{' '}
                  {hoveredPartners
                    .map(
                      (p) =>
                        `${p.face}${p.index} (${translateColorName(
                          getColorMeta(palette, faces[p.face][p.index]).name,
                          lang
                        )})`
                    )
                    .join(' + ')}
                </span>
              </>
            ) : (
              <>
                <span className="text-slate-400 dark:text-slate-500">·</span>
                <span className="text-slate-600 dark:text-slate-300">{t.fixedCenter}</span>
              </>
            )}
          </div>
        ) : (
          <span>{t.tapHint}</span>
        )}
      </div>

      {/* Inline Mobile-Safe Color Picker Bar */}
      {!isSolvePreviewLocked && editingSticker && (
        <div
          role="region"
          aria-label={t.selectColorAria(editingSticker.face, editingSticker.index)}
          className="p-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-300 dark:border-slate-700 rounded-lg flex flex-col gap-2"
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
              {t.editTile(editingSticker.face, editingSticker.index)}
            </span>
            <button
              type="button"
              onClick={() => setEditingSticker(null)}
              className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 px-2 py-0.5 rounded"
            >
              {t.done}
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {PALETTE_OPTIONS.map((opt) => {
              const optMeta = getColorMeta(palette, opt);
              const optDisplayName = translateColorName(optMeta.name, lang);
              const optShort = translateColorShortLabel(optMeta.name, optMeta.shortLabel, lang);
              const current = faces[editingSticker.face][editingSticker.index];
              const selected = current === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  title={optDisplayName}
                  aria-label={t.setColorAria(
                    editingSticker.face,
                    editingSticker.index,
                    optDisplayName
                  )}
                  onClick={() => {
                    onStickerChange(editingSticker.face, editingSticker.index, opt);
                    setEditingSticker(null);
                  }}
                  style={{
                    backgroundColor: opt === '?' ? undefined : optMeta.hex,
                    borderColor: opt === '?' ? undefined : optMeta.borderHex,
                  }}
                  className={`min-h-[38px] rounded-md border text-[11px] font-mono font-bold flex items-center justify-center transition-transform active:scale-95 ${
                    opt === '?'
                      ? 'unscanned-hatch border-slate-300 dark:border-slate-600'
                      : 'sticker-tile-sheen'
                  } ${
                    selected
                      ? 'ring-2 ring-blue-600 dark:ring-blue-400 ring-offset-1 dark:ring-offset-slate-800'
                      : ''
                  }`}
                >
                  <span
                    style={opt === '?' ? undefined : { color: optMeta.textOnHex }}
                    className={opt === '?' ? 'text-slate-600 dark:text-slate-300' : undefined}
                  >
                    {optShort}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Cross Net Grid */}
      <div className="overflow-x-auto pb-1">
        <div
          className="grid gap-2 sm:gap-3 mx-auto w-fit"
          style={{
            gridTemplateColumns:
              cubeSize === 2
                ? 'repeat(4, minmax(68px, 114px))'
                : 'repeat(4, minmax(72px, 128px))',
            gridTemplateRows: 'repeat(3, auto)',
          }}
        >
          {NET_POSITIONS.map(({ face, col, row }) => {
            const centerColor = cubeSize === 3 ? faces[face][4] : '?';
            const centerMeta = getColorMeta(palette, centerColor);
            return (
              <div
                key={face}
                style={{ gridColumnStart: col, gridRowStart: row }}
                className="flex flex-col gap-1"
              >
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[11px] sm:text-xs font-semibold text-slate-800 dark:text-slate-100 font-mono truncate">
                    {face}{' '}
                    <span className="hidden sm:inline font-sans font-normal text-slate-500 dark:text-slate-400">
                      {cubeSize === 2 || centerColor === '?'
                        ? translateFaceShortName(face, lang)
                        : translateColorName(centerMeta.name, lang)}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={isSolvePreviewLocked}
                    onClick={() => onRotateFaceClockwise(face)}
                    title={isSolvePreviewLocked ? t.rotateDisabledTitle : t.rotateTitle(face)}
                    aria-label={t.rotateAria(face)}
                    className="p-1 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors shrink-0"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div
                  className={`grid ${
                    cubeSize === 2 ? 'grid-cols-2 gap-1.5 p-1.5' : 'grid-cols-3 gap-1 p-1.5'
                  } bg-slate-900 dark:bg-[#090E1A] rounded-lg border transition-colors shadow-xs ${
                    activeMoveFace === face
                      ? 'border-blue-500 ring-2 ring-blue-500/40'
                      : 'border-slate-800 dark:border-slate-700/80'
                  }`}
                >
                  {faces[face].map((color, idx) => {
                    const key = stickerKey(face, idx);
                    const meta = getColorMeta(palette, color);
                    const displayName = translateColorName(meta.name, lang);
                    const conf = confidences[face][idx];
                    const isConflict = conflictSet.has(key);
                    const isFocused = focusedSet.has(key);
                    const isPartner = partnerSet.has(key);
                    const isEditing =
                      !isSolvePreviewLocked &&
                      editingSticker?.face === face &&
                      editingSticker?.index === idx;
                    const isUncertain = conf === 'low' || conf === 'medium';

                    return (
                      <div key={idx} className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            if (isSolvePreviewLocked) return;
                            setEditingSticker(isEditing ? null : { face, index: idx });
                          }}
                          onMouseEnter={() => setHoveredSticker({ face, index: idx })}
                          onMouseLeave={() => setHoveredSticker(null)}
                          aria-label={t.stickerAria(face, idx, displayName, isConflict)}
                          style={{
                            backgroundColor: color === '?' ? undefined : meta.hex,
                            borderColor: isConflict
                              ? '#E11D48'
                              : isFocused
                              ? '#2563EB'
                              : color === '?'
                              ? undefined
                              : meta.borderHex,
                          }}
                          className={`relative w-full aspect-square rounded-[5px] border flex items-center justify-center transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            color === '?'
                              ? 'unscanned-hatch border-slate-300 dark:border-slate-600'
                              : 'sticker-tile-sheen'
                          } ${isPartner ? 'ring-2 ring-cyan-400 scale-[0.94]' : ''} ${
                            isFocused ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-slate-900' : ''
                          } ${isConflict ? 'ring-2 ring-rose-500' : ''} ${
                            isEditing ? 'ring-2 ring-white scale-95' : 'hover:scale-[0.96]'
                          }`}
                        >
                          {showIndices ? (
                            <span
                              style={color === '?' ? undefined : { color: meta.textOnHex }}
                              className={`font-mono tabular-nums text-[10px] font-semibold ${
                                color === '?' ? 'text-slate-600 dark:text-slate-300' : ''
                              }`}
                            >
                              {face}
                              {idx}
                            </span>
                          ) : cubeSize === 3 && idx === 4 ? (
                            <span
                              style={color === '?' ? undefined : { color: meta.textOnHex }}
                              className={`font-mono text-xs font-bold opacity-85 ${
                                color === '?' ? 'text-slate-600 dark:text-slate-300' : ''
                              }`}
                            >
                              {face}
                            </span>
                          ) : color === '?' ? (
                            <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">
                              ?
                            </span>
                          ) : null}

                          {isUncertain && color !== '?' && !isConflict && (
                            <span
                              title={t.aiConfidenceTitle(translateConfidence(conf, lang))}
                              className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 border border-white"
                            />
                          )}

                          {isConflict && (
                            <span
                              title={t.conflictTitle}
                              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center leading-none border border-white"
                            >
                              !
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detected Palette Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
        <span>{t.detectedPalette}</span>
        {KNOWN_COLORS.map((c) => {
          const meta = getColorMeta(palette, c);
          return (
            <span key={c} className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
              <span
                className="w-3 h-3 rounded-[2px] border inline-block"
                style={{
                  backgroundColor: meta.hex,
                  borderColor: meta.borderHex,
                }}
              />
              {translateColorName(meta.name, lang)}
            </span>
          );
        })}
        <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
          {t.uncertainRead}
        </span>
        <span className="inline-flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
          <span className="w-3.5 h-3.5 rounded-full bg-rose-600 text-white text-[9px] font-bold inline-flex items-center justify-center">
            !
          </span>
          {t.validationConflict}
        </span>
      </div>
    </section>
  );
}
