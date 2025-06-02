// deno-lint-ignore-file no-explicit-any
import type {
    DropOperation,
    ScratchArgumentType,
    StopType,
} from "../ir/types.ts";
import type {
    BinaryOperation,
    FileFormat,
    IlNode,
    IlValue,
    UnaryOperation,
} from "../ir/types.ts";
export class Label {
    constructor(
        public name: string,
        public nodes: IlNode[],
    ) {
    }

    push(node: IlNode) {
        this.nodes.push(node);
    }
}
export const $: {
    COUNTER: number;
    labels: Label[];
    scope: Label | null;
    currentFunc: string | null;
    currentSprite: Sprite | null;
    returnValue: Variable | null;
    functionsToAdd: string[];
    breakVariable: Variable | null;
} = {
    COUNTER: 0,
    labels: new Array<Label>(new Label("stat", [])),
    scope: null,
    currentFunc: null,
    currentSprite: null,
    returnValue: null,
    functionsToAdd: [],
    breakVariable: null,
};
const statLabel = $.labels.find((a) => a.name === "stat")!;

export type Body = (...args: any[]) => void;
function labelify(body: Body, ...args: any[]) {
    const oldScope = $.scope;
    const oldBreak = $.breakVariable;
    const newScope = new Label(reserveCount(), []);
    $.scope = newScope;
    body(...args);
    $.scope = oldScope;
    $.breakVariable = oldBreak;
    return newScope;
}

export class Broadcast {
    id: string;

    constructor() {
        this.id = reserveCount();
    }
}
export class Sprite {
    id: string;
    isStage: boolean;
    costumes: Costume[];
    implementedFunctions: Set<string>;

    constructor(isStage = false) {
        this.isStage = isStage;
        this.costumes = [];
        this.id = reserveCount();
        this.implementedFunctions = new Set();
        statLabel.push({
            type: "CreateSpr",
            isStage,
            id: this.id,
            name: isStage ? "Stage" : this.id,
        });
    }

    addCostume(costume: Costume) {
        this.costumes.push(costume);
        statLabel.push({
            type: "AddSprCostume",
            ...costume,
            id: this.id,
        });
    }

    onFlag(body: Body) {
        $.currentSprite = this;
        const b = labelify(body);
        $.currentSprite = null;
        if (b.nodes.length) {
            statLabel.push({
                type: "Flag",
                label: b.name,
                target: this.id,
            });
            $.labels.push(b);
        }
    }
    onKeypress(key: string, body: Body) {
        $.currentSprite = this;
        const b = labelify(body);
        $.currentSprite = null;
        if (b.nodes.length) {
            statLabel.push({
                type: "Keypress",
                key,
                label: b.name,
                target: this.id,
            });
            $.labels.push(b);
        }
    }
    onClicked(body: Body) {
        $.currentSprite = this;
        const b = labelify(body);
        $.currentSprite = null;
        if (b.nodes.length) {
            statLabel.push({
                type: "Clicked",
                label: b.name,
                target: this.id,
            });
            $.labels.push(b);
        }
    }

    clone() {
        $.scope?.push({
            type: "Clone",
            target: this.id,
        });
    }
    onClone(body: Body) {
        $.currentSprite = this;
        const b = labelify(body);
        $.currentSprite = null;
        if (b.nodes.length) {
            statLabel.push({
                type: "WhenClone",
                label: b.name,
                target: this.id,
            });
            $.labels.push(b);
        }
    }

    onBroadcast(broadcast: Broadcast, body: Body) {
        $.currentSprite = this;
        const b = labelify(body);
        $.currentSprite = null;
        if (b.nodes.length) {
            statLabel.push({
                type: "WhenBroadcast",
                label: b.name,
                target: this.id,
                name: broadcast.id,
            });
            $.labels.push(b);
        }
    }
}
export class Costume {
    name: string;
    format: FileFormat;
    file: string;
    anchorX: number;
    anchorY: number;
    constructor(
        format: FileFormat,
        file: string,
        anchorX: number,
        anchorY: number,
    ) {
        this.name = reserveCount();
        this.format = format;
        this.file = file;
        this.anchorX = anchorX;
        this.anchorY = anchorY;
    }

    static fromPath(path: string, anchorX?: number, anchorY?: number): Costume {
        let type: FileFormat;
        if (path.endsWith(".svg")) type = "SVG";
        else if (path.endsWith(".png")) type = "PNG";
        else {throw new Error(
                "unknown file extension: " + path +
                    ", please manually create a Costume",
            );}

        return new Costume(type, path, anchorX ?? 0, anchorY ?? 0);
    }
}
export const stage: Sprite = new Sprite(true);

export function reserveCount(): string {
    return "BC_" + ($.COUNTER++).toString();
}

