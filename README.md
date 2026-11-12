# jdk-001 像素画编辑器

基于 **Vue 3 + TypeScript + Vite** 的纯前端像素画编辑器，数据保存在浏览器 `localStorage`。

## 功能概览

- **画布**：16×16 / 32×32 / 64×64，点击上色
- **调色板**：24 色预设、自定义颜色、最近 8 色
- **工具**：画笔、橡皮、油漆桶、吸管、直线（两点）
- **图层**：最多 3 层，显示/隐藏/删除
- **动画**：最多 8 帧，可调间隔并循环预览
- **参考图**：按项目导入底图垫在画布下方，可调透明度、缩放和位置；不进入图层/帧，导出与动画预览均不包含
- **导出**：当前帧或全部帧 PNG
- **项目**：新建 / 保存 / 加载多个项目

参考图的设置随项目保存在 `localStorage`；图片本体在体积较大时会先压缩，再单独存入 `IndexedDB`，避免占满 `localStorage`。

## 架构

| 目录 | 职责 |
|------|------|
| `src/core/` | 纯领域逻辑：网格算法、存储、导出、工厂方法 |
| `src/editor/` | 编辑状态编排：工具、命令、动画播放 |
| `src/components/` | UI 组件，仅消费 `useEditorStore` |

## 本地开发

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm run build
npm run preview
```

## Docker 一键启动

```bash
docker compose up --build
```

浏览器访问：<http://localhost:8080>
