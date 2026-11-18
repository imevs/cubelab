import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AiSpeedMode,
  AmbiguousStickerNote,
  ColorSchemeMode,
  CubeColor,
  CubeConfidenceMap,
  CubeFaces,
  CubePalette,
  CubeSize,
  FaceConfidenceGrid,
  FaceGrid,
  FaceId,
  KnownColorId,
  PhotoAnalysisSummary,
  RecognitionTimingBreakdown,
  StickerConfidence,
} from './src/shared/cubeTypes.ts';
import {
  DEFAULT_PALETTE,
  FACE_ORDER,
  KNOWN_COLORS,
  buildColorMeta,
  createEmptyConfidences,
  createEmptyFaces,
} from './src/shared/cubeTypes.ts';
import { verifyCubeState } from './src/shared/cubeVerifier.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_ACCURATE = 'gemini-4-hydrogen';
const MODEL_FAST = 'gemini-3.1-flash-lite';

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface ImageInput {
  dataUrl: string;
  label?: string;
}

interface GeminiPaletteItem {
  name: string;
  hex: string;
}

interface GeminiRawResponse {
  palette: GeminiPaletteItem[];
  photoAnalyses?: Array<{
    photoIndex: number;
    visibleFaces: string[];
    orientationNote: string;
  }>;
  reasoningSummary: string;
  faces: Record<FaceId, string[]>;
  confidences?: Record<FaceId, string[]>;
  ambiguousStickers: Array<{
    face: string;
    index: number;
    chosenColor: string;
    alternativeColor: string;
    reason: string;
  }>;
}

function buildFacesSchema(cubeSize: CubeSize) {
  const count = cubeSize * cubeSize;
  return {
    type: Type.OBJECT,
    description: `Canonical 2D unfolded cross net. Each face U, R, F, D, L, B has exactly ${count} color names matching the names in "palette", or "?" if that face/sticker is not visible in any photo.`,
    properties: {
      U: { type: Type.ARRAY, items: { type: Type.STRING } },
      R: { type: Type.ARRAY, items: { type: Type.STRING } },
      F: { type: Type.ARRAY, items: { type: Type.STRING } },
      D: { type: Type.ARRAY, items: { type: Type.STRING } },
      L: { type: Type.ARRAY, items: { type: Type.STRING } },
      B: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ['U', 'R', 'F', 'D', 'L', 'B'],
  };
}

const PALETTE_SCHEMA = {
  type: Type.ARRAY,
  description:
    'List the exact 6 distinct sticker colors on this cube (e.g. White, Yellow, Green, Blue, Red, Orange, or custom colors). Use a consistent short name and accurate hex (#RRGGBB) for each.',
  items: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      hex: { type: Type.STRING },
    },
    required: ['name', 'hex'],
  },
};

const AMBIGUOUS_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      face: { type: Type.STRING },
      index: { type: Type.INTEGER },
      chosenColor: { type: Type.STRING },
      alternativeColor: { type: Type.STRING },
      reason: { type: Type.STRING },
    },
    required: ['face', 'index', 'chosenColor', 'alternativeColor', 'reason'],
  },
};

function buildCubeResponseSchema(cubeSize: CubeSize) {
  return {
    type: Type.OBJECT,
    properties: {
      palette: PALETTE_SCHEMA,
      photoAnalyses: {
        type: Type.ARRAY,
        description: 'Brief visible faces and 3-6 word orientation note per photo.',
        items: {
          type: Type.OBJECT,
          properties: {
            photoIndex: { type: Type.INTEGER },
            visibleFaces: { type: Type.ARRAY, items: { type: Type.STRING } },
            orientationNote: { type: Type.STRING },
          },
          required: ['photoIndex', 'visibleFaces', 'orientationNote'],
        },
      },
      reasoningSummary: {
        type: Type.STRING,
        description: 'One short sentence (<15 words) summarizing cube colors & stitching.',
      },
      faces: buildFacesSchema(cubeSize),
      ambiguousStickers: AMBIGUOUS_SCHEMA,
    },
    required: ['palette', 'photoAnalyses', 'reasoningSummary', 'faces', 'ambiguousStickers'],
  };
}

