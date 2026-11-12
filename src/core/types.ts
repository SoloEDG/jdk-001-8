export type CanvasSize = 16 | 32 | 64

export type Pixel = string | null

export type ToolType = 'brush' | 'eraser' | 'bucket' | 'eyedropper' | 'line'

export interface Layer {
  id: string
  name: string
  visible: boolean
  pixels: Pixel[]
}

export interface Frame {
  id: string
  name: string
  layers: Layer[]
}

export interface ReferenceImageMeta {
  name: string
  width: number
  height: number
  mimeType: string
  byteSize: number
  compressed: boolean
  savedAt: number
}

/**
 * A tracing reference that sits under the canvas. It is intentionally kept
 * outside of frames/layers so it never becomes part of the artwork.
 */
export interface ReferenceSettings {
  image: ReferenceImageMeta | null
  visible: boolean
  opacity: number
  /** 1 = image fitted (contained) inside the canvas. */
  scale: number
  /** Offset as a fraction of the canvas size, 0 = centered. */
  offsetX: number
  offsetY: number
}

export interface PixelProject {
  id: string
  name: string
  canvasSize: CanvasSize
  frames: Frame[]
  activeFrameIndex: number
  activeLayerIndex: number
  frameDelayMs: number
  recentColors: string[]
  customColors: string[]
  reference: ReferenceSettings
  updatedAt: number
}

export interface EditorPreferences {
  activeColor: string
  activeTool: ToolType
  activeProjectId: string | null
}