export interface SingleValue {
    toScratchValue(): IlValue;
}
export interface Serializable {
    sizeof(): number;
    toSerialized(): IlValue[];
    fromSerialized(values: IlValue[]): IlNode[];
}
export interface Variable {
    set(...args: any[]): void;
    nooptimize(): this;
}
export type Valuesque = SingleValue | number | string | IlValue;
export function toScratchValue(value: Valuesque): IlValue {
    if (typeof value === "object" && "key" in value) return value as IlValue;
    if (typeof value === "number") {
        return {
            key: "Float",
            value,
        };
    } else if (typeof value === "string") {
        return {
            key: "String",
            value,
        };
    } else return (value as SingleValue).toScratchValue();
}

export class IlWrapper implements SingleValue {
    constructor(private value: IlValue) {
    }

    toScratchValue(): IlValue {
        return this.value;
    }
}
export class Num implements SingleValue, Serializable, Variable {
    id: string;
    #intcreationobj: IlNode;

    constructor() {
        this.id = reserveCount();
        statLabel.push(
            this.#intcreationobj = {
                type: "CreateVar",
                name: this.id,
                nooptimize: false,
            },
        );
    }
    sizeof(): number {
        return 1;
    }
    toScratchValue(): IlValue {
        return {
            key: "Variable",
            name: this.id,
        };
    }

    toSerialized(): IlValue[] {
        return [this.toScratchValue()];
    }
    fromSerialized(values: IlValue[]): IlNode[] {
        return [{
            type: "Set",
            target: this.id,
            value: values.shift()!,
        }];
    }

    set(value: Valuesque): void {
        $.scope?.push({
            type: "Set",
            target: this.id,
            value: toScratchValue(value),
        });
    }
    change(value: Valuesque): void {
        $.scope?.push({
            type: "Change",
            target: this.id,
            value: toScratchValue(value),
        });
    }

    static literal(value: Valuesque): Num {
        const v = new Num();
        v.set(value);
        return v;
    }

    nooptimize(): this {
        if (this.#intcreationobj.type !== "CreateVar") return this;
        this.#intcreationobj.nooptimize = true;
        return this;
    }
}
export class Str implements SingleValue, Serializable, Variable {
    id: string;
    #intcreationobj: IlNode;
    constructor() {
        this.id = reserveCount();
        statLabel.push(
            this.#intcreationobj = {
                type: "CreateVar",
                name: this.id,
                nooptimize: false,
            } satisfies IlNode,
        );
    }
    sizeof(): number {
        return 1;
    }
    toScratchValue(): IlValue {
        return {
            key: "Variable",
            name: this.id,
        };
    }

    toSerialized(): IlValue[] {
        return [this.toScratchValue()];
    }
    fromSerialized(values: IlValue[]): IlNode[] {
        return [{
            type: "Set",
            target: this.id,
            value: values.shift()!,
        }];
    }

    set(value: Valuesque): void {
        $.scope?.push({
            type: "Set",
            target: this.id,
            value: toScratchValue(value),
        });
    }

    slice(from: Valuesque, to: Valuesque): Str {
        const n = Str.literal(""); // no optimisations
        for$(
            new Num(),
            (v) => v.set(from),
            (v) => lt(v, to),
            (v) => v.change(1),
            (v) => {
                n.set(join(n, letterOf(v, this)));
            },
        );
        return n;
    }

    static literal(s: string): Str {
        const st = new Str();
        st.set(s);
        return st;
    }

    nooptimize(): this {
        if (this.#intcreationobj.type !== "CreateVar") return this;
        this.#intcreationobj.nooptimize = true;
        return this;
    }

    length(): IlWrapper {
        return stringLength(this);
    }

    at(index: Valuesque): IlWrapper {
        return letterOf(add(index, 1), this);
    }
}
export class Argument implements SingleValue, Serializable {
    index: number;
    constructor(index: number, private funcName: string) {
        this.index = index;
    }

    toScratchValue(): IlValue {
        return {
            key: "Argument",
            funcName: this.funcName,
            index: this.index,
        };
    }

    fromSerialized(values: IlValue[]): IlNode[] {
        values.shift();
        return [];
    }

    toSerialized(): IlValue[] {
        return [this.toScratchValue()];
    }
    sizeof(): number {
        return 1;
    }
}

export const Color = (hex: string): IlValue => ({
    key: "Color",
    hex,
});
export class List<T extends new () => Serializable & Variable> {
    id: string;

    type: T;
    constructor(type: T) {
        this.type = type;
        this.id = reserveCount();
        statLabel.push({
            type: "CreateList",
            name: this.id,
        });
    }

