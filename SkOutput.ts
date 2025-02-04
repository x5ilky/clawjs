/**
 * SkSFL amalgamate file
 * GitHub: https://github.com/x5ilky/SkSFL
 * Created: 16:54:14 GMT+1100 (澳大利亚东部夏令时间)
 * Modules: SkAn, SkLg, SkLp, SkAr, SkAp
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
    prefixTags: LoggerTag[];
    suffixTags: LoggerTag[];
    levels: {[level: number]: LoggerTag};
    
    tagPrefix: string;
    tagSuffix: string;

    startTag: LoggerTag;
    endTag: LoggerTag;

    hideThreshold: number;
}

export class Logger {
    config: LoggerConfig;
    maxTagLength: number;
    constructor(config: Partial<LoggerConfig>) {
        this.config = config as LoggerConfig;
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
        );
    }

    // deno-lint-ignore no-explicit-any
    debug(...args: any[]) {
        this.printWithTags(
            [
                ...(this.config.prefixTags ?? []),
                this.config.levels![0]
            ],
            ...args
        );
    }

    // deno-lint-ignore no-explicit-any
    warn(...args: any[]) {
        this.printWithTags(
            [
                ...(this.config.prefixTags ?? []),
                this.config.levels![20]
            ],
            ...args
        );
    }

    // deno-lint-ignore no-explicit-any
    error(...args: any[]) {
        this.printWithTags(
            [
                ...(this.config.prefixTags ?? []),
                this.config.levels![30]
            ],
            ...args
        );
    }

    // deno-lint-ignore no-explicit-any
    log(level: number, ...args: any[]) {
        this.printWithTags(
            [
                ...(this.config.prefixTags ?? []),
                this.config.levels![level]
            ],
            ...args
        );
    }

    start(level: number, ...args: string[]) {
        this.printWithTags(
            [
                ...(this.config.prefixTags ?? []),
                this.config.levels![level],
                this.config.startTag!
            ],
            ...args
        );
    }
    end(level: number, ...args: string[]) {
        this.printWithTags(
            [
                ...(this.config.prefixTags ?? []),
                this.config.levels![level],
                this.config.endTag!
            ],
            ...args
        );
    }
}

export const LogLevel = {
    DEBUG: 0,
    INFO: 10,
    WARN: 20,
    ERROR: 30
};

type EZPScanner<T, O, V = O> = (ezp: EZP<T, O>) => V;
export type EZPRule<TokenType, NodeType, V = NodeType> = {
  target: string;
  scanner: EZPScanner<TokenType, NodeType, V>;
};
export class EZPError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
    }
}
type ApplyTypePredicate<T, E> = (T extends (value: E) => value is (infer R extends E) ? R : E) ;

export class EZP<TokenType, NodeType> {
    tokens: TokenType[];
    output: NodeType[];
    targetRules: EZPRule<TokenType, NodeType>[];
    last: TokenType;

    
    constructor(tokens: TokenType[], private options: {
        getLoc?: (token: TokenType) => [string, number, number],
        customError?: (error: string, token: TokenType) => Error
    }) {
        this.tokens = tokens;
        this.output = [];
        this.targetRules = [];
        this.last = tokens[0];
        this.options.customError ??= (error) => new Error(error);
    }

    addRule(target: string, scanner: EZPScanner<TokenType, NodeType>): EZPRule<TokenType, NodeType> {
        let v;
        this.targetRules.push(v = {
            target,
            scanner
        });
        return v;
    }

    instantiateRule<I extends TokenType, O extends NodeType>(target: string, scanner: EZPScanner<I, O>): EZPRule<I, O> {
        return {
            target,
            scanner
        }
    }

    instantiateHelper<I extends TokenType, O>(target: string, scanner: EZPScanner<I, NodeType, O>): EZPRule<I, NodeType, O> {
        return {
            target,
            scanner
        }
    }
    
    parse() {
        while (this.tokens.length) {
            const err = this.parseOnce();
            if (err !== true) {
                let message = `Failed to parse, expected:\n`;
                for (const r of this.targetRules) {
                    message += `  ${r.target}\n`;
                }
                message += err.map(a => a.message + "\n").join("");
                message += `But instead got ${JSON.stringify(this.tokens[0])}`;
                return this.options.customError!(message, this.tokens[0]);
            }
        }
        return this.output;
    }
    parseOnce() {
        // deno-lint-ignore no-explicit-any
        const errors: any[] = [];
        for (const r of this.targetRules) {
            try {
                this.output.push(this.expectRule(r));
                return true;
            } catch (e) {
                // pass
                errors.push(e)
            }
        }
        return errors
    }
    /**
     * Eats the first token
     * !!! ONLY USE THIS FUNCTION IF YOU ARE SURE THERE IS A TOKEN
     * @returns The first token in the stream
     */
    consume(): TokenType {
        return this.tokens.shift()!;
    }
    peek(): TokenType {
        return this.tokens[0];
    }
    peekAnd(test: (t: TokenType) => boolean) {
        return this.peek() !== undefined && test(this.peek());
    }
    expect<O extends TokenType, F extends (token: TokenType) => unknown>(pred: F): ApplyTypePredicate<F, O> {
        if (this.tokens.length === 0) throw new EZPError("Not enough elements");
        let t;
        if (!pred(t = this.tokens.shift()!)) throw new EZPError("mismatch")
        return t as ApplyTypePredicate<F, O>;
    }
    expectOrTerm<O extends TokenType, F extends (token: TokenType) => unknown>(error: string, pred: F): ApplyTypePredicate<F, O> {
        if (this.tokens.length === 0) throw this.options.customError!(error, this.last);
        let t;
        if (!pred(t = this.tokens.shift()!)) throw this.options.customError!(error, this.last);
        return t as ApplyTypePredicate<F, O>;
    }
    expectRule<O extends NodeType, V = O>(rule: EZPRule<TokenType, O, V>): V {
        const prevTokens = structuredClone(this.tokens);
        const prevNodes = structuredClone(this.output);
        try {
            const ezp = new EZP<TokenType, O>(this.tokens, this.options);
            const value = rule.scanner(ezp) as V;
            this.tokens = ezp.tokens;
            return value;
        } catch (e) {
            if (e instanceof EZPError) {
                this.tokens = prevTokens;
                this.output = prevNodes;
                let errMsg = `Expected rule ${rule.target}:\n${e.message}`;
                if (this.options.getLoc !== undefined) {
                    const [fp, ln, col] = this.options.getLoc(this.tokens[0]);
                    errMsg = `At ${fp}:${ln}:${col}: ${errMsg}`
                }
                throw new EZPError(errMsg);
            } 
            throw e;
        }
    }
    
    expectRuleOrTerm<O extends NodeType, V>(error: string, rule: EZPRule<TokenType, O, V>): V {
        try {
            const ezp = new EZP<TokenType, O>(this.tokens, this.options);
            const value = rule.scanner(ezp) as V;
            this.tokens = ezp.tokens;
            return value;
        } catch (e) {
            let errMsg = error;
            if (this.options.getLoc !== undefined && this.tokens.length) {
                const [fp, ln, col] = this.options.getLoc(this.tokens[0]);
                errMsg = `At ${fp}:${ln}:${col}: ${errMsg}`
            }
            throw this.options.customError!(errMsg + "\n" + (e as Error)?.message, this.tokens[0]);
        }
    }
    getFirstThatWorks<O extends NodeType>(...rules: EZPRule<TokenType, O>[]): O {
        for (const r of rules) {
            try {
                const v = this.expectRule(r) as O;
                return v;
            } catch {
                // nothing
            }
        }
        throw new EZPError("None worked")
    }
    getFirstThatWorksOrTerm<O extends NodeType>(error: string, ...rules: EZPRule<TokenType, O>[]): O {
        const errors = [];
        for (const r of rules) {
            try {
                const v = this.expectRule(r) as O;
                return v;
            } catch (e) {
                // nothing
                if (e instanceof Error && !(e instanceof EZPError)) {
                    errors.push(e)
                }
            }
        }
        throw this.options.customError!(error + errors, this.tokens[0]);
    }

    tryRule<O extends NodeType>(rule: EZPRule<TokenType, O>): O | null {
        const prevTokens = structuredClone(this.tokens);
        const prevNodes = structuredClone(this.output);
        try {
            const ezp = new EZP<TokenType, O>(this.tokens, this.options);
            const value = rule.scanner(ezp) as O;
            this.output.push(value);
            this.tokens = ezp.tokens;
            return value;
        } catch {
            this.tokens = prevTokens;
            this.output = prevNodes;
            return null;
        }
    }
    thisOrIf<O extends NodeType>(value: O, pred: (token: TokenType) => boolean, cb: (token: TokenType) => O): O {
        if (this.tokens.length && pred(this.tokens[0])) {
            return cb(this.tokens.shift()!);
        }
        return value;
    }
    
    doesNext(pred: (token: TokenType) => boolean): boolean {
        return this.tokens.length ? pred(this.tokens[0]) : false;
    }
}

