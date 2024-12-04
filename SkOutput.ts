/**
 * SkSFL amalgamate file
 * GitHub: https://github.com/x5ilky/SkSFL
 * Created: 15:49:31 GMT+1100 (澳大利亚东部夏令时间)
 * Modules: SkAn, SkLg
 * 
 * Created without care by x5ilky
 */

// (S)il(k) (An)si

export const Ansi = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    italic: "\x1b[3m",
    underline: "\x1b[4m",
    inverse: "\x1b[7m",
    hidden: "\x1b[8m",
    strikethrough: "\x1b[9m",
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    gray: "\x1b[90m",
    grey: "\x1b[90m",
    blackBright: "\x1b[90m",
    redBright: "\x1b[91m",
    greenBright: "\x1b[92m",
    yellowBright: "\x1b[93m",
    blueBright: "\x1b[94m",
    magentaBright: "\x1b[95m",
    cyanBright: "\x1b[96m",
    whiteBright: "\x1b[97m",
    bgBlack: "\x1b[40m",
    bgRed: "\x1b[41m",
    bgGreen: "\x1b[42m",
    bgYellow: "\x1b[43m",
    bgBlue: "\x1b[44m",
    bgMagenta: "\x1b[45m",
    bgCyan: "\x1b[46m",
    bgWhite: "\x1b[47m",
    bgGray: "\x1b[100m",
    bgGrey: "\x1b[100m",
    bgBlackBright: "\x1b[100m",
    bgRedBright: "\x1b[101m",
    bgGreenBright: "\x1b[102m",
    bgYellowBright: "\x1b[103m",
    bgBlueBright: "\x1b[104m",
    bgMagentaBright: "\x1b[105m",
    bgCyanBright: "\x1b[106m",
    bgWhiteBright: "\x1b[107m",

    // 24-bit
    rgb: (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`,
    bgRgb: (r: number, g: number, b: number) => `\x1b[48;2;${r};${g};${b}m`,

    rgbHex: (_hex: string) => "",
    bgRgbHex: (_hex: string) => "",

    cursor: {
        // Move the cursor up by n lines
        moveUp: (n: number) => `\x1b[${n}A`,

        // Move the cursor down by n lines
        moveDown: (n: number) => `\x1b[${n}B`,

        // Move the cursor forward by n columns
        moveForward: (n: number) => `\x1b[${n}C`,

        // Move the cursor backward by n columns
        moveBackward: (n: number) => `\x1b[${n}D`,

        // Move the cursor to a specific position (row, column)
        moveTo: (row: number, col: number) => `\x1b[${row};${col}H`,

        // Save the current cursor position
        savePosition: () => `\x1b[s`,

        // Restore the saved cursor position
        restorePosition: () => `\x1b[u`,
    },
    // Clear the screen and move the cursor to the top-left
    clearScreen: () => `\x1b[2J`,

    // Clear the current line from the cursor to the end
    clearLineToEnd: () => `\x1b[0K`,

    // Clear the current line from the cursor to the beginning
    clearLineToStart: () => `\x1b[1K`,

    // Clear the entire current line
    clearLine: () => `\x1b[2K`,
};

Ansi.rgbHex = (hex: string) => Ansi.rgb(...hexToRgb(hex));
Ansi.bgRgbHex = (hex: string) => Ansi.bgRgb(...hexToRgb(hex));

function hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)!;
    return [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
    ] as const;
}





export type LoggerTag = {
    name: string,
    color: [number, number, number],
    priority: number
}
export type LoggerConfig = {
    prefixTags?: LoggerTag[];
    suffixTags?: LoggerTag[];
    levels?: {[level: number]: LoggerTag};
    
    tagPrefix?: string;
    tagSuffix?: string;

    startTag?: LoggerTag;
    endTag?: LoggerTag;

    hideThreshold?: number;
}

export class Logger {
    config: LoggerConfig;
    maxTagLength: number;
    constructor(config: LoggerConfig) {
        this.config = config;
        this.config.hideThreshold ??= 0;
        this.config.levels ??= {
            0: {color: [77, 183, 53], name: "DEBUG", priority: 0},
            10: {color: [54, 219, 180], name: "INFO", priority: 10},
            20: {color: [219, 158, 54], name: "WARN", priority: 20},
            30: {color: [219, 54, 54], name: "ERROR", priority: 30}
        };
        this.config.tagPrefix ??= "[";
        this.config.tagSuffix ??= "]";

        this.config.startTag ??= {
            color: [219, 197, 54],
            name: "START",
            priority: -10
        };
        this.config.endTag ??= {
            color: [82, 219, 54],
            name: "END",
            priority: -10
        };
        this.maxTagLength = Math.max(
            this.config.startTag!.name.length,
            this.config.endTag!.name.length,
            ...Object.values(this.config.levels!).map(a => a.name.length),
            ...this.config.prefixTags?.map(a => a.name.length) ?? [],
            ...this.config.suffixTags?.map(a => a.name.length) ?? []
        ) + this.config.tagPrefix!.length + this.config.tagSuffix!.length;
    }

    // deno-lint-ignore no-explicit-any
    printWithTags(tags: LoggerTag[], ...args: any[]) {
        const tag = (a: LoggerTag) => {
            const raw = `${this.config.tagPrefix}${a.name}${this.config.tagSuffix}`.padEnd(this.maxTagLength, " ");
            return `${Ansi.rgb(a.color[0], a.color[1], a.color[2])}${raw}${Ansi.reset}`;
        }
        console.log(`${tags.map((a) => tag(a).padStart(this.maxTagLength, "#")).join(' ')} ${args.join(' ')}`);
    }

    // deno-lint-ignore no-explicit-any
    info(...args: any[]) {
        this.printWithTags(
            [
                ...(this.config.prefixTags ?? []),
                this.config.levels![10]
            ],
            ...args
        )
    }

    // deno-lint-ignore no-explicit-any
    debug(...args: any[]) {
        this.printWithTags(
            [
                ...(this.config.prefixTags ?? []),
                this.config.levels![0]
            ],
            ...args
        )
    }

    // deno-lint-ignore no-explicit-any
    warn(...args: any[]) {
        this.printWithTags(
            [
                ...(this.config.prefixTags ?? []),
                this.config.levels![20]
            ],
            ...args
        )
    }

    // deno-lint-ignore no-explicit-any
    error(...args: any[]) {
        this.printWithTags(
            [
                ...(this.config.prefixTags ?? []),
                this.config.levels![30]
            ],
            ...args
        )
    }

    // deno-lint-ignore no-explicit-any
    log(level: number, ...args: any[]) {
        this.printWithTags(
            [
                ...(this.config.prefixTags ?? []),
                this.config.levels![level]
            ],
            ...args
        )
    }

    start(level: number, ...args: string[]) {
        this.printWithTags(
            [
                ...(this.config.prefixTags ?? []),
                this.config.levels![level],
                this.config.startTag!
            ],
            ...args
        )
    }
    end(level: number, ...args: string[]) {
        this.printWithTags(
            [
                ...(this.config.prefixTags ?? []),
                this.config.levels![level],
                this.config.endTag!
            ],
            ...args
        )
    }
}

export const LogLevel = {
    DEBUG: 0,
    INFO: 10,
    WARN: 20,
    ERROR: 30
}