function buildPass2ResponseSchema(cubeSize: CubeSize) {
  return {
    type: Type.OBJECT,
    properties: {
      palette: PALETTE_SCHEMA,
      reasoningSummary: {
        type: Type.STRING,
        description: 'Short (<12 words) summary of corrected tiles/faces.',
      },
      faces: buildFacesSchema(cubeSize),
      ambiguousStickers: AMBIGUOUS_SCHEMA,
    },
    required: ['palette', 'reasoningSummary', 'faces', 'ambiguousStickers'],
  };
}

const SYSTEM_INSTRUCTION_3X3 = `You are a precision 3x3x3 Rubik's Cube computer-vision specialist.
Map every visible sticker onto the canonical 2D unfolded cross net:
        [ U ]
[ L ]   [ F ]   [ R ]   [ B ]
        [ D ]
Indices 0..8 row-major per face (0 1 2 / 3 4 5 / 6 7 8, center = 4).

RULES:
1. COLORS: Identify the actual 6 sticker color names directly (e.g. White, Yellow, Green, Blue, Red, Orange, Black, Pink, etc.) consistently across "palette", "faces", and "ambiguousStickers". Read each tile's true pigment under lighting (ignore glare/dark seams; compare White vs Yellow, Red vs Orange vs Pink, Blue vs Green). Never copy a center color onto surrounding scrambled tiles.
2. ISOMETRIC VERTEX (U/F/R photo meeting at 3-way corner V):
   - V = (U[8], F[2], R[0]).
   - Top diamond U: U0=far-top corner, U2=outer-right (touches R2), U6=outer-left (touches F0), U8=bottom corner V.
   - F rows run left->right towards V; R rows run left->right away from V.
3. MULTI-PHOTO ROTATION & SEAMS: Anchor U/F/R from Photo 1. Match Photo 2+ centers to D/L/B and rotate each face (0/90/180/270 deg) into canonical net orientation so seams match:
   U[6,7,8]<->F[0,1,2], U[0,3,6]<->L[0,1,2], U[8,5,2]<->R[0,1,2], U[2,1,0]<->B[0,1,2], F[2,5,8]<->R[0,3,6], F[0,3,6]<->L[2,5,8], F[6,7,8]<->D[0,1,2].
4. Output "?" for unseen stickers. Keep text notes ultra-concise.`;

const SYSTEM_INSTRUCTION_2X2 = `You are a precision 2x2x2 Pocket Cube computer-vision specialist.
Map every visible sticker onto the canonical 2D unfolded cross net:
        [ U ]
[ L ]   [ F ]   [ R ]   [ B ]
        [ D ]
Indices 0..3 row-major per face (top-left=0, top-right=1, bottom-left=2, bottom-right=3; 4 tiles per face, NO centers).

RULES:
1. COLORS: Identify the 6 distinct sticker color names directly across "palette", "faces", and "ambiguousStickers". Ignore glare/dark seams; distinguish White vs Yellow, Red vs Orange, Blue vs Green.
2. ISOMETRIC VERTEX (U/F/R photo meeting at 3-way corner V):
   - V = (U[3], F[1], R[0]).
   - Top diamond U: U0=far-top, U1=outer-right (touches R1), U2=outer-left (touches F0), U3=bottom corner V.
   - F top row = [0,1], bottom = [2,3] towards V; R top row = [0,1], bottom = [2,3] away from V.
3. MULTI-PHOTO ROTATION & SEAMS: Anchor Photo 1 on U/F/R. Align Photo 2+ faces (D, B, L) into canonical 2D net orientation so corner seams match:
   U[2,3]<->F[0,1], U[0,2]<->L[0,1], U[3,1]<->R[0,1], U[1,0]<->B[0,1], F[1,3]<->R[0,2], F[0,2]<->L[1,3], F[2,3]<->D[0,1].
4. Output "?" for unseen stickers. Keep text notes ultra-concise.`;