// (S)il(k) (Ar)ray Tools

export function arrzip<T, U>(a: T[], n: U[]): [T, U][] {
    const max = Math.max(a.length, n.length);
    const out: [T, U][] = [];
    for (let i = 0; i < max; i++) {
        out.push([a?.[i], n?.[i]])
    }
    return out
}

export function arreq<T, U>(a: T[], b: U[], eq: (a: T, b: U) => boolean) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (!eq(a[i], b[i])) return false;
    }
    return true;
}

// (S)il(k) (A)rgument (P)arser



// deno-lint-ignore no-namespace
export namespace skap {
    type ParseSettings = {
        customError: (error: string) => void;
    };

    type SkapRequired<T extends SkapArgument> = T & {__required: true};
    type SkapMulti<T extends SkapArgument>  = T & {__multi: true};
    type SkapOptional<T extends SkapArgument> = (T extends SkapRequired<infer U> ? U : T) & {__required: false};
    type SkapArgument = 
        SkapString<string> 
      | SkapNumber<string>
      | SkapBoolean<string>
      | SkapPositional<number>
      | SkapRest
      | SkapKV
      | SkapSubcommand<SkapSubcommandShape>;
    function isNotSkapSubcommand<T extends SkapArgument>(arg: T): arg is Exclude<T, SkapSubcommand<SkapSubcommandShape>> {
        return !(arg instanceof SkapSubcommand);
    }
    type SkapCommandShape = {[name: string]: SkapArgument};
    type SkapSubcommandShape = {[name: string]: SkapCommand<SkapCommandShape>};

