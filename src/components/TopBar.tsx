import { Maximize2, Menu, Minimize2, Moon, Sun } from 'lucide-react';
import type { CubeSize } from '../shared/cubeTypes.ts';
import { UI_TEXT, type Language } from '../lib/i18n.ts';
import type { ThemeMode } from '../lib/theme.ts';
import type { MenuTab } from './WorkspaceMenuDrawer.tsx';

interface TopBarProps {
  lang: Language;
  theme: ThemeMode;
  isFullscreen: boolean;
  cubeSize: CubeSize;
  issueCount: number;
  knownStickerCount: number;
  totalStickerCount: number;
  hasPlayableSolution: boolean;
  isAnimating: boolean;
  isAnalyzing: boolean;
  onChangeCubeSize: (size: CubeSize) => void;
  onOpenMenu: (tab: MenuTab) => void;
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onToggleFullscreen: () => void;
}

export function TopBar({
  lang,
  theme,
  isFullscreen,
  cubeSize,
  issueCount,
  knownStickerCount,
  totalStickerCount,
  hasPlayableSolution,
  isAnimating,
  isAnalyzing,
  onChangeCubeSize,
  onOpenMenu,
  onToggleLang,
  onToggleTheme,
  onToggleFullscreen,
}: TopBarProps) {
  const t = UI_TEXT[lang].topBar;
  const defaultTab: MenuTab =
    issueCount > 0 ? 'verification' : hasPlayableSolution ? 'timeline' : 'layout';
  const sizeDisabled = isAnimating || isAnalyzing;
  const themeLabel = theme === 'dark' ? t.switchToLight : t.switchToDark;
  const fullscreenLabel = isFullscreen ? t.exitFullscreen : t.enterFullscreen;

  return (
    <header className="sticky top-0 z-30 bg-white/88 dark:bg-slate-950/88 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/90 transition-colors">
      <div className="max-w-7xl mx-auto px-2 min-[375px]:px-2.5 sm:px-6 h-13 sm:h-14 [@media(max-height:500px)]:h-11 flex items-center justify-between gap-1 min-[375px]:gap-1.5 sm:gap-5">
        <div className="flex items-center gap-1.5 min-[375px]:gap-2 sm:gap-3.5 shrink-0 min-w-0">
          <a
            href="#scanner"
            aria-label="CubeNet Lab"
            className="inline-flex items-center gap-1.5 sm:gap-2 text-sm sm:text-[17px] font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
          >
            <svg
              viewBox="0 0 20 20"
              className="w-5 h-5 shrink-0"
              aria-hidden="true"
            >
              <rect x="1.5" y="1.5" width="7.5" height="7.5" rx="1.8" fill="#2563EB" />
              <rect
                x="11"
                y="1.5"
                width="7.5"
                height="7.5"
                rx="1.8"
                className="fill-slate-900 dark:fill-slate-200"
              />
              <rect
                x="1.5"
                y="11"
                width="7.5"
                height="7.5"
                rx="1.8"
                className="fill-slate-900 dark:fill-slate-200"
              />
              <rect x="11" y="11" width="7.5" height="7.5" rx="1.8" fill="#10B981" />
            </svg>
            <span className="hidden min-[440px]:inline">
              CubeNet<span className="hidden sm:inline"> Lab</span>
            </span>
          </a>

          <div
            role="group"
            aria-label={t.cubeSizeLabel}
            className="grid grid-cols-2 p-0.5 bg-slate-100/90 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-lg shrink-0"
          >
            {([3, 2] as const).map((sz) => (
              <button
                key={sz}
                type="button"
                disabled={sizeDisabled}
                onClick={() => onChangeCubeSize(sz)}
                aria-pressed={cubeSize === sz}
                className={`min-h-[30px] [@media(max-height:500px)]:min-h-[26px] px-1.5 min-[375px]:px-2 sm:px-3 py-1 [@media(max-height:500px)]:py-0.5 font-mono tabular-nums text-[11px] sm:text-xs font-semibold rounded-md transition-all whitespace-nowrap shrink-0 disabled:opacity-50 ${
                  cubeSize === sz
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs ring-1 ring-slate-900/5 dark:ring-white/10'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {sz === 3 ? t.size3x3 : t.size2x2}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-pressed={isFullscreen}
            aria-label={fullscreenLabel}
            title={fullscreenLabel}
            className={`inline-flex lg:hidden [@media(max-height:500px)]:inline-flex items-center justify-center shrink-0 min-w-[34px] min-[375px]:min-w-[36px] min-h-[36px] sm:min-h-[38px] [@media(max-height:500px)]:min-h-[32px] [@media(max-height:500px)]:min-w-[32px] px-1.5 min-[375px]:px-2 py-1.5 text-xs font-semibold rounded-lg transition-colors border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              isFullscreen
                ? 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60'
                : 'text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={themeLabel}
            title={themeLabel}
            className="min-w-[34px] min-[375px]:min-w-[36px] min-h-[36px] sm:min-h-[38px] [@media(max-height:500px)]:min-h-[32px] [@media(max-height:500px)]:min-w-[32px] px-1.5 min-[375px]:px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 rounded-lg transition-colors inline-flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onToggleLang}
            aria-label={t.switchLangLabel}
            className="min-h-[36px] sm:min-h-[38px] [@media(max-height:500px)]:min-h-[32px] px-1.5 min-[375px]:px-2 sm:px-2.5 py-1.5 text-xs font-mono font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {lang === 'en' ? 'RU' : 'EN'}
          </button>

          <button
            type="button"
            onClick={() => onOpenMenu(defaultTab)}
            aria-label={t.menuAria(knownStickerCount, totalStickerCount)}
            className="min-h-[36px] sm:min-h-[38px] [@media(max-height:500px)]:min-h-[32px] px-2 min-[375px]:px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 shadow-xs transition-colors rounded-lg inline-flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Menu className="w-4 h-4 shrink-0" />
            <span>{t.menu}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
