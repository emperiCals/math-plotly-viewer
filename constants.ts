import { MathPlotSettings } from "./types";

export const RESERVED_KEYWORDS = new Set([
    'range', 'domain', 'step', 'samples', 'size', 'theme', 'color',
    'text', 'title', 'grid', 'width', 'height', 'linewidth', 'lw',
    'parameter', 'param', 'config',
    'x', 'y', 'z', 't', 'theta', 'phi', 'rho', 'r' // Math variables
]);

// Keywords that apply to the entire graph layout
export const GLOBAL_KEYWORDS = new Set([
    'range', 'domain', 'size', 'theme', 'title', 'grid', 'width', 'height', 'text',
    'xrange', 'yrange', 'zrange', 'trange', 'phirange', 'thetarange',
    'xstep', 'ystep', 'zstep', 'tstep', 'phistep', 'thetastep'
]);

export const DEFAULT_PALETTE = [
    '#4cc9f0', // Cyan
    '#f72585', // Pink/Magenta
    '#7209b7', // Purple
    '#4361ee', // Blue
    '#ffb703', // Yellow/Orange
    '#06d6a0', // Green
    '#ef476f'  // Red/Pink
];

export const DEFAULT_SETTINGS: MathPlotSettings = {
    theme: "plotly_dark",
    renderQuality: 40,
    plotBackgroundColor: "rgba(0, 0, 0, 0)",
    curveColor: "#4cc9f0",
    lineWidth: 3,
    colorscale3D: "Viridis",
    defaultBlockWidth: "100%",
    defaultBlockHeight: "450px",
    defaultMobileBlockWidth: "100%", // 移动端默认宽度
    defaultMobileBlockHeight: "350px", // 移动端默认高度
    borderColor: "#333333",
    borderWidth: "1px",
    gridColor: "#444444",
    textColor: "#dcddde",
    defaultRangeMin: -10,
    defaultRangeMax: 10,
    plotFontSize: 12,
    mobileThreshold: 768 // 移动端阈值
};