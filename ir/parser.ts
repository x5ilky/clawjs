import type { Logger } from "../SkOutput.ts";
import type { SensingOperation, StopType } from "./types.ts";
import type { ScratchArgumentType } from "./types.ts";
import type { FileFormat } from "./types.ts";
import type { BuiltinValue, IlNode, ListValue } from "./types.ts";
import type { IlValue } from "./types.ts";
import { FORBIDDEN_VARIABLE_NAME_PREFIX } from "./convertor.ts";

export class IrParser {
    lines: string[];
    lineNumber: number;
    logger: Logger;
    constructor(str: string, logger: Logger) {
        this.lines = str.split("\n");
        this.lineNumber = 0;
        this.logger = logger;
    }

    public parse(): IlNode[] {
        const nodes = [];
        while (this.lines.length) {
            if (this.lines[0].trim() === "") {
                this.lines.shift();
                continue;
            }
            nodes.push(this.parseLabel());
        }
        return nodes;
    }

    private parseLabel(): IlNode {
        const [ln, indent] = this.getLine();
        if (indent > 0) {
            this.error("Label must start with no preceding whitespace");
            Deno.exit(1);
        }
        let name = "";
        let d = false;
        for (const ch of ln) {
            if (ch == ":") {
                d = true;
                break;
            }
            name += ch;
        }
        if (!d) {
            this.error("Label must end with colon");
            Deno.exit(1);
        }
        const nodes = [];
        while (true) {
            if (this.lines.length === 0) break;
            const [line, ind] = this.getLine();
            if (ind > 0) {
                if (line.trim().length === 0) continue;
                if (line.trim().startsWith(";")) continue;
                nodes.push(this.parseLine(line.replace(/\r/g, "")));
            } else if (line.trim() !== "") {
                this.lines.splice(0, 0, line);
                break;
            }
        }
        return {
            type: "Label",
            value: [name, nodes],
        };
    }
    private parseLine(str: string): IlNode {
        const chars = str.split("");
        const instr = this.getIdentifier(chars);
        switch (instr.toLowerCase()) {
            case "createvar":
                return {
                    type: "CreateVar",
                    name: this.getIdentifier(chars),
                    nooptimize: this.getIdentifier(chars) === "nooptimize",
                };
            case "createinstance":
                return {
                    type: "CreateInstanceVar",
                    target: this.getIdentifier(chars),
                    varName: this.getIdentifier(chars),
                };
            case "createinstancelist":
                return {
                    type: "CreateInstanceList",
                    target: this.getIdentifier(chars),
                    varName: this.getIdentifier(chars),
                };
            case "createbroadcast":
                return {
                    type: "CreateBroadcast",
                    name: this.getString(chars),
                };
            case "createlist":
                return {
                    type: "CreateList",
                    name: this.getIdentifier(chars),
                };
            case "createspr": {
                let id = this.getIdentifier(chars);
                if (id === "stage") {
                    id = this.getIdentifier(chars);
                }
                return {
                    type: "CreateSpr",
                    isStage: id === "stage",
                    id,
                    name: this.getString(chars),
                };
            }
            case "addcostume": {
                const id = this.getIdentifier(chars);
                const name = this.getIdentifier(chars);
                const type = ((type): FileFormat => {
                    switch (type) {
                        case "png":
                        case "bitmap":
                            return "PNG";
                        case "svg":
                        case "vector":
                            return "SVG";
                        default:
                            this.error(
                                "Invalid file format! Files have to be:",
                            );
                            this.error("\tBitmap - `png`, `bitmap`");
                            this.error("\tVector - `svg`, `vector`");
                            Deno.exit(1);
                    }
                })(this.getIdentifier(chars));
                const file = this.getString(chars);
                const anchorX = this.getNumber(chars);
                const anchorY = this.getNumber(chars);
                return {
                    type: "AddSprCostume",
                    id,
                    name,
                    file,
                    format: type,
                    anchorX,
                    anchorY,
                };
            }
            case "addsound": {
                const id = this.getIdentifier(chars);
                const name = this.getIdentifier(chars);
                const type = ((type) => {
                    switch (type) {
                        case "wav":
                            return "WAV";
                        case "mp3":
                            return "MP3";
                        default:
                            this.error(
                                "Invalid file format! Sounds have to be `wav` or `mp3`",
                            );
                            Deno.exit(1);
                    }
                })(this.getIdentifier(chars));
                const file = this.getString(chars);
                return {
                    type: "AddSprSound",
                    id,
                    name,
                    file,
                    format: type,
                };
            }
            case "flag":
                return {
                    type: "Flag",
                    target: this.getIdentifier(chars),
                    label: this.getLabel(chars),
                };
            case "keypress": {
                const target = this.getIdentifier(chars);
                const key = this.getString(chars);
                if (key.length > 1) {
                    if (
                        !([
                            "space",
                            "left arrow",
                            "up arrow",
                            "right arrow",
                            "down arrow",
                            "any",
                        ].includes(key))
                    ) {
                        this.error(`Invalid key in keypress: ${key}`);
                        Deno.exit(1);
                    }
                } else {
                    if (!/[a-z0-9]/.test(key)) {
                        this.error(`Invalid key in keypress: ${key}`);
                        Deno.exit(1);
                    }
                }
                const label = this.getLabel(chars);
                return {
                    type: "Keypress",
                    key,
                    label,
                    target,
                };
            }
            case "clicked":
                return {
                    type: "Clicked",
                    target: this.getIdentifier(chars),
                    label: this.getLabel(chars),
                };
            case "whenbroadcast":
                return {
                    type: "WhenBroadcast",
                    target: this.getIdentifier(chars),
                    name: this.getString(chars),
                    label: this.getLabel(chars),
                };
            case "broadcast":
                return {
                    type: "Broadcast",
                    value: this.getValue(chars),
                };
            case "broadcastwait":
                return {
                    type: "BroadcastWait",
                    value: this.getValue(chars),
                };

            case "forever":
                return {
                    type: "Forever",
                    label: this.getLabel(chars),
                };
            case "stop": {
                const type = ((s: string): StopType => {
                    switch (s) {
                        case "this":
                            return "ThisScript";
                        case "all":
                            return "All";
                        case "other":
                            return "OtherScripts";
                        default:
                            this.error("Invalid option for stop command!");
                            this.error(
                                "Valid ones are: `this`, `all`, and `other`",
                            );
                            Deno.exit(1);
                    }
                })(this.getIdentifier(chars));
                return {
                    type: "Stop",
                    stopType: type,
                };
            }
            case "wait":
                return {
                    type: "Wait",
                    time: this.getValue(chars),
                };
            case "waituntil":
                return {
                    type: "WaitUntil",
                    predicate: this.getValue(chars),
                };
            case "if":
                return {
                    type: "If",
                    predicate: this.getValue(chars),
                    label: this.getLabel(chars),
                };
            case "ifelse":
                return {
                    type: "IfElse",
                    predicate: this.getValue(chars),
                    label: this.getLabel(chars),
                    label2: this.getLabel(chars),
                };
            case "repeat":
                return {
                    type: "Repeat",
                    amount: this.getValue(chars),
                    label: this.getLabel(chars),
                };
            case "repeatuntil":
                return {
                    type: "RepeatUntil",
                    predicate: this.getValue(chars),
                    label: this.getLabel(chars),
                };
            case "clone":
                return {
                    type: "Clone",
                    target: this.getIdentifier(chars),
                };
            case "clonemyself":
                return {
                    type: "CloneMyself",
                };
            case "whenclone":
                return {
                    type: "WhenClone",
                    target: this.getIdentifier(chars),
                    label: this.getLabel(chars),
                };
            case "deleteclone":
                return {
                    type: "DeleteClone",
                };

            case "movesteps":
                return {
                    type: "Move",
                    steps: this.getValue(chars),
                };
            case "turnright":
                return {
                    type: "TurnRight",
                    degrees: this.getValue(chars),
                };
            case "turnleft":
                return {
                    type: "TurnLeft",
                    degrees: this.getValue(chars),
                };
            case "gotoxy":
                return {
                    type: "GotoXY",
                    x: this.getValue(chars),
                    y: this.getValue(chars),
                };
            case "glidetoxy":
                return {
                    type: "GlideToXY",
                    x: this.getValue(chars),
                    y: this.getValue(chars),
                    secs: this.getValue(chars),
                };
            case "setx":
                return {
                    type: "SetX",
                    value: this.getValue(chars),
                };
            case "sety":
                return {
                    type: "SetY",
                    value: this.getValue(chars),
                };

            case "changex":
                return {
                    type: "ChangeX",
                    value: this.getValue(chars),
                };
            case "changey":
                return {
                    type: "ChangeY",
                    value: this.getValue(chars),
                };

            case "say":
                return {
                    type: "Say",
                    value: this.getValue(chars),
                };
            case "sayfor":
                return {
                    type: "SayFor",
                    value: this.getValue(chars),
                    secs: this.getValue(chars),
                };
            case "think":
                return {
                    type: "Think",
                    value: this.getValue(chars),
                };

            case "thinkfor":
                return {
                    type: "ThinkFor",
                    value: this.getValue(chars),
                    secs: this.getValue(chars),
                };
            case "switchcostume":
                return {
                    type: "SwitchCostume",
                    value: this.getValue(chars),
                };
            case "nextcostume":
                return {
                    type: "NextCostume",
                };
            case "switchbackdrop":
                return {
                    type: "SwitchBackdrop",
                    value: this.getValue(chars),
                };
            case "nextbackdrop":
                return {
                    type: "NextBackdrop",
                };
            case "changesize":
                return {
                    type: "ChangeSize",
                    value: this.getValue(chars),
                };
            case "setsize":
                return {
                    type: "SetSize",
                    value: this.getValue(chars),
                };
            case "show":
                return {
                    type: "Show",
                };
            case "hide":
                return {
                    type: "Hide",
                };

            case "gotolayer":
                return {
                    type: "GotoLayer",
                    value: {
                        front: true,
                        back: false,
                    }[this.getIdentifier(chars)] ??
                        (() => {
                            this.error(
                                "gotolayer only takes front or back",
                            );
                            Deno.exit(1);
                        })(),
                };

            case "changelayer":
                return {
                    type: "GoForwardLayers",
                    value: this.getValue(chars),
                };

            // Sounds

            case "playuntildone":
                return {
                    type: "PlayUntilDone",
                    sound: this.getValue(chars),
                };
            case "play":
                return {
                    type: "Play",
                    sound: this.getValue(chars),
                };
            case "stopallsounds":
                return {
                    type: "StopAllSounds",
                };

            case "changeeffect": {
                const effect = this.getIdentifier(chars);
                if (effect !== "pan" && effect !== "pitch") {
                    this.logger.error(
                        `Invalid effect, valid effects are pan and pitch`,
                    );
                    Deno.exit(1);
                }
                return {
                    type: "ChangeEffectBy",
                    // deno-lint-ignore no-explicit-any
                    effect: effect.toLowerCase() as any,
                    amount: this.getValue(chars),
                };
            }
            case "seteffect": {
                const effect = this.getIdentifier(chars);
                if (effect !== "pan" && effect !== "pitch") {
                    this.logger.error(
                        `Invalid effect, valid effects are pan and pitch`,
                    );
                    Deno.exit(1);
                }
                return {
                    type: "SetEffectTo",
                    // deno-lint-ignore no-explicit-any
                    effect: effect.toLowerCase() as any,
                    amount: this.getValue(chars),
                };
            }

            case "cleareffects":
                return {
                    type: "ClearEffects",
                };

            case "changevolume":
                return {
                    type: "ChangeVolumeBy",
                    value: this.getValue(chars),
                };
            case "setvolume":
                return {
                    type: "SetVolumeTo",
                    value: this.getValue(chars),
                };

            // Sensing

            case "askandwait":
                return {
                    type: "AskAndWait",
                    prompt: this.getValue(chars),
                };
            case "setdragmode": {
                const type = this.getIdentifier(chars);
                if (!(type === "draggable" || type === "undraggable")) {
                    this.logger.error(
                        "SetDragMode takes only either `draggable` or `undraggable`",
                    );
                    Deno.exit(1);
                }
                return {
                    type: "SetDragMode",
                    mode:
                        (type === "draggable" ? "draggable" : "not draggable"),
                };
            }
            case "resettimer":
                return {
                    type: "ResetTimer",
                };

            case "def":
            case "warp": {
                const id = this.getIdentifier(chars);
                const label = this.getLabel(chars);
                const amt = this.getNumber(chars);
                const args: ScratchArgumentType[] = [];
                for (let i = 0; i < amt; i++) {
                    const type = this.getIdentifier(chars);
                    if (type === "bool" || type === "boolean") {
                        args.push("Boolean");
                    } else if (type === "any") args.push("Any");
                    else {
                        this.logger.warn(
                            "`def` keyword only accepts `bool` or `any`, defaulting to any...",
                        );
                        args.push("Any");
                    }
                }
                return {
                    type: "Def",
                    label,
                    id,
                    argAmount: amt,
                    args,
                    warp: instr === "warp",
                };
            }

            case "insertdef": {
                this.trimStart(chars);
                const func = this.getIdentifier(chars);
                const sprites = [];
                while (chars.length) {
                    this.trimStart(chars);
                    sprites.push(this.getIdentifier(chars));
                }
                return {
                    type: "InsertDef",
                    func,
                    sprites,
                };
            }

            case "run": {
                const id = this.getIdentifier(chars);
                const amt = this.getNumber(chars);
                const args = [];
                for (let i = 0; i < amt; i++) {
                    args.push(this.getValue(chars));
                }
                return {
                    type: "Run",
                    argAmount: amt,
                    args,
                    id,
                };
            }

            case "set":
                return {
                    type: "Set",
                    target: this.getVariable(chars),
                    value: this.getValue(chars),
                };

            case "change":
                return {
                    type: "Change",
                    target: this.getVariable(chars),
                    value: this.getValue(chars),
                };

            case "list":
                {
                    const subOper = this.getIdentifier(chars);
                    const list = this.getList(chars);
                    switch (subOper) {
                        case "push":
                            return {
                                type: "ListOper",
                                list,
                                oper: {
                                    key: "Push",
                                    value: this.getValue(chars),
                                },
                            };
                        case "remove":
                            return {
                                type: "ListOper",
                                list,
                                oper: {
                                    key: "RemoveIndex",
                                    index: this.getValue(chars),
                                },
                            };
                        case "clear":
                            return {
                                type: "ListOper",
                                list,
                                oper: {
                                    key: "Clear",
                                },
                            };
                        case "insert":
                            return {
                                type: "ListOper",
                                list,
                                oper: {
                                    key: "Insert",
                                    index: this.getValue(chars),
                                    value: this.getValue(chars),
                                },
                            };
                        case "replace":
                            return {
                                type: "ListOper",
                                list,
                                oper: {
                                    key: "Replace",
                                    index: this.getValue(chars),
                                    value: this.getValue(chars),
                                },
                            };
                        default: {
                            this.error(`Invalid list subcommand`);
                            Deno.exit(1);
                        }
                    }
                }
                break; // starts erroring me for some reason

            case "ret":
                return {
                    type: "Return",
                    func: this.getIdentifier(chars),
                    value: this.getValue(chars),
                };

            default: {
                this.error(`Unknown instructions: \`${instr}\``);
                Deno.exit(1);
            }
        }
    }

