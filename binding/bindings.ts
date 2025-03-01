// deno-lint-ignore-file no-explicit-any
import { DropOperation, ScratchArgumentType, StopType } from "../ir/types.ts";
import { BinaryOperation, FileFormat, IlNode, IlValue, UnaryOperation } from "../ir/types.ts";
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
export const $ = {
    COUNTER: 0,
    labels: new Array<Label>(new Label("stat", [])),
    scope: null as Label | null,
    currentFunc: null as string | null,
    currentSprite: null as Sprite | null,
    returnValue: null as Variable | null,
    functionsToAdd: [] as string[]
};
const statLabel = $.labels.find(a => a.name === "stat")!;

export type Body = (...args: any[]) => void;
function labelify(body: Body, ...args: any[]) {
    const oldScope = $.scope;
    $.scope = new Label(reserveCount(), []);
    body(...args);
    const v = $.scope;
    $.scope = oldScope;
    return v;
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
            name: isStage ? "Stage" : this.id
        })
    }

    addCostume(costume: Costume) {
        this.costumes.push(costume)
        statLabel.push({
            type: "AddSprCostume",
            ...costume,
            id: this.id
        })
    }

    onFlag(body: Body) {
        $.currentSprite = this;
        const b = labelify(body);
        $.currentSprite = null;
        if (b.nodes.length) {
            statLabel.push({
                type: "Flag",
                label: b.name,
                target: this.id
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
                target: this.id
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
                target: this.id
            });
            $.labels.push(b);
        }
    }

    clone() {
        $.scope?.push({
            type: "Clone",
            target: this.id
        })
    }
    onClone(body: Body) {
        $.currentSprite = this;
        const b = labelify(body);
        $.currentSprite = null;
        if (b.nodes.length) {
            statLabel.push({
                type: "WhenClone",
                label: b.name,
                target: this.id
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
                name: broadcast.id
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
    constructor(format: FileFormat, file: string, anchorX: number, anchorY: number) {
        this.name = reserveCount();
        this.format = format;
        this.file = file;
        this.anchorX = anchorX;
        this.anchorY = anchorY;
    }
}
export const stage = new Sprite(true);

export function reserveCount() {
    return "BC_" + ($.COUNTER++).toString()
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
}
export type Valuesque = SingleValue | number | string | IlValue;
export function toScratchValue(value: Valuesque): IlValue {
    if (typeof value === "object" && "key" in value) return value as IlValue;
    if (typeof value === "number") {
        return {
            key: "Float",
            value
        } 
    } else if (typeof value === "string") {
        return {
            key: "String",
            value
        } 
    } else return (value as SingleValue).toScratchValue();
}

export class IlWrapper implements SingleValue {
    constructor(private value: IlValue) {

    }

    toScratchValue(): IlValue {
      return this.value
    }
}
export class Num implements SingleValue, Serializable, Variable {
    id: string;
    
    constructor() {
        this.id = reserveCount();
        statLabel.push({
            type: "CreateVar",
            name: this.id
        })
    }
    sizeof(): number {
      return 1
    }
    toScratchValue(): IlValue {
      return {
        key: "Variable",
        name: this.id
      }
    }

    toSerialized(): IlValue[] {
      return [this.toScratchValue()];
    }
    fromSerialized(values: IlValue[]): IlNode[] {
        return [{
            type: "Set",
            target: this.id,
            value: values.shift()!
        }]
    }

    set(value: Valuesque) {
        $.scope?.push({
            type: "Set",
            target: this.id,
            value: toScratchValue(value)
        })
    }
    change(value: Valuesque) {
        $.scope?.push({
            type: "Change",
            target: this.id,
            value: toScratchValue(value)
        })
    }
}
export class Str implements SingleValue, Serializable, Variable {
    id: string;
    constructor() {
        this.id = reserveCount();
        statLabel.push({
            type: "CreateVar",
            name: this.id
        })
    }
    sizeof(): number {
      return 1
    }
    toScratchValue(): IlValue {
      return {
        key: "Variable",
        name: this.id
      }
    }

    toSerialized(): IlValue[] {
      return [this.toScratchValue()];
    }
    fromSerialized(values: IlValue[]): IlNode[] {
        return [{
            type: "Set",
            target: this.id,
            value: values.shift()!
        }]
    }

    set(value: Valuesque) {
        $.scope?.push({
            type: "Set",
            target: this.id,
            value: toScratchValue(value)
        })
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
        index: this.index
      }
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

export class List<T extends new () => Serializable & Variable> {
    id: string;

    type: T;
    constructor(type: T) {
        this.type = type;
        this.id = reserveCount();
        statLabel.push({
            type: "CreateList",
            name: this.id
        });
    }
    
    push(value: InstanceType<T>) {
        for (const v of value.toSerialized()) {
            $.scope?.push({
                type: "ListOper",
                list: this.id,
                oper: {
                    key: "Push",
                    value: v
                }
            });
        }    
    }
    pushRaw(value: Valuesque) {
        $.scope?.push({
            type: "ListOper",
            list: this.id,
            oper: {
                key: "Push",
                value: toScratchValue(value)
            }
        });
    }
    insert(value: InstanceType<T>, index: Valuesque) {
        for (const v of value.toSerialized().toReversed()) {
            $.scope?.push({
                type: "ListOper",
                list: this.id,
                oper: {
                    key: "Insert",
                    index: toScratchValue(index),
                    value: v
                }
            });
        }
    }
    replace(value: InstanceType<T>, index: Valuesque) {
        const serd = value.toSerialized();
        for (let i = 0; i < serd.length; i++) {
            $.scope?.push({
                type: "ListOper",
                list: this.id,
                oper: {
                    key: "Replace",
                    index: add(mul(toScratchValue(index), value.sizeof()), i+1).toScratchValue(),
                    value: serd[i]
                }
            });
        }
    }
    clear() {
        $.scope?.push({
            type: "ListOper",
            list: this.id,
            oper: {
                key: "Clear"
            }
        })
    }
    removeAt(index: Valuesque) {
        $.scope?.push({
            type: "ListOper",
            list: this.id,
            oper: {
                key: "RemoveIndex",
                index: toScratchValue(index)
            }
        });
    }

    length() {
        return new IlWrapper({
            key: "ListValue",
            list: this.id,
            value: {
                key: "Length"
            }
        });
    }
    at(index: Valuesque) {
        return new IlWrapper({
            key: "ListValue",
            list: this.id,
            value: {
                key: "Index",
                index: toScratchValue(index)
            }
        });
    }
    nth(index: Valuesque): InstanceType<T> {
        const value = new this.type() as InstanceType<T>;
        const values = [];
        for (let i = 0; i < value.sizeof(); i++) {
            values.push(this.at(add(mul(index, value.sizeof()), i + 1)).toScratchValue())
        }
        const nodes = value.fromSerialized(values);
        $.scope?.nodes.push(...nodes);

        return value;
    }
    containsSingle(item: Valuesque) {
        return new IlWrapper({
            key: "ListValue",
            list: this.id,
            value: {
                key: "Contains",
                value: toScratchValue(item)
            }
        });
    }
    indexOf(item: Valuesque) {
        return new IlWrapper({
            key: "ListValue",
            list: this.id,
            value: {
                key: "Find",
                value: toScratchValue(item)
            }
        });
    }

    pop(): InstanceType<T> {
        // 1,2 3,4 5,6 7,8
        // length: 8
        // sizeof: 2

        const v = new this.type();
        const size = v.sizeof();
        const s = v.toSerialized();
        const values = [];
        for (let i = 0; i < s.length; i++) {
            values.push(this.at(add(sub(this.length(), size), i+1)).toScratchValue());
        }
        const nodes = v.fromSerialized(values);
        $.scope?.nodes.push(...nodes);
        for (let i = 0; i < s.length; i++) {
            this.removeAt(this.length())
        }
        return v as InstanceType<T>;
    }
}

type DataclassOutput<T> = T & { new (...args: any[]): Serializable & Variable }
// deno-lint-ignore ban-types
export function DataClass<T extends { new (...args: any[]): {} }>(cl: T): DataclassOutput<T> {
    return class extends cl implements Serializable, Variable {
        set(value: InstanceType<DataclassOutput<T>>): void {
            for (const key in value) {
                const v = value[key] as any;
                if (typeof(v) !== "object") {
                    throw new Error("Class member not serializable");
                }
                (this[key as keyof typeof this] as any).set(v);
            } 
        }
        sizeof(): number {
            let out = 0;
            for (const key in this) {
                const v = this[key] as any;
                if (typeof(v) !== "object") {
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
            const out: IlValue[] = []
            for (const key in this) {
                const v = this[key] as any;
                if (typeof(v) !== "object") {
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
            const out: IlNode[] = []
            for (const key in this) {
                const v = this[key] as any;
                if (typeof(v) !== "object") {
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
            super(...args)
        }
    } 
}

export type Argumentify<T extends Serializable> = 
      T extends Num ? Argument
    : T extends Str ? Argument
    : T extends (...inputs: any[]) => any ? T
    : T & { [k in keyof T]: T[k] extends Serializable ? Argumentify<T[k]> : T[k] };

export function Argumentify<T extends Serializable>(value: T, index: number): [Argumentify<T>, number] {
    const newValue = value as any;
    if (value instanceof Num) {
        return [new Argument(index, $.currentFunc!) as Argumentify<T>, ++index]
    }
    if (value instanceof Str) {
        return [new Argument(index, $.currentFunc!) as Argumentify<T>, ++index]
    }
    for (const k in value) {
        if (value[k] instanceof Num) [newValue[k], index] = Argumentify(value[k], index);
        else if (value[k] instanceof Str) [newValue[k], index] = Argumentify(value[k], index);
        else [newValue[k], index] = Argumentify(value[k] as Serializable, index);
    }
    return [newValue, index];
}
export function def
    <const T extends (new () => Serializable)[], R extends new () => Serializable & Variable>
    (argTypes: T, fn: (...args: { [K in keyof T]: Argumentify<InstanceType<T[K]>> } ) => void, returnType?: R) {
    return defRaw(argTypes, fn, returnType, false);
}
export function warp
    <const T extends (new () => Serializable)[], R extends new () => Serializable & Variable>
    (argTypes: T, fn: (...args: { [K in keyof T]: Argumentify<InstanceType<T[K]>> } ) => void, returnType?: R) {
    return defRaw(argTypes, fn, returnType, true);
}
function defRaw
    <const T extends (new () => Serializable)[], R extends new () => Serializable & Variable>
    (argTypes: T, fn: (...args: { [K in keyof T]: Argumentify<InstanceType<T[K]>> } ) => void, returnType: R | undefined, warp: boolean) {
    const oldFunc = $.currentFunc;
    const id = $.currentFunc = reserveCount();

    const oldrv = $.returnValue;
    let ret = null;
    if (returnType !== undefined) {
        ret = new returnType();
        $.returnValue = ret;
    }
    const out = {
        type: "Def",
        label: "",
        argAmount: 0,
        args: [] as ScratchArgumentType[],
        id: $.currentFunc,
        warp
    } satisfies IlNode;
    const args: any = [];
    let totalSize = 0;
    let index = 1;
    for (const arg of argTypes) {
        const a = new arg();
        const size = a.sizeof();

        totalSize += size;

        for (let i = 0; i < size; i++) {
            out.args.push("Any");
        }
        out.argAmount += size;
        const [ag, newi] = Argumentify(a, index)
        index = newi;
        args.push(ag);
    }

    const label = labelify(fn, ...args);
    $.labels.push(label);
    out.label = label.name;
    statLabel.push(out);

    $.currentFunc = oldFunc;
    $.returnValue = oldrv;
    return (...args: { [K in keyof T]: InstanceType<T[K]> }) => {
        $.functionsToAdd.push(id);
        if ($.currentSprite !== null) {
            for (const id of $.functionsToAdd) 
                if (!$.currentSprite?.implementedFunctions.has(id)) {
                    $.currentSprite?.implementedFunctions.add(id);
                    statLabel.push({
                        type: "InsertDef",
                        func: id,
                        sprites: [$.currentSprite!.id]
                    })
                };
            $.functionsToAdd = [];
        }            

        $.scope?.nodes.push({
            type: "Run",
            id,
            argAmount: totalSize,
            args: args.map(a => a.toSerialized()).flat()
        } satisfies IlNode);
        return ret as InstanceType<R>
    }
}

function makeBinaryOperatorFunction(name: BinaryOperation) {
    return (left: Valuesque, right: Valuesque): IlWrapper => {
        return new IlWrapper({
            key: "BinaryOperation",
            oper: name,
            left: toScratchValue(left),
            right: toScratchValue(right)
        })
    }
}
export const add = makeBinaryOperatorFunction("Add");
export const sub = makeBinaryOperatorFunction("Sub");
export const mul = makeBinaryOperatorFunction("Mul");
export const div = makeBinaryOperatorFunction("Div");
export const eq = makeBinaryOperatorFunction("Eq");
export const gt = makeBinaryOperatorFunction("Gt");
export const lt = makeBinaryOperatorFunction("Lt");
export const gte = makeBinaryOperatorFunction("Gte");
export const lte = makeBinaryOperatorFunction("Lte");
export const mod = makeBinaryOperatorFunction("Mod");
export const join = makeBinaryOperatorFunction("Join");
export const letterOf = makeBinaryOperatorFunction("LetterOf");
export const stringContains = makeBinaryOperatorFunction("Contains");
export const random = makeBinaryOperatorFunction("Random");
export const and = makeBinaryOperatorFunction("And");
export const or = makeBinaryOperatorFunction("Or");

function makeUnaryOperatorFunction(name: UnaryOperation) {
    return (left: Valuesque): IlWrapper => {
        return new IlWrapper({
            key: "UnaryOperation",
            oper: name,
            value: toScratchValue(left)
        })
    }
}
export const not = makeUnaryOperatorFunction("Not");
export const stringLength = makeUnaryOperatorFunction("Length");
export const round = makeUnaryOperatorFunction("Round");

function makeDropOperatorFunction(name: DropOperation) {
    return (left: Valuesque): IlWrapper => {
        return new IlWrapper({
            key: "DropOperation",
            oper: name,
            value: toScratchValue(left)
        })
    }
}

export const abs = makeDropOperatorFunction("Abs");
export const floor = makeDropOperatorFunction("Floor");
export const ceiling = makeDropOperatorFunction("Ceiling");
export const sqrt = makeDropOperatorFunction("Sqrt");
export const sin = makeDropOperatorFunction("Sin");
export const cos = makeDropOperatorFunction("Cos");
export const tan = makeDropOperatorFunction("Tan");
export const asin = makeDropOperatorFunction("Asin");
export const acos = makeDropOperatorFunction("Acos");
export const atan = makeDropOperatorFunction("Atan");
export const ln = makeDropOperatorFunction("Ln");
export const log = makeDropOperatorFunction("Log");
export const epower = makeDropOperatorFunction("EPower");
export const tenpower = makeDropOperatorFunction("TenPower");

export const isTouchingObject = (target: Valuesque | Sprite) => {
    if (target instanceof Sprite)
        return new IlWrapper({
            key: "SensingOperation",
            oper: {
                type: "TouchingObject",
                target: {
                    key: "String",
                    value: target.id
                }
            }
        });
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "TouchingObject",
            target: toScratchValue(target)
        }
    });
}
export const isTouchingColor = (color: Valuesque) => {
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "TouchingColor",
            color: toScratchValue(color)
        }
    });
}
export const ColorIsTouchingColor = (color: Valuesque, color2: Valuesque) => {
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "ColorIsTouchingColor",
            color1: toScratchValue(color),
            color2: toScratchValue(color2)
        }
    });
}
export const distanceTo = (target: Valuesque | Sprite) => {
    if (target instanceof Sprite)
        return new IlWrapper({
            key: "SensingOperation",
            oper: {
                type: "DistanceTo",
                target: {
                    key: "String",
                    value: target.id
                }
            }
        });
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "DistanceTo",
            target: toScratchValue(target)
        }
    });
}
export const keyPressed = (key: Valuesque) => {
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "KeyPressed",
            key: toScratchValue(key)
        }
    });
}
export const mouse = {
    down: () => {
        return new IlWrapper({
            key: "SensingOperation",
            oper: {
                type: "MouseDown",
            }
        });
    },
    x: () => {
        return new IlWrapper({
            key: "SensingOperation",
            oper: {
                type: "MouseX",
            }
        });
    },
    y: () => {
        return new IlWrapper({
            key: "SensingOperation",
            oper: {
                type: "MouseY",
            }
        });
    }
}
export const loudness = () => {
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "Loudness",
        }
    });
}
export const timer = () => {
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "Timer",
        }
    });
}
export const propertyOf = (property: string, object: Valuesque | Sprite) => {
    const obj = object instanceof Sprite ?
        {
            key: "String",
            value: object.id
        } satisfies IlValue : toScratchValue(object);
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "Of",
            property,
            object: obj
        }
    });
}
export const daysSince2000 = () => {
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "DaysSince2000",
        }
    });
}
export const username = () => {
    return new IlWrapper({
        key: "SensingOperation",
        oper: {
            type: "Username",
        }
    });
}

