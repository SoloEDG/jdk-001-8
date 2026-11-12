<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEditorStore } from '../editor/useEditorStore'

const store = useEditorStore()
const fileInput = ref<HTMLInputElement | null>(null)

const reference = computed(() => store.activeProject?.reference ?? null)
const hasImage = computed(() => Boolean(reference.value?.image))
const isLoading = computed(() => store.referenceStatus === 'loading')
const hasData = computed(() => Boolean(store.referenceDataUrl))

const opacityPercent = computed(() => Math.round((reference.value?.opacity ?? 0) * 100))
const scalePercent = computed(() => Math.round((reference.value?.scale ?? 1) * 100))
const offsetXPercent = computed(() => Math.round((reference.value?.offsetX ?? 0) * 100))
const offsetYPercent = computed(() => Math.round((reference.value?.offsetY ?? 0) * 100))

const sizeLabel = computed(() => {
  const image = reference.value?.image
  if (!image) return ''
  const kb = Math.max(1, Math.round(image.byteSize / 1024))
  return `${image.width}×${image.height} · ${kb} KB`
})

function pickFile() {
  fileInput.value?.click()
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  await store.importReferenceImage(file)
}

function onOpacityInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  store.setReferenceOpacity(value / 100)
}

function onScaleInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  store.setReferenceScale(value / 100)
}

function onOffsetXInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  store.setReferenceOffsetX(value / 100)
}

function onOffsetYInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  store.setReferenceOffsetY(value / 100)
}
</script>

<template>
  <section class="panel side-panel reference-panel">
    <h3>参考图 <small>仅当前项目</small></h3>
    <p class="hint">垫在画布下方，不进入图层和帧，也不参与导出与动画预览</p>

    <input
      ref="fileInput"
      class="file-input"
      type="file"
      accept="image/*"
      @change="onFileChange"
    />

    <button
      type="button"
      class="action"
      :disabled="isLoading"
      @click="pickFile"
    >
      {{ isLoading ? '处理中…' : hasImage ? '更换参考图' : '导入参考图' }}
    </button>

    <p v-if="store.referenceError" class="reference-error">
      {{ store.referenceError }}
    </p>

    <p v-else-if="isLoading && !hasData" class="hint">正在加载参考图…</p>

    <div v-if="reference?.image" class="reference-info">
      <span class="reference-name" :title="reference.image.name">
        {{ reference.image.name }}
      </span>
      <span class="reference-size">
        {{ sizeLabel }} · {{ reference.image.compressed ? '已压缩' : '原图' }}
      </span>
    </div>

    <div v-if="reference?.image" class="reference-controls">
      <div class="reference-actions">
        <button type="button" class="mini-btn" @click="store.toggleReferenceVisible">
          {{ reference.visible ? '隐藏' : '显示' }}
        </button>
        <button type="button" class="mini-btn" @click="store.resetReferenceTransform">
          居中适应
        </button>
        <button type="button" class="mini-btn danger" @click="store.removeReferenceImage">
          移除
        </button>
      </div>

      <label class="reference-field">
        <span>透明度 <b>{{ opacityPercent }}%</b></span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="opacityPercent"
          @input="onOpacityInput"
        />
      </label>

      <label class="reference-field">
        <span>缩放 <b>{{ scalePercent }}%</b></span>
        <input
          type="range"
          min="10"
          max="400"
          step="5"
          :value="scalePercent"
          @input="onScaleInput"
        />
      </label>

      <label class="reference-field">
        <span>水平位置 <b>{{ offsetXPercent }}%</b></span>
        <input
          type="range"
          min="-100"
          max="100"
          step="1"
          :value="offsetXPercent"
          @input="onOffsetXInput"
        />
      </label>

      <label class="reference-field">
        <span>垂直位置 <b>{{ offsetYPercent }}%</b></span>
        <input
          type="range"
          min="-100"
          max="100"
          step="1"
          :value="offsetYPercent"
          @input="onOffsetYInput"
        />
      </label>

      <p v-if="!hasData && !isLoading" class="hint">
        图片数据未加载，可重新导入或移除参考图。
      </p>
    </div>
  </section>
</template>
