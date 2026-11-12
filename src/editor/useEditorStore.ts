import { computed, reactive, ref, watch } from 'vue'
import { CANVAS_SIZES } from '../core/constants'
import { exportAllFramesPng, exportFramePng } from '../core/exportPng'
import { addCustomColor, pushRecentColor } from '../core/paletteService'
import { compositeLayers } from '../core/pixelGrid'
import { createProject } from '../core/projectFactory'
import { defaultReferenceSettings, processReferenceImageFile } from '../core/referenceImage'
import {
  deleteReferenceImage,
  loadReferenceImage,
  saveReferenceImage,
} from '../core/referenceStorage'
import {
  ensureDefaultProject,
  loadPreferences,
  loadProjects,
  removeProject,
  savePreferences,
  saveProjects,
  upsertProject,
} from '../core/storage'
import type { CanvasSize, PixelProject, ReferenceSettings, ToolType } from '../core/types'
import { createAnimationPlayer } from './animationPlayer'
import {
  addFrameToProject,
  addLayerToActiveFrame,
  deleteFrameAt,
  deleteLayerAt,
  toggleLayerVisibility,
  withActiveLayer,
  withCanvasSize,
  withFrameLayers,
} from './projectCommands'
import { applyToolAt, cancelLineTool, type LinePending } from './toolController'

const projects = ref<PixelProject[]>(ensureDefaultProject(loadProjects()))
const prefs = reactive(loadPreferences())

const linePending = ref<LinePending | null>(null)
const isPlaying = ref(false)
const previewFrameIndex = ref<number | null>(null)

type ReferenceStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Image bytes live in IndexedDB; the project only keeps tiny metadata. */
const referenceDataUrl = ref<string | null>(null)
const referenceStatus = ref<ReferenceStatus>('idle')
const referenceError = ref<string | null>(null)
let referenceLoadToken = 0

/** Invalidates in-flight imports when a project's reference is removed/deleted. */
const referenceOperations = new Map<string, number>()

function beginReferenceOperation(projectId: string): number {
  const next = (referenceOperations.get(projectId) ?? 0) + 1
  referenceOperations.set(projectId, next)
  return next
}

function isCurrentReferenceOperation(projectId: string, operation: number): boolean {
  return referenceOperations.get(projectId) === operation
}

const player = createAnimationPlayer({ isPlaying, previewFrameIndex })

function persistProjects() {
  saveProjects(projects.value)
}

function persistPrefs() {
  savePreferences({ ...prefs })
}

const activeProject = computed(() => {
  const id = prefs.activeProjectId
  const found = projects.value.find((p) => p.id === id)
  return found ?? projects.value[0] ?? null
})

function syncActiveProjectId() {
  if (!activeProject.value && projects.value[0]) {
    prefs.activeProjectId = projects.value[0].id
    persistPrefs()
  } else if (activeProject.value && prefs.activeProjectId !== activeProject.value.id) {
    prefs.activeProjectId = activeProject.value.id
    persistPrefs()
  }
}

syncActiveProjectId()

function mutateProject(mutator: (p: PixelProject) => PixelProject) {
  const current = activeProject.value
  if (!current) return
  const updated = { ...mutator(current), updatedAt: Date.now() }
  projects.value = upsertProject(projects.value, updated)
  persistProjects()
}

const canvasSize = computed(() => activeProject.value?.canvasSize ?? 16)

const activeFrame = computed(() => {
  const p = activeProject.value
  if (!p) return null
  const idx = previewFrameIndex.value ?? p.activeFrameIndex
  return p.frames[idx] ?? null
})

const compositePixels = computed(() => {
  const frame = activeFrame.value
  if (!frame) return []
  return compositeLayers(frame.layers, canvasSize.value)
})

function describeReferenceError(error: unknown): string {
  if (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  ) {
    return '浏览器可用存储空间不足。'
  }
  if (error instanceof Error && error.message) return error.message
  return '未知错误。'
}

function reloadReferenceForActiveProject() {
  const project = activeProject.value
  const token = ++referenceLoadToken
  referenceDataUrl.value = null
  referenceError.value = null

  if (!project || !project.reference.image) {
    referenceStatus.value = 'idle'
    return
  }

  referenceStatus.value = 'loading'
  void loadReferenceImage(project.id)
    .then((record) => {
      if (token !== referenceLoadToken) return
      if (!record) {
        referenceStatus.value = 'error'
        referenceError.value =
          '参考图加载失败，数据可能已被浏览器清理。已保留当前画面内容，请重新导入。'
        return
      }
      referenceDataUrl.value = record.dataUrl
      referenceStatus.value = 'ready'
    })
    .catch((error) => {
      if (token !== referenceLoadToken) return
      referenceStatus.value = 'error'
      referenceError.value = `参考图加载失败：${describeReferenceError(error)} 已保留当前画面内容。`
    })
}