export const position = {
    x: () => new IlWrapper({ key: "Builtin", value: { key: "XPosition" } }),
    y: () => new IlWrapper({ key: "Builtin", value: { key: "YPosition" } }),
    direction: () => new IlWrapper({ key: "Builtin", value: { key: "Direction" } }),
    size: () => new IlWrapper({ key: "Builtin", value: { key: "Size" } }),
}
export const costumeNumber = () => new IlWrapper({ key: "Builtin", value: { key: "Costume", numberOrName: true }})
export const costumeName = () => new IlWrapper({ key: "Builtin", value: { key: "Costume", numberOrName: false }})
export const backdropNumber = () => new IlWrapper({ key: "Builtin", value: { key: "Backdrop", numberOrName: true }})
export const backdropName = () => new IlWrapper({ key: "Builtin", value: { key: "Backdrop", numberOrName: false }})

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
        y: toScratchValue(y)
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
        type: "NextCostume" });
}

export function switchBackdrop(backdrop: Valuesque) {
    $.scope?.push({
        type: "SwitchBackdrop",
        value: toScratchValue(backdrop),
    });
}

export function nextBackdrop() {
    $.scope?.push({
        type: "NextBackdrop" });
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
    $.scope?.push({ type: "ChangeEffectBy", effect, amount: toScratchValue(amount) });
}
export function setEffect(effect: "PAN" | "PITCH", amount: Valuesque) {
    $.scope?.push({ type: "SetEffectTo", effect, amount: toScratchValue(amount) });
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
        $.scope?.push({ type: "If", label: label.name, predicate: toScratchValue(predicate) });
    } else {
        const label = labelify(body);
        const elseLabel = labelify(elseBody);
        $.labels.push(label);
        $.labels.push(elseLabel);
        $.scope?.push({ type: "IfElse", label: label.name, label2: elseLabel.name, predicate: toScratchValue(predicate) });
    }
}
export function repeat$(times: Valuesque, body: Body) {
    const label = labelify(body);
    $.labels.push(label);
    $.scope?.push({ type: "Repeat", label: label.name, amount: toScratchValue(times) });
}
export function while$(predicate: Valuesque, body: Body) {
    const label = labelify(body);
    $.labels.push(label);
    $.scope?.push({ type: "RepeatUntil", label: label.name, predicate: not(predicate).toScratchValue() });
}