    export type SkapInfer<T extends SkapCommand<SkapCommandShape>> = {
        [K in keyof T["shape"]]: 
            T["shape"][K] extends SkapArgument
          ? SkapInferArgument<T["shape"][K]>
          : never
    };
    type SkapInferArgument<T extends SkapArgument> = 
        T extends SkapMulti<infer U extends SkapArgument>
      ? (SkapInferArgument<U>)[]
      : T extends SkapRequired<infer U extends SkapArgument>
      ? Require<SkapInferArgument<U>>
      : T extends SkapKV
      ? { key: string, value: string } | undefined
      : T extends SkapString<string> 
      ? string | undefined 
      : T extends SkapPositional<number> 
      ? string | undefined 
      : T extends SkapNumber<string>
      ? number | undefined
      : T extends SkapBoolean<string>
      ? boolean
      : T extends SkapSubcommand<infer U extends SkapSubcommandShape> ? {commands: {
            [K in keyof U]: SkapInfer<U[K]> | undefined
        }, selected: keyof U}
      : T extends SkapRest
      ? string[]
      : never;
    type Require<T> = Exclude<T, undefined>;

    /**
     * Creates a SkapCommand instance: e.g.
     * ```ts
     * const shape = skap.command({
     *     speed: skap.number().required(),
     *     foo: skap.boolean()
     * });
     * ```
     * @param shape Shape of the command, similar to zod
     * @returns above
     */
    export function command<T extends SkapCommandShape>(shape: T, description: string = ""): SkapCommand<T> {
        return new SkapCommand(shape, description);
    }
    /**
     * Creates a SkapSubcommand instance: e.g.
     * ```ts
     * skap.command({
     *     subc: skap.subcommand({
     *         build: skap.command({ ... })
     *     })
     * })
     * @param shape Shape of subcommand
     * @returns 
     */
    export function subcommand<T extends SkapSubcommandShape>(shape: T, description: string = ""): SkapSubcommand<T> {
        return new SkapSubcommand(shape, description);
    }
    export function string<T extends string>(name: T): SkapString<T> {
        return new SkapString(name);
    }
    export function kv(initial: string): SkapKV {
        return new SkapKV(initial);
    }
    export function number<T extends string>(name: T): SkapNumber<T> {
        return new SkapNumber(name);
    }
    export function boolean<T extends string>(name: T): SkapBoolean<T> {
        return new SkapBoolean(name);
    }
    /**
     * 
     * @param index Order of positional argument
     * @returns SkapPositional instance
     */
    export function positional<T extends number>(index: T): SkapPositional<number> {
        return new SkapPositional(index);
    }
    /**
     * Like {@link SkapPositional} except it gives all the unused positional arguments
     * @returns SkapRest instance
     */
    export function rest(): SkapRest {
        const r = new SkapRest();
        return r;
    }
    class SkapString<T extends string> {
        name: T;
        __default: string | undefined;
        __description: string;
        __required: boolean;
        __multi: boolean;
        constructor(name: T, description: string = "", required: boolean = false) {
            this.name = name;
            this.__description = description;
            this.__required = required;
            this.__multi = false;

            this.__default = undefined;
        }

