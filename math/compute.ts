import { ParseResult, ComputeResult, MathPlotSettings, PlotGroup, TableData } from "../types";
import { DEFAULT_PALETTE } from "../constants";
import { marchingCubes } from "./marchingCubes";

export function computePlot(parsed: ParseResult, params: Record<string, number>, settings: MathPlotSettings): ComputeResult {
    try {
        // Defaults
        let min = settings.defaultRangeMin;
        let max = settings.defaultRangeMax;

        const rawRange = parsed.globalConfig['range'] || parsed.globalConfig['domain'];
        if (rawRange) {
            const cleaned = rawRange.replace(/[\[\]\(\)]/g, '');
            const rp = cleaned.split(',').map(s => parseFloat(s.trim()));
            if (!isNaN(rp[0])) min = rp[0];
            if (!isNaN(rp[1])) max = rp[1];
        }
        
        // Helper: Parse Range String "[min, max]"
        const parseRange = (str: string | undefined, defaultMin: number, defaultMax: number) => {
            if (!str) return { min: defaultMin, max: defaultMax };
            const cleaned = str.replace(/[\[\]\(\)]/g, '');
            const rp = cleaned.split(',').map(s => parseFloat(s.trim()));
            const rMin = !isNaN(rp[0]) ? rp[0] : defaultMin;
            const rMax = !isNaN(rp[1]) ? rp[1] : defaultMax;
            return { min: rMin, max: rMax };
        };

        const getAxisRange = (varName: string, config: Record<string, string>) => {
            const specificKey = `${varName}range`;
            const specificVal = config[specificKey] || parsed.globalConfig[specificKey]; 
            if (specificVal) return parseRange(specificVal, min, max);
          
            const genericVal = config['range'] || config['domain'] || parsed.globalConfig['range'] || parsed.globalConfig['domain'];
            return parseRange(genericVal, min, max);
        };

        const getAxisResolution = (varName: string, range: {min: number, max: number}, config: Record<string, string>, defaultQuality: number, maxLimit = 5000) => {
            const span = Math.abs(range.max - range.min);
            if (span === 0) return 1;

            const sKey = `${varName}step`;
            const sVal = config[sKey] || parsed.globalConfig[sKey];
            if (sVal) return Math.min(Math.floor(span / parseFloat(sVal)), maxLimit);

            const gStep = config['step'] || parsed.globalConfig['step'];
            if (gStep) return Math.min(Math.floor(span / parseFloat(gStep)), maxLimit);

            const gSamples = config['samples'] || parsed.globalConfig['samples'];
            if (gSamples) return Math.min(parseInt(gSamples), maxLimit);

            return defaultQuality;
        };

        const finalGridColor = parsed.globalConfig['grid'] || settings.gridColor;
        const finalTextColor = settings.textColor;

        const is3D = parsed.plots.some(p => ['explicit3d', 'parametric3d', 'vector3d', 'implicit3d', 'spherical', 'cylindrical'].includes(p.type));

        // 等比例坐标（y 锚定 x）只对纯隐函数/向量场的 2D 组合启用；
        // 与普通曲线混绘时启用会强行拉宽另一轴，产生大片空白
        const allowEqualAspect = !is3D && parsed.plots.length > 0
            && parsed.plots.every(p => p.type === 'implicit2d' || p.type === 'vector2d');

        const topMargin = 10;
        const margin = is3D
            ? { l: 0, r: 0, t: topMargin, b: 0 }
            : { l: 60, r: 60, t: Math.max(topMargin, 40), b: 60 };

        const layout: any = {
            template: parsed.globalConfig['theme'] || settings.theme,
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            margin: margin,
            showlegend: false, // We use custom legend
            legend: { font: { color: finalTextColor }, bgcolor: 'rgba(0,0,0,0)' },
            autosize: true, // 确保 Plotly 尝试自动调整
            hovermode: 'closest'
        };

        const plotGroups: PlotGroup[] = [];

        const evaluate = (compiledExpr: any, scope: any) => {
            const fullScope = Object.assign({}, params, scope);
            return compiledExpr.evaluate(fullScope);
        };

        // --- Process Each Plot Definition ---

        parsed.plots.forEach((plot, index) => {
            const { type, compiled, config, arrayExprs, equation } = plot;

            const quality = config['samples'] ? parseInt(config['samples']) : (settings.renderQuality || 40);

            const defaultColor = DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];
            const finalCurveColor = config['color'] || defaultColor;
            const lw = config['linewidth'] || config['lw'];
            const finalLineWidth = lw ? parseFloat(lw) : settings.lineWidth;

            const traceName = config['title'] || equation;

            const currentTraces: any[] = [];
            let currentTableData: TableData | null = null;

            if (type === 'explicit2d') {
                const range = getAxisRange('x', config);
                const plotSteps = getAxisResolution('x', range, config, 250);
                const act = (range.max - range.min) / plotSteps;
                const xA: number[] = [], yA: (number|null)[] = [];
                const tableRows: any[][] = [];

                for (let i = 0; i <= plotSteps; i++) {
                    const x = range.min + i * act;
                    let val: number | null = null;
                    try {
                        const v = evaluate(compiled.main, { x });
                        if (typeof v === 'number' && isFinite(v)) val = v;
                    } catch (e) { }
                    xA.push(x); yA.push(val);
                    tableRows.push([x, val]);
                }
                currentTraces.push({ x: xA, y: yA, type: 'scatter', mode: 'lines', name: traceName, line: { color: finalCurveColor, width: finalLineWidth, shape: 'spline' } });
                currentTableData = { type: 'series', headers: ['x', 'y'], rows: tableRows };

            } else if (type === 'explicit3d') {
                const xRange = getAxisRange('x', config);
                const yRange = getAxisRange('y', config);
               
                const xSteps = getAxisResolution('x', xRange, config, quality || 60);
                const ySteps = getAxisResolution('y', yRange, config, quality || 60);
               
                const tX: number[] = [], tY: number[] = [], tZ: number[][] = [];

                for (let i = 0; i <= xSteps; i++) tX.push(xRange.min + i * (xRange.max - xRange.min)/xSteps);
                for (let i = 0; i <= ySteps; i++) tY.push(yRange.min + i * (yRange.max - yRange.min)/ySteps);
               
                for (let i = 0; i <= ySteps; i++) {
                    const zR: number[] = [], y = tY[i];
                    for (let j = 0; j <= xSteps; j++) {
                        let val = NaN;
                        try {
                            const v = evaluate(compiled.main, { x: tX[j], y });
                            if (typeof v === 'number' && isFinite(v)) val = v;
                        } catch { }
                        zR.push(val);
                    }
                    tZ.push(zR);
                }
                currentTraces.push({ z: tZ, x: tX, y: tY, type: 'surface', name: traceName, colorscale: settings.colorscale3D, showscale: index === 0, opacity: 0.9 });
                currentTableData = { type: 'grid', x: tX, y: tY, z: tZ, labels: { x: 'X', y: 'Y' } };
                if (!layout.scene) layout.scene = {};

            } else if (type === 'polar') {
                const range = getAxisRange('theta', config);
                const isDefault = range.min === settings.defaultRangeMin && range.max === settings.defaultRangeMax;
                const pMin = isDefault ? 0 : range.min;
                const pMax = isDefault ? 6.28 : range.max;
                const actualRange = {min: pMin, max: pMax};

                const steps = getAxisResolution('theta', actualRange, config, 500);
                const dTheta = (pMax - pMin) / steps;
                const rA: number[] = [], tA: number[] = [];
                const tableRows: any[][] = [];

                for (let i = 0; i <= steps; i++) {
                    const theta = pMin + i * dTheta;
                    try {
                        const r = evaluate(compiled.main, { theta });
                        if (typeof r === 'number' && isFinite(r)) {
                            rA.push(r); tA.push(theta);
                            tableRows.push([theta, r]);
                        }
                    } catch { }
                }
                currentTraces.push({ type: 'scatterpolar', r: rA, theta: tA, mode: 'lines', name: traceName, thetaunit: 'radians', line: { color: finalCurveColor, width: finalLineWidth } });
                layout.polar = { bgcolor: 'rgba(0,0,0,0)', angularaxis: { thetaunit: 'radians', direction: 'counterclockwise' } };
                currentTableData = { type: 'series', headers: ['theta', 'r'], rows: tableRows };

            } else if (type === 'parametric2d') {
                const range = getAxisRange('t', config);
                const steps = getAxisResolution('t', range, config, 500);
                const dt = (range.max - range.min) / steps;
                const xA: (number|null)[] = [], yA: (number|null)[] = [];
                const tableRows: any[][] = [];

                for (let i = 0; i <= steps; i++) {
                    const t = range.min + i * dt;
                    let xv = NaN, yv = NaN;
                    try {
                        xv = evaluate(compiled.x, { t });
                        yv = evaluate(compiled.y, { t });
                    } catch { }
                    if (isFinite(xv) && isFinite(yv)) {
                        xA.push(xv); yA.push(yv);
                        tableRows.push([t, xv, yv]);
                    } else { xA.push(null); yA.push(null); }
                }
                currentTraces.push({ type: 'scatter', mode: 'lines', x: xA, y: yA, name: traceName, line: { width: finalLineWidth, color: finalCurveColor, shape: 'spline' } });
                currentTableData = { type: 'series', headers: ['t', 'x', 'y'], rows: tableRows };

            } else if (type === 'parametric3d') {
                const range = getAxisRange('t', config);
                const steps = getAxisResolution('t', range, config, 500);
                const dt = (range.max - range.min) / steps;
                const xA: (number|null)[] = [], yA: (number|null)[] = [], zA: (number|null)[] = [];
                const tableRows: any[][] = [];

                for (let i = 0; i <= steps; i++) {
                    const t = range.min + i * dt;
                    let xv = NaN, yv = NaN, zv = NaN;
                    try {
                        xv = evaluate(compiled.x, { t });
                        yv = evaluate(compiled.y, { t });
                        zv = evaluate(compiled.z, { t });
                    } catch { }
                    if (isFinite(xv) && isFinite(yv) && isFinite(zv)) {
                        xA.push(xv); yA.push(yv); zA.push(zv);
                        tableRows.push([t, xv, yv, zv]);
                    } else { xA.push(null); yA.push(null); zA.push(null); }
                }
                currentTraces.push({ type: 'scatter3d', mode: 'lines', x: xA, y: yA, z: zA, name: traceName, line: { width: finalLineWidth * 2, color: finalCurveColor } });
                currentTableData = { type: 'series', headers: ['t', 'x', 'y', 'z'], rows: tableRows };

            } else if (type === 'spherical') {
                let rTheta = getAxisRange('theta', config);
                let rPhi = getAxisRange('phi', config);

                const defMin = settings.defaultRangeMin; const defMax = settings.defaultRangeMax;
                if (rTheta.min === defMin && rTheta.max === defMax) rTheta = {min: 0, max: 6.28};
                if (rPhi.min === defMin && rPhi.max === defMax) rPhi = {min: 0, max: Math.PI};

                const thetaSteps = getAxisResolution('theta', rTheta, config, quality);
                const phiSteps = getAxisResolution('phi', rPhi, config, quality);

                const thetaVals: number[] = [], phiVals: number[] = [];
                for (let i = 0; i <= thetaSteps; i++) thetaVals.push(rTheta.min + (i * (rTheta.max - rTheta.min) / thetaSteps));
                for (let i = 0; i <= phiSteps; i++) phiVals.push(rPhi.min + (i * (rPhi.max - rPhi.min) / phiSteps));

                const xM: number[][] = [], yM: number[][] = [], zM: number[][] = [], rhoM: number[][] = [];
                for (let i = 0; i < phiVals.length; i++) {
                    const phi = phiVals[i];
                    const xR: number[] = [], yR: number[] = [], zR: number[] = [], rhoR: number[] = [];
                    for (let j = 0; j < thetaVals.length; j++) {
                        const theta = thetaVals[j];
                        let valRho = NaN;
                        try {
                            const r = evaluate(compiled.main, { theta, phi });
                            if (isFinite(r)) valRho = r;
                        } catch { }

                        if (!isNaN(valRho)) {
                            xR.push(valRho * Math.sin(phi) * Math.cos(theta));
                            yR.push(valRho * Math.sin(phi) * Math.sin(theta));
                            zR.push(valRho * Math.cos(phi));
                            rhoR.push(valRho);
                        } else {
                            xR.push(NaN); yR.push(NaN); zR.push(NaN); rhoR.push(NaN);
                        }
                    }
                    xM.push(xR); yM.push(yR); zM.push(zR); rhoM.push(rhoR);
                }
                currentTraces.push({ type: 'surface', x: xM, y: yM, z: zM, name: traceName, colorscale: settings.colorscale3D, showscale: index === 0 });
                layout.scene = { xaxis: { title: 'X' }, yaxis: { title: 'Y' }, zaxis: { title: 'Z' }, aspectmode: 'data' };
                currentTableData = { type: 'grid', x: thetaVals, y: phiVals, z: rhoM, labels: { x: 'θ', y: 'φ' } };
            } else if (type === 'cylindrical') {
                const rZ = getAxisRange('z', config);
                let rTheta = getAxisRange('theta', config);

                const defMin = settings.defaultRangeMin; const defMax = settings.defaultRangeMax;
                if (rTheta.min === defMin && rTheta.max === defMax) rTheta = {min: 0, max: 2 * Math.PI};
                if (rZ.min === defMin && rZ.max === defMax) { rZ.min = 0; rZ.max = 10; }

                const zSteps = getAxisResolution('z', rZ, config, quality);
                const thetaSteps = getAxisResolution('theta', rTheta, config, quality);

                const zVals: number[] = [], thetaVals: number[] = [];
                for (let i = 0; i <= zSteps; i++) zVals.push(rZ.min + (i * (rZ.max - rZ.min) / zSteps));
                for (let i = 0; i <= thetaSteps; i++) thetaVals.push(rTheta.min + (i * (rTheta.max - rTheta.min) / thetaSteps));

                const xM: number[][] = [], yM: number[][] = [], zM: number[][] = [], rM: (number|null)[][] = [];

                for (let i = 0; i < zVals.length; i++) {
                    const z = zVals[i];
                    const xR: number[] = [], yR: number[] = [], zR: number[] = [], rRow: (number|null)[] = [];
                    for (let j = 0; j < thetaVals.length; j++) {
                        const theta = thetaVals[j];
                        let valR = NaN;
                        try {
                            const r = evaluate(compiled.main, { z, theta });
                            if (isFinite(r)) valR = r;
                        } catch (e) { }

                        if (!isNaN(valR)) {
                            xR.push(valR * Math.cos(theta));
                            yR.push(valR * Math.sin(theta));
                            zR.push(z);
                            rRow.push(valR);
                        } else {
                            xR.push(NaN); yR.push(NaN); zR.push(NaN); rRow.push(null);
                        }
                    }
                    xM.push(xR); yM.push(yR); zM.push(zR); rM.push(rRow);
                }

                currentTraces.push({ type: 'surface', x: xM, y: yM, z: zM, name: traceName, colorscale: settings.colorscale3D, showscale: index === 0 });
                layout.scene = { xaxis: { title: 'X' }, yaxis: { title: 'Y' }, zaxis: { title: 'Z' }, aspectmode: 'data' };
                currentTableData = { type: 'grid', x: thetaVals, y: zVals, z: rM, labels: { x: 'θ', y: 'Z' } };

            } else if (type === 'implicit2d') {
                const xR = getAxisRange('x', config);
                const yR = getAxisRange('y', config);
                
                const xSteps = getAxisResolution('x', xR, config, 85);
                const ySteps = getAxisResolution('y', yR, config, 85);

                const xArr: number[] = [], yArr: number[] = [], zMatrix: (number|null)[][] = [];
                const xSpan = xR.max - xR.min;
                const ySpan = yR.max - yR.min;
                
                for (let i = 0; i <= xSteps; i++) xArr.push(xR.min + i * (xSpan/xSteps));
                for (let i = 0; i <= ySteps; i++) {
                    const row: (number|null)[] = [];
                    const y = yR.min + i * (ySpan/ySteps);
                    yArr.push(y);
                    for (let j = 0; j <= xSteps; j++) {
                        const x = xArr[j];
                        let val: number | null = null;
                        try {
                            const v = evaluate(compiled.main, { x, y });
                            if (isFinite(v)) val = v;
                        } catch { }
                        row.push(val);
                    }
                    zMatrix.push(row);
                }
                currentTraces.push({ z: zMatrix, x: xArr, y: yArr, type: 'contour', name: traceName, showscale: false, contours: { coloring: 'none', showlines: true, start: 0, end: 0, size: 0 }, line: { width: finalLineWidth, color: finalCurveColor }, hovertemplate: 'x: %{x:.4f}<br>y: %{y:.4f}<extra></extra>' });
                if (allowEqualAspect) layout.yaxis = { scaleanchor: 'x', scaleratio: 1 };

                // 自动取景：用户未显式指定坐标范围时，把显示范围收紧到 0 等值线包围盒（+15% 边距）
                const hasExplicitRange = config['xrange'] || config['yrange'] || config['range'] || config['domain']
                    || parsed.globalConfig['xrange'] || parsed.globalConfig['yrange']
                    || parsed.globalConfig['range'] || parsed.globalConfig['domain'];
                if (!hasExplicitRange) {
                    let bxMin = Infinity, bxMax = -Infinity, byMin = Infinity, byMax = -Infinity, found = false;
                    const mark = (x: number, y: number) => {
                        found = true;
                        if (x < bxMin) bxMin = x; if (x > bxMax) bxMax = x;
                        if (y < byMin) byMin = y; if (y > byMax) byMax = y;
                    };
                    for (let i = 0; i <= ySteps; i++) {
                        for (let j = 0; j <= xSteps; j++) {
                            const v = zMatrix[i][j];
                            if (v === null) continue;
                            if (v === 0) { mark(xArr[j], yArr[i]); continue; }
                            if (j < xSteps) { const vr = zMatrix[i][j + 1]; if (vr !== null && vr * v < 0) mark(xArr[j], yArr[i]); }
                            if (i < ySteps) { const vd = zMatrix[i + 1][j]; if (vd !== null && vd * v < 0) mark(xArr[j], yArr[i]); }
                        }
                    }
                    if (found) {
                        const padX = Math.max((bxMax - bxMin) * 0.15, 0.5);
                        const padY = Math.max((byMax - byMin) * 0.15, 0.5);
                        layout.xaxis = Object.assign({}, layout.xaxis, { range: [bxMin - padX, bxMax + padX], autorange: false });
                        layout.yaxis = Object.assign({}, layout.yaxis, { range: [byMin - padY, byMax + padY], autorange: false });
                    }
                }
                currentTableData = { type: 'grid', x: xArr, y: yArr, z: zMatrix, labels: { x: 'X', y: 'Y' } };

            } else if (type === 'implicit3d') {
                const xR = getAxisRange('x', config);
                const yR = getAxisRange('y', config);
                const zR = getAxisRange('z', config);

                // Marching cubes over a regular grid; resolution capped to avoid memory blowups
                const resolution = Math.min(Math.max(quality, 4), 128);

                // Reuse a single scope object: only x/y/z change per sample
                const scope: any = Object.assign({}, params);
                const field = (x: number, y: number, z: number) => {
                    scope.x = x; scope.y = y; scope.z = z;
                    return compiled.main.evaluate(scope);
                };

                const mesh = marchingCubes(field, xR, yR, zR, resolution);
                if (mesh.indices.length === 0) {
                    throw new Error("No surface found in range (isolevel 0). Check the x/y/z ranges or increase 'samples'.");
                }

                currentTraces.push({ type: 'three-mesh', positions: mesh.positions, indices: mesh.indices, name: traceName, showlegend: false, color: finalCurveColor });

                // 表格数据：网格顶点（x,y,z），顶点过多时均匀抽稀到 2000 行
                const vCount = mesh.positions.length / 3;
                const stride = Math.max(1, Math.ceil(vCount / 2000));
                const meshRows: any[][] = [];
                for (let vi = 0; vi < vCount; vi += stride) {
                    meshRows.push([mesh.positions[vi * 3], mesh.positions[vi * 3 + 1], mesh.positions[vi * 3 + 2]]);
                }
                currentTableData = { type: 'series', headers: ['x', 'y', 'z'], rows: meshRows };

            } else if (type === 'vector2d' || type === 'vector3d') {
                const isV3D = type === 'vector3d';
                
                const xR = getAxisRange('x', config);
                const yR = getAxisRange('y', config);
                const zR = isV3D ? getAxisRange('z', config) : {min:0, max:0};

                const xSteps = getAxisResolution('x', xR, config, isV3D ? 8 : 20);
                const ySteps = getAxisResolution('y', yR, config, isV3D ? 8 : 20);
                const zSteps = isV3D ? getAxisResolution('z', zR, config, 8) : 1;
                
                const xA: number[] = [], yA: number[] = [], zA: number[] = [], uA: number[] = [], vA: number[] = [], wA: number[] = [];
                const tableRows: any[][] = [];

                // Expressions are already compiled once in the parser
                const cX = compiled.x;
                const cY = compiled.y;
                const cZ = isV3D ? compiled.z : null;

                const dx = (xR.max - xR.min) / xSteps;
                const dy = (yR.max - yR.min) / ySteps;
                const dz = isV3D ? (zR.max - zR.min) / zSteps : 0;

                for (let i = 0; i <= xSteps; i++) {
                    for (let j = 0; j <= ySteps; j++) {
                        const x = xR.min + i * dx;
                        const y = yR.min + j * dy;

                        if (isV3D && cZ) {
                            for (let k = 0; k <= zSteps; k++) {
                                const z = zR.min + k * dz;
                                try {
                                    const s = Object.assign({}, params, { x, y, z });
                                    const u = cX.evaluate(s), v = cY.evaluate(s), w = cZ.evaluate(s);
                                    if (isFinite(u) && isFinite(v) && isFinite(w)) {
                                        xA.push(x); yA.push(y); zA.push(z); uA.push(u); vA.push(v); wA.push(w);
                                        const mag = Math.sqrt(u * u + v * v + w * w);
                                        tableRows.push([x, y, z, u, v, w, mag]);
                                    }
                                } catch { }
                            }
                        } else {
                            try {
                                const s = Object.assign({}, params, { x, y, z: 0 });
                                const u = cX.evaluate(s), v = cY.evaluate(s);
                                if (isFinite(u) && isFinite(v)) {
                                    const m = Math.sqrt(u * u + v * v);
                                    xA.push(x); yA.push(y); uA.push(u); vA.push(v); wA.push(m);
                                    tableRows.push([x, y, u, v, m]);
                                }
                            } catch { }
                        }
                    }
                }
                if (isV3D) {
                    currentTableData = { type: 'series', headers: ['x', 'y', 'z', 'u', 'v', 'w', '|v|'], rows: tableRows };
                    currentTraces.push({ type: 'cone', x: xA, y: yA, z: zA, u: uA, v: vA, w: wA, name: traceName, sizemode: 'scaled', sizeref: 0.5, colorscale: settings.colorscale3D, showscale: index === 0 });
                } else {
                    currentTableData = { type: 'series', headers: ['x', 'y', 'u', 'v', '|v|'], rows: tableRows };
                    const lX: (number|null)[] = [], lY: (number|null)[] = [], hX: number[] = [], hY: number[] = [], ang: number[] = [], col: number[] = [];
                    let maxMag = 0; wA.forEach(m => maxMag = Math.max(maxMag, m));
                    const scale = maxMag > 0 ? (dx * 0.9) / maxMag : 1;

                    for (let i = 0; i < xA.length; i++) {
                        const x = xA[i], y = yA[i], u = uA[i], v = vA[i], m = wA[i];
                        const su = u * scale, sv = v * scale;
                        lX.push(x, x + su, null); lY.push(y, y + sv, null);
                        hX.push(x + su); hY.push(y + sv);
                        col.push(m);
                        ang.push((Math.atan2(v, u) * 180 / Math.PI) - 90);
                    }
                    currentTraces.push({ type: 'scatter', mode: 'lines', x: lX, y: lY, name: traceName + " (lines)", line: { color: finalCurveColor, width: finalLineWidth * 0.5 }, hoverinfo: 'skip', showlegend: false });
                    currentTraces.push({ type: 'scatter', mode: 'markers', x: hX, y: hY, name: traceName, marker: { symbol: 'triangle-up', size: 8, angle: ang, color: col, colorscale: settings.colorscale3D, showscale: index === 0 } });
                    if (allowEqualAspect) layout.yaxis = { scaleanchor: 'x', scaleratio: 1 };
                }
            }

            if (currentTraces.length > 0) {
                if (currentTableData) {
                    currentTableData.name = traceName;
                    currentTableData.color = finalCurveColor;
                }
                plotGroups.push({
                    traces: currentTraces,
                    table: currentTableData,
                    name: traceName,
                    color: finalCurveColor
                });
            }
        });

        // Apply Styles to Axis
        const axisStyle = {
            gridcolor: finalGridColor,
            zerolinecolor: finalGridColor,
            linecolor: finalGridColor,
            tickcolor: finalGridColor,
            title: { font: { color: finalTextColor } },
            tickfont: { color: finalTextColor }
        };

        if (layout.scene) {
            layout.scene.xaxis = Object.assign({}, layout.scene.xaxis, axisStyle);
            layout.scene.yaxis = Object.assign({}, layout.scene.yaxis, axisStyle);
            layout.scene.zaxis = Object.assign({}, layout.scene.zaxis, axisStyle);
        } else if (layout.polar) {
            layout.polar.radialaxis = Object.assign({}, layout.polar.radialaxis, axisStyle);
            layout.polar.angularaxis = Object.assign({}, layout.polar.angularaxis, axisStyle);
        } else {
            layout.xaxis = Object.assign({}, layout.xaxis, axisStyle);
            layout.yaxis = Object.assign({}, layout.yaxis, axisStyle);
        }

        return { plotGroups, layout };

    } catch (e: any) {
        return { plotGroups: [], layout: {}, error: e.message || String(e) };
    }
}