    push(value: InstanceType<T>): void {
        for (const v of value.toSerialized()) {
            $.scope?.push({
                type: "ListOper",
                list: this.id,
                oper: {
                    key: "Push",
                    value: v,
                },
            });
        }
    }
    pushRaw(value: Valuesque): void {
        $.scope?.push({
            type: "ListOper",
            list: this.id,
            oper: {
                key: "Push",
                value: toScratchValue(value),
            },
        });
    }
    insert(value: InstanceType<T>, index: Valuesque): void {
        for (const v of value.toSerialized().toReversed()) {
            $.scope?.push({
                type: "ListOper",
                list: this.id,
                oper: {
                    key: "Insert",
                    index: toScratchValue(index),
                    value: v,
                },
            });
        }
    }
    replace(value: InstanceType<T>, index: Valuesque): void {
        const serd = value.toSerialized();
        for (let i = 0; i < serd.length; i++) {
            $.scope?.push({
                type: "ListOper",
                list: this.id,
                oper: {
                    key: "Replace",
                    index: add(
                        mul(toScratchValue(index), value.sizeof()),
                        i + 1,
                    )
                        .toScratchValue(),
                    value: serd[i],
                },
            });
        }
    }
    clear(): void {
        $.scope?.push({
            type: "ListOper",
            list: this.id,
            oper: {
                key: "Clear",
            },
        });
    }
    removeAt(index: Valuesque): void {
        $.scope?.push({
            type: "ListOper",
            list: this.id,
            oper: {
                key: "RemoveIndex",
                index: toScratchValue(index),
            },
        });
    }

    rawLength(): IlWrapper {
        return new IlWrapper({
            key: "ListValue",
            list: this.id,
            value: {
                key: "Length",
            },
        });
    }
    length(): IlWrapper {
        const v = new this.type();
        const size = v.sizeof();
        return div(this.rawLength(), size);
    }
    at(index: Valuesque): IlWrapper {
        return new IlWrapper({
            key: "ListValue",
            list: this.id,
            value: {
                key: "Index",
                index: toScratchValue(index),
            },
        });
    }
    nth(index: Valuesque): InstanceType<T> {
        const value = new this.type() as InstanceType<T>;
        const values: IlValue[] = [];
        for (let i = 0; i < value.sizeof(); i++) {
            values.push(
                this.at(add(mul(index, value.sizeof()), i + 1))
                    .toScratchValue(),
            );
        }
        const nodes = value.fromSerialized(values);
        $.scope?.nodes.push(...nodes);

        return value;
    }
    containsSingle(item: Valuesque): IlWrapper {
        return new IlWrapper({
            key: "ListValue",
            list: this.id,
            value: {
                key: "Contains",
                value: toScratchValue(item),
            },
        });
    }
    indexOf(item: Valuesque): IlWrapper {
        return new IlWrapper({
            key: "ListValue",
            list: this.id,
            value: {
                key: "Find",
                value: toScratchValue(item),
            },
        });
    }

    pop(): InstanceType<T> {
        // 1,2 3,4 5,6 7,8
        // length: 8
        // sizeof: 2

        const v = new this.type();
        const size = v.sizeof();
        const s = v.toSerialized();
        const values: IlValue[] = [];
        for (let i = 0; i < s.length; i++) {
            values.push(
                this.at(add(sub(this.rawLength(), size), i + 1))
                    .toScratchValue(),
            );
        }
        const nodes = v.fromSerialized(values);
        $.scope?.nodes.push(...nodes);
        for (let i = 0; i < s.length; i++) {
            this.removeAt(this.rawLength());
        }
        return v as InstanceType<T>;
    }

    foreach(cb: (elem: InstanceType<T>, i: Num) => void): void {
        const i = new Num();
        i.set(0);
        repeat$(this.length(), () => {
            const w = this.nth(i);
            if$(eq(1, 1), () => {
                cb(w, i);
            });
            i.change(1);
        });
    }
}

export type DataclassOutput<T> = T & {
    new (...args: any[]): Serializable & Variable;
};
// deno-lint-ignore ban-types
export function DataClass<T extends { new (...args: any[]): {} }>(
    cl: T,
): DataclassOutput<T> {
    return class extends cl implements Serializable, Variable {
        set(value: InstanceType<DataclassOutput<T>>): void {
            for (const key in value) {
                const v = value[key] as any;
                if (typeof v !== "object") {
                    throw new Error("Class member not serializable");
                }
                if (!("set" in v)) {
                    throw new Error(
                        "Class member doesnt implement Variable interface",
                    );
                }
                (this[key as keyof typeof this] as any).set(v);
            }
        }
        nooptimize(): this {
            for (const key in this) {
                const v = this[key] as any;
                if (typeof v !== "object") {
                    throw new Error("Class member not implementing Variable");
                }
                if (!("nooptimize" in v)) {
                    throw new Error("Class member not implementing Variable");
                }
                (this[key as keyof typeof this] as any).nooptimize();
            }
            return this;
        }
        sizeof(): number {
            let out = 0;
            for (const key in this) {
                const v = this[key] as any;
                if (typeof v !== "object") {
                    throw new Error("Class member not serializable");
                }
                if (!("sizeof" in v)) {
                    throw new Error("Class member not serializable");
                }
                out += v.sizeof();
            }
            return out;
        }
        toSerialized(): IlValue[] {
            const out: IlValue[] = [];
            for (const key in this) {
                const v = this[key] as any;
                if (typeof v !== "object") {
                    throw new Error("Class member not serializable");
                }
                if (!("toSerialized" in v)) {
                    throw new Error("Class member not serializable");
                }
                out.push(...v.toSerialized());
            }
            return out;
        }
        fromSerialized(values: IlValue[]): IlNode[] {
            const out: IlNode[] = [];
            for (const key in this) {
                const v = this[key] as any;
                if (typeof v !== "object") {
                    throw new Error("Class member not serializable");
                }
                if (!("fromSerialized" in v)) {
                    throw new Error("Class member not serializable");
                }
                out.push(...v.fromSerialized(values));
            }
            return out;
        }
        constructor(...args: any[]) {
            super(...args);
        }
    };
}