        required(): SkapRequired<SkapString<T>> {
            this.__required = true;
            return this as SkapRequired<SkapString<T>>;
        }
        optional(): SkapOptional<this> {
            this.__required = false;
            return this as SkapOptional<this>;
        }
        description(description: string): this {
            this.__description = description;
            return this;
        }
        default(value: string): SkapRequired<this> {
            this.__default = value;
            return  this as SkapRequired<this>;
        }
        multi(): SkapMulti<this> {
            this.__multi = true;
            return this as SkapMulti<this>;
        }
    }
    class SkapKV {
        name: string;
        __default: {key: string, value: string} | undefined;
        __description: string;
        __required: boolean;
        __multi: boolean;
        constructor(initial: string, description: string = "", required: boolean = false) {
            this.name = initial;
            this.__description = description;
            this.__required = required;
            this.__multi = false;

            this.__default = undefined;
        }

        required(): SkapRequired<this> {
            this.__required = true;
            return this as SkapRequired<this>;
        }
        optional(): SkapOptional<this> {
            this.__required = false;
            return this as SkapOptional<this>;
        }
        description(description: string): this {
            this.__description = description;
            return this;
        }
        default(value: {key: string, value: string}): SkapRequired<this> {
            this.__default = value;
            return  this as SkapRequired<this>;
        }
        multi(): SkapMulti<this> {
            this.__multi = true;
            return this as SkapMulti<this>;
        }
    }
    class SkapNumber<T extends string> {
        name: T;
        __description: string;
        __default: number | undefined;
        __required: boolean;
        __multi: boolean;
        constructor(name: T, description: string = "", required: boolean = false) {
            this.name = name;
            this.__description = description;
            this.__required = required;
            this.__default = 0;
            this.__multi = false;
        }