    private trimStart(chars: string[]) {
        while (chars.length) {
            if (/\s/.test(chars[0])) chars.shift();
            else return;
        }
    }
    private getLine() {
        let s = "";
        let indent = 0;
        let end = false;
        this.lineNumber++;
        const ln = this.lines.shift()!;
        for (const ch of ln) {
            if (!end && ch === "\t") {
                indent += 4;
            } else if (!end && ch === " ") {
                indent += 1;
            } else {
                end = true;
                s += ch;
            }
        }
        return [s, indent] as const;
    }
    private getLabel(chars: string[]): string {
        this.trimStart(chars);
        if (chars.shift() !== "@") {
            this.error("Expected label to start with @");
            Deno.exit(1);
        }
        return this.getIdentifier(chars);
    }

    private getVariable(chars: string[]): string {
        this.trimStart(chars);
        if (chars.shift() !== "#") {
            this.error("Expected variable to start with #");
            Deno.exit(1);
        }
        return this.getIdentifier(chars);
    }
    private getSound(chars: string[]): string {
        this.trimStart(chars);
        if (chars.shift() !== "%") {
            this.error("Expected sound to start with %");
            Deno.exit(1);
        }
        return this.getIdentifier(chars);
    }

    private getList(chars: string[]): string {
        this.trimStart(chars);
        if (chars.shift() !== "#") {
            this.error("Expected list to start with ##");
            Deno.exit(1);
        }
        if (chars.shift() !== "#") {
            this.error("Expected list to start with ##");
            Deno.exit(1);
        }
        return this.getIdentifier(chars);
    }

