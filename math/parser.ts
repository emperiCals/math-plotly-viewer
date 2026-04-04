import { ParseResult, ParameterDef, PlotDef } from "../types";
import { RESERVED_KEYWORDS, GLOBAL_KEYWORDS } from "../constants";

const smartSplit = (str: string, delimiter: string): string[] => {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === '(' || char === '[' || char === '{') depth++;
        else if (char === ')' || char === ']' || char === '}') depth--;
        if (char === delimiter && depth === 0) {
            if (current.trim() !== '') parts.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim() !== '') parts.push(current.trim());
    return parts;
};

const getVariables = (exprs: string[]): Set<string> => {
    const vars = new Set<string>();
    exprs.forEach(expr => {
        try {
            if (window.math) {
                window.math.parse(expr).traverse((node: any) => {
                    if (node.type === 'SymbolNode' && !window.math[node.name]) {
                        vars.add(node.name);
                    }
                });
            }
        } catch (e) { }
    });
    return vars;
};

export function parseScript(source: string): ParseResult {
    try {
        const math = window.math;
        const lines = source.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) throw { code: "ERR_EMPTY", message: "Source is empty." };

        const globalConfig: Record<string, string> = {};
        const parametersMap = new Map<string, ParameterDef>();
        const plotDefs: PlotDef[] = [];

        const paramKeys = [
            'range', 'domain', 'step', 'samples', 'size', 'theme', 'color', 
            'text', 'title', 'grid', 'width', 'height', 'linewidth', 'lw',
            'xrange', 'yrange', 'zrange', 'trange', 'phirange', 'thetarange',
            'xstep', 'ystep', 'zstep', 'tstep', 'phistep', 'thetastep'
        ];

        lines.forEach((line) => {
            const parts = smartSplit(line, ',');
            const localConfig: Record<string, string> = {};
            let equationRaw = "";
            let processedParams = false;

            parts.forEach((part) => {
                const eqIdx = part.indexOf('=');
                let processed = false;

                if (eqIdx > -1) {
                    const key = part.substring(0, eqIdx).trim().toLowerCase();
                    const val = part.substring(eqIdx + 1).trim();

                    if (key === 'parameter' || key === 'param') {
                        processed = true;
                        processedParams = true;
                        const inner = val.replace(/[\[\]]/g, '');
                        const pParts = inner.split(',').map(s => s.trim());

                        if (pParts.length < 3) throw { code: "ERR_PARAM_FMT", message: `Invalid parameter format: '${val}'. Expected [name, min, max, step?]` };

                        const name = pParts[0];
                        if (RESERVED_KEYWORDS.has(name)) throw { code: "ERR_RESERVED", message: `Parameter name '${name}' is reserved.` };
                        if (!isNaN(Number(name))) throw { code: "ERR_PARAM_NAME", message: `Parameter name '${name}' cannot be a number.` };

                        const val1 = parseFloat(pParts[1]);
                        const val2 = parseFloat(pParts[2]);
                        const step = pParts[3] ? parseFloat(pParts[3]) : Math.abs(val2 - val1) / 50;

                        if (isNaN(val1) || isNaN(val2)) throw { code: "ERR_PARAM_VAL", message: `Invalid numeric range for parameter '${name}'` };

                        const min = Math.min(val1, val2);
                        const max = Math.max(val1, val2);

                        parametersMap.set(name, {
                            name, min, max,
                            step: isNaN(step) ? (max - min) / 50 : step,
                            value: min
                        });
                    }
                    else if (paramKeys.includes(key)) {
                        processed = true;
                        if (GLOBAL_KEYWORDS.has(key)) {
                            globalConfig[key] = val;
                        } else {
                            localConfig[key] = val;
                        }
                    }
                }

                if (!processed) {
                    if (!equationRaw) equationRaw = part.trim();
                }
            });

            if (equationRaw) {
                const parametricMatch = equationRaw.match(/^\[(.*)\]$/);
                const isArrayInput = !!parametricMatch;
                const arrayExprs = isArrayInput ? smartSplit(parametricMatch[1], ',') : [];
                const variables = isArrayInput ? getVariables(arrayExprs) : getVariables([equationRaw]);

                parametersMap.forEach((_, name) => variables.delete(name));

                const isEquationR = equationRaw.split('=')[0].trim() === 'r';
                const isEquationRho = equationRaw.split('=')[0].trim() === 'rho';

                let type = 'explicit2d';
                let equation = equationRaw;

                const has = (v: string) => variables.has(v);

                if (isArrayInput) {
                    if (has('t') && !has('x') && !has('y')) {
                        type = arrayExprs.length >= 3 ? 'parametric3d' : 'parametric2d';
                    } else if (has('x') || has('y') || has('z')) {
                        type = arrayExprs.length >= 3 ? 'vector3d' : 'vector2d';
                    }
                } else {
                    let isImplicit = equationRaw.includes('=');
                    if (isEquationR) isImplicit = false;
                    if (isEquationRho) isImplicit = false;

                    if (has('phi') || has('rho') || isEquationRho) type = 'spherical';
                    else if (isEquationR && (has('z') || equationRaw.includes('z'))) type = 'cylindrical';
                    else if (has('theta') || isEquationR) type = 'polar';
                    else if (isImplicit) {
                        const sides = equationRaw.split('=');
                        if (sides.length === 2) equation = `${sides[0]} - (${sides[1]})`;
                        type = equation.includes('z') ? 'implicit3d' : 'implicit2d';
                    }
                    else if (equation.includes('z') || (has('x') && has('y'))) type = 'explicit3d';
                    else type = 'explicit2d';
                }

                if (type === 'spherical' && equationRaw.includes('=')) equation = equationRaw.split('=')[1];
                if (type === 'cylindrical' && equationRaw.includes('=')) equation = equationRaw.split('=')[1];
                if (type === 'polar' && equationRaw.includes('=')) equation = equationRaw.split('=')[1];

                const compiled: Record<string, any> = {};
                if (isArrayInput) {
                    if (arrayExprs[0]) compiled.x = math.compile(arrayExprs[0]);
                    if (arrayExprs[1]) compiled.y = math.compile(arrayExprs[1]);
                    if (arrayExprs[2]) compiled.z = math.compile(arrayExprs[2]);
                } else {
                    compiled.main = math.compile(equation);
                }

                plotDefs.push({ type, equation, arrayExprs, config: localConfig, compiled });
            }
        });

        if (plotDefs.length === 0 && parametersMap.size === 0) {
            throw { code: "ERR_NO_EQ", message: "No equation found." };
        }

        return {
            globalConfig,
            plots: plotDefs,
            parameters: Array.from(parametersMap.values())
        };

    } catch (e: any) {
        return {
            globalConfig: {}, plots: [], parameters: [],
            error: e.code ? e : { code: "ERR_PARSE", message: e.message }
        };
    }
}