function updateReferenceSettings(patch: Partial<ReferenceSettings>) {
  mutateProject((project) => {
    if (!project.reference.image) return project
    return { ...project, reference: { ...project.reference, ...patch } }
  })
}

function setReferenceOpacity(value: number) {
  if (!Number.isFinite(value)) return
  updateReferenceSettings({ opacity: Math.min(1, Math.max(0, value)) })
}

function setReferenceScale(value: number) {
  if (!Number.isFinite(value)) return
  updateReferenceSettings({ scale: Math.min(4, Math.max(0.05, value)) })
}

function setReferenceOffsetX(value: number) {
  if (!Number.isFinite(value)) return
  updateReferenceSettings({ offsetX: Math.min(2, Math.max(-2, value)) })
}

function setReferenceOffsetY(value: number) {
  if (!Number.isFinite(value)) return
  updateReferenceSettings({ offsetY: Math.min(2, Math.max(-2, value)) })
}

function toggleReferenceVisible() {
  mutateProject((project) =>
    project.reference.image
      ? {
          ...project,
          reference: { ...project.reference, visible: !project.reference.visible },
        }
      : project,
  )
}

function resetReferenceTransform() {
  updateReferenceSettings({ scale: 1, offsetX: 0, offsetY: 0 })
}

async function importReferenceImage(file: File) {
  const project = activeProject.value
  if (!project) return
  const projectId = project.id
  const token = referenceLoadToken
  const operation = beginReferenceOperation(projectId)

  referenceStatus.value = 'loading'
  referenceError.value = null

  try {
    const processed = await processReferenceImageFile(file)
    if (
      !isCurrentReferenceOperation(projectId, operation) ||
      !projects.value.some((p) => p.id === projectId)
    ) {
      return
    }
    await saveReferenceImage(projectId, processed.dataUrl, processed.meta)
    if (!isCurrentReferenceOperation(projectId, operation)) {
      // Removed or deleted while the image was being written.
      await deleteReferenceImage(projectId).catch(() => {
        /* Nothing else to clean up. */
      })
      return
    }

    const target = projects.value.find((p) => p.id === projectId)
    if (target) {
      const updated: PixelProject = {
        ...target,
        reference: { ...defaultReferenceSettings(), image: processed.meta },
        updatedAt: Date.now(),
      }
      projects.value = upsertProject(projects.value, updated)
      persistProjects()
    }

    if (activeProject.value?.id === projectId) {
      if (token === referenceLoadToken) {
        referenceDataUrl.value = processed.dataUrl
        referenceStatus.value = 'ready'
      } else {
        // The user switched away and back while this import was running.
        reloadReferenceForActiveProject()
      }
    }
  } catch (error) {
    if (activeProject.value?.id === projectId) {
      if (token === referenceLoadToken) {
        referenceStatus.value = 'error'
        referenceError.value = `参考图导入失败：${describeReferenceError(error)} 画面内容未受影响。`
      } else {
        reloadReferenceForActiveProject()
      }
    }
  }
}

function removeReferenceImage() {
  const project = activeProject.value
  if (!project || !project.reference.image) return
  const projectId = project.id
  beginReferenceOperation(projectId)

  projects.value = upsertProject(projects.value, {
    ...project,
    reference: defaultReferenceSettings(),
    updatedAt: Date.now(),
  })
  persistProjects()

  if (activeProject.value?.id === projectId) {
    referenceLoadToken += 1
    referenceDataUrl.value = null
    referenceStatus.value = 'idle'
    referenceError.value = null
  }

  void deleteReferenceImage(projectId).catch(() => {
    /* Metadata is already gone; a leftover blob is harmless. */
  })
}

watch(
  () => activeProject.value?.id,
  () => {
    reloadReferenceForActiveProject()
  },
  { immediate: true },
)

watch(
  () => prefs.activeProjectId,
  () => {
    linePending.value = null
    player.stop()
  },
)

function recordColorUse(color: string) {
  mutateProject((p) => ({
    ...p,
    recentColors: pushRecentColor(p.recentColors, color),
  }))
}

function setActiveColor(color: string) {
  prefs.activeColor = color
  persistPrefs()
  recordColorUse(color)
}

function setTool(tool: ToolType) {
  prefs.activeTool = tool
  if (tool !== 'line') linePending.value = null
  persistPrefs()
}

function setCanvasSize(size: CanvasSize) {
  if (!CANVAS_SIZES.includes(size)) return
  mutateProject((p) => withCanvasSize(p, size))
}

