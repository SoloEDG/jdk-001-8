<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../editor/useEditorStore'

const store = useEditorStore()

const displaySize = computed(() => {
  const size = store.canvasSize
  const cell = Math.floor(Math.min(512 / size, 24))
  return { size, cell, px: size * cell }
})

const referenceSettings = computed(() => store.activeProject?.reference ?? null)

const referenceVisible = computed(() => {
  const reference = referenceSettings.value
  return Boolean(
    store.referenceDataUrl &&
      reference?.image &&
      reference.visible &&
      !store.isPlaying &&
      store.previewFrameIndex === null,
  )
})

const referenceStyle = computed(() => {
  const reference = referenceSettings.value
  const image = reference?.image
  if (!reference || !image || !referenceVisible.value) return null

  const canvasPx = displaySize.value.px
  const fit = Math.min(canvasPx / image.width, canvasPx / image.height)
  const width = image.width * fit * reference.scale
  const height = image.height * fit * reference.scale
  const left = (canvasPx - width) / 2 + reference.offsetX * canvasPx
  const top = (canvasPx - height) / 2 + reference.offsetY * canvasPx

  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
    opacity: reference.opacity,
  }
})

const checkerStyle = computed(() => ({
  backgroundSize: `${displaySize.value.cell * 2}px ${displaySize.value.cell * 2}px`,
}))

function onCellClick(x: number, y: number) {
  if (store.isPlaying) return
  store.onCanvasPointer(x, y)
}

function cellStyle(index: number) {
  const color = store.compositePixels[index]
  if (color === null || color === undefined) {
    return { backgroundColor: 'transparent' }
  }
  return { backgroundColor: color }
}
</script>

<template>
  <main class="canvas-area">
    <div class="canvas-meta">
      <span>{{ store.canvasSize }}×{{ store.canvasSize }}</span>
      <span v-if="referenceVisible" class="badge">参考图</span>
      <span v-if="store.isPlaying" class="badge playing">动画预览中</span>
      <span v-else-if="store.previewFrameIndex !== null" class="badge">预览帧</span>
    </div>
    <div
      class="canvas-stack"
      :style="{
        width: `${displaySize.px}px`,
        height: `${displaySize.px}px`,
      }"
    >
      <div class="canvas-checker" :style="checkerStyle" />
      <img
        v-if="referenceStyle"
        class="reference-layer"
        :src="store.referenceDataUrl ?? ''"
        :style="referenceStyle"
        alt="参考图"
        draggable="false"
      />
      <div
        class="pixel-grid"
        :style="{
          gridTemplateColumns: `repeat(${displaySize.size}, ${displaySize.cell}px)`,
          gridTemplateRows: `repeat(${displaySize.size}, ${displaySize.cell}px)`,
        }"
      >
        <button
          v-for="(_, index) in store.compositePixels"
          :key="index"
          type="button"
          class="pixel-cell"
          :style="cellStyle(index)"
          :aria-label="`像素 ${index}`"
          @click="onCellClick(index % displaySize.size, Math.floor(index / displaySize.size))"
        />
      </div>
    </div>
  </main>
</template>
