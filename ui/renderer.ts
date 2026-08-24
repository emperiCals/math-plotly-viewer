import { MathPlotSettings, TableData, ParameterDef, IRenderChild, ComputeResult } from "../types";
import { parseScript } from "../math/parser";
import { computePlot } from "../math/compute";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function renderError(container: HTMLElement, code: string, msg: string) {
    container.innerHTML = "";
    container.style.height = "auto";
    const errEl = container.createEl("div", { cls: "mathplot-error" });
    errEl.innerHTML = `<strong style="display:block; margin-bottom:4px;">Error [${code}]</strong>${msg}`;
}

export function renderTable(container: HTMLElement, tableData: TableData, settings: MathPlotSettings) {
    // 边框与文字跟随 Obsidian 主题（亮/暗自适应）；表头仍用曲线色以呼应图例
    const borderColor = "var(--background-modifier-border)";
    const textColor = "var(--text-normal)";
    const curveColor = tableData.color || settings.curveColor;
    const fontSize = settings.plotFontSize;

    // 性能：整表拼成 HTML 字符串一次性写入，避免逐单元格 createEl（大网格数千节点会卡 1s+）
    const thStyle = `border:1px solid ${borderColor};color:${curveColor};font-size:${fontSize}px;background:var(--background-secondary);`;
    const thCorner = thStyle + "left:0;z-index:10;";
    const tdNum = `border:1px solid ${borderColor};color:${textColor};font-size:${fontSize}px;opacity:0.85;`;
    const tdTxt = `border:1px solid ${borderColor};color:${textColor};font-size:${fontSize}px;`;
    const tdRowHead = `border:1px solid ${borderColor};color:${textColor};font-size:${fontSize}px;background:var(--background-secondary);`;
    const tdIndex = tdNum + "opacity:0.5;";
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    let html = "";
    let truncatedInfo = "";

    if (tableData.type === 'grid' && tableData.labels && tableData.x && tableData.y && tableData.z) {
        const cols = tableData.x;
        // 网格表列数过多时均匀抽稀，防止 DOM 爆炸
        const maxCols = 40;
        const colStride = Math.max(1, Math.ceil(cols.length / maxCols));
        const maxRows = 100;
        const rowStride = Math.max(1, Math.ceil(tableData.y.length / maxRows));
        if (colStride > 1 || rowStride > 1) {
            truncatedInfo = `Sampled every ${colStride} col(s) / ${rowStride} row(s) for display.`;
        }

        html += `<thead><tr><th class="mp-th mp-corner" style="${thCorner}">${esc(tableData.labels.y)}\\${esc(tableData.labels.x)}</th>`;
        for (let j = 0; j < cols.length; j += colStride) html += `<th class="mp-th" style="${thStyle}">${cols[j].toFixed(2)}</th>`;
        html += "</tr></thead><tbody>";
        for (let i = 0; i < tableData.y.length; i += rowStride) {
            html += `<tr${i % 2 === 1 ? ' class="mathplot-tr-odd"' : ""}><td class="mp-rowhead" style="${tdRowHead}">${tableData.y[i].toFixed(2)}</td>`;
            for (let j = 0; j < cols.length; j += colStride) {
                const z = tableData.z[i][j];
                html += `<td class="mp-td-num" style="${tdNum}">${(z !== null && !isNaN(z)) ? z.toFixed(2) : ""}</td>`;
            }
            html += "</tr>";
        }
        html += "</tbody>";
    } else if (tableData.headers && tableData.rows) {
        const maxRows = 1000;
        const rows = tableData.rows;
        const stride = Math.max(1, Math.ceil(rows.length / maxRows));
        if (stride > 1) truncatedInfo = `Sampled every ${stride} rows (${rows.length} total).`;

        html += `<thead><tr><th class="mp-th" style="${thStyle}width:40px;">#</th>`;
        for (const h of tableData.headers) html += `<th class="mp-th" style="${thStyle}">${esc(h)}</th>`;
        html += "</tr></thead><tbody>";
        let displayIdx = 0;
        for (let r = 0; r < rows.length; r += stride, displayIdx++) {
            html += `<tr${displayIdx % 2 === 1 ? ' class="mathplot-tr-odd"' : ""}><td class="mp-td-num mp-td-index" style="${tdIndex}">${r + 1}</td>`;
            for (const cell of rows[r]) {
                if (typeof cell === 'number') html += `<td class="mp-td-num" style="${tdNum}">${cell.toFixed(4)}</td>`;
                else if (cell !== null && cell !== undefined) html += `<td style="${tdTxt}">${esc(String(cell))}</td>`;
                else html += `<td class="mp-td-num" style="${tdNum}">-</td>`;
            }
            html += "</tr>";
        }
        html += "</tbody>";
    }

    container.innerHTML = `<div class="mathplot-table-wrapper"><table class="mathplot-data-table" style="color:${textColor};">${html}</table></div>`
        + (truncatedInfo ? `<div class="mathplot-table-info">${truncatedInfo}</div>` : "");
}