// export type Argumentify<T extends Serializable> =
//       T extends Num ? Argument
//     : T extends Str ? Argument
//     : T extends (...inputs: any[]) => any ? T
//     : T & { [k in keyof T]: T[k] extends Serializable ? Argumentify<T[k]> : T[k] };

// export function Argumentify<T extends Serializable>(value: T, index: number): [Argumentify<T>, number] {
//     const newValue = value as any;
//     if (value instanceof Num) {
//         return [new Argument(index, $.currentFunc!) as Argumentify<T>, ++index]
//     }
//     if (value instanceof Str) {
//         return [new Argument(index, $.currentFunc!) as Argumentify<T>, ++index]
//     }
//     for (const k in value) {
//         if (value[k] instanceof Num) [newValue[k], index] = Argumentify(value[k], index);
//         else if (value[k] instanceof Str) [newValue[k], index] = Argumentify(value[k], index);
//         else [newValue[k], index] = Argumentify(value[k] as Serializable, index);
//     }
//     return [newValue, index];
// }
export function def<
    const T extends (new () => Serializable)[],
    R extends new () => Serializable & Variable,
    F extends (...args: { [K in keyof T]: InstanceType<T[K]> }) => void,
>(argTypes: T, fn: F, returnType?: R): (...params: Parameters<F>) => InstanceType<R> {
    return defRaw(argTypes, fn, returnType, false);
}
export function warp<
    const T extends (new () => Serializable)[],
    R extends new () => Serializable & Variable,
    F extends (...args: { [K in keyof T]: InstanceType<T[K]> }) => void,
>(argTypes: T, fn: F, returnType?: R): (...params: Parameters<F>) => InstanceType<R> {
    return defRaw(argTypes, fn, returnType, true);
}
function defRaw<
    const T extends (new () => Serializable)[],
    R extends new () => Serializable & Variable,
    F extends (...args: { [K in keyof T]: InstanceType<T[K]> }) => void,
>(argTypes: T, fn: F, returnType: R | undefined, warp: boolean): (...params: Parameters<F>) => InstanceType<R> {
    const oldFunc = $.currentFunc;
    const id = $.currentFunc = reserveCount();

    const oldrv = $.returnValue;
    let ret = null;
    if (returnType !== undefined) {
        ret = new returnType().nooptimize();
        $.returnValue = ret;
    }
    const out = {
        type: "Def",
        label: "",
        argAmount: 0,
        args: [] as ScratchArgumentType[],
        id: $.currentFunc,
        warp,
    } satisfies IlNode;
    const args: any = [];
    let totalSize = 0;
    let index = 1;
    let setup: IlNode[] = [];
    for (const arg of argTypes) {
        const a = new arg();
        const size = a.sizeof();

        totalSize += size;

        const v = [];
        for (let i = 0; i < size; i++) {
            v.push(
                {
                    key: "Argument",
                    funcName: $.currentFunc,
                    index: index++,
                } satisfies IlValue,
            );
            out.args.push("Any");
        }
        out.argAmount += size;
        setup = [...setup, ...a.fromSerialized(v)];
        args.push(a);
    }

    const label = labelify(() => {
        $.scope?.nodes.push(...setup);
        if$(eq(1, 1), () => {
            fn(...args);
        });
    });
    $.labels.push(label);
    out.label = label.name;
    statLabel.push(out);

    $.currentFunc = oldFunc;
    $.returnValue = oldrv;
    return ((...args: { [K in keyof T]: InstanceType<T[K]> }) => {
        $.functionsToAdd.push(id);
        if ($.currentSprite !== null) {
            for (const id of $.functionsToAdd) {
                if (!$.currentSprite?.implementedFunctions.has(id)) {
                    $.currentSprite?.implementedFunctions.add(id);
                    statLabel.push({
                        type: "InsertDef",
                        func: id,
                        sprites: [$.currentSprite!.id],
                    });
                }
            }
            $.functionsToAdd = [];
        }

        $.scope?.nodes.push(
            {
                type: "Run",
                id,
                argAmount: totalSize,
                args: args.map((a) => a.toSerialized()).flat(),
            } satisfies IlNode,
        );
        return ret as InstanceType<R>;
    });
}

