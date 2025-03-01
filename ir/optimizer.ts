import { VariableClawType } from "../claw/typechecker.ts";
import { IlNode, IlValue } from "./types.ts";

export class Optimizer {
    labels: IlNode[];
    statLabel: IlNode[];

    variableReplacements: Map<string, IlValue>;

    constructor(labels: IlNode[]) {
        this.labels = labels;
        this.variableReplacements = new Map();
        // @ts-ignore: im not writing type assertions for this
        this.statLabel = labels.find(a => a.type === "Label" && a.value[0] === "stat")!.value[1];
    }

    optimize() {
        let prevLength = this.labels.length;
        while (true) {
            this.redundantVariablePass()

            const newLength = this.labels.length;
            if (prevLength === newLength) break;
            prevLength = newLength;
        }
    }

    /**
     * Checks for situations such as:
     * x = 10
     * push x
     * 
     * where we can instead just substitute
     * 
     * push 10
     */
    redundantVariablePass() {
        // const redundantVars = this.countVariableAssignments();
        // console.log(redundantVars.values().filter(a => a.count > 0).toArray().length)
        // for (const [k, v] of redundantVars) {
        //     if (v.count > 1) continue;
        //     if (v.count === 0) this.statLabel.splice(this.statLabel.findIndex(a => a.type === "CreateVar" && a.name === k), 1);
            
        //     this.variableReplacements.set(k, v.definitions[0])
        //     while (true) {
        //         const count = this.countVariableUsage();
        //         if (count.get(k)! > 0) {
        //             this.replaceVariableUsage(k, v.definitions[0]); 
        //         } else break;
        //     }
        // }
    }

    countVariableUsage() {
        const map = new Map<string, number>();
        for (const label of this.labels) {
            if (label.type !== "Label") continue;
            const [id, nodes] = label.value;
            for (const node of nodes) {
                for (const k in node) {
                    const v = node[k as keyof typeof node];
                    if (isObjectProbablyIlValue(v)) {
                        this.countVariableUsageInValues(v, map);
                    }
                }
            }
        }
        return map;
    }

    countVariableAssignments() {
        const map = new Map<string, { count: number, definitions: IlValue[] }>();
        for (const label of this.labels) {
            if (label.type !== "Label") continue;
            const [_id, nodes] = label.value;
            for (const node of nodes) {
                if (node.type === "Set" || node.type === "Change") {
                    if (!map.has(node.target)) map.set(node.target, { count: 1, definitions: [node.value] })
                    else {
                        const v = map.get(node.target)!;
                        v.count++;
                        v.definitions.push(node.value);
                        map.set(node.target, v);
                    }
                }
            }
        }
        
        return map;
    }

    countVariableUsageInValues(value: IlValue, map: Map<string, number>) {
        switch(value.key) {
            case "Integer":
            case "Float":
            case "String":
            case "Color":
            case "Argument":
            case "Costume":
            case "Sound":
            case "Target":
                return;
            case "Variable":
                if (map.has(value.name)) {
                    map.set(value.name, map.get(value.name)!+1)
                } else map.set(value.name, 1)
                return;
            case "UnaryOperation": 
                this.countVariableUsageInValues(value.value, map); 
                return;
            case "BinaryOperation": 
                this.countVariableUsageInValues(value.left, map); 
                this.countVariableUsageInValues(value.right, map); 
                return;
            case "DropOperation":
                this.countVariableUsageInValues(value.value, map); 
                return;
            case "SensingOperation":
            case "Builtin":
            case "ListValue":
                for (const k in value) {
                    const v = value[k as keyof typeof value];
                    if (isObjectProbablyIlValue(v)) {
                        this.countVariableUsageInValues(v, map);
                    }
                }
                return;
        }
    }

    replaceVariableUsage(name: string, value: IlValue) {
        for (const label of this.labels) {
            if (label.type !== "Label") continue;
            const [id, nodes] = label.value;
            for (const node of nodes) {
                for (const k in node) {
                    const v = node[k as keyof typeof node];
                    if (isObjectProbablyIlValue(v)) {
                        // deno-lint-ignore no-explicit-any
                        node[k as keyof typeof node] = this.replaceVariableWithValueInValue(name, value, v) as any;
                    }
                }
            }
        }
    }
    replaceVariableWithValueInValue(name: string, value: IlValue, target: IlValue) {
        switch(target.key) {
            case "Integer":
            case "Float":
            case "String":
            case "Color":
            case "Argument":
            case "Costume":
            case "Sound":
            case "Target":
                break;
            case "Variable":
                if (target.name === name) {
                    return value;
                }
                break;
            case "UnaryOperation": 
                target.value = this.replaceVariableWithValueInValue(name, value, target.value); 
                break;
            case "BinaryOperation": 
                target.left = this.replaceVariableWithValueInValue(name, value, target.left); 
                target.right = this.replaceVariableWithValueInValue(name, value, target.right); 
                break;
            case "DropOperation":
                target.value = this.replaceVariableWithValueInValue(name, value, target.value); 
                break;
            case "SensingOperation":
            case "Builtin":
            case "ListValue":
                for (const k in target) {
                    const v = target[k as keyof typeof target];
                    if (isObjectProbablyIlValue(v)) {
                        // deno-lint-ignore no-explicit-any
                        target[k as keyof typeof target] = this.replaceVariableWithValueInValue(name, value, v) as any; 
                    }
                }
                break;
        }
        return target;
    }
}

function isObjectProbablyIlValue(t: any): t is IlValue {
    return typeof t === "object" && "key" in t && t.key === "Integer" || t.key === "Float" || t.key === "String" || t.key === "Variable" || t.key === "Color" || t.key === "Target" || t.key === "UnaryOperation" || t.key === "BinaryOperation" || t.key === "DropOperation" || t.key === "SensingOperation" || t.key === "Argument" || t.key === "Builtin" || t.key === "Costume"  || t.key === "Sound" || t.key === "ListValue"
}