    private getArgument(chars: string[]): [string, number] {
        this.trimStart(chars);
        if (chars.shift() !== "$") {
            this.error("Expected argument to start with $");
            Deno.exit(1);
        }
        const name = this.getIdentifier(chars);
        if (chars.shift() !== ":") {
            this.error(
                "Expected colon between function name and argument number",
            );
            Deno.exit(1);
        }
        const value = this.getIdentifier(chars);
        try {
            const v = parseInt(value);
            return [name, v];
        } catch {
            this.error("Arguments have to be numbered!");
            this.error("Ex: $foo:3, $bar:69");
            Deno.exit(1);
        }
    }
    private getValue(chars: string[]): IlValue {
        this.trimStart(chars);
        const first = chars?.[0];
        if (first === undefined) {
            this.error("Expected value, got nothing");
            Deno.exit(1);
        }
        if (/[0-9\-]/.test(first)) {
            return this.getNumberValue(chars);
        }
        if (first === '"') {
            return {
                key: "String",
                value: this.getString(chars),
            };
        }
        if (first == "#") {
            return {
                key: "Variable",
                name: this.getVariable(chars),
            };
        }
        if (first == "%") {
            return {
                key: "Sound",
                name: this.getSound(chars),
            };
        }
        if (first === "$") {
            const v = this.getArgument(chars);
            return {
                key: "Argument",
                funcName: v[0],
                index: v[1],
            };
        }
        if (first === "^") {
            const v = this.getColor(chars);
            return v;
        }
        if (first === "!") {
            chars.shift();
            const v = this.getIdentifier(chars);
            const builtin: BuiltinValue = ((): BuiltinValue => {
                switch (v) {
                    case "xposition":
                        return { key: "XPosition" };
                    case "yposition":
                        return { key: "YPosition" };
                    case "direction":
                        return { key: "Direction" };
                    case "volume":
                        return { key: "Volume" };
                    case "costumenumber":
                        return { key: "Costume", numberOrName: false };
                    case "costumename":
                        return { key: "Costume", numberOrName: true };
                    case "backdropnumber":
                        return { key: "Backdrop", numberOrName: false };
                    case "backdropname":
                        return { key: "Backdrop", numberOrName: true };
                    case "size":
                        return { key: "Size" };
                    default:
                        this.error(`Invalid builtin: ${v}`);
                        Deno.exit(1);
                }
            })();
            return {
                key: "Builtin",
                value: builtin,
            };
        }
        if (first === "&") {
            chars.shift();
            const type = this.getIdentifier(chars);
            const isBackdrop = (type === "backdrop" || type === "b")
                ? true
                : (type === "costume" || type === "c")
                ? false
                : (() => {
                    this.error(
                        `Costume/backdrop format is &<backdrop | costume>:<id>`,
                    );
                    Deno.exit(1);
                })();
            if (chars.shift() !== ":") {
                this.error(
                    `Costume/backdrop format is &<backdrop | costume>:<id>`,
                );
                Deno.exit(1);
            }
            const v = this.getIdentifier(chars);
            return {
                key: "Costume",
                isBackdrop,
                name: v,
            };
        }
        if (first === "(") {
            chars.shift();
            const keyword = this.getIdentifier(chars);
            switch (keyword) {
                case "add":
                case "sub":
                case "mul":
                case "div":
                case "mod":
                case "and":
                case "or":
                case "eq":
                case "gt":
                case "lt":
                case "gte":
                case "lte":
                case "join":
                case "letterof":
                case "contains": {
                    const left = this.getValue(chars);
                    const right = this.getValue(chars);
                    this.trimStart(chars);
                    if (chars.shift() !== ")") {
                        this.error(`Operation doesn't close`);
                        Deno.exit(1);
                    }
                    return {
                        key: "BinaryOperation",
                        left,
                        right,
                        oper: (() => {
                            switch (keyword) {
                                case "add":
                                    return "Add";
                                case "sub":
                                    return "Sub";
                                case "mul":
                                    return "Mul";
                                case "div":
                                    return "Div";
                                case "mod":
                                    return "Mod";
                                case "and":
                                    return "And";
                                case "or":
                                    return "Or";
                                case "eq":
                                    return "Eq";
                                case "gt":
                                    return "Gt";
                                case "lt":
                                    return "Lt";
                                case "join":
                                    return "Join";
                                case "letterof":
                                    return "LetterOf";
                                case "contains":
                                    return "Contains";
                                default: {
                                    this.error("Unreachable");
                                    Deno.exit(1);
                                }
                            }
                        })(),
                    };
                }
                case "not":
                case "length":
                case "round": {
                    const value = this.getValue(chars);
                    this.trimStart(chars);
                    if (chars.shift() !== ")") {
                        this.error("Operation doesn't close");
                        Deno.exit(1);
                    }
                    return {
                        key: "UnaryOperation",
                        value,
                        oper: (() => {
                            switch (keyword) {
                                case "not":
                                    return "Not";
                                case "length":
                                    return "Length";
                                case "round":
                                    return "Round";
                            }
                        })(),
                    };
                }
                case "abs":
                case "floor":
                case "ceiling":
                case "sqrt":
                case "sin":
                case "cos":
                case "tan":
                case "asin":
                case "acos":
                case "atan":
                case "ln":
                case "log":
                case "epower":
                case "tenpower": {
                    const value = this.getValue(chars);
                    this.trimStart(chars);
                    if (chars.shift() !== ")") {
                        this.error("Operation doesn't close");
                        Deno.exit(1);
                    }
                    return {
                        key: "DropOperation",
                        value,
                        oper: (() => {
                            switch (keyword) {
                                case "abs":
                                    return "Abs";
                                case "floor":
                                    return "Floor";
                                case "ceiling":
                                    return "Ceiling";
                                case "sqrt":
                                    return "Sqrt";
                                case "sin":
                                    return "Sin";
                                case "cos":
                                    return "Cos";
                                case "tan":
                                    return "Tan";
                                case "asin":
                                    return "Asin";
                                case "acos":
                                    return "Acos";
                                case "atan":
                                    return "Atan";
                                case "ln":
                                    return "Ln";
                                case "log":
                                    return "Log";
                                case "epower":
                                    return "EPower";
                                case "tenpower":
                                    return "TenPower";
                            }
                        })(),
                    };
                }

                case "list": {
                    const subOper = this.getIdentifier(chars);
                    const list = this.getList(chars);
                    const oper = ((): ListValue => {
                        switch (subOper) {
                            case "get":
                            case "index": {
                                return {
                                    key: "Index",
                                    index: this.getValue(chars),
                                };
                            }
                            case "find":
                                return {
                                    key: "Find",
                                    value: this.getValue(chars),
                                };
                            case "contains":
                                return {
                                    key: "Contains",
                                    value: this.getValue(chars),
                                };
                            case "length":
                                return {
                                    key: "Length",
                                };
                            default:
                                this.error(`Invalid list operation`);
                                Deno.exit(1);
                        }
                    })();
                    if (chars.shift() !== ")") {
                        this.error("Operation doesn't close");
                        Deno.exit(1);
                    }

                    return {
                        key: "ListValue",
                        list,
                        value: oper,
                    };
                }
                case "return": {
                    const func = this.getIdentifier(chars);
                    if (chars.shift() !== ")") {
                        this.logger.error("Expected ending parentheses");
                        Deno.exit(1);
                    }
                    return {
                        key: "Variable",
                        name: `${FORBIDDEN_VARIABLE_NAME_PREFIX}${func}`,
                    };
                }
                case "sensing": {
                    const subOper = this.getIdentifier(chars);
                    const d: IlValue = {
                        key: "SensingOperation",
                        oper: ((): SensingOperation => {
                            switch (subOper) {
                                case "touchingobject":
                                    return {
                                        type: "TouchingObject",
                                        target: this.getTarget(chars),
                                    };
                                case "touchingcolor":
                                    return {
                                        type: "TouchingColor",
                                        color: this.getValue(chars),
                                    };
                                case "coloristouchingcolor":
                                    return {
                                        type: "ColorIsTouchingColor",
                                        color1: this.getValue(chars),
                                        color2: this.getValue(chars),
                                    };
                                case "distanceto":
                                    return {
                                        type: "DistanceTo",
                                        target: this.getTarget(chars),
                                    };
                                case "keypressed":
                                    return {
                                        type: "KeyPressed",
                                        key: this.getValue(chars),
                                    };
                                case "mousedown":
                                    return {
                                        type: "MouseDown",
                                    };
                                case "mousex":
                                    return {
                                        type: "MouseX",
                                    };
                                case "mousey":
                                    return {
                                        type: "MouseY",
                                    };
                                case "loudness":
                                    return {
                                        type: "Loudness",
                                    };
                                case "timer":
                                    return {
                                        type: "Timer",
                                    };
                                case "of":
                                    return {
                                        type: "Of",
                                        property: this.getString(chars),
                                        object: this.getValue(chars),
                                    };
                                case "current":
                                    return {
                                        type: "Current",
                                        thing: this.getString(chars),
                                    };
                                case "dayssince2000":
                                    return {
                                        type: "DaysSince2000",
                                    };
                                case "username":
                                    return {
                                        type: "Username",
                                    };
                                default:
                                    this.logger.error(
                                        "unknown sensing instruction",
                                    );
                                    Deno.exit(1);
                            }
                        })(),
                    };
                    if (chars.shift() !== ")") {
                        this.logger.error("Expected ending parentheses");
                        Deno.exit(1);
                    }
                    return d;
                }
                default:
                    this.error(`Unknown operation: \`${keyword}\``);
                    Deno.exit(1);
            }
        }

        this.error(`Found ${first} when expected value`);
        Deno.exit(1);
    }