function makeBinaryOperatorFunction(name: BinaryOperation): BinaryOperator {
    return (left: Valuesque, right: Valuesque): IlWrapper => {
        return new IlWrapper({
            key: "BinaryOperation",
            oper: name,
            left: toScratchValue(left),
            right: toScratchValue(right),
        });
    };
}
export type BinaryOperator = (left: Valuesque, right: Valuesque) => IlWrapper;
export const add: BinaryOperator = makeBinaryOperatorFunction("Add");
export const sub: BinaryOperator = makeBinaryOperatorFunction("Sub");
export const mul: BinaryOperator = makeBinaryOperatorFunction("Mul");
export const div: BinaryOperator = makeBinaryOperatorFunction("Div");
export const eq: BinaryOperator = makeBinaryOperatorFunction("Eq");
export const gt: BinaryOperator = makeBinaryOperatorFunction("Gt");
export const lt: BinaryOperator = makeBinaryOperatorFunction("Lt");
export const gte: (left: Valuesque, right: Valuesque) => Valuesque = (
    left: Valuesque,
    right: Valuesque,
) => or(eq(left, right), gt(left, right));
export const lte: (left: Valuesque, right: Valuesque) => Valuesque = (
    left: Valuesque,
    right: Valuesque,
) => or(eq(left, right), lt(left, right));
export const mod: BinaryOperator = makeBinaryOperatorFunction("Mod");
export const join: BinaryOperator = makeBinaryOperatorFunction("Join");
export const letterOf: BinaryOperator = makeBinaryOperatorFunction("LetterOf");
export const stringContains: BinaryOperator = makeBinaryOperatorFunction(
    "Contains",
);
export const random: BinaryOperator = makeBinaryOperatorFunction("Random");
const andRaw: BinaryOperator = makeBinaryOperatorFunction("And");
export const and: (...values: Valuesque[]) => Valuesque = (
    ...values: Valuesque[]
) => {
    return values.reduce((prev, cur) => andRaw(prev, cur));
};
const orRaw: BinaryOperator = makeBinaryOperatorFunction("Or");
export const or: (...values: Valuesque[]) => Valuesque = (
    ...values: Valuesque[]
) => {
    return values.reduce((prev, cur) => orRaw(prev, cur));
};

function makeUnaryOperatorFunction(name: UnaryOperation): UnaryOperator {
    return (left: Valuesque): IlWrapper => {
        return new IlWrapper({
            key: "UnaryOperation",
            oper: name,
            value: toScratchValue(left),
        });
    };
}
export type UnaryOperator = (left: Valuesque) => IlWrapper;
export const not: UnaryOperator = makeUnaryOperatorFunction("Not");
export const stringLength: UnaryOperator = makeUnaryOperatorFunction("Length");
export const round: UnaryOperator = makeUnaryOperatorFunction("Round");

function makeDropOperatorFunction(name: DropOperation) {
    return (left: Valuesque): IlWrapper => {
        return new IlWrapper({
            key: "DropOperation",
            oper: name,
            value: toScratchValue(left),
        });
    };
}
type DropOperator = (left: Valuesque) => IlWrapper;

export const abs: DropOperator = makeDropOperatorFunction("Abs");
export const floor: DropOperator = makeDropOperatorFunction("Floor");
export const ceiling: DropOperator = makeDropOperatorFunction("Ceiling");
export const sqrt: DropOperator = makeDropOperatorFunction("Sqrt");

export const trig: {
    degrees: {
        sin: (left: Valuesque) => IlWrapper;
        cos: (left: Valuesque) => IlWrapper;
        tan: (left: Valuesque) => IlWrapper;
        asin: (left: Valuesque) => IlWrapper;
        acos: (left: Valuesque) => IlWrapper;
        atan: (left: Valuesque) => IlWrapper;
        atan2: (y: Valuesque, x: Valuesque) => IlWrapper;
    };
    DEG2RAD: (deg: Valuesque) => IlWrapper;
    RAD2DEG: (rad: Valuesque) => IlWrapper;
    radians: {
        sin: (left: Valuesque) => IlWrapper;
        cos: (left: Valuesque) => IlWrapper;
        tan: (left: Valuesque) => IlWrapper;
        asin: (left: Valuesque) => IlWrapper;
        acos: (left: Valuesque) => IlWrapper;
        atan: (left: Valuesque) => IlWrapper;
        atan2: (y: Valuesque, x: Valuesque) => IlWrapper;
    };
} = {
    degrees: {
        sin: makeDropOperatorFunction("Sin"),
        cos: makeDropOperatorFunction("Cos"),
        tan: makeDropOperatorFunction("Tan"),
        asin: makeDropOperatorFunction("Asin"),
        acos: makeDropOperatorFunction("Acos"),
        atan: makeDropOperatorFunction("Atan"),
        atan2: (y: Valuesque, x: Valuesque) =>
            add(
                mul(
                    eq(x, 0),
                    add(
                        mul(gt(y, 0), Math.PI / 2),
                        mul(lt(y, 0), -Math.PI / 2),
                    ),
                ),
                add(
                    mul(gt(x, 0), trig.degrees.atan(div(y, x))),
                    mul(
                        lt(x, 0),
                        add(
                            mul(
                                lt(y, 0),
                                sub(trig.degrees.atan(div(y, x)), Math.PI),
                            ),
                            mul(
                                gt(y, 0),
                                add(trig.degrees.atan(div(y, x)), Math.PI),
                            ),
                        ),
                    ),
                ),
            ),
    },
    DEG2RAD: (deg: Valuesque) => mul(deg, Math.PI / 180),
    RAD2DEG: (rad: Valuesque) => mul(rad, 180 / Math.PI),
    radians: {
        sin: (x: Valuesque) => trig.DEG2RAD(trig.degrees.sin(trig.RAD2DEG(x))),
        cos: (x: Valuesque) => trig.DEG2RAD(trig.degrees.cos(trig.RAD2DEG(x))),
        tan: (x: Valuesque) => trig.DEG2RAD(trig.degrees.tan(trig.RAD2DEG(x))),
        asin: (x: Valuesque) =>
            trig.DEG2RAD(trig.degrees.asin(trig.RAD2DEG(x))),
        acos: (x: Valuesque) =>
            trig.DEG2RAD(trig.degrees.acos(trig.RAD2DEG(x))),
        atan: (x: Valuesque) =>
            trig.DEG2RAD(trig.degrees.atan(trig.RAD2DEG(x))),
        atan2: (y: Valuesque, x: Valuesque) =>
            trig.DEG2RAD(trig.degrees.atan2(trig.RAD2DEG(y), trig.RAD2DEG(x))),
    },
};