function onCanvasPointer(x: number, y: number) {
  const p = activeProject.value
  const frame = activeFrame.value
  if (!p || !frame || previewFrameIndex.value !== null) return

  const result = applyToolAt(
    {
      size: p.canvasSize,
      layers: frame.layers,
      activeLayerIndex: p.activeLayerIndex,
      activeColor: prefs.activeColor,
      tool: prefs.activeTool,
      linePending: linePending.value,
    },
    x,
    y,
  )
  if (!result.consumed) return

  linePending.value = result.linePending
  if (result.activeColor) setActiveColor(result.activeColor)

  if (result.layers !== frame.layers) {
    mutateProject((proj) =>
      withFrameLayers(proj, proj.activeFrameIndex, result.layers),
    )
    if (prefs.activeTool === 'brush' || prefs.activeTool === 'bucket' || prefs.activeTool === 'line') {
      recordColorUse(prefs.activeColor)
    }
  }
}

function setActiveLayer(index: number) {
  mutateProject((p) => withActiveLayer(p, index))
}

function toggleLayerVisible(index: number) {
  mutateProject((p) => toggleLayerVisibility(p, index))
}

function deleteLayer(index: number) {
  mutateProject((p) => deleteLayerAt(p, index))
}

function addLayer() {
  mutateProject((p) => addLayerToActiveFrame(p) ?? p)
}

function setActiveFrame(index: number) {
  previewFrameIndex.value = null
  mutateProject((p) => ({ ...p, activeFrameIndex: index }))
  linePending.value = cancelLineTool()
}

function addFrame() {
  mutateProject((p) => addFrameToProject(p) ?? p)
}

function deleteFrame(index: number) {
  mutateProject((p) => deleteFrameAt(p, index))
}

function setFrameDelay(ms: number) {
  const clamped = Math.max(50, Math.min(5000, Math.round(ms)))
  mutateProject((p) => ({ ...p, frameDelayMs: clamped }))
}

function togglePlayback() {
  player.toggle(activeProject.value)
}

watch(
  () => activeProject.value?.frameDelayMs,
  (delay) => {
    if (!isPlaying.value || delay === undefined) return
    player.stop()
    player.toggle(activeProject.value)
  },
)

function saveCurrentProject() {
  const p = activeProject.value
  if (!p) return
  projects.value = upsertProject(projects.value, { ...p, updatedAt: Date.now() })
  persistProjects()
}

function createNewProject(name?: string) {
  const project = createProject(name?.trim() || `项目 ${projects.value.length + 1}`)
  projects.value = [...projects.value, project]
  prefs.activeProjectId = project.id
  persistProjects()
  persistPrefs()
  linePending.value = null
  player.stop()
}

function loadProject(id: string) {
  prefs.activeProjectId = id
  persistPrefs()
  linePending.value = null
  player.stop()
}

function deleteProject(id: string) {
  beginReferenceOperation(id)
  projects.value = removeProject(projects.value, id)
  if (projects.value.length === 0) {
    const fallback = createProject('未命名项目')
    projects.value = [fallback]
    prefs.activeProjectId = fallback.id
  } else if (prefs.activeProjectId === id) {
    prefs.activeProjectId = projects.value[0]!.id
  }
  persistProjects()
  persistPrefs()
  player.stop()
  void deleteReferenceImage(id).catch(() => {
    /* Project metadata is gone; a leftover blob is harmless. */
  })
}

function addCustomPaletteColor(color: string) {
  mutateProject((p) => ({
    ...p,
    customColors: addCustomColor(p.customColors, color),
  }))
  setActiveColor(color)
}

function exportCurrentFrame() {
  const p = activeProject.value
  const frame = activeFrame.value
  if (!p || !frame) return
  exportFramePng(frame, p.canvasSize, `${p.name}_当前帧.png`)
}

function exportAllFrames() {
  const p = activeProject.value
  if (!p) return
  exportAllFramesPng(p.frames, p.canvasSize, p.name)
}

let editorStore: ReturnType<typeof buildEditorStore> | null = null

function buildEditorStore() {
  return reactive({
    projects,
    prefs,
    activeProject,
    canvasSize,
    activeFrame,
    compositePixels,
    linePending,
    isPlaying,
    previewFrameIndex,
    referenceDataUrl,
    referenceStatus,
    referenceError,
    setActiveColor,
    setTool,
    setCanvasSize,
    onCanvasPointer,
    setActiveLayer,
    toggleLayerVisible,
    deleteLayer,
    addLayer,
    setActiveFrame,
    addFrame,
    deleteFrame,
    setFrameDelay,
    togglePlayback,
    stopPlayback: player.stop,
    saveCurrentProject,
    createNewProject,
    loadProject,
    deleteProject,
    addCustomPaletteColor,
    exportCurrentFrame,
    exportAllFrames,
    importReferenceImage,
    removeReferenceImage,
    setReferenceOpacity,
    setReferenceScale,
    setReferenceOffsetX,
    setReferenceOffsetY,
    resetReferenceTransform,
    toggleReferenceVisible,
  })
}

export function useEditorStore() {
  if (!editorStore) editorStore = buildEditorStore()
  return editorStore
}