        required(): SkapRequired<SkapNumber<T>> {
            this.__required = true;
            return this as SkapRequired<SkapNumber<T>>;
        }
        optional(): SkapOptional<this> {
            this.__required = false;
            return this as SkapOptional<this>;
        }
        description(description: string): this {
            this.__description = description;
            return this;
        }
        default(value: number): SkapRequired<this> {
            this.__default = value;
            return this as SkapRequired<this>;
        }
        multi(): SkapMulti<this> {
            this.__multi = true;
            return this as SkapMulti<this>;
        }
    }
    class SkapBoolean<T extends string> {
        name: T;
        __description: string;
        __required: boolean;
        constructor(name: T, description: string = "", required: boolean = false) {
            this.name = name;
            this.__description = description;
            this.__required = required;
        }
        description(description: string): this {
            this.__description = description;
            return this;
        }
    }
    class SkapPositional<T extends number> {
        name: T;
        __description: string;
        __required: boolean;
        constructor(index: T, description: string = "", required: boolean = false) {
            this.name = index;
            this.__description = description;
            this.__required = required;
        }

        required(): SkapRequired<this> {
            this.__required = true;
            return this as SkapRequired<this>;
        }
        optional(): SkapOptional<this> {
            this.__required = false;
            return this as SkapOptional<this>;
        }
        description(description: string): this {
            this.__description = description;
            return this;
        }
    }
    class SkapRest {
        __description: string;
        __required: boolean;
        constructor(description: string = "", required: boolean = false) {
            this.__description = description;
            this.__required = required;
        }

        description(description: string): this {
            this.__description = description;
            return this;
        }
    }
    class SkapSubcommand<T extends SkapSubcommandShape = SkapSubcommandShape> {
        shape: T;
        __description: string;
        __required: boolean;
        constructor(shape: T, description: string = "", required: boolean = false) {
            this.shape = shape;
            this.__description = description;
            this.__required = required;
        }
        required(): SkapRequired<SkapSubcommand<T>> {
            this.__required = true;
            return this as SkapRequired<SkapSubcommand<T>>;
        }
        optional(): SkapOptional<SkapSubcommand<T>> {
            this.__required = false;
            return this as SkapOptional<SkapSubcommand<T>>;
        }
    }
    class SkapCommand<T extends SkapCommandShape> {
        shape: T;
        __description: string;
        constructor(shape: T, description: string) {
            SkapCommand.check(shape);
            this.shape = shape;
            this.__description = description;
        }
        static check(shape: SkapCommandShape) {
            let subcs = 0;
            let rest = 0;
            for (const argName in shape) {
                if (shape[argName] instanceof SkapSubcommand) {
                    subcs++;
                    if (subcs > 1) {
                        throw new Error("SkAp: Only one subcommand is allowed");
                    }
                    for (const subcommandName in shape[argName].shape) {
                        SkapCommand.check(shape[argName].shape[subcommandName].shape);
                    }
                }
                if (shape[argName] instanceof SkapRest) {
                    if (subcs) {
                        throw new Error("SkAp: Cannot have subcommands and rest arguments due to confusion")
                    }
                    rest++;
                    if (rest > 1) {
                        throw new Error("SkAp: Only one rest argument is allowed")
                    }
                }
            }
        }