export const ln: DropOperator = makeDropOperatorFunction("Ln");
export const log: DropOperator = makeDropOperatorFunction("Log");
export const epower: DropOperator = makeDropOperatorFunction("EPower");
export const tenpower: DropOperator = makeDropOperatorFunction("TenPower");

/**
 * @param y degrees
 * @param x degrees
 * @returns degrees
 */

export const isTouchingObject: (target: Valuesque | Sprite) => IlWrapper = (
    target: Valuesque | Sprite,
) => {
    if (target instanceof Sprite) {
        return new IlWrapper({
            key: "SensingOperation",
            oper: {
                type: "TouchingObject",
                target: {
                    key: "String",
                    value: target.id,
                },
            },
        });
    }
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "TouchingObject",
            target: toScratchValue(target),
        },
    });
};
export const isTouchingColor: (color: Valuesque) => IlWrapper = (
    color: Valuesque,
) => {
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "TouchingColor",
            color: toScratchValue(color),
        },
    });
};
export const ColorIsTouchingColor: (
    color: Valuesque,
    color2: Valuesque,
) => IlWrapper = (color: Valuesque, color2: Valuesque) => {
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "ColorIsTouchingColor",
            color1: toScratchValue(color),
            color2: toScratchValue(color2),
        },
    });
};
export const distanceTo: (target: Valuesque | Sprite) => IlWrapper = (
    target: Valuesque | Sprite,
) => {
    if (target instanceof Sprite) {
        return new IlWrapper({
            key: "SensingOperation",
            oper: {
                type: "DistanceTo",
                target: {
                    key: "String",
                    value: target.id,
                },
            },
        });
    }
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "DistanceTo",
            target: toScratchValue(target),
        },
    });
};
export const keyPressed: (key: Valuesque) => IlWrapper = (key: Valuesque) => {
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "KeyPressed",
            key: toScratchValue(key),
        },
    });
};
export const mouse: {
    down: () => IlWrapper;
    x: () => IlWrapper;
    y: () => IlWrapper;
} = {
    down: () => {
        return new IlWrapper({
            key: "SensingOperation",
            oper: {
                type: "MouseDown",
            },
        });
    },
    x: () => {
        return new IlWrapper({
            key: "SensingOperation",
            oper: {
                type: "MouseX",
            },
        });
    },
    y: () => {
        return new IlWrapper({
            key: "SensingOperation",
            oper: {
                type: "MouseY",
            },
        });
    },
};
export const loudness: () => IlWrapper = () => {
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "Loudness",
        },
    });
};
export const timer: () => IlWrapper = () => {
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "Timer",
        },
    });
};
export const propertyOf: (
    property: string,
    object: Valuesque | Sprite,
) => IlWrapper = (property: string, object: Valuesque | Sprite) => {
    const obj = object instanceof Sprite
        ? {
            key: "String",
            value: object.id,
        } satisfies IlValue
        : toScratchValue(object);
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "Of",
            property,
            object: obj,
        },
    });
};
export const daysSince2000: () => IlWrapper = () => {
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "DaysSince2000",
        },
    });
};
export const username: () => IlWrapper = () => {
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "Username",
        },
    });
};

export const position: {
    x: () => IlWrapper;
    y: () => IlWrapper;
    direction: () => IlWrapper;
    size: () => IlWrapper;
} = {
    x: () => new IlWrapper({ key: "Builtin", value: { key: "XPosition" } }),
    y: () => new IlWrapper({ key: "Builtin", value: { key: "YPosition" } }),
    direction: () =>
        new IlWrapper({ key: "Builtin", value: { key: "Direction" } }),
    size: () => new IlWrapper({ key: "Builtin", value: { key: "Size" } }),
};
export const costumeNumber: () => IlWrapper = () =>
    new IlWrapper({
        key: "Builtin",
        value: { key: "Costume", numberOrName: true },
    });