const COMMON_COLOR_HEX: Record<string, string> = {
  white: '#FFFFFF',
  yellow: '#FACC15',
  green: '#16A34A',
  blue: '#2563EB',
  red: '#DC2626',
  orange: '#F97316',
  black: '#18181B',
  pink: '#EC4899',
  magenta: '#DB2777',
  purple: '#8B5CF6',
  violet: '#7C3AED',
  cyan: '#06B6D4',
  teal: '#14B8A6',
  turquoise: '#0D9488',
  lime: '#84CC16',
  gray: '#64748B',
  grey: '#64748B',
  silver: '#CBD5E1',
  gold: '#EAB308',
  brown: '#92400E',
};

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error('Invalid image format. Please upload valid PNG, JPEG, or WebP images.');
  }
  return { mimeType: match[1], data: match[2] };
}

function cleanColorName(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '?';
  const upper = trimmed.toUpperCase();
  if (upper === '?' || upper === 'UNKNOWN' || upper === 'UNSCANNED' || upper === 'NONE') {
    return '?';
  }
  if (upper === 'W') return 'White';
  if (upper === 'Y') return 'Yellow';
  if (upper === 'G') return 'Green';
  if (upper === 'B') return 'Blue';
  if (upper === 'R') return 'Red';
  if (upper === 'O') return 'Orange';
  return trimmed
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function inferHexForColor(name: string, providedHex?: string): string {
  if (providedHex && /^#[0-9a-fA-F]{6}$/.test(providedHex.trim())) {
    return providedHex.trim().toUpperCase();
  }
  const lower = name.toLowerCase();
  for (const [key, hex] of Object.entries(COMMON_COLOR_HEX)) {
    if (lower === key || lower.includes(key)) {
      return hex;
    }
  }
  return '#94A3B8';
}

function buildPaletteAndNameMap(
  raw: GeminiRawResponse,
  cubeSize: CubeSize
): {
  palette: CubePalette;
  nameToId: Map<string, KnownColorId>;
} {
  const palette: CubePalette = { ...DEFAULT_PALETTE };
  const nameToId = new Map<string, KnownColorId>();
  const hexByName = new Map<string, string>();

  if (Array.isArray(raw.palette)) {
    for (const item of raw.palette) {
      const cname = cleanColorName(item?.name);
      if (cname !== '?') {
        const key = cname.toLowerCase();
        if (!hexByName.has(key)) {
          hexByName.set(key, inferHexForColor(cname, item?.hex));
        }
      }
    }
  }

  // Ordered discovery: centers first (if 3x3), then palette entries, then any remaining observed sticker names
  const orderedNames: string[] = [];
  const seenKeys = new Set<string>();

  const registerName = (rawName: string | undefined) => {
    const cname = cleanColorName(rawName);
    if (cname === '?') return;
    const key = cname.toLowerCase();
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      orderedNames.push(cname);
    }
  };

  if (cubeSize === 3) {
    for (const face of FACE_ORDER) {
      registerName(raw.faces?.[face]?.[4]);
    }
  }
  if (Array.isArray(raw.palette)) {
    for (const item of raw.palette) {
      registerName(item?.name);
    }
  }
  for (const face of FACE_ORDER) {
    const arr = raw.faces?.[face];
    if (Array.isArray(arr)) {
      for (const cell of arr) {
        registerName(cell);
      }
    }
  }

  for (let i = 0; i < Math.min(6, orderedNames.length); i++) {
    const id = KNOWN_COLORS[i];
    const cname = orderedNames[i];
    const key = cname.toLowerCase();
    const hex = hexByName.get(key) ?? inferHexForColor(cname);
    palette[id] = buildColorMeta(id, cname, hex, DEFAULT_PALETTE[id].hex);
    nameToId.set(key, id);
  }

  // Fill any remaining slots (on partial scans) with unused default colors so all 6 slots stay unique
  const unusedDefaults = KNOWN_COLORS.map((id) => DEFAULT_PALETTE[id]).filter(
    (meta) => !seenKeys.has(meta.name.toLowerCase())
  );
  let fallbackIdx = 0;
  for (let i = orderedNames.length; i < 6; i++) {
    const id = KNOWN_COLORS[i];
    const fb = unusedDefaults[fallbackIdx++] ?? DEFAULT_PALETTE[id];
    palette[id] = buildColorMeta(id, fb.name, fb.hex, fb.hex);
  }

  return { palette, nameToId };
}

