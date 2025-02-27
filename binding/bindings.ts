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
            })
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
    fromSerialized(target: Serializable, values: IlValue[]): void;
}