export function renderSlider(container: HTMLElement, param: ParameterDef, settings: MathPlotSettings, onUpdate: (val: number) => void, onPlayStateChange: (playing: boolean) => void) {
    const wrapper = container.createEl("div", { cls: "mathplot-slider-wrapper" });
    wrapper.style.color = settings.textColor;

    const playBtn = wrapper.createEl("button", { text: "Play", cls: "mathplot-btn mathplot-play-btn" });
    wrapper.createEl("span", { text: param.name + ":", cls: "mathplot-slider-label" });

    const slider = wrapper.createEl("input", { attr: { type: "range" }, cls: "mathplot-slider-input" }) as HTMLInputElement;
    slider.min = String(param.min);
    slider.max = String(param.max);
    slider.step = String(param.step);
    slider.value = String(param.value);

    const valDisplay = wrapper.createEl("span", { text: param.value.toFixed(2), cls: "mathplot-slider-val" });

    let isPlaying = false;
    let animId: number;
    let direction = 1;
    let lastTime = 0;
    const fps = 15; 
    const interval = 1000 / fps;

    playBtn.onclick = () => {
        isPlaying = !isPlaying;
        playBtn.innerText = isPlaying ? "Pause" : "Play";
        
        if (isPlaying) playBtn.classList.add("active");
        else playBtn.classList.remove("active");

        if (onPlayStateChange) onPlayStateChange(isPlaying);

        if (isPlaying) {
            const animate = (time: number) => {
                if (!document.body.contains(wrapper)) return;

                if (time - lastTime > interval) {
                    lastTime = time;
                    let next = param.value + (param.step * direction);

                    if (next >= param.max) {
                        next = param.max;
                        direction = -1;
                    } else if (next <= param.min) {
                        next = param.min;
                        direction = 1;
                    }

                    next = Math.round(next * 10000) / 10000;

                    param.value = next;
                    slider.value = String(next);
                    valDisplay.innerText = next.toFixed(2);
                    onUpdate(next);
                }

                if (isPlaying) animId = requestAnimationFrame(animate);
            };
            animId = requestAnimationFrame(animate);
        } else {
            cancelAnimationFrame(animId);
        }
    };

    slider.oninput = (e: Event) => {
        const v = parseFloat((e.target as HTMLInputElement).value);
        param.value = v;
        valDisplay.innerText = v.toFixed(2);
        onUpdate(v);
        if (isPlaying) {
            isPlaying = false;
            if (onPlayStateChange) onPlayStateChange(false);
            playBtn.innerText = "Play";
            playBtn.classList.remove("active");
            cancelAnimationFrame(animId);
        }
    };
}