export const costumeName: () => IlWrapper = () =>
    new IlWrapper({
        key: "Builtin",
        value: { key: "Costume", numberOrName: false },
    });
export const backdropNumber: () => IlWrapper = () =>
    new IlWrapper({
        key: "Builtin",
        value: { key: "Backdrop", numberOrName: true },
    });
export const backdropName: () => IlWrapper = () =>
    new IlWrapper({
        key: "Builtin",
        value: { key: "Backdrop", numberOrName: false },
    });

export function steps(steps: Valuesque) {
    $.scope?.push({
        type: "MoveSteps",
        value: toScratchValue(steps),
    });
}
export function turnRight(degrees: Valuesque) {
    $.scope?.push({
        type: "TurnRight",
        degrees: toScratchValue(degrees),
    });
}
export function turnLeft(degrees: Valuesque) {
    $.scope?.push({
        type: "TurnLeft",
        degrees: toScratchValue(degrees),
    });
}

export function goto(x: Valuesque, y: Valuesque) {
    $.scope?.push({
        type: "GotoXY",
        x: toScratchValue(x),
        y: toScratchValue(y),
    });
}
export function setRotation(degrees: Valuesque) {
    $.scope?.push({
        type: "PointDirection",
        value: toScratchValue(degrees),
    });
}
export function setX(x: Valuesque) {
    $.scope?.push({
        type: "SetX",
        value: toScratchValue(x),
    });
}
export function setY(y: Valuesque) {
    $.scope?.push({
        type: "SetY",
        value: toScratchValue(y),
    });
}
export function changeX(value: Valuesque) {
    $.scope?.push({
        type: "ChangeX",
        value: toScratchValue(value),
    });
}

export function changeY(value: Valuesque) {
    $.scope?.push({
        type: "ChangeY",
        value: toScratchValue(value),
    });
}

export function say(message: Valuesque) {
    $.scope?.push({
        type: "Say",
        value: toScratchValue(message),
    });
}

export function sayFor(message: Valuesque, secs: Valuesque) {
    $.scope?.push({
        type: "SayFor",
        value: toScratchValue(message),
        secs: toScratchValue(secs),
    });
}

export function think(message: Valuesque) {
    $.scope?.push({
        type: "Think",
        value: toScratchValue(message),
    });
}

export function thinkFor(message: Valuesque, secs: Valuesque) {
    $.scope?.push({
        type: "ThinkFor",
        value: toScratchValue(message),
        secs: toScratchValue(secs),
    });
}

export function switchCostume(costume: Valuesque) {
    $.scope?.push({
        type: "SwitchCostume",
        value: toScratchValue(costume),
    });
}

export function nextCostume() {
    $.scope?.push({
        type: "NextCostume",
    });
}

export function switchBackdrop(backdrop: Valuesque) {
    $.scope?.push({
        type: "SwitchBackdrop",
        value: toScratchValue(backdrop),
    });
}

export function nextBackdrop() {
    $.scope?.push({
        type: "NextBackdrop",
    });
}

export function changeSize(value: Valuesque) {
    $.scope?.push({
        type: "ChangeSize",
        value: toScratchValue(value),
    });
}

export function setSize(value: Valuesque) {
    $.scope?.push({
        type: "SetSize",
        value: toScratchValue(value),
    });
}

export function show() {
    $.scope?.push({ type: "Show" });
}

export function hide() {
    $.scope?.push({ type: "Hide" });
}

export function playSound(sound: Valuesque) {
    $.scope?.push({
        type: "Play",
        sound: toScratchValue(sound),
    });
}

export function playSoundUntilDone(sound: Valuesque) {
    $.scope?.push({
        type: "PlayUntilDone",
        sound: toScratchValue(sound),
    });
}

export function stopAllSounds() {
    $.scope?.push({ type: "StopAllSounds" });
}

