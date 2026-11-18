import type {
  CubeFaces,
  CubePalette,
  CubeSize,
  FaceGrid,
  FaceId,
  PhotoCanvasAlign,
} from '../shared/cubeTypes.ts';
import { DEFAULT_PALETTE, getColorMeta, inferCubeSizeFromFaces } from '../shared/cubeTypes.ts';

export interface UploadedPhoto {
  id: string;
  dataUrl: string;
  name: string;
  label: string;
  cubeSize?: CubeSize;
  scanMode?: 'ai' | 'canvas';
  targetFace?: FaceId;
  squareAlign?: PhotoCanvasAlign;
  canvasAlign?: PhotoCanvasAlign;
}

export async function normalizeImageFile(
  file: File,
  maxDimension = 768,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(`Unsupported image format in ${file.name}.`));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not initialize canvas context.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function downscaleDataUrl(
  dataUrl: string,
  maxDimension = 768,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(dataUrl);
    img.onload = () => {
      const rawW = img.naturalWidth || img.width;
      const rawH = img.naturalHeight || img.height;
      if (Math.max(rawW, rawH) <= maxDimension && dataUrl.startsWith('data:image/jpeg')) {
        resolve(dataUrl);
        return;
      }
      const scale = Math.min(1, maxDimension / Math.max(rawW, rawH));
      const width = Math.max(1, Math.round(rawW * scale));
      const height = Math.max(1, Math.round(rawH * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}

export function rotateFaceClockwise(face: FaceGrid): FaceGrid {
  if (face.length === 4) {
    return [face[2], face[0], face[3], face[1]];
  }
  return [
    face[6], face[3], face[0],
    face[7], face[4], face[1],
    face[8], face[5], face[2],
  ];
}

export function generateCubeNetSvg(faces: CubeFaces, palette: CubePalette = DEFAULT_PALETTE): string {
  const cubeSize = inferCubeSizeFromFaces(faces);
  const tile = cubeSize === 2 ? 46 : 34;
  const gap = 3;
  const faceGap = 10;
  const faceSize = tile * cubeSize + gap * (cubeSize - 1);
  const pad = 24;

  const positions: Record<FaceId, { gx: number; gy: number }> = {
    U: { gx: 1, gy: 0 },
    L: { gx: 0, gy: 1 },
    F: { gx: 1, gy: 1 },
    R: { gx: 2, gy: 1 },
    B: { gx: 3, gy: 1 },
    D: { gx: 1, gy: 2 },
  };

  const width = pad * 2 + faceSize * 4 + faceGap * 3;
  const height = pad * 2 + faceSize * 3 + faceGap * 2;
  const totalTiles = cubeSize * cubeSize;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#FFFFFF" />`,
  ];

  (Object.keys(positions) as FaceId[]).forEach((faceId) => {
    const { gx, gy } = positions[faceId];
    const originX = pad + gx * (faceSize + faceGap);
    const originY = pad + gy * (faceSize + faceGap);

    for (let i = 0; i < totalTiles; i++) {
      const col = i % cubeSize;
      const row = Math.floor(i / cubeSize);
      const x = originX + col * (tile + gap);
      const y = originY + row * (tile + gap);
      const color = faces[faceId][i] ?? '?';
      const meta = getColorMeta(palette, color);
      parts.push(
        `<rect x="${x}" y="${y}" width="${tile}" height="${tile}" rx="4" fill="${meta.hex}" stroke="${meta.borderHex}" stroke-width="1.5" />`
      );
      if (cubeSize === 3 && i === 4) {
        parts.push(
          `<text x="${x + tile / 2}" y="${y + tile / 2 + 4}" text-anchor="middle" font-family="monospace" font-size="12" font-weight="700" fill="${meta.textOnHex}">${faceId}</text>`
        );
      } else if (color === '?') {
        parts.push(
          `<text x="${x + tile / 2}" y="${y + tile / 2 + 4}" text-anchor="middle" font-family="monospace" font-size="12" font-weight="600" fill="#64748B">?</text>`
        );
      }
    }
  });

  parts.push('</svg>');
  return parts.join('\n');
}