function resolveColorId(raw: string | undefined, nameToId: Map<string, KnownColorId>): CubeColor {
  const cname = cleanColorName(raw);
  if (cname === '?') return '?';
  const key = cname.toLowerCase();
  const exact = nameToId.get(key);
  if (exact) return exact;

  // Partial word fallback (e.g. "Dark Blue" matching "Blue" in palette)
  for (const [palKey, id] of nameToId.entries()) {
    if (key.includes(palKey) || palKey.includes(key)) {
      return id;
    }
  }
  return '?';
}

function normalizeConfidence(raw: string | undefined, color: CubeColor): StickerConfidence {
  if (color === '?') return 'unscanned';
  const val = (raw ?? '').trim().toLowerCase();
  if (val === 'high' || val === 'medium' || val === 'low') return val;
  return 'medium';
}

function normalizeGeminiResult(
  raw: GeminiRawResponse,
  cubeSize: CubeSize,
  fallbackPhotoAnalyses: PhotoAnalysisSummary[] = []
): {
  palette: CubePalette;
  faces: CubeFaces;
  confidences: CubeConfidenceMap;
  photoAnalyses: PhotoAnalysisSummary[];
  ambiguousStickers: AmbiguousStickerNote[];
  reasoningSummary: string;
} {
  const tileCount = cubeSize * cubeSize;
  const maxIndex = tileCount - 1;
  const { palette, nameToId } = buildPaletteAndNameMap(raw, cubeSize);
  const faces = createEmptyFaces(cubeSize);
  const confidences = createEmptyConfidences(cubeSize);

  const ambiguousSet = new Set<string>(
    (raw.ambiguousStickers ?? [])
      .filter((a) => FACE_ORDER.includes(a.face as FaceId) && a.index >= 0 && a.index <= maxIndex)
      .map((a) => `${a.face}:${a.index}`)
  );

  for (const face of FACE_ORDER) {
    const rawFace = Array.isArray(raw.faces?.[face]) ? raw.faces[face] : [];
    const rawConf = Array.isArray(raw.confidences?.[face]) ? raw.confidences[face] : [];
    const grid: CubeColor[] = [];
    const confGrid: StickerConfidence[] = [];
    for (let i = 0; i < tileCount; i++) {
      const c = resolveColorId(rawFace[i], nameToId);
      grid.push(c);
      if (c === '?') {
        confGrid.push('unscanned');
      } else if (rawConf.length > 0) {
        confGrid.push(normalizeConfidence(rawConf[i], c));
      } else if (ambiguousSet.has(`${face}:${i}`)) {
        confGrid.push('low');
      } else {
        confGrid.push('high');
      }
    }
    faces[face] = grid as FaceGrid;
    confidences[face] = confGrid as FaceConfidenceGrid;
  }

  const photoAnalyses: PhotoAnalysisSummary[] =
    Array.isArray(raw.photoAnalyses) && raw.photoAnalyses.length > 0
      ? raw.photoAnalyses.map((p, idx) => ({
          photoIndex: typeof p.photoIndex === 'number' ? p.photoIndex : idx + 1,
          visibleFaces: (p.visibleFaces ?? []).filter((f): f is FaceId =>
            FACE_ORDER.includes(f as FaceId)
          ),
          orientationNote: p.orientationNote ?? '',
        }))
      : fallbackPhotoAnalyses;

  const ambiguousStickers: AmbiguousStickerNote[] = (raw.ambiguousStickers ?? [])
    .filter((a) => FACE_ORDER.includes(a.face as FaceId) && a.index >= 0 && a.index <= maxIndex)
    .map((a) => ({
      face: a.face as FaceId,
      index: a.index,
      chosenColor: resolveColorId(a.chosenColor, nameToId),
      alternativeColor: resolveColorId(a.alternativeColor, nameToId),
      reason: a.reason ?? '',
    }));

  return {
    palette,
    faces,
    confidences,
    photoAnalyses,
    ambiguousStickers,
    reasoningSummary: raw.reasoningSummary ?? '',
  };
}