    private getTarget(chars: string[]): IlValue {
        this.trimStart(chars);
        const t = this.getIdentifier(structuredClone(chars));
        if (t === "_mouse_" || t === "_random_") {
            return {
                key: "Target",
                value: this.getIdentifier(chars) as "_mouse_",
            };
        }

        return this.getValue(chars);
    }

    private getNumber(chars: string[]): number {
        const a = this.getNumberValue(chars);
        if (a.key === "Integer") return a.value;
        else if (a.key === "Float") return a.value;
        else {
            this.error("Not a valid number");
            Deno.exit(1);
        }
    }
    private getNumberValue(chars: string[]): IlValue {
        const char = chars.shift()!;
        if (char === "0") {
            // check if hex or binary
            const prefix = chars?.[0];
            if (prefix === "b") {
                // binary
                let buffer = 0;
                chars.shift();
                while (true) {
                    if (chars?.[0] === "1") {
                        buffer <<= 1;
                        buffer += 1;
                        chars.shift();
                    } else if (chars?.[0] === "0") {
                        buffer <<= 1;
                        chars.shift();
                    } else break;
                }
                return {
                    key: "Integer",
                    value: buffer,
                };
            } else if (prefix === "x") {
                // binary
                let buffer = "";
                chars.shift();
                while (true) {
                    if (/[0-9a-fA-F]/.test(char)) buffer += chars.shift();
                    else break;
                }
                return {
                    key: "Integer",
                    value: parseInt(buffer, 16),
                };
            }
        }
        let period = false;
        let e = false;
        let buffer = char.toString();
        while (true) {
            const c = chars?.[0];
            if (c === undefined) break;
            else if (/[0-9]/.test(c)) buffer += c;
            else if ("." === c) {
                if (period) {
                    this.error("more than one period in a number");
                    Deno.exit(1);
                }
                buffer += c;
                period = true;
            } else if ("e" === c) {
                if (e) {
                    this.error(
                        "more than one exponential in a number",
                    );
                    Deno.exit(1);
                }
                e = true;
                buffer += c;
            } else {
                break;
            }
            chars.shift();
        }
        return period
            ? {
                key: "Float",
                value: parseFloat(buffer),
            }
            : {
                key: "Integer",
                value: parseInt(buffer),
            };
    }