        private emptyBase(): Partial<SkapInfer<this>> {
            // deno-lint-ignore no-explicit-any
            const out: any = {};
            for (const argName in this.shape) {
                const argShape = this.shape[argName];
                if (argShape instanceof SkapString) {
                    if (argShape.__multi) out[argName] = [];
                    else out[argName] = argShape.__default;
                } else if (argShape instanceof SkapKV) {
                    if (argShape.__multi) out[argName] = [];
                    else out[argName] = argShape.__default;
                } else if (argShape instanceof SkapNumber) {
                    if (argShape.__multi) out[argName] = [];
                    else out[argName] = argShape.__default;
                } else if (argShape instanceof SkapSubcommand) {
                    // deno-lint-ignore no-explicit-any
                    const commands: any = {};
                    for (const subcommandName in argShape.shape) {
                        commands[subcommandName] = argShape.shape[subcommandName].emptyBase();
                    }
                    out[argName] = {selected: undefined, commands: commands};
                } else if (argShape instanceof SkapBoolean) {
                    out[argName] = false;
                } else if (argShape instanceof SkapPositional) {
                    out[argName] = undefined;
                } else if (argShape instanceof SkapRest) {
                    out[argName] = [];
                }
            }
            return out;
        }
        private parseBase(args: string[], settings: ParseSettings): [SkapInfer<this>, string[]] {
            // deno-lint-ignore no-explicit-any
            const out: any = this.emptyBase();

            const positional = Object.entries(this.shape).filter(([a, b]) => b instanceof SkapPositional).toSorted(([_n, a], [_, b]) => (a as SkapPositional<number>).name - (b as SkapPositional<number>).name);
            const rest = Object.entries(this.shape).find(([b, a]) => a instanceof SkapRest);

            while (args.length) {
                const arg = args.shift();
                let did = false;
                for (const argName in this.shape) {
                    const argShape = this.shape[argName];
                    if (argShape instanceof SkapString) {
                        if (arg == argShape.name) {
                            if (argShape.__multi) out[argName].push(args.shift());
                            else out[argName] = args.shift();
                            did = true;
                        }
                    } else if (argShape instanceof SkapNumber) {
                        if (arg == argShape.name) {
                            try {
                                if (argShape.__multi) out[argName].push(Number(args.shift()));
                                else out[argName] = Number(args.shift());
                                did = true;
                            } catch (e) {
                                settings.customError!(`Invalid number argument ${argShape.name}`);
                            }
                        }
                    } else if (argShape instanceof SkapSubcommand) {
                        for (const subcommandName in argShape.shape) {
                            if (arg == subcommandName) {
                                const [subcommandOut, subcommandRest] = argShape.shape[subcommandName].parseBase(args, settings);
                                // deno-lint-ignore no-explicit-any
                                const o: any = {};
                                o[subcommandName] = subcommandOut;
                                out[argName] = {selected: subcommandName, commands: o};
                                args = subcommandRest;
                                break;
                            }
                        }
                        did = true;
                    } else if (argShape instanceof SkapBoolean) {
                        if (arg == argShape.name) {
                            out[argName] = true;
                            did = true;
                        }
                    } else if (argShape instanceof SkapKV) {
                        if (arg?.startsWith(argShape.name)) {
                            const [key, value] = arg.slice(argShape.name.length).split("=", 2);
                            if (argShape.__multi) out[argName].push({key, value});
                            else out[argName] = {key, value};
                            did = true;
                        }
                    }
                }
                if (!did) {
                    // check for positionals
                    if (positional.length) {
                        const [argName, _argShape] = positional.shift()!;
                        out[argName] = arg;
                    } else if (rest !== undefined) {
                        out[rest[0]].push(arg);
                    }
                    else {
                        settings.customError(`Too many arguments\n${this.usage()}`)
                    }
                }
            }
            

            for (const argName in this.shape) {
                const argShape = this.shape[argName];
                if (argShape instanceof SkapString) {
                    if (out[argName] === undefined && argShape.__required) {
                        settings.customError!(`Missing required string argument ${argShape.name}\n${this.usage()}`);
                    }
                } else if (argShape instanceof SkapNumber) {
                    if (out[argName] === undefined && argShape.__required) {
                        settings.customError!(`Missing required number argument ${argShape.name}\n${this.usage()}`);
                    }
                } else if (argShape instanceof SkapSubcommand) {
                    if (out[argName].selected === undefined && argShape.__required) {
                        settings.customError!(`Missing required subcommand for ${argName}\n${this.usage()}`);
                    }
                } else if (argShape instanceof SkapBoolean) {
                    // pass
                } else if (argShape instanceof SkapPositional) {
                    if (out[argName] === undefined && argShape.__required) {
                        settings.customError!(`Missing required positional argument for ${argName}\n${this.usage()}`);
                    }
                } else if (argShape instanceof SkapKV) {
                    if (out[argName] === undefined && argShape.__required) {
                        settings.customError!(`Missing required key-value argument for ${argName}\n${this.usage()}`);
                    }
                }
            }

            return [out as SkapInfer<this>, args];
        }
        parse(args: string[], settings: Partial<ParseSettings> = {

        }): SkapInfer<this> {
            if (settings.customError === undefined) {
                settings.customError = (error) => {
                    throw new Error(error);
                }
            }
            return this.parseBase(args, settings as ParseSettings)[0];
        }