function rotateGridN<T>(g: readonly T[], turnsCW: number): T[] {
  let curr = [...g];
  const count = ((turnsCW % 4) + 4) % 4;
  if (curr.length === 4) {
    for (let t = 0; t < count; t++) {
      curr = [curr[2], curr[0], curr[3], curr[1]];
    }
    return curr;
  }
  for (let t = 0; t < count; t++) {
    curr = [
      curr[6], curr[3], curr[0],
      curr[7], curr[4], curr[1],
      curr[8], curr[5], curr[2],
    ];
  }
  return curr;
}

/**
 * Deterministic <2ms fixer: if Pass 1 stitched one or more faces rotated 90/180/270 deg off
 * (very common when combining opposite-angle photos), rotate faces locally to restore exact solvability
 * and avoid an unnecessary Pass 2 AI round-trip.
 */
function tryAutoFixFaceRotations(
  faces: CubeFaces,
  confidences: CubeConfidenceMap,
  colorSchemeMode: ColorSchemeMode,
  palette: CubePalette,
  lang: 'en' | 'ru'
): { faces: CubeFaces; confidences: CubeConfidenceMap; fixed: boolean } {
  const applyTriple = (
    fA: FaceId, tA: number,
    fB: FaceId, tB: number,
    fC: FaceId, tC: number
  ): CubeFaces => ({
    ...faces,
    [fA]: rotateGridN(faces[fA], tA) as FaceGrid,
    [fB]: rotateGridN(faces[fB], tB) as FaceGrid,
    [fC]: rotateGridN(faces[fC], tC) as FaceGrid,
  });

  // 1. Single-face rotation check across all 6 faces
  for (const face of FACE_ORDER) {
    for (let t = 1; t <= 3; t++) {
      const candidate: CubeFaces = {
        ...faces,
        [face]: rotateGridN(faces[face], t) as FaceGrid,
      };
      if (verifyCubeState(candidate, colorSchemeMode, palette, lang).isSolvable) {
        return {
          faces: candidate,
          confidences: {
            ...confidences,
            [face]: rotateGridN(confidences[face], t) as FaceConfidenceGrid,
          },
          fixed: true,
        };
      }
    }
  }

  // 2. Opposite-corner group rotation (D, B, L relative to U, F, R, and vice versa)
  const triples: Array<[FaceId, FaceId, FaceId]> = [
    ['D', 'B', 'L'],
    ['U', 'F', 'R'],
  ];
  for (const [fA, fB, fC] of triples) {
    for (let tA = 0; tA < 4; tA++) {
      for (let tB = 0; tB < 4; tB++) {
        for (let tC = 0; tC < 4; tC++) {
          if (tA === 0 && tB === 0 && tC === 0) continue;
          const candidate = applyTriple(fA, tA, fB, tB, fC, tC);
          if (verifyCubeState(candidate, colorSchemeMode, palette, lang).isSolvable) {
            return {
              faces: candidate,
              confidences: {
                ...confidences,
                [fA]: rotateGridN(confidences[fA], tA) as FaceConfidenceGrid,
                [fB]: rotateGridN(confidences[fB], tB) as FaceConfidenceGrid,
                [fC]: rotateGridN(confidences[fC], tC) as FaceConfidenceGrid,
              },
              fixed: true,
            };
          }
        }
      }
    }
  }

  return { faces, confidences, fixed: false };
}

function facesToNamedJson(faces: CubeFaces, palette: CubePalette): Record<FaceId, string[]> {
  const out = {} as Record<FaceId, string[]>;
  for (const face of FACE_ORDER) {
    out[face] = faces[face].map((c) => (c === '?' ? '?' : palette[c]?.name ?? c));
  }
  return out;
}