    private getString(chars: string[]): string {
        this.trimStart(chars);
        const char = chars.shift()!;
        let buffer = "";
        while (true) {
            const c = chars.shift();
            if (c === undefined) {
                this.error("string not ended");
                Deno.exit(1);
            } else if (c === char) break;
            else if (c === "\\") {
                buffer += this.getEscape(chars);
            } else buffer += c;
        }
        return buffer;
    }
    private getEscape(chars: string[]) {
        const escape = chars.shift()!;
        if (escape === "n") return "\n";
        else if (escape === "r") return "\r";
        else if (escape === "t") return "\t";
        else if (escape === "v") return "\v";
        else if (escape === "f") return "\f";
        else if (escape === "\\") return "\\";
        else if (escape === "0") return "\0";
        else if (escape === "c") {
            const code = chars.shift();
            return String.fromCharCode(code!.charCodeAt(0) % 32);
        } else if (/[\^$\.*+?()[\]{}|\/`]/.test(escape!)) {
            return escape;
        } else if (escape === "x") {
            const char1 = chars.shift()!;
            const char2 = chars.shift()!;
            return String.fromCharCode(parseInt(char1 + char2, 16));
        } else if (escape === "u") {
            const char1 = chars.shift()!;
            if (char1 === "{") {
                let b = "";
                let c;
                while ((c = chars.shift()) !== "}") {
                    b += c;
                }
                return String.fromCharCode(parseInt(b, 16));
            } else {
                const char2 = chars.shift()!;
                const char3 = chars.shift()!;
                const char4 = chars.shift()!;

                return String.fromCharCode(
                    parseInt(char1 + char2 + char3 + char4, 16),
                );
            }
        } else {
            this.error(`Invalid escape: \\${escape}`);
            Deno.exit(1);
        }
    }

    private getIdentifier(chars: string[]): string {
        let s = "";
        this.trimStart(chars);
        while (chars.length) {
            const ch = chars.shift()!;
            if (/[a-zA-Z0-9_]/.test(ch)) s += ch;
            else {
                chars.splice(0, 0, ch);
                break;
            }
        }
        return s;
    }

    private getColor(chars: string[]): IlValue {
        this.trimStart(chars);
        if (chars.shift() !== "^") {
            this.logger.error(`Expected color to start with ^`);
            Deno.exit(1);
        }
        const hex = chars.splice(0, 6);
        if (hex.length !== 6) {
            this.logger.error(`Not enough hex digits in color`);
            Deno.exit(1);
        }
        return {
            key: "Color",
            hex: "#" + hex.join(""),
        };
    }

    private error(message: string) {
        this.logger.error(`At line ${this.lineNumber - 1}:`);
        this.logger.error(message);
    }
}
