// deno-lint-ignore-file no-explicit-any
import { StopType } from "../ir/types.ts";
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
    currentFunc: null as string | null
};
const statLabel = $.labels.find(a => a.name === "stat")!;

export type Body = () => void;
function labelify(body: Body) {
    const oldScope = $.scope;
    $.scope = new Label(reserveCount(), []);
    body();
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

    constructor(isStage = false) {
        this.isStage = isStage;
        this.costumes = [];
        this.id = reserveCount();
        statLabel.push({
            type: "CreateSpr",
            isStage,
            id: this.id,
            name: this.id
        })
    }

    addCostume(costume: Costume) {
        statLabel.push({
            type: "AddSprCostume",
            ...costume,
            id: this.id
        })
    }

    onFlag(body: Body) {
        const b = labelify(body);
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
        const b = labelify(body);
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
        const b = labelify(body);
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
        const b = labelify(body);
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
        const b = labelify(body);
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
    fromSerialized(targets: string[], values: IlValue[]): IlNode[];
}
export interface Variable {
    setInner(ids: IlValue[]): void;
}
export type Valuesque = SingleValue | number | string;
export function toScratchValue(value: Valuesque): IlValue {
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
    } else return value.toScratchValue();
}

export class IlWrapper implements SingleValue {
    constructor(private value: IlValue) {

    }

    toScratchValue(): IlValue {
      return this.value
    }
}
export class Num implements SingleValue, Serializable {
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
    fromSerialized(targets: string[], values: IlValue[]): IlNode[] {
        return [{
            type: "Set",
            target: targets.shift()!,
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
export class Str implements SingleValue, Serializable {
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
    fromSerialized(targets: string[], values: IlValue[]): IlNode[] {
        return [{
            type: "Set",
            target: targets.shift()!,
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
export class List<T extends Serializable> {
    id: string;
    constructor() {
        this.id = reserveCount();
        statLabel.push({
            type: "CreateList",
            name: this.id
        });
    }
    
    push(value: T) {
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
    insert(value: T, index: Valuesque) {
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
    replace(value: T, index: Valuesque) {
        const serd = value.toSerialized();
        for (let i = 0; i < serd.length; i++) {
            $.scope?.push({
                type: "ListOper",
                list: this.id,
                oper: {
                    key: "Replace",
                    index: toScratchValue(index),
                    value: add(new IlWrapper(serd[i]), i)
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

}

// deno-lint-ignore ban-types
export function DataClass<T extends { new (...args: any[]): {} }>(cl: T): T & { new (...args: any[]): Serializable } {
    return class extends cl implements Serializable {
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
        fromSerialized(targets: string[], values: IlValue[]): IlNode[] {
            const out: IlNode[] = []
            for (const key in this) {
                const v = this[key] as any;
                if (typeof(v) !== "object") {
                    throw new Error("Class member not serializable");
                }
                if (!("fromSerialized" in v)) {
                    throw new Error("Class member not serializable");
                }
                out.push(...v.fromSerialized(targets, values));
            } 
            return out;
        }
        constructor(...args: any[]) {
            super(...args)
        }
    } 
}

function makeBinaryOperatorFunction(name: BinaryOperation) {
    return (left: Valuesque, right: Valuesque): IlValue => {
        return {
            key: "BinaryOperation",
            oper: name,
            left: toScratchValue(left),
            right: toScratchValue(right)
        }
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

function makeUnaryOperatorFunction(name: UnaryOperation) {
    return (left: Valuesque): IlValue => {
        return {
            key: "UnaryOperation",
            oper: name,
            value: toScratchValue(left)
        }
    }
}
export const not = makeUnaryOperatorFunction("Not");
export const stringLength = makeUnaryOperatorFunction("Length");
export const round = makeUnaryOperatorFunction("Round");

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

export function return$(value: Valuesque) {
    $.scope?.push({ type: "Return", func: $.currentFunc!, value: toScratchValue(value) });
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

