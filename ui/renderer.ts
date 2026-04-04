import { MathPlotSettings, TableData, ParameterDef, IRenderChild, ComputeResult } from "../types";
import { parseScript } from "../math/parser";
import { computePlot } from "../math/compute";

export function renderError(container: HTMLElement, code: string, msg: string) {
    container.innerHTML = "";
    container.style.height = "auto";
    const errEl = container.createEl("div", { cls: "mathplot-error" });
    errEl.innerHTML = `<strong style="display:block; margin-bottom:4px;">Error [${code}]</strong>${msg}`;
}

export function renderTable(container: HTMLElement, tableData: TableData, settings: MathPlotSettings) {
    container.innerHTML = "";
    const borderColor = settings.gridColor;
    const textColor = settings.textColor;
    const curveColor = tableData.color || settings.curveColor;
    const fontSize = settings.plotFontSize;

    const headerStyle = `position: sticky; top: 0; background: #222; z-index: 5; border: 1px solid ${borderColor}; padding: 6px; color: ${curveColor}; text-align: left; font-size: ${fontSize}px;`;
    const cellStyleNum = `border: 1px solid ${borderColor}; padding: 4px 6px; color: ${textColor}; text-align: right; opacity: 0.8; font-size: ${fontSize}px;`;
    const cellStyle = `border: 1px solid ${borderColor}; padding: 4px 6px; color: ${textColor}; font-size: ${fontSize}px;`;

    const wrapper = container.createEl("div", { cls: "mathplot-table-wrapper" });
    const table = wrapper.createEl("table", { cls: "mathplot-data-table" });
    table.style.color = textColor;

    if (tableData.type === 'grid' && tableData.labels && tableData.x && tableData.y && tableData.z) {
        const thead = table.createEl("thead");
        const hr = thead.createEl("tr");
        hr.createEl("th", { text: `${tableData.labels.y}\\${tableData.labels.x}`, attr: { style: headerStyle + " left: 0; z-index: 10;" } });
        tableData.x.forEach((x: number) => hr.createEl("th", { text: x.toFixed(2), attr: { style: headerStyle } }));

        const tbody = table.createEl("tbody");
        tableData.y.forEach((y: number, i: number) => {
            const tr = tbody.createEl("tr");
            if (i % 2 === 1) tr.classList.add("mathplot-tr-odd");
            tr.createEl("td", { text: y.toFixed(2), attr: { style: `border: 1px solid ${borderColor}; padding: 4px; font-weight:bold; background: #222; position: sticky; left: 0; z-index: 2; color: ${textColor}; font-size: ${fontSize}px;` } });
            tableData.z![i].forEach((z: number | null) => {
                tr.createEl("td", { text: (z !== null && !isNaN(z)) ? z.toFixed(2) : "", attr: { style: cellStyleNum } });
            });
        });
    } else if (tableData.headers && tableData.rows) {
        const thead = table.createEl("thead");
        const tr = thead.createEl("tr");
        tr.createEl("th", { text: "#", attr: { style: headerStyle + " width: 40px;" } });

        tableData.headers.forEach((h: string) => {
            tr.createEl("th", { text: h, attr: { style: headerStyle } });
        });

        const tbody = table.createEl("tbody");
        const maxRows = 2000;
        const rowsToRender = tableData.rows.slice(0, maxRows);

        rowsToRender.forEach((row: any[], i: number) => {
            const tr = tbody.createEl("tr");
            if (i % 2 === 1) tr.classList.add("mathplot-tr-odd");
            tr.createEl("td", { text: String(i + 1), attr: { style: cellStyleNum + " text-align: center; opacity: 0.5;" } });

            row.forEach((cell: any) => {
                let txt = "-";
                let style = cellStyleNum;
                if (typeof cell === 'number') txt = cell.toFixed(4);
                else if (cell !== null && cell !== undefined) { txt = String(cell); style = cellStyle; }
                tr.createEl("td", { text: txt, attr: { style } });
            });
        });

        if (tableData.rows.length > maxRows) {
            container.createEl("div", { text: `Showing first ${maxRows} of ${tableData.rows.length} rows.`, cls: "mathplot-table-info" });
        }
    }
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
    container.style.backgroundColor = settings.plotBackgroundColor === "rgba(0, 0, 0, 0)" ? "#111" : settings.plotBackgroundColor;
    
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
    });
    resizeObserver.observe(container);

    if (renderChild) {
        renderChild.registerOnUnload(() => {
            mobileQuery.removeEventListener("change", onMediaChange);
            resizeObserver.disconnect();
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
        requestAnimationFrame(() => {
            updatePlotVisuals();
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

        Plotly.react(plotDiv, activeTraces, finalLayout, {
            responsive: true,
            displayModeBar: false
        });

        if (isTableVisible && activeAnimations === 0) {
            renderTableContent();
        }
    };

    const updatePlot = () => {
        // 2. 运算逻辑
        const result = computePlot(parsed, currentParams, settings);
        latestResult = result;

        if (result.error) {
            renderError(plotDiv, "ERR_EVAL", typeof result.error === 'string' ? result.error : result.error.message || String(result.error));
            return;
        }
        if (result.plotGroups.length === 0) {
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