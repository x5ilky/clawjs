import { FileFormat, IlNode, IlValue } from "../ir/types.ts";

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
    scope: null as Label | null
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

export class Num implements SingleValue, Serializable {
    id: string;
    constructor() {
        this.id = reserveCount();
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

export function goto(x: Valuesque, y: Valuesque) {
    $.scope?.push({
        type: "GotoXY",
        x: toScratchValue(x),
        y: toScratchValue(y)
    });
}