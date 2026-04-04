import { Plugin, MarkdownRenderChild, MarkdownPostProcessorContext, normalizePath } from "obsidian";
import { MathPlotSettings } from "./types";
import { DEFAULT_SETTINGS } from "./constants";
import { renderPlot } from "./ui/renderer";
import { MathPlotSettingTab } from "./ui/settingsTab";

export default class MathPlotPlugin extends Plugin {
    settings!: MathPlotSettings;
    onSettingsChange?: () => void;

    async onload() {
        console.log("Math Plotly: Loading plugin...");
        await this.loadSettings();

        try {
            const pluginDir = this.manifest.dir;
            const adapter = this.app.vault.adapter;

            const injectScript = (fileName: string, globalVar: string): Promise<any> => {
                return new Promise((resolve) => {
                    if ((window as any)[globalVar]) return resolve((window as any)[globalVar]);
                    // @ts-ignore
                    const resourcePath = adapter.getResourcePath(normalizePath(pluginDir + "/" + fileName));
                    const script = document.createElement("script");
                    script.src = resourcePath;
                    script.type = "text/javascript";
                    script.onload = () => {
                        console.log(`MathPlotly: Library ${fileName} loaded.`);
                        resolve((window as any)[globalVar]);
                    };
                    script.onerror = (e) => {
                        console.error(`MathPlotly: Failed to load ${fileName}`, e);
                        resolve(null);
                    };
                    document.head.appendChild(script);
                });
            };

            await injectScript("math.min.js", "math");
            await injectScript("plotly.min.js", "Plotly");

            this.registerMarkdownCodeBlockProcessor("plot", (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
                const container = el.createEl("div", { cls: "mathplot-container" });
                const child = new MathPlotRenderChild(container, source, this);
                ctx.addChild(child);
            });

            this.addSettingTab(new MathPlotSettingTab(this.app, this));

        } catch (e) {
            console.error("Math Plotly: Init error", e);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        if (this.onSettingsChange) this.onSettingsChange();

        // 刷新所有当前已被渲染出来的图表以应用新的设置
        const containers = document.querySelectorAll(".mathplot-container");
        containers.forEach((node) => {
            const htmlNode = node as HTMLElement;
            const source = htmlNode.dataset.source;
            if (source) {
                renderPlot(htmlNode, source, this.settings);
            }
        });
    }
}

class MathPlotRenderChild extends MarkdownRenderChild {
    source: string;
    plugin: MathPlotPlugin;
    unloadCallbacks: (() => void)[];

    constructor(containerEl: HTMLElement, source: string, plugin: MathPlotPlugin) {
        super(containerEl);
        this.source = source;
        this.plugin = plugin;
        this.unloadCallbacks = [];
    }

    registerOnUnload(callback: () => void) {
        this.unloadCallbacks.push(callback);
    }

    onunload() {
        this.unloadCallbacks.forEach(cb => cb());
        super.onunload();
    }

    onload() {
        // 解耦后，通过注入 settings 来启动渲染管线
        // 修复：利用 setTimeout 将执行推迟到当前事件循环结束，确保 DOM 完全挂载且 Displayed
        setTimeout(() => {
            if (this.containerEl) {
                try {
                    renderPlot(this.containerEl, this.source, this.plugin.settings, this);
                } catch (e) {
                    console.error("MathPlotly render error:", e);
                }
            }
        }, 0);
    }
}