export function renderPlot(container: HTMLElement, source: string, settings: MathPlotSettings, renderChild?: IRenderChild) {
    if (!window.math || !window.Plotly) {
        container.createEl("div", { text: "Libraries loading..." });
        return;
    }
    const Plotly = window.Plotly;

    container.innerHTML = "";
    container.dataset.source = source;

    // 1. 解析逻辑
    const parsed = parseScript(source);

    const mobileQuery = window.matchMedia(`(max-width: ${settings.mobileThreshold || 768}px)`);
    
    const updateContainerSize = () => {
        const isMobile = mobileQuery.matches;
        
        const defaultW = isMobile ? settings.defaultMobileBlockWidth : settings.defaultBlockWidth;
        const defaultH = isMobile ? settings.defaultMobileBlockHeight : settings.defaultBlockHeight;

        let targetWidth = parsed.globalConfig['width'] || (parsed.globalConfig['size'] ? parsed.globalConfig['size'].split(',')[0] : null) || defaultW;
        let targetHeight = parsed.globalConfig['height'] || (parsed.globalConfig['size'] ? parsed.globalConfig['size'].split(',')[1] : null) || defaultH;

        container.style.width = targetWidth;
        
        const plotDiv = container.querySelector(".plot-div") as HTMLElement;
        if (plotDiv) {
            plotDiv.style.height = targetHeight;
            // 修复：仅当 plotDiv 已经被 Plotly 完全初始化并且在屏幕上具备宽和高时才调整大小
            try {
                if ((plotDiv as any)._fullLayout && plotDiv.clientWidth > 0 && plotDiv.clientHeight > 0) {
                    Plotly.Plots.resize(plotDiv);
                }
            } catch (e) {
                console.warn("MathPlotly resize skipped:", e);
            }
        }
    };

    container.style.border = `${settings.borderWidth} solid ${settings.borderColor}`;
    container.style.backgroundColor = settings.plotBackgroundColor === "rgba(0, 0, 0, 0)" ? "var(--background-secondary)" : settings.plotBackgroundColor;
    
    const onMediaChange = () => updateContainerSize();
    mobileQuery.addEventListener("change", onMediaChange);

    const resizeObserver = new ResizeObserver(() => {
        const plotDiv = container.querySelector(".plot-div") as HTMLElement;
        if (plotDiv) {
            // 修复：在 ResizeObserver 中也增加相同的安全判断
            try {
                if ((plotDiv as any)._fullLayout && plotDiv.clientWidth > 0 && plotDiv.clientHeight > 0) {
                    Plotly.Plots.resize(plotDiv);
                }
            } catch (e) {
                console.warn("MathPlotly resize skipped:", e);
            }
        }
        if (threeDiv) {
            threeDiv.style.height = plotDiv ? plotDiv.style.height : threeDiv.style.height;
            updateThreeSize();
        }
    });
    resizeObserver.observe(container);

    if (renderChild) {
        renderChild.registerOnUnload(() => {
            mobileQuery.removeEventListener("change", onMediaChange);
            resizeObserver.disconnect();
            disposeThree();
        });
    }

    if (parsed.error) {
        renderError(container, parsed.error.code, parsed.error.message);
        return;
    }

    const customTitle = parsed.globalConfig['text'] || parsed.globalConfig['title'];
    const hasMultiplePlots = parsed.plots.length > 1;
    const showHeader = !!customTitle || hasMultiplePlots;

    let headerDiv: HTMLElement | null = null;
    let legendContainer: HTMLElement | null = null;

    if (showHeader) {
        headerDiv = container.createEl("div", { cls: "mathplot-header" });
        headerDiv.style.borderBottom = `1px solid ${settings.borderColor}`;
        
        const titleSpan = headerDiv.createEl("span", { text: customTitle || "", cls: "mathplot-title-text" });
        titleSpan.style.color = settings.textColor;

        legendContainer = headerDiv.createEl("div", { cls: "mathplot-legend-container" });
    }

    const plotDiv = container.createEl("div", { cls: "plot-div" });
    updateContainerSize();

    const controlsDiv = container.createEl("div", { cls: "mathplot-controls" });
    controlsDiv.style.borderTop = `1px solid ${settings.borderColor}`;
    
    const slidersContainer = controlsDiv.createEl("div", { cls: "mathplot-sliders-container" });
    const tableActionContainer = controlsDiv.createEl("div", { cls: "mathplot-table-action" });
    const toggleBtn = tableActionContainer.createEl("button", { text: "Show Table", cls: "mathplot-btn" }) as HTMLButtonElement;
    
    const tableContainer = container.createEl("div", { cls: "mathplot-table" });
    tableContainer.style.borderTop = `1px solid ${settings.borderColor}`;

    const currentParams: Record<string, number> = {};
    parsed.parameters.forEach(p => currentParams[p.name] = p.value);

    let isTableVisible = false;
    let activeDatasetIndex = -1; 
    let latestResult: ComputeResult | null = null;
    let activeAnimations = 0;

    const mergeTableData = (datasets: (TableData | null)[]): TableData | null => {
        const validDatasets = datasets.filter((d): d is TableData => d !== null);
        if (!validDatasets || validDatasets.length === 0) return null;
        if (validDatasets.length === 1) return validDatasets[0];
        if (validDatasets.some(d => d.type !== 'series')) return validDatasets[0];

        const base = validDatasets[0];
        if (!base.headers || !base.rows) return null;
        const domainLabel = base.headers[0];
        const mergedHeaders = [domainLabel];

        validDatasets.forEach(ds => {
            if (ds.headers) {
                for (let i = 1; i < ds.headers.length; i++) {
                    mergedHeaders.push(`${ds.headers[i]} (${ds.name})`);
                }
            }
        });

        const rowCount = base.rows.length;
        const mergedRows: any[][] = [];

        for (let r = 0; r < rowCount; r++) {
            const row = [base.rows[r][0]];
            validDatasets.forEach(ds => {
                if (ds.rows && ds.rows[r]) {
                    for (let c = 1; c < ds.rows[r].length; c++) {
                        row.push(ds.rows[r][c]);
                    }
                } else if (ds.headers) {
                    for (let c = 1; c < ds.headers.length; c++) row.push(null);
                }
            });
            mergedRows.push(row);
        }

        return {
            type: 'series',
            headers: mergedHeaders,
            rows: mergedRows,
            color: settings.textColor
        };
    };

    const updateTableButtonState = () => {
        if (activeAnimations > 0) {
            toggleBtn.disabled = true;
            toggleBtn.classList.add("mathplot-btn-disabled");
            toggleBtn.innerText = "Playing...";
        } else {
            toggleBtn.disabled = false;
            toggleBtn.classList.remove("mathplot-btn-disabled");
            toggleBtn.innerText = isTableVisible ? "Hide Table" : "Show Table";
        }
    };

    const styleLegendBtn = (btn: HTMLElement, active: boolean, activeColor: string, activeText: string) => {
        if (active) {
            btn.style.backgroundColor = activeColor;
            btn.style.color = activeText;
            if (activeColor.startsWith("#0") || activeColor === "black" || activeColor.includes("0,0,0") || activeColor === "#444") {
                btn.style.color = "#fff";
            }
            btn.classList.add("active");
        } else {
            btn.style.backgroundColor = "rgba(255,255,255,0.1)";
            btn.style.color = "#888";
            btn.classList.remove("active");
        }
    };

    const renderHeaderLegend = () => {
        if (!legendContainer || !latestResult || !latestResult.plotGroups) return;
        legendContainer.innerHTML = "";

        if (latestResult.plotGroups.length > 0) {
            const groups = latestResult.plotGroups;

            if (groups.length > 1) {
                const isAllActive = activeDatasetIndex === -1;
                const allBtn = legendContainer.createEl("button", { text: "ALL", cls: "mathplot-legend-btn" });
                styleLegendBtn(allBtn, isAllActive, "#444", "#ccc");
                allBtn.onclick = () => {
                    activeDatasetIndex = -1;
                    renderHeaderLegend();
                    updatePlotVisuals();
                };

                groups.forEach((g, idx) => {
                    const isActive = idx === activeDatasetIndex;
                    const btn = legendContainer.createEl("button", { text: g.name || `Eq ${idx + 1}`, cls: "mathplot-legend-btn" });
                    styleLegendBtn(btn, isActive, g.color, "#000"); 

                    btn.onclick = () => {
                        activeDatasetIndex = idx;
                        renderHeaderLegend();
                        updatePlotVisuals();
                    };
                });
            }
        }
    };

    toggleBtn.onclick = () => {
        isTableVisible = !isTableVisible;
        updateTableButtonState();
        if (isTableVisible) {
            tableContainer.style.display = "flex";
            renderTableContent();
        } else {
            tableContainer.style.display = "none";
        }
        // 表格在图表下方展开/收起，图表尺寸不变，无需 Plotly.react 全量重绘；
        // 仅通知 Plotly/three 校准一次当前尺寸即可
        requestAnimationFrame(() => {
            try {
                if ((plotDiv as any)._fullLayout && plotDiv.clientWidth > 0) Plotly.Plots.resize(plotDiv);
            } catch (e) { /* ignore */ }
            updateThreeSize();
        });
    };

    const renderTableContent = () => {
        if (!latestResult || !tableContainer) return;
        let dataToShow: TableData | null = null;

        if (activeDatasetIndex === -1) {
            const allTables = latestResult.plotGroups.map(g => g.table);
            dataToShow = mergeTableData(allTables);
        } else {
            if (latestResult.plotGroups[activeDatasetIndex]) {
                dataToShow = latestResult.plotGroups[activeDatasetIndex].table;
            }
        }

        if (dataToShow) {
            renderTable(tableContainer, dataToShow, settings);
        } else {
            tableContainer.innerHTML = "<div class='mathplot-no-data'>No data available.</div>";
        }
    };

    // --- Three.js surface rendering (implicit3d marching cubes meshes) ---
    // Mixed groups (Plotly traces + three-mesh traces) are handled simply:
    // three-mesh surfaces render in their own container below the Plotly div.
    let threeDiv: HTMLElement | null = null;
    let threeCtx: any = null;

    const disposeThree = () => {
        if (!threeCtx) return;
        cancelAnimationFrame(threeCtx.rafId);
        threeCtx.controls.dispose();
        threeCtx.meshes.forEach((mesh: any) => {
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        threeCtx.meshes.clear();
        (threeCtx.helpers || []).forEach((h: any) => {
            threeCtx.scene.remove(h);
            if (h.geometry) h.geometry.dispose();
            if (h.material) h.material.dispose();
        });
        threeCtx.renderer.dispose();
        threeCtx = null;
        if (threeDiv) { threeDiv.remove(); threeDiv = null; }
    };

    const ensureThreeContext = () => {
        if (threeCtx) return;
        threeDiv = container.createEl("div", { cls: "three-div" });
        // 紧贴图表区插入，保证与 Plotly 图表一致的布局顺序（图在上，控制栏/表格在下）
        plotDiv.after(threeDiv);
        threeDiv.style.height = plotDiv.style.height || settings.defaultBlockHeight;

        const width = threeDiv.clientWidth || 600;
        const height = threeDiv.clientHeight || 400;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 高分屏限制倍率，避免片元数爆炸
        threeDiv.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
        camera.position.set(1.5, 1.5, 1.5);

        // 三点式打光，接近 Plotly 3D 的柔和观感
        scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
        dirLight.position.set(3, 5, 4);
        scene.add(dirLight);
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
        fillLight.position.set(-4, -2, -3);
        scene.add(fillLight);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        threeCtx = { renderer, scene, camera, controls, meshes: new Map<string, any>(), helpers: [], rafId: 0, fitted: false, needsRender: true };

        // 按需渲染：RAF 常驻但只做 cheap 检查，仅相机仍在运动或数据更新时才真正 render
        // （damping 生效期间 controls.update() 返回 true，保证惯性动画完整播完）
        const loop = () => {
            if (!threeCtx) return;
            threeCtx.rafId = requestAnimationFrame(loop);
            const moving = threeCtx.controls.update();
            if (moving || threeCtx.needsRender) {
                threeCtx.needsRender = false;
                threeCtx.renderer.render(threeCtx.scene, threeCtx.camera);
            }
        };
        const requestRender = () => { if (threeCtx) threeCtx.needsRender = true; };
        threeCtx.requestRender = requestRender;
        controls.addEventListener("change", requestRender);
        loop();
    };

    const updateThreeSize = () => {
        if (!threeCtx || !threeDiv) return;
        const width = threeDiv.clientWidth, height = threeDiv.clientHeight;
        if (width <= 0 || height <= 0) return;
        threeCtx.camera.aspect = width / height;
        threeCtx.camera.updateProjectionMatrix();
        threeCtx.renderer.setSize(width, height);
        threeCtx.requestRender();
    };

    const updateThreeMeshes = (meshTraces: any[]) => {
        ensureThreeContext();
        const seen = new Set<string>();

        meshTraces.forEach((trace, i) => {
            const key = trace.name || `mesh-${i}`;
            seen.add(key);

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(trace.positions, 3));
            geometry.setIndex(trace.indices);
            geometry.computeVertexNormals();

            const existing = threeCtx.meshes.get(key);
            if (existing) {
                // Parameter animation: swap geometry only, keep renderer/camera/controls (view preserved)
                existing.geometry.dispose();
                existing.geometry = geometry;
            } else {
                const material = new THREE.MeshStandardMaterial({
                    color: trace.color || settings.curveColor,
                    side: THREE.DoubleSide,
                    roughness: 0.45,
                    metalness: 0.05,
                    flatShading: false
                });
                const mesh = new THREE.Mesh(geometry, material);
                threeCtx.scene.add(mesh);
                threeCtx.meshes.set(key, mesh);
            }

            // Fit the camera once, on the first geometry
            if (!threeCtx.fitted) {
                geometry.computeBoundingSphere();
                const bs = geometry.boundingSphere;
                if (bs && isFinite(bs.radius) && bs.radius > 0) {
                    threeCtx.camera.position.set(bs.center.x + bs.radius * 2.2, bs.center.y + bs.radius * 1.8, bs.center.z + bs.radius * 2.2);
                    threeCtx.controls.target.copy(bs.center);

                    // 坐标轴 + 底部参考网格，向 Plotly 3D 的观感靠拢
                    const axes = new THREE.AxesHelper(bs.radius * 1.2);
                    axes.position.copy(bs.center);
                    threeCtx.scene.add(axes);
                    threeCtx.helpers.push(axes);

                    const gridSize = bs.radius * 2.4;
                    const grid = new THREE.GridHelper(gridSize, 12, 0x666666, 0x444444);
                    (grid.material as THREE.Material).transparent = true;
                    (grid.material as THREE.Material).opacity = 0.35;
                    grid.position.set(bs.center.x, bs.center.y - bs.radius * 1.05, bs.center.z);
                    threeCtx.scene.add(grid);
                    threeCtx.helpers.push(grid);

                    threeCtx.fitted = true;
                }
            }
            threeCtx.requestRender();
        });

        // Drop meshes whose traces disappeared
        threeCtx.meshes.forEach((mesh: any, key: string) => {
            if (!seen.has(key)) {
                threeCtx.scene.remove(mesh);
                mesh.geometry.dispose();
                mesh.material.dispose();
                threeCtx.meshes.delete(key);
                threeCtx.requestRender();
            }
        });

        updateThreeSize();
    };

    const updatePlotVisuals = () => {
        if (!latestResult) return;

        let activeTraces: any[] = [];
        if (activeDatasetIndex === -1) {
            activeTraces = latestResult.plotGroups.flatMap(g => g.traces);
        } else {
            if (latestResult.plotGroups[activeDatasetIndex]) {
                activeTraces = latestResult.plotGroups[activeDatasetIndex].traces;
            }
        }

        const threeMeshTraces = activeTraces.filter(t => t.type === 'three-mesh');
        const plotlyTraces = activeTraces.filter(t => t.type !== 'three-mesh');

        if (threeMeshTraces.length > 0) {
            updateThreeMeshes(threeMeshTraces);
        } else if (threeCtx) {
            disposeThree();
        }

        const finalLayout = Object.assign({}, latestResult.layout, {
            showlegend: false,
            font: {
                family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                color: settings.textColor,
                size: settings.plotFontSize
            },
            autosize: true, 
            uirevision: 'mathplot-animation',
        });

        plotDiv.style.display = plotlyTraces.length > 0 ? "" : "none";
        if (plotlyTraces.length > 0) {
            Plotly.react(plotDiv, plotlyTraces, finalLayout, {
                responsive: true,
                displayModeBar: false
            });
        }

        if (isTableVisible && activeAnimations === 0) {
            renderTableContent();
        }
    };

    const updatePlot = () => {
        // 2. 运算逻辑
        const result = computePlot(parsed, currentParams, settings);
        latestResult = result;

        if (result.error) {
            disposeThree();
            renderError(plotDiv, "ERR_EVAL", typeof result.error === 'string' ? result.error : result.error.message || String(result.error));
            return;
        }
        if (result.plotGroups.length === 0) {
            disposeThree();
            renderError(plotDiv, "ERR_NO_DATA", "No data generated");
            return;
        }

        const hasSliders = parsed.parameters.length > 0;
        const hasData = result.plotGroups.length > 0;

        if (hasSliders || hasData) {
            controlsDiv.style.display = "flex";
            slidersContainer.style.display = hasSliders ? "flex" : "none";
            tableActionContainer.style.display = hasData ? "flex" : "none";
        } else {
            controlsDiv.style.display = "none";
        }

        renderHeaderLegend();
        updatePlotVisuals();
    };

    if (parsed.parameters.length > 0) {
        parsed.parameters.forEach(param => {
            renderSlider(slidersContainer, param, settings,
                (newVal) => {
                    currentParams[param.name] = newVal;
                    updatePlot(); 
                },
                (playing) => {
                    if (playing) activeAnimations++; else activeAnimations--;
                    if (activeAnimations < 0) activeAnimations = 0;
                    updateTableButtonState();
                }
            );
        });
    }

    updatePlot();
}