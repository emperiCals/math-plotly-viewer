import { App, PluginSettingTab, Setting, Plugin } from "obsidian";
import { MathPlotSettings } from "../types";

// 定义一个接口来代替直接引入 main.ts 中的 MathPlotPlugin，彻底打破循环依赖
export interface IMathPlotPlugin extends Plugin {
    settings: MathPlotSettings;
    saveSettings(): Promise<void>;
}

export class MathPlotSettingTab extends PluginSettingTab {
    plugin: IMathPlotPlugin;

    constructor(app: App, plugin: IMathPlotPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.innerHTML = '';
        containerEl.createEl('h2', { text: 'MathPlot Settings' });

        // --- Layout & Dimensions ---
        containerEl.createEl('h3', { text: 'Layout & Dimensions' });

        new Setting(containerEl)
            .setName('Block Width')
            .setDesc('Default width of the plot container (e.g. 100%)')
            .addSlider(slider => slider
                .setLimits(20, 100, 5)
                .setValue(parseInt(this.plugin.settings.defaultBlockWidth) || 100)
                .onChange(async (value) => {
                    this.plugin.settings.defaultBlockWidth = value + "%";
                    await this.plugin.saveSettings();
                })
                .setDynamicTooltip());
        
        new Setting(containerEl)
            .setName('Mobile Threshold')
            .setDesc('Screen width (px) below which plots will take mobile dimensions.')
            .addSlider(slider => slider
                .setLimits(300, 1200, 50)
                .setValue(this.plugin.settings.mobileThreshold || 768)
                .onChange(async (value) => {
                    this.plugin.settings.mobileThreshold = value;
                    await this.plugin.saveSettings();
                })
                .setDynamicTooltip());

        new Setting(containerEl)
            .setName('Mobile Block Width')
            .setDesc('Default width on mobile devices (e.g. 100%)')
            .addText(text => text
                .setValue(this.plugin.settings.defaultMobileBlockWidth || "100%")
                .onChange(async (value) => {
                    this.plugin.settings.defaultMobileBlockWidth = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Block Height')
            .setDesc('Default height of the plot container (px)')
            .addSlider(slider => slider
                .setLimits(300, 1200, 50)
                .setValue(parseInt(this.plugin.settings.defaultBlockHeight) || 450)
                .onChange(async (value) => {
                    this.plugin.settings.defaultBlockHeight = value + "px";
                    await this.plugin.saveSettings();
                })
                .setDynamicTooltip());

        new Setting(containerEl)
            .setName('Mobile Block Height')
            .setDesc('Default height on mobile devices (e.g. 350px)')
            .addText(text => text
                .setValue(this.plugin.settings.defaultMobileBlockHeight || "350px")
                .onChange(async (value) => {
                    this.plugin.settings.defaultMobileBlockHeight = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Border Width')
            .setDesc('Thickness of the plot border (px)')
            .addSlider(slider => slider
                .setLimits(0, 10, 1)
                .setValue(parseInt(this.plugin.settings.borderWidth) || 1)
                .onChange(async (value) => {
                    this.plugin.settings.borderWidth = value + "px";
                    await this.plugin.saveSettings();
                })
                .setDynamicTooltip());

        new Setting(containerEl)
            .setName('Border Color')
            .setDesc('Color of the plot border')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.borderColor)
                .onChange(async (value) => {
                    this.plugin.settings.borderColor = value;
                    await this.plugin.saveSettings();
                }));

        // --- Visual Style ---
        containerEl.createEl('h3', { text: 'Visual Style' });

        new Setting(containerEl)
            .setName('Plot Font Size')
            .setDesc('Base font size for the plot labels and text (px)')
            .addSlider(slider => slider
                .setLimits(8, 24, 1)
                .setValue(this.plugin.settings.plotFontSize)
                .onChange(async (value) => {
                    this.plugin.settings.plotFontSize = value;
                    await this.plugin.saveSettings();
                })
                .setDynamicTooltip());

        new Setting(containerEl)
            .setName('Theme')
            .setDesc('Plotly theme to use by default')
            .addDropdown(dropdown => dropdown
                .addOption('plotly_dark', 'Dark')
                .addOption('plotly', 'Light')
                .addOption('ggplot2', 'ggplot2')
                .addOption('seaborn', 'Seaborn')
                .setValue(this.plugin.settings.theme)
                .onChange(async (value) => {
                    this.plugin.settings.theme = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Background Color')
            .setDesc('Background color of the plot area')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.plotBackgroundColor === "rgba(0, 0, 0, 0)" ? "#000000" : this.plugin.settings.plotBackgroundColor)
                .onChange(async (value) => {
                    this.plugin.settings.plotBackgroundColor = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default Curve Color')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.curveColor)
                .onChange(async (value) => {
                    this.plugin.settings.curveColor = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Grid Color')
            .setDesc('Color of the grid lines and axes')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.gridColor)
                .onChange(async (value) => {
                    this.plugin.settings.gridColor = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Text Color')
            .setDesc('Color of the plot labels and text')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.textColor)
                .onChange(async (value) => {
                    this.plugin.settings.textColor = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default Line Width')
            .setDesc('Thickness of the curves (px)')
            .addSlider(slider => slider
                .setLimits(1, 10, 0.5)
                .setValue(this.plugin.settings.lineWidth)
                .onChange(async (value) => {
                    this.plugin.settings.lineWidth = value;
                    await this.plugin.saveSettings();
                })
                .setDynamicTooltip());

        new Setting(containerEl)
            .setName('3D Color Scale')
            .setDesc('Color scale for 3D surfaces and vector fields')
            .addDropdown(dropdown => dropdown
                .addOption('Viridis', 'Viridis')
                .addOption('Portland', 'Portland')
                .addOption('Plasma', 'Plasma')
                .addOption('Electric', 'Electric')
                .addOption('Hot', 'Hot')
                .addOption('Jet', 'Jet')
                .setValue(this.plugin.settings.colorscale3D)
                .onChange(async (value) => {
                    this.plugin.settings.colorscale3D = value;
                    await this.plugin.saveSettings();
                }));

        // --- Defaults ---
        containerEl.createEl('h3', { text: 'Graph Defaults' });

        new Setting(containerEl)
            .setName('Default Range Min')
            .setDesc('Starting value for range if not specified')
            .addSlider(slider => slider
                .setLimits(-100, 100, 1)
                .setValue(this.plugin.settings.defaultRangeMin)
                .onChange(async (value) => {
                    this.plugin.settings.defaultRangeMin = value;
                    await this.plugin.saveSettings();
                })
                .setDynamicTooltip());

        new Setting(containerEl)
            .setName('Default Range Max')
            .setDesc('Ending value for range if not specified')
            .addSlider(slider => slider
                .setLimits(-100, 100, 1)
                .setValue(this.plugin.settings.defaultRangeMax)
                .onChange(async (value) => {
                    this.plugin.settings.defaultRangeMax = value;
                    await this.plugin.saveSettings();
                })
                .setDynamicTooltip());

        // --- Performance ---
        containerEl.createEl('h3', { text: 'Performance' });

        new Setting(containerEl)
            .setName('Render Quality')
            .setDesc('Higher values = smoother plots but slower (Default: 40)')
            .addSlider(slider => slider
                .setLimits(10, 100, 5)
                .setValue(this.plugin.settings.renderQuality)
                .onChange(async (value) => {
                    this.plugin.settings.renderQuality = value;
                    await this.plugin.saveSettings();
                })
                .setDynamicTooltip());
    }
}