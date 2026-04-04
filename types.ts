declare global {
    interface Window {
        math: any;
        Plotly: any;
    }
}

export interface MathPlotSettings {
    theme: string;
    renderQuality: number;
    plotBackgroundColor: string;
    curveColor: string;
    lineWidth: number;
    colorscale3D: string;
    defaultBlockWidth: string;
    defaultBlockHeight: string;
    defaultMobileBlockWidth: string;
    defaultMobileBlockHeight: string;
    borderColor: string;
    borderWidth: string;
    gridColor: string;
    textColor: string;
    defaultRangeMin: number;
    defaultRangeMax: number;
    plotFontSize: number;
    mobileThreshold: number;
}

export interface ParameterDef {
    name: string;
    min: number;
    max: number;
    step: number;
    value: number;
}

export interface PlotDef {
    type: string;
    equation: string;
    arrayExprs: string[];
    config: Record<string, string>;
    compiled: Record<string, any>;
}

export interface ParseResult {
    globalConfig: Record<string, string>;
    plots: PlotDef[];
    parameters: ParameterDef[];
    error?: { code: string; message: string };
}

export interface TableData {
    type: 'series' | 'grid';
    headers?: string[];
    rows?: any[][];
    x?: number[];
    y?: number[];
    z?: any[][];
    labels?: { x: string; y: string };
    name?: string;
    color?: string;
}

export interface PlotGroup {
    traces: any[];
    table: TableData | null;
    name: string;
    color: string;
}

export interface ComputeResult {
    plotGroups: PlotGroup[];
    layout: any;
    error?: string | any;
}

// 定义 RenderChild 接口以解除对 Obsidian 类直接耦合导致的循环引用
export interface IRenderChild {
    registerOnUnload(callback: () => void): void;
}