async function generateWithRetry(
  ai: GoogleGenAI,
  parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }>,
  options: {
    model: string;
    thinkingLevel: ThinkingLevel;
    systemInstruction: string;
    responseSchema: unknown;
  },
  retries = 2
): Promise<{ data: GeminiRawResponse; durationMs: number; retries: number }> {
  const callStart = Date.now();
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: options.model,
        contents: { parts },
        config: {
          systemInstruction: options.systemInstruction,
          thinkingConfig: { thinkingLevel: options.thinkingLevel },
          responseMimeType: 'application/json',
          responseSchema: options.responseSchema,
        },
      });

      const text = (response.text ?? '').trim();
      if (!text) {
        throw new Error('Model returned an empty response.');
      }
      return {
        data: JSON.parse(text) as GeminiRawResponse,
        durationMs: Date.now() - callStart,
        retries: attempt,
      };
    } catch (err: unknown) {
      lastError = err;
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? Number((err as { status?: number }).status)
          : undefined;
      const isTransient = status === 500 || status === 503 || status === 429;
      if (attempt < retries && isTransient) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

function buildErrorStatusAndMessage(
  err: unknown,
  modelName = MODEL_ACCURATE
): { status: number; message: string } {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status?: number }).status)
      : 500;

  if (status === 403 || rawMessage.includes('PERMISSION_DENIED') || rawMessage.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message:
        'Gemini API authorization failed. Please verify the API key configured in Settings > Secrets.',
    };
  }
  if (status === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message:
        'Gemini API rate limit or quota reached. Please wait a moment and try again.',
    };
  }
  if (status === 404 || rawMessage.includes('NOT_FOUND')) {
    return {
      status: 404,
      message: `Requested AI model (${modelName}) was not found or is unavailable.`,
    };
  }
  return {
    status: Number.isFinite(status) && status >= 400 && status < 600 ? status : 500,
    message: rawMessage || 'Failed to analyze Rubik\'s Cube photo(s).',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/analyze-cube', async (req, res) => {
    const wantsStream = req.query.stream === '1';
    let streamStarted = false;

    const sendProgress = (percent: number, stageKey: string) => {
      if (!wantsStream || res.writableEnded) return;
      if (!streamStarted) {
        streamStarted = true;
        res.status(200);
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
      }
      res.write(`${JSON.stringify({ type: 'progress', percent, stageKey })}\n`);
    };

    const sendResult = (payload: unknown) => {
      if (!wantsStream) {
        res.json(payload);
        return;
      }
      if (!streamStarted) {
        streamStarted = true;
        res.status(200);
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      }
      if (!res.writableEnded) {
        res.write(`${JSON.stringify({ type: 'result', data: payload })}\n`);
        res.end();
      }
    };

    const sendError = (status: number, message: string) => {
      if (!wantsStream) {
        res.status(status).json({ error: message });
        return;
      }
      if (!streamStarted) {
        res.status(status).json({ error: message });
        return;
      }
      if (!res.writableEnded) {
        res.write(`${JSON.stringify({ type: 'error', status, error: message })}\n`);
        res.end();
      }
    };

    let selectedModel = MODEL_ACCURATE;
    try {
      const {
        images,
        cubeSize: rawCubeSize = 3,
        colorSchemeMode = 'auto',
        existingFaces,
        existingPalette,
        skipPass2 = false,
        aiSpeedMode = 'accurate',
        lang = 'en',
      } = req.body as {
        images?: ImageInput[];
        cubeSize?: CubeSize;
        colorSchemeMode?: ColorSchemeMode;
        existingFaces?: CubeFaces;
        existingPalette?: CubePalette;
        skipPass2?: boolean;
        aiSpeedMode?: AiSpeedMode;
        lang?: 'en' | 'ru';
      };

      const cubeSize: CubeSize = rawCubeSize === 2 ? 2 : 3;
      const systemInstruction = cubeSize === 2 ? SYSTEM_INSTRUCTION_2X2 : SYSTEM_INSTRUCTION_3X3;
      const responseSchema = buildCubeResponseSchema(cubeSize);
      const pass2Schema = buildPass2ResponseSchema(cubeSize);

      const useFastModel = aiSpeedMode === 'fast';
      selectedModel = useFastModel ? MODEL_FAST : MODEL_ACCURATE;
      const pass1Thinking = useFastModel ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW;
      const pass2Thinking = ThinkingLevel.LOW;

      if (!Array.isArray(images) || images.length === 0 || images.length > 6) {
        sendError(
          400,
          lang === 'ru'
            ? 'Загрузите от 1 до 6 фотографий кубика Рубика.'
            : 'Please provide between 1 and 6 photos of the Rubik\'s Cube.'
        );
        return;
      }

      const recognitionStartMs = Date.now();
      sendProgress(12, 'prepare');

      const ai = getGenAIClient();
      const imageParts = images.map((img) => {
        const parsed = parseDataUrl(img.dataUrl);
        return {
          inlineData: {
            mimeType: parsed.mimeType,
            data: parsed.data,
          },
        };
      });

      const schemeRule =
        colorSchemeMode === 'standard'
          ? 'Scheme: standard WCA opposite pairs allowed if cube uses standard colors.'
          : 'Scheme: non-standard colors/layouts allowed; read actual sticker pigments.';

      const langRule =
        lang === 'ru'
          ? 'Write reasoningSummary, orientationNote, and ambiguousStickers[].reason in Russian; keep palette names in English.'
          : '';

      const photoDesc = images
        .map((img, i) => `Photo ${i + 1}${img.label ? ` (${img.label})` : ''}`)
        .join(', ');

      if (existingFaces) {
        const activePalette = existingPalette ?? DEFAULT_PALETTE;
        const currentVerification = verifyCubeState(
          existingFaces,
          colorSchemeMode,
          activePalette
        );
        const conflictSummary =
          currentVerification.issues.length > 0
            ? currentVerification.issues
                .map((iss) => `- [${iss.code}] ${iss.message} (${iss.hint})`)
                .join('\n')
            : 'Re-check every individual sticker color against the photos.';

        const reverifyPrompt = `Re-examine (${photoDesc}) for a ${cubeSize}x${cubeSize} cube and fix tile colors in the 2D net.
${schemeRule} ${langRule}
Current 2D Net: ${JSON.stringify(facesToNamedJson(existingFaces, activePalette))}
Issues:
${conflictSummary}
Return corrected palette and faces.`;

        sendProgress(26, 'reverify');
        const reverifyRes = await generateWithRetry(ai, [...imageParts, { text: reverifyPrompt }], {
          model: selectedModel,
          thinkingLevel: pass2Thinking,
          systemInstruction,
          responseSchema,
        });
        sendProgress(88, 'verify');
        let normalized = normalizeGeminiResult(reverifyRes.data, cubeSize);
        let verification = verifyCubeState(
          normalized.faces,
          colorSchemeMode,
          normalized.palette,
          lang
        );
        let autoFixedRotation = false;
        if (verification.issues.length > 0) {
          const autoFixed = tryAutoFixFaceRotations(
            normalized.faces,
            normalized.confidences,
            colorSchemeMode,
            normalized.palette,
            lang
          );
          if (autoFixed.fixed) {
            autoFixedRotation = true;
            normalized = {
              ...normalized,
              faces: autoFixed.faces,
              confidences: autoFixed.confidences,
            };
            verification = verifyCubeState(
              normalized.faces,
              colorSchemeMode,
              normalized.palette,
              lang
            );
          }
        }

        const serverTotalMs = Date.now() - recognitionStartMs;
        const timingBreakdown: RecognitionTimingBreakdown = {
          mode: 'ai',
          aiSpeedMode,
          pass1Ms: reverifyRes.durationMs,
          pass2Ms: 0,
          retries: reverifyRes.retries,
          autoFixedRotation,
          pass2Skipped: false,
          serverTotalMs,
        };

        sendResult({
          ...normalized,
          verification,
          passCount: 1,
          selfCorrected: true,
          recognitionDurationMs: serverTotalMs,
          timingBreakdown,
        });
        return;
      }

      const pass1Prompt = `Read the ${images.length} ${cubeSize}x${cubeSize} cube photo(s): ${photoDesc}.
${schemeRule} ${langRule}
Output: 6-color palette (name+hex), brief photoAnalyses, canonical ${cubeSize}x${cubeSize} faces U/R/F/D/L/B ("?" if unseen), and any uncertain stickers.`;

      sendProgress(22, 'pass1');
      const pass1Res = await generateWithRetry(ai, [...imageParts, { text: pass1Prompt }], {
        model: selectedModel,
        thinkingLevel: pass1Thinking,
        systemInstruction,
        responseSchema,
      });
      sendProgress(72, 'verify');
      let finalResult = normalizeGeminiResult(pass1Res.data, cubeSize);
      let verification = verifyCubeState(
        finalResult.faces,
        colorSchemeMode,
        finalResult.palette,
        lang
      );
      let passCount = 1;
      let selfCorrected = false;
      let autoFixedRotation = false;
      let pass2Ms = 0;
      let pass2Retries = 0;
      let pass2Skipped = false;

      // Try <2ms deterministic face rotation alignment before issuing Pass 2
      if (verification.issues.length > 0) {
        const autoFixed = tryAutoFixFaceRotations(
          finalResult.faces,
          finalResult.confidences,
          colorSchemeMode,
          finalResult.palette,
          lang
        );
        if (autoFixed.fixed) {
          autoFixedRotation = true;
          finalResult = {
            ...finalResult,
            faces: autoFixed.faces,
            confidences: autoFixed.confidences,
          };
          verification = verifyCubeState(
            finalResult.faces,
            colorSchemeMode,
            finalResult.palette,
            lang
          );
          selfCorrected = true;
        }
      }

      if (verification.issues.length > 0 && skipPass2) {
        pass2Skipped = true;
      } else if (verification.issues.length > 0) {
        const namedCounts: Record<string, number> = {};
        for (const id of KNOWN_COLORS) {
          namedCounts[finalResult.palette[id].name] = verification.colorCounts[id];
        }

        const conflictList = verification.issues
          .map(
            (iss) =>
              `- [${iss.code}] ${iss.message} (${iss.affectedStickers
                .map((s) => `${s.face}${s.index}`)
                .join(', ')})`
          )
          .join('\n');

        const pass2Prompt = `FIX CONFLICTS (${cubeSize}x${cubeSize}, ${photoDesc}):
${schemeRule} ${langRule}
Previous Faces: ${JSON.stringify(facesToNamedJson(finalResult.faces, finalResult.palette))}
Counts: ${JSON.stringify(namedCounts)}
Conflicts:
${conflictList}
Re-check the flagged stickers & face rotations in the photos and output corrected palette + faces.`;

        sendProgress(76, 'pass2');
        const pass2Res = await generateWithRetry(ai, [...imageParts, { text: pass2Prompt }], {
          model: selectedModel,
          thinkingLevel: pass2Thinking,
          systemInstruction,
          responseSchema: pass2Schema,
        });
        pass2Ms = pass2Res.durationMs;
        pass2Retries = pass2Res.retries;
        sendProgress(92, 'verify');
        let pass2Normalized = normalizeGeminiResult(pass2Res.data, cubeSize, finalResult.photoAnalyses);
        let pass2Verification = verifyCubeState(
          pass2Normalized.faces,
          colorSchemeMode,
          pass2Normalized.palette,
          lang
        );

        if (pass2Verification.issues.length > 0) {
          const autoFixed2 = tryAutoFixFaceRotations(
            pass2Normalized.faces,
            pass2Normalized.confidences,
            colorSchemeMode,
            pass2Normalized.palette,
            lang
          );
          if (autoFixed2.fixed) {
            autoFixedRotation = true;
            pass2Normalized = {
              ...pass2Normalized,
              faces: autoFixed2.faces,
              confidences: autoFixed2.confidences,
            };
            pass2Verification = verifyCubeState(
              pass2Normalized.faces,
              colorSchemeMode,
              pass2Normalized.palette,
              lang
            );
          }
        }

        if (
          pass2Verification.issues.length <= verification.issues.length ||
          pass2Verification.isSolvable
        ) {
          finalResult = pass2Normalized;
          verification = pass2Verification;
          selfCorrected = true;
        }
        passCount = 2;
      }

      const serverTotalMs = Date.now() - recognitionStartMs;
      const timingBreakdown: RecognitionTimingBreakdown = {
        mode: 'ai',
        aiSpeedMode,
        pass1Ms: pass1Res.durationMs,
        pass2Ms,
        retries: pass1Res.retries + pass2Retries,
        autoFixedRotation,
        pass2Skipped,
        serverTotalMs,
      };

      sendResult({
        ...finalResult,
        verification,
        passCount,
        selfCorrected,
        recognitionDurationMs: serverTotalMs,
        timingBreakdown,
      });
    } catch (err: unknown) {
      const { status, message } = buildErrorStatusAndMessage(err, selectedModel);
      sendError(status, message);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*path}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CubeNet Lab server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
