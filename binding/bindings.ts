import { FileFormat, IlNode } from "../ir/types.ts";

export const $ = {
    COUNTER: 0,
    labels: new Map<string, IlNode[]>(),
};
const statLabel = $.labels.set("stat", []).get("stat")!;

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
