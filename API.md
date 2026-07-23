# Math Plotly Viewer — API 文档

## 插件概述

Math Plotly Viewer 是一个 Obsidian 插件，通过 ` ```plot ` 代码块在笔记中嵌入基于 Plotly 的交互式数学图表。支持 2D/3D 显式函数、隐式函数、极坐标、参数方程、球坐标、柱坐标、向量场等多种绘图类型，并支持交互式参数滑块与数据表格查看。数学表达式由 mathjs 解析，绘图由 Plotly.js 完成（两个库在插件加载时以 `<script>` 标签注入到页面）。

## manifest 信息

| 字段 | 值 |
| --- | --- |
| `id` | `math-plotly-viewer` |
| `name` | `Math Plotly Viewer` |
| `version` | `1.0.3` |
| `minAppVersion` | `0.15.0` |
| `author` | `yzh-362` |
| `isDesktopOnly` | `false` |
| `main` | `main.js` |

## 主插件类 `MathPlotPlugin`（`main.ts`）

继承自 `obsidian.Plugin`。

### 属性

- `settings: MathPlotSettings` — 当前插件设置。
- `onSettingsChange?: () => void` — 可选回调，在 `saveSettings()` 后被调用。

### 生命周期

- `onload()`：
  1. 调用 `loadSettings()` 加载设置；
  2. 通过 `injectScript()` 将插件目录下的 `math.min.js`（挂到 `window.math`）和 `plotly.min.js`（挂到 `window.Plotly`）以资源路径注入 `<head>`（已加载则跳过）；
  3. 注册 Markdown 代码块处理器 `plot`：为每个代码块创建 `.mathplot-container` 容器并挂载一个 `MathPlotRenderChild`；
  4. 注册设置页 `MathPlotSettingTab`。
- 未注册任何命令（command）或自定义视图（View）。
- `onunload()`：未显式实现，使用 Obsidian 默认卸载逻辑。

### 方法

- `async loadSettings()` — 读取持久化数据并与 `DEFAULT_SETTINGS` 合并写入 `this.settings`。
- `async saveSettings()` — 持久化 `this.settings`，触发 `onSettingsChange` 回调，然后遍历页面上所有 `.mathplot-container` 调用 `renderPlot()` 重绘已渲染图表以应用新设置。

### 内部类 `MathPlotRenderChild`（`main.ts`，非导出）

继承自 `MarkdownRenderChild`，实现 `IRenderChild` 接口。

- `source: string` — 代码块源码。
- `plugin: MathPlotPlugin` — 插件实例引用。
- `unloadCallbacks: (() => void)[]` — 卸载回调列表。
- `registerOnUnload(callback: () => void)` — 注册卸载时执行的回调（用于清理 `ResizeObserver`、媒体查询监听器等）。
- `onload()` — 通过 `setTimeout(..., 0)` 推迟到 DOM 挂载完成后调用 `renderPlot()`。
- `onunload()` — 依次执行所有 `unloadCallbacks` 后调用父类卸载。

## 模块接口

### `math/parser.ts`

#### `parseScript(source: string): ParseResult`

解析 `plot` 代码块源码。按行处理，每行以逗号（顶层）切分键值对与方程：

- `parameter=[name, min, max, step?]`（或 `param=`）声明交互参数，加入 `parameters`；
- 全局关键字（`range`、`domain`、`size`、`theme`、`title`、`grid`、`width`、`height`、`text`、`xrange`、`yrange`、`zrange`、`trange`、`phirange`、`thetarange` 及各 `*step`）写入 `globalConfig`；
- 局部关键字（`color`、`linewidth`/`lw`、`samples` 等）写入该条 plot 的 `config`；
- 其余片段作为方程，自动推断绘图类型并预编译（`math.compile`）。

类型推断规则：

- `[expr1, expr2, expr3?]` 数组形式：含 `t` → `parametric2d` / `parametric3d`；含 `x`/`y`/`z` → `vector2d` / `vector3d`；
- 含 `phi`/`rho` 或 `rho=...` → `spherical`；
- `r=...` 且含 `z` → `cylindrical`；
- 含 `theta` 或 `r=...` → `polar`；
- 含 `=` 的隐式方程 → `implicit2d` / `implicit3d`（自动改写为 `左 - (右)`）；
- 其余 → `explicit2d` / `explicit3d`。

解析出错时不抛异常，而是返回带 `error: { code, message }` 的 `ParseResult`（错误码如 `ERR_EMPTY`、`ERR_PARAM_FMT`、`ERR_RESERVED`、`ERR_PARAM_NAME`、`ERR_PARAM_VAL`、`ERR_NO_EQ`、`ERR_PARSE`）。

### `math/compute.ts`

#### `computePlot(parsed: ParseResult, params: Record<string, number>, settings: MathPlotSettings): ComputeResult`

根据解析结果、当前参数值和设置，数值采样并生成 Plotly 的 traces 与 layout：

- 解析全局/局部的 `range`（`[min, max]`）、`step`、`samples` 决定采样范围与分辨率（上限 5000）；
- 对每种绘图类型生成对应的 Plotly trace（2D 折线、surface、scatterpolar、scatter3d、contour、cone、向量场线段+三角标记等；`implicit3d` 例外，见下）；
- `implicit3d` 分支：在 `xrange`/`yrange`/`zrange` 规则网格上采样隐式函数（复用单个 scope 对象，只改 x/y/z），再调用 `marchingCubes()` 提取 0 等值面。分辨率取 `samples` 参数或 `settings.renderQuality`（默认 40），钳制在 [4,128]。输出 `{ type: 'three-mesh', positions: Float32Array, indices: number[], name, showlegend: false, color }` trace，由 renderer 用 Three.js 渲染（非 Plotly）；网格内无曲面时报错提示检查范围或增大 `samples`；
- 同时为每条曲线生成 `TableData`（`series` 或 `grid`）供数据表格展示（`implicit3d` 为占位空表）；
- 统一应用网格/文字颜色等坐标轴样式，返回 `{ plotGroups, layout }`；出错返回 `error` 字段。

性能说明：所有方程表达式在 `parseScript` 中只 `math.compile` 一次，挂在 `PlotDef.compiled`（`main` 或 `x`/`y`/`z`）；`computePlot` 各分支（包括 `vector2d`/`vector3d`、`implicit3d`）直接复用预编译结果，采样时只更新 scope 对象后调用 `evaluate`，不重复编译。

### `math/marchingCubes.ts`

#### `marchingCubes(field: (x: number, y: number, z: number) => number, xrange: {min, max}, yrange: {min, max}, zrange: {min, max}, resolution: number): MarchingCubesResult`

经典 marching cubes（Lorensen-Cline）算法，在规则网格上提取隐式函数的 0 等值面。查找表（edgeTable/triTable）取自 three.js 官方 addon（`examples/jsm/objects/MarchingCubes.js`）的 canonical 数据。

- `field` 在三轴范围张成的 `resolution³` 规则网格上采样；含 NaN 的格子整体跳过；
- 棱上交点用线性插值计算；返回 `MarchingCubesResult = { positions: Float32Array, indices: number[] }`（非索引化三角形，positions 为顶点坐标 xyz 连续排列，indices 顺序引用）。

### `ui/renderer.ts`

- `renderError(container: HTMLElement, code: string, msg: string)` — 在容器内渲染错误提示块。
- `renderTable(container: HTMLElement, tableData: TableData, settings: MathPlotSettings)` — 渲染数据表格；`grid` 类型渲染为二维矩阵，`series` 类型渲染为带行号的行列表（最多 2000 行）。
- `renderSlider(container: HTMLElement, param: ParameterDef, settings: MathPlotSettings, onUpdate: (val: number) => void, onPlayStateChange: (playing: boolean) => void)` — 渲染参数滑块及 Play/Pause 动画按钮（约 15fps 往返播放）；拖动或播放时通过 `onUpdate` 回传新值，播放状态变化通过 `onPlayStateChange` 通知。
- `renderPlot(container: HTMLElement, source: string, settings: MathPlotSettings, renderChild?: IRenderChild)` — 渲染管线入口：解析 → 计算 → 用 `Plotly.react` 绘制；负责容器尺寸（区分桌面/移动端，监听媒体查询与 `ResizeObserver`）、边框/背景样式、标题与图例按钮（多曲线时可切换显示单条/全部）、参数滑块区、"Show Table" 数据表格切换；通过 `renderChild.registerOnUnload` 注册清理逻辑。

#### `three-mesh` trace 的 Three.js 渲染（`implicit3d`）

`renderPlot` 将 active traces 分为两组：Plotly traces 走 `Plotly.react`，`three-mesh` traces 在 Plotly div 下方独立的 `.three-div` 容器中用 Three.js 渲染：

- 场景：`WebGLRenderer`（antialias + alpha 透明背景）、`PerspectiveCamera(45°)`、`OrbitControls` 交互旋转/缩放、`AmbientLight` + `DirectionalLight`、`AxesHelper`（按包围球半径缩放）、`MeshStandardMaterial`（`DoubleSide`，roughness 0.6/metalness 0.1）；`requestAnimationFrame` 循环驱动 `controls.update()` + `render()`；
- 首次添加网格时按包围球自动取景（`fitted` 标记）；参数动画时只替换 `BufferGeometry`（释放旧 geometry），保持相机视角不变；不再需要的 mesh 从场景移除并释放；
- `ResizeObserver` 同步 `.three-div` 尺寸到相机 aspect 与 renderer；
- 清理（`renderChild.registerOnUnload`）：`cancelAnimationFrame`、`controls.dispose()`、逐 mesh 释放 geometry/material、`renderer.dispose()`、移除 `.three-div`。

Three.js 通过 npm 依赖（工作区根目录 `three`）由 esbuild 打进 `main.js` bundle，不依赖 `window` 全局注入；因根 esbuild 未 minify，`main.js` 体积约 1.26MB。

### `ui/settingsTab.ts`

- `interface IMathPlotPlugin extends Plugin { settings: MathPlotSettings; saveSettings(): Promise<void>; }` — 用于打破与 `main.ts` 的循环依赖的插件接口。
- `class MathPlotSettingTab extends PluginSettingTab` — 设置页，分组为 Layout & Dimensions（宽高、移动端尺寸、边框）、Visual Style（主题、颜色、字体、3D 色标）、Graph Defaults（默认取值范围）、Performance（渲染质量），所有变更即改即存并触发全量重绘。

### `constants.ts`

- `RESERVED_KEYWORDS: Set<string>` — 保留关键字集合，不可作为参数名（含 `range`、`step`、`x`、`y`、`z`、`t`、`theta` 等）。
- `GLOBAL_KEYWORDS: Set<string>` — 作用于整张图布局的全局关键字集合。
- `DEFAULT_PALETTE: string[]` — 多曲线默认配色（7 色循环）。
- `DEFAULT_SETTINGS: MathPlotSettings` — 设置默认值（见下表）。

## 设置项数据结构（`MathPlotSettings`，`types.ts`）

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `theme` | `string` | `"plotly_dark"` | Plotly 模板主题 |
| `renderQuality` | `number` | `40` | 3D/隐式图渲染质量（采样密度） |
| `plotBackgroundColor` | `string` | `"rgba(0, 0, 0, 0)"` | 图表容器背景色 |
| `curveColor` | `string` | `"#4cc9f0"` | 默认曲线颜色 |
| `lineWidth` | `number` | `3` | 曲线宽度（px） |
| `colorscale3D` | `string` | `"Viridis"` | 3D 曲面/向量场色标 |
| `defaultBlockWidth` | `string` | `"100%"` | 桌面端默认容器宽度 |
| `defaultBlockHeight` | `string` | `"450px"` | 桌面端默认容器高度 |
| `defaultMobileBlockWidth` | `string` | `"100%"` | 移动端默认容器宽度 |
| `defaultMobileBlockHeight` | `string` | `"350px"` | 移动端默认容器高度 |
| `borderColor` | `string` | `"#333333"` | 边框颜色 |
| `borderWidth` | `string` | `"1px"` | 边框宽度 |
| `gridColor` | `string` | `"#444444"` | 网格/坐标轴颜色 |
| `textColor` | `string` | `"#dcddde"` | 文字颜色 |
| `defaultRangeMin` | `number` | `-10` | 默认取值范围下限 |
| `defaultRangeMax` | `number` | `10` | 默认取值范围上限 |
| `plotFontSize` | `number` | `12` | 图表基础字号（px） |
| `mobileThreshold` | `number` | `768` | 移动端判定屏幕宽度阈值（px） |

其他类型（`types.ts`）：`ParameterDef`（参数定义 `{name, min, max, step, value}`）、`PlotDef`（单条绘图定义 `{type, equation, arrayExprs, config, compiled}`）、`ParseResult`（`{globalConfig, plots, parameters, error?}`）、`TableData`（表格数据，`series`/`grid` 两种）、`PlotGroup`（`{traces, table, name, color}`）、`ComputeResult`（`{plotGroups, layout, error?}`）、`IRenderChild`（卸载回调注册接口）。

## 用户侧用法

在笔记中使用 `plot` 代码块：

````markdown
```plot
title = 示例, range = [-10, 10], width = 100%, height = 400px
x^2, color = #ff0000, lw = 2
sin(x), title = 正弦曲线
parameter = [a, -5, 5, 0.1]
a * cos(x)
```
````

语法要点：

- 每行一条曲线；逗号分隔方程与键值对配置；
- 全局配置：`range`/`domain`、`xrange`/`yrange`/`zrange`、`step`/`samples`、`size`/`width`/`height`、`theme`、`title`/`text`、`grid` 等；
- 局部配置（只作用于该行曲线）：`color`、`linewidth`/`lw`、`title`、`samples` 等；
- 交互参数：`parameter = [名称, 最小值, 最大值, 步长?]`，声明后会出现滑块与播放按钮，参数名可直接在方程中使用；
- 方程类型自动识别：`y = x^2` 或 `x^2`（2D 显式）、`x^2 + y^2 = 4`（隐式）、`r = 2*sin(theta)`（极坐标）、`rho = ...`（球坐标）、`r = f(z,theta)`（柱坐标）、`[t*cos(t), t*sin(t)]`（参数方程）、`[y, -x]`（2D 向量场）等；
- 支持多曲线叠加，图例按钮可切换显示；底部 "Show Table" 可查看采样数据表。