export function return$(value: Variable | string | number) {
    if (typeof value === "number") $.returnValue?.set(value)
    else if (typeof value === "string") $.returnValue?.set(value)
    else $.returnValue?.set(value);
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
                value: value.id
            }
        })
    } else $.scope?.push({
        type: "Broadcast",
        value: toScratchValue(value)
    });
}

export function broadcastWait(value: Valuesque): void;
export function broadcastWait(value: Broadcast): void;
export function broadcastWait(value: Valuesque | Broadcast) {
    if (value instanceof Broadcast) {
        $.scope?.push({
            type: "BroadcastWait",
            value: {
                key: "String",
                value: value.id
            }
        })
    } else $.scope?.push({
        type: "BroadcastWait",
        value: toScratchValue(value)
    });
}

export const pen = {
    clear: () => {
        $.scope?.push({
            type: "PenEraseAll",
        })
    },
    stamp: () => {
        $.scope?.push({
            type: "PenStamp",
        })
    },
    down: () => {
        $.scope?.push({
            type: "PenDown",
        })
    },
    up: () => {
        $.scope?.push({
            type: "PenUp",
        })
    },
    setColor: (value: Valuesque) => {
        $.scope?.push({
            type: "PenSetPenColor",
            color: toScratchValue(value)
        })
    },
    setParam: (param: Valuesque, amount: Valuesque) => {
        $.scope?.push({
            type: "PenSetValue",
            value: toScratchValue(param),
            amount: toScratchValue(amount),
        })
    },
    changeParam: (param: Valuesque, amount: Valuesque) => {
        $.scope?.push({
            type: "PenChangeValue",
            value: toScratchValue(param),
            amount: toScratchValue(amount),
        })
    },
    changeSize: (amount: Valuesque) => {
        $.scope?.push({
            type: "PenChangeSize",
            value: toScratchValue(amount),
        })
    },
    setSize: (amount: Valuesque) => {
        $.scope?.push({
            type: "PenSetSize",
            value: toScratchValue(amount),
        })
    }
}