        syntax(): string {
            let out = `${Ansi.italic}`;
            for (const argName in this.shape) {
                const argShape = this.shape[argName];
                if (argShape instanceof SkapString) {
                    if (!out.includes(" [options]")) {
                        out += ` [options]`;
                    }
                } else if (argShape instanceof SkapSubcommand) {
                    out += `${Ansi.reset}${Ansi.bold} <subcommand>`;
                } else if (argShape instanceof SkapPositional) {
                    out += `${Ansi.reset}${Ansi.italic} <${argName}>`
                } else if (argShape instanceof SkapRest) {
                    out += `${Ansi.reset}${Ansi.underline} <...${argName}>`
                }
            }
            out += `${Ansi.reset}\n`;
            return out;
        }
        usage(previous: string = "program"): string {
            let out = previous + this.syntax();
            const args = Object.keys(this.shape).filter(a => isNotSkapSubcommand(this.shape[a]));
            if (args.length > 0) {
                out += `${Ansi.blue}ARGUMENTS:\n${Ansi.reset}`;
                for (const arg of args) {
                    out += `${Ansi.reset}`;
                    if (this.shape[arg] instanceof SkapString) {
                        out += `  ${Ansi.bold}${this.shape[arg].name}${Ansi.reset} <string>`;
                    } else if (this.shape[arg] instanceof SkapKV) {
                        out += `  ${Ansi.bold}${this.shape[arg].name}${Ansi.reset}<key>=<value>`;
                    } else if (this.shape[arg] instanceof SkapNumber) {
                        out += `  ${Ansi.bold}${this.shape[arg].name}${Ansi.reset} <number>`;
                    } else if (this.shape[arg] instanceof SkapBoolean) {
                        out += `  ${Ansi.bold}${this.shape[arg].name}${Ansi.reset}`;
                    } else if (this.shape[arg] instanceof SkapPositional) {
                        out += `  ${Ansi.bold}<${arg}>${Ansi.reset}`
                    } else if (this.shape[arg] instanceof SkapRest) {
                        out += `  ${Ansi.bold}<...${arg}>${Ansi.reset}`;
                    }
                    if (this.shape[arg].__required) {
                        out += `${Ansi.red} (required)`;
                    } else {
                        out += `${Ansi.green} (optional)`;
                    }
                    if (this.shape[arg].__description) {
                        out += `\n${Ansi.reset}${Ansi.gray}    ${Ansi.italic}${this.shape[arg].__description}`;
                    }
                    out += `${Ansi.reset}\n`;
                }
            }
            const subcs = Object.keys(this.shape).filter(a => this.shape[a] instanceof SkapSubcommand);
            if (subcs.length > 0) {
                out += "SUBCOMMANDS:\n";
                for (const subc of subcs) {
                    const shape = this.shape[subc];
                    if (shape instanceof SkapSubcommand) {
                        for (const subcommand in shape.shape) {
                            out += `  ${subcommand}${shape.shape[subcommand].syntax()}`;
                            if (shape.shape[subcommand].__description !== "") {
                                out += `${Ansi.italic}    ${Ansi.italic}${shape.shape[subcommand].__description}${Ansi.reset}\n`
                            }
                        }
                    }
                }
            }
            return out;
        }

        description(description: string): this {
            this.__description = description;
            return this;
        }
    }
}