export function changeEffect(effect: "PAN" | "PITCH", amount: Valuesque) {
    $.scope?.push({
        type: "ChangeEffectBy",
        effect,
        amount: toScratchValue(amount),
    });
}
export function setEffect(effect: "PAN" | "PITCH", amount: Valuesque) {
    $.scope?.push({
        type: "SetEffectTo",
        effect,
        amount: toScratchValue(amount),
    });
}
export function clearEffects() {
    $.scope?.push({ type: "ClearEffects" });
}
export function changeVolume(amount: Valuesque) {
    $.scope?.push({ type: "ChangeVolumeBy", value: toScratchValue(amount) });
}
export function setVolume(amount: Valuesque) {
    $.scope?.push({ type: "SetVolumeTo", value: toScratchValue(amount) });
}
export function wait(amount: Valuesque) {
    $.scope?.push({ type: "Wait", time: toScratchValue(amount) });
}
export function forever(body: Body) {
    const label = labelify(body);
    $.labels.push(label);
    $.scope?.push({ type: "Forever", label: label.name });
}
export function if$(predicate: Valuesque, body: Body, elseBody?: Body) {
    if (elseBody === undefined) {
        const label = labelify(body);
        $.labels.push(label);
        $.scope?.push({
            type: "If",
            label: label.name,
            predicate: toScratchValue(predicate),
        });
    } else {
        const label = labelify(body);
        const elseLabel = labelify(elseBody);
        $.labels.push(label);
        $.labels.push(elseLabel);
        $.scope?.push({
            type: "IfElse",
            label: label.name,
            label2: elseLabel.name,
            predicate: toScratchValue(predicate),
        });
    }
}
export function if_then_continue$(predicate: Valuesque, action?: Body) {
    const newLabel = new Label(reserveCount(), []);
    $.labels.push(newLabel);
    if (action === undefined) {
        $.scope?.push({
            type: "If",
            label: newLabel.name,
            predicate: toScratchValue(not(predicate)),
        });
    } else {
        const ac = labelify(action);
        $.labels.push(ac);
        $.scope?.push({
            type: "IfElse",
            label: ac.name,
            label2: newLabel.name,
            predicate: toScratchValue(predicate),
        });
    }
    $.scope = newLabel;
}
export function repeat$(times: Valuesque, body: Body) {
    const label = labelify(body);
    $.labels.push(label);
    $.scope?.push({
        type: "Repeat",
        label: label.name,
        amount: toScratchValue(times),
    });
}
export function while$(predicate: Valuesque, body: Body) {
    const toBreak = new Num();
    toBreak.set(0);
    $.breakVariable = toBreak;
    const label = labelify(body);
    $.labels.push(label);
    $.scope?.push({
        type: "RepeatUntil",
        label: label.name,
        predicate: toScratchValue(or(not(predicate), eq(toBreak, 1))),
    });
}
export function for$<T>(
    variable: T,
    initialiser: (v: T) => void,
    predicate: (v: T) => Valuesque,
    post: (v: T) => void,
    body: (v: T) => void,
) {
    initialiser(variable);
    while$(predicate(variable), () => {
        if$(eq(1, 1), () => {
            body(variable);
        });

        post(variable);
    });
}
export function break$() {
    if ($.breakVariable !== null) {
        $.breakVariable.set(1);
    } else throw new Error("no matching loop");
}
export function continue$() {
    if ($.breakVariable !== null) {
        $.breakVariable.set(1);
    } else throw new Error("no matching loop");
}

export function return$(value: Variable | string | number) {
    if (typeof value === "number") $.returnValue?.set(value);
    else if (typeof value === "string") $.returnValue?.set(value);
    else $.returnValue?.set(value);
    stop("ThisScript");
}
export function stop(type: StopType) {
    $.scope?.push({ type: "Stop", stopType: type });
}

export function broadcast(value: Valuesque): void;
export function broadcast(value: Broadcast): void;
export function broadcast(value: Valuesque | Broadcast) {
    if (value instanceof Broadcast) {
        $.scope?.push({
            type: "Broadcast",
            value: {
                key: "String",
                value: value.id,
            },
        });
    } else {$.scope?.push({
            type: "Broadcast",
            value: toScratchValue(value),
        });}
}

export function broadcastWait(value: Valuesque): void;
export function broadcastWait(value: Broadcast): void;
export function broadcastWait(value: Valuesque | Broadcast) {
    if (value instanceof Broadcast) {
        $.scope?.push({
            type: "BroadcastWait",
            value: {
                key: "String",
                value: value.id,
            },
        });
    } else {$.scope?.push({
            type: "BroadcastWait",
            value: toScratchValue(value),
        });}
}

export const pen: {
    clear: () => void;
    stamp: () => void;
    down: () => void;
    up: () => void;
    setColor: (value: Valuesque) => void;
    setParam: (param: Valuesque, amount: Valuesque) => void;
    changeParam: (param: Valuesque, amount: Valuesque) => void;
    changeSize: (amount: Valuesque) => void;
    setSize: (amount: Valuesque) => void;
} = {
    clear: (): void => {
        $.scope?.push({
            type: "PenEraseAll",
        });
    },
    stamp: (): void => {
        $.scope?.push({
            type: "PenStamp",
        });
    },
    down: (): void => {
        $.scope?.push({
            type: "PenDown",
        });
    },
    up: (): void => {
        $.scope?.push({
            type: "PenUp",
        });
    },
    setColor: (value: Valuesque): void => {
        $.scope?.push({
            type: "PenSetPenColor",
            color: toScratchValue(value),
        });
    },
    setParam: (param: Valuesque, amount: Valuesque): void => {
        $.scope?.push({
            type: "PenSetValue",
            value: toScratchValue(param),
            amount: toScratchValue(amount),
        });
    },
    changeParam: (param: Valuesque, amount: Valuesque): void => {
        $.scope?.push({
            type: "PenChangeValue",
            value: toScratchValue(param),
            amount: toScratchValue(amount),
        });
    },
    changeSize: (amount: Valuesque): void => {
        $.scope?.push({
            type: "PenChangeSize",
            value: toScratchValue(amount),
        });
    },
    setSize: (amount: Valuesque): void => {
        $.scope?.push({
            type: "PenSetSize",
            value: toScratchValue(amount),
        });
    },
};
