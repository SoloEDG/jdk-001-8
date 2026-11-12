import type { CanvasSize } from './types'

export const CANVAS_SIZES: CanvasSize[] = [16, 32, 64]

export const MAX_LAYERS = 3
export const MAX_FRAMES = 8
export const MAX_RECENT_COLORS = 8

export const PRESET_COLORS: string[] = [
  '#000000',
  '#1d2b53',
  '#7e2553',
  '#008751',
  '#ab5236',
  '#5f574f',
  '#c2c3c7',
  '#fff1e8',
  '#ff004d',
  '#ffa300',
  '#ffec27',
  '#00e436',
  '#29adff',
  '#83769c',
  '#ff77a8',
  '#ffffff',
  '#3b5dc9',
  '#6b8c42',
  '#8b4513',
  '#2e222f',
  '#4a6741',
  '#9e2835',
  '#566c86',
  '#94b0c2',
]

export const STORAGE_KEYS = {
  projects: 'jdk-001-projects',
  preferences: 'jdk-001-preferences',
} as const

export const DEFAULT_FRAME_DELAY_MS = 200

export const EXPORT_PIXEL_SCALE = 16

export const DEFAULT_REFERENCE_OPACITY = 0.55

/** Files larger than this are always re-encoded before being stored. */
export const MAX_REFERENCE_SOURCE_BYTES = 900 * 1024

/** Maximum width/height of the stored copy, keeping memory usage predictable. */
export const MAX_REFERENCE_IMAGE_DIMENSION = 1600

/** Target upper bound for the compressed copy (IndexedDB, never localStorage). */
export const MAX_REFERENCE_STORED_BYTES = 2 * 1024 * 1024

export const REFERENCE_DB_NAME = 'jdk-001-reference-images'
export const REFERENCE_DB_VERSION = 1
export const REFERENCE_STORE_NAME = 'images'
