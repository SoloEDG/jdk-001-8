import {
  DEFAULT_REFERENCE_OPACITY,
  MAX_REFERENCE_IMAGE_DIMENSION,
  MAX_REFERENCE_SOURCE_BYTES,
  MAX_REFERENCE_STORED_BYTES,
} from './constants'
import type { ReferenceImageMeta, ReferenceSettings } from './types'

export interface ProcessedReferenceImage {
  dataUrl: string
  meta: ReferenceImageMeta
}

export function defaultReferenceSettings(): ReferenceSettings {
  return {
    image: null,
    visible: true,
    opacity: DEFAULT_REFERENCE_OPACITY,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeImageMeta(value: unknown): ReferenceImageMeta | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const width = finiteNumber(raw.width, 0)
  const height = finiteNumber(raw.height, 0)
  if (width <= 0 || height <= 0) return null
  if (typeof raw.name !== 'string') return null

  return {
    name: raw.name,
    width,
    height,
    mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : 'image/png',
    byteSize: Math.max(0, finiteNumber(raw.byteSize, 0)),
    compressed: raw.compressed === true,
    savedAt: finiteNumber(raw.savedAt, 0),
  }
}

/** Fills in defaults for projects saved before reference images existed. */
export function normalizeReferenceSettings(value: unknown): ReferenceSettings {
  const defaults = defaultReferenceSettings()
  if (!value || typeof value !== 'object') return defaults
  const raw = value as Record<string, unknown>

  return {
    image: normalizeImageMeta(raw.image),
    visible: typeof raw.visible === 'boolean' ? raw.visible : defaults.visible,
    opacity: clamp(finiteNumber(raw.opacity, defaults.opacity), 0, 1),
    scale: clamp(finiteNumber(raw.scale, defaults.scale), 0.05, 4),
    offsetX: clamp(finiteNumber(raw.offsetX, defaults.offsetX), -2, 2),
    offsetY: clamp(finiteNumber(raw.offsetY, defaults.offsetY), -2, 2),
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('无法读取图片数据。'))
    }
    reader.onerror = () => reject(new Error('无法读取图片文件。'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片格式无法识别或文件已损坏。'))
    image.src = src
  })
}

function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return 0
  const base64Length = dataUrl.length - comma - 1
  return Math.ceil((base64Length * 3) / 4)
}

function mimeTypeOf(dataUrl: string): string {
  const match = /^data:([^;,]+)/.exec(dataUrl)
  return match?.[1] ?? 'image/png'
}

function encodeCanvas(canvas: HTMLCanvasElement, quality: number): string {
  const webp = canvas.toDataURL('image/webp', quality)
  if (webp.startsWith('data:image/webp')) return webp
  const jpeg = canvas.toDataURL('image/jpeg', quality)
  if (jpeg.startsWith('data:image/jpeg')) return jpeg
  return canvas.toDataURL('image/png')
}

function drawScaled(
  image: HTMLImageElement,
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
): { canvas: HTMLCanvasElement; width: number; height: number } {
  const ratio = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * ratio))
  const height = Math.max(1, Math.round(sourceHeight * ratio))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器无法创建图片画布。')
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(image, 0, 0, width, height)
  return { canvas, width, height }
}

function encodeWithinBudget(
  image: HTMLImageElement,
  sourceWidth: number,
  sourceHeight: number,
): { dataUrl: string; width: number; height: number } {
  let maxDimension = MAX_REFERENCE_IMAGE_DIMENSION
  let scaled = drawScaled(image, sourceWidth, sourceHeight, maxDimension)
  let dataUrl = encodeCanvas(scaled.canvas, 0.85)

  for (const quality of [0.7, 0.55, 0.4]) {
    if (estimateDataUrlBytes(dataUrl) <= MAX_REFERENCE_STORED_BYTES) break
    dataUrl = encodeCanvas(scaled.canvas, quality)
  }

  while (
    estimateDataUrlBytes(dataUrl) > MAX_REFERENCE_STORED_BYTES &&
    maxDimension > 512
  ) {
    maxDimension = Math.round(maxDimension * 0.75)
    scaled = drawScaled(image, sourceWidth, sourceHeight, maxDimension)
    dataUrl = encodeCanvas(scaled.canvas, 0.55)
  }

  return { dataUrl, width: scaled.width, height: scaled.height }
}

/**
 * Reads a user-selected image and re-encodes it when it is too large to keep
 * comfortably. The resulting data URL is meant for IndexedDB, not localStorage.
 */
export async function processReferenceImageFile(file: File): Promise<ProcessedReferenceImage> {
  const hasImageType = file.type.startsWith('image/')
  const hasImageExtension = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name)
  if (!hasImageType && !(file.type === '' && hasImageExtension)) {
    throw new Error('请选择图片文件。')
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      throw new Error('无法读取图片尺寸。')
    }

    const needsCompression =
      file.size > MAX_REFERENCE_SOURCE_BYTES ||
      Math.max(sourceWidth, sourceHeight) > MAX_REFERENCE_IMAGE_DIMENSION

    if (!needsCompression) {
      const originalDataUrl = await readFileAsDataUrl(file)
      return {
        dataUrl: originalDataUrl,
        meta: {
          name: file.name,
          width: sourceWidth,
          height: sourceHeight,
          mimeType: file.type || 'image/png',
          byteSize: file.size,
          compressed: false,
          savedAt: Date.now(),
        },
      }
    }

    const encoded = encodeWithinBudget(image, sourceWidth, sourceHeight)
    return {
      dataUrl: encoded.dataUrl,
      meta: {
        name: file.name,
        width: encoded.width,
        height: encoded.height,
        mimeType: mimeTypeOf(encoded.dataUrl),
        byteSize: estimateDataUrlBytes(encoded.dataUrl),
        compressed: true,
        savedAt: Date.now(),
      },
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
