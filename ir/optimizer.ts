// deno-lint-ignore-file no-explicit-any
import type { IlNode, IlValue } from "./types.ts";

export type OptimizerOptions = {
    variableReplacements: boolean,
    redundantOperations: boolean,
    redundantControlFlow: boolean
}

export class Optimizer {
    labels: IlNode[];
    statLabel: IlNode[];

    variableReplacements: Map<string, IlValue>;
    options: OptimizerOptions;

    constructor(labels: IlNode[], options?: Partial<OptimizerOptions>) {
        this.labels = labels;
        this.variableReplacements = new Map();
        // @ts-ignore: im not writing type assertions for this
        this.statLabel = labels.find(a => a.type === "Label" && a.value[0] === "stat")!.value[1];
        this.options = {
            redundantControlFlow: options?.redundantControlFlow ?? true,
            redundantOperations: options?.redundantOperations ?? true,
            variableReplacements: options?.variableReplacements ?? true,
        }
    }

    optimize(): void {
        const PASSES = 5;
        let prevLength = this.labels.length;
        while (true) {
            for (let i = 0; i < PASSES; i++) {
                if (this.options.redundantOperations) this.redundantOperationPass();
                if (this.options.variableReplacements) this.redundantVariablePass();
                if (this.options.redundantControlFlow) this.redundantControlFlowPass();
            }

            const newLength = this.labels.length;
            if (prevLength === newLength) break;
            prevLength = newLength;
        }
    }

    /**
     * check for situations such as:
     *  say 1*1 + 1
     * 
     * the 1*1 is redundant, so we can just put
     * 
     *  say 1 + 1
     */
    redundantOperationPass(): void {
        this.replaceValueUsage(v => {
            return this.cloneValue(v, {
                BinaryOperation: (v) => {
                    if (v.key !== "BinaryOperation") return v;
                    if (v.oper === "Mul") {
                        if (v.left.key === "Float" && v.right.key === "Float") return {
                            key: "Float",
                            value: v.left.value * v.right.value
                        }
                        if (v.left.key === "Float" && v.left.value === 1) return v.right;
                        if (v.right.key === "Float" && v.right.value === 1) return v.left;
                        if (v.left.key === "Float" && v.left.value === 0) return v.left;
                        if (v.right.key === "Float" && v.right.value === 0) return v.right;
                    }
                    if (v.oper === "Div") {
                        if (v.left.key === "Float" && v.right.key === "Float") return {
                            key: "Float",
                            value: v.left.value / v.right.value
                        }
                        if (v.left.key === "Float" && v.left.value === 1) return v.right;
                        if (v.right.key === "Float" && v.right.value === 1) return v.left;
                    }
                    if (v.oper === "Add") {
                        if (v.left.key === "Float" && v.right.key === "Float") return {
                            key: "Float",
                            value: v.left.value + v.right.value
                        }
                        if (v.left.key === "Float" && v.left.value === 0) return v.right;
                        if (v.right.key === "Float" && v.right.value === 0) return v.left;
                    }
                    if (v.oper === "Sub") {
                        if (v.left.key === "Float" && v.right.key === "Float") return {
                            key: "Float",
                            value: v.left.value - v.right.value
                        }
                        if (v.left.key === "Float" && v.left.value === 0) return v.right;
                        if (v.right.key === "Float" && v.right.value === 0) return v.left;
                    }
                    if (v.oper === "Eq") {
                        if (v.left.key === "Float" && v.right.key === "Float") 
                            return {
                                key: "Bool",
                                value: v.left.value === v.right.value
                            };
                    }
                    if (v.oper === "Or") {
                        if (v.left.key === "Bool")
                            if (v.left.value)
                                return {
                                    key: "Bool",
                                    value: true
                                }
                            else return v.right
                        if (v.right.key === "Bool")
                            if (v.right.value)
                                return {
                                    key: "Bool",
                                    value: true
                                }
                            else return v.left
                    }
                    if (v.oper === "And") {
                        if (v.left.key === "Bool" && v.left.value === false)
                            return {
                                key: "Bool",
                                value: false
                            }
                        if (v.right.key === "Bool" && v.right.value === false)
                            return {
                                key: "Bool",
                                value: false
                            }
                    }
                    return v;
                }
            })
        })
    }
    /**
     * Checks for situations such as:
     * x = 10
     * push x
     * 
     * where we can instead just substitute
     * push 10
     * 
     * exceptions:
     *  x = list[0]
     *  push x
     * 
     * this will not be transformed because list[0] can change
     */
    redundantVariablePass(): void {
        const redundantVars = this.countVariableAssignments();
        for (const [k, v] of redundantVars) {
            if (v.count > 1) continue;
            if (v.count === 0) this.statLabel.splice(this.statLabel.findIndex(a => a.type === "CreateVar" && a.name === k), 1);
            
            let referenceCount = 0;
            this.cloneValue(v.definitions[0], {
                SensingOperation: (v) => {
                    referenceCount++;
                    return v;
                },
                ListValue: (v) => {
                    referenceCount++;
                    return v;
                },
            });
            if (referenceCount > 0) continue;
            this.variableReplacements.set(k, v.definitions[0])
        }
        for (const [k, v] of this.variableReplacements) {
            this.variableReplacements.set(
                k,
                this.replaceVariableUsageInValue(v, this.variableReplacements)
            )
        }
        this.replaceVariableAllUsage(this.variableReplacements);
        for (const [k, _v] of this.variableReplacements) {
            this.statLabel = this.statLabel.filter(a => {
                if (a.type === "CreateVar") {
                    if (a.name === k) return false;
                }
                return true;
            });
            this.labels = this.labels.map(a => {
                if (a.type !== "Label") return a;
                a.value[1] = a.value[1].filter(b => {
                    if (b.type === "Set" || b.type === "Change") {
                        if (b.target === k) return false;
                    }
                    return true;
                })
                return a;
            })
        }
    }

    redundantControlFlowPass(): void {
        for (const label of this.labels) {
            if (label.type !== 'Label') continue;

            const [_id, nodes] = label.value;
            const newNodes = [];
            for (const node of nodes) {
                if (node.type === "If") {
                    if (node.predicate.key === "Bool") {
                        if (node.predicate.value)  {
                            const l = this.labels.find(a => a.type === 'Label' && a.value[0] === node.label);
                            if (l?.type !== "Label") continue;
                            newNodes.push(...l.value[1])
                        }
                    } else {
                        newNodes.push(node);
                    }
                } else if (node.type === "Repeat") {
                    if (node.amount.key === "Float") {
                        const l = this.labels.find(a => a.type === 'Label' && a.value[0] === node.label);
                        if (l?.type !== "Label") continue;
                        if (node.amount.value <= 5 && l.value[1].length <= 3) {
                            for (let i = 0; i < node.amount.value; i++) {
                                newNodes.push(...l.value[1]);
                            }
                        } else {
                            newNodes.push(node);
                        }
                    } else {
                        newNodes.push(node);
                    }
                } else {
                    newNodes.push(node);
                }
            }
            label.value[1] = newNodes;
        }
    }

    countVariableUsage(): Map<string, number> {
        const map = new Map<string, number>();
        this.replaceValueUsage(v => {
            if (isObjectProbablyIlValue(v)) {
                this.countVariableUsageInValues(v, map);
            }
            return v;
        })
        return map;
    }

    countVariableAssignments(): Map<string, { count: number, definitions: IlValue[] }> {
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


    replaceVariableAllUsage(map: Map<string, IlValue>) {
        this.replaceValueUsage(v => this.replaceVariableUsageInValue(v, map))
    }
    replaceValueUsage(value: (v: IlValue) => IlValue) {
        for (const label of this.labels) {
            if (label.type !== "Label") continue;
            const [_id, nodes] = label.value;
            for (const node of nodes) {
                for (const k in node) {
                    const K = k as keyof typeof node;
                    if (isObjectProbablyIlValue(node[K])) {
                        (node[K] as any) = value(node[K])
                    }
                }
                if (node.type === "ListOper") {
                    for (const k in node.oper) {
                        const K = k as keyof typeof node.oper;
                        if (isObjectProbablyIlValue(node.oper[K])) {
                            (node.oper[K] as any) = value(node.oper[K])
                        }
                    }
                }
                if (node.type === "Run") {
                    node.args = node.args.map(a => value(a));
                }
            }
        }
    }

    replaceVariableUsageInValue(value: IlValue, map: Map<string, IlValue>): IlValue {
        return this.cloneValue(value, {
            Variable: (v) => {
                if (v.key !== "Variable") return v;
                if (map.has(v.name)) return map.get(v.name)!;
                return v;
            }
        });
    }

    cloneValue(value: IlValue, cb: { [k in IlValue["key"]]?: (v: IlValue) => IlValue }): IlValue {
        switch (value.key) {
            case "Integer": 
            case "String":
            case "Variable":
            case "Color":
            case "Argument":
            case "Costume":
            case "Sound":
            case "Target": 
            case "Bool":
            case "Float": return cb?.[value.key] === undefined ? value : cb[value.key]!(value);
            case "UnaryOperation": {
                const c = cb["UnaryOperation"] ?? (k => k);
                return c({
                    key: "UnaryOperation",
                    oper: value.oper,
                    value: this.cloneValue(value.value, cb)
                })
            }
            case "BinaryOperation": {
                const c = cb["BinaryOperation"] ?? (k => k);
                return c({
                    key: "BinaryOperation",
                    oper: value.oper,
                    left: this.cloneValue(value.left, cb),
                    right: this.cloneValue(value.right, cb)
                })
            }
            case "DropOperation": {
                const c = cb["DropOperation"] ?? (k => k);
                return c({
                    key: "DropOperation",
                    oper: value.oper,
                    value: this.cloneValue(value.value, cb)
                })
            }
            case "SensingOperation": {
                const c = cb["SensingOperation"] ?? (k => k);
                switch (value.oper.type) {
                    case "TouchingObject": 
                        return c({
                            key: "SensingOperation",
                            oper: {
                                type: "TouchingObject",
                                target: this.cloneValue(value.oper.target, cb)
                            }
                        })
                    case "TouchingColor":
                        return c({
                            key: "SensingOperation",
                            oper: {
                                type: "TouchingColor",
                                color: this.cloneValue(value.oper.color, cb)
                            }
                        })
                    case "ColorIsTouchingColor":
                        return c({
                            key: "SensingOperation",
                            oper: {
                                type: "ColorIsTouchingColor",
                                color1: this.cloneValue(value.oper.color1, cb),
                                color2: this.cloneValue(value.oper.color2, cb)
                            }
                        })
                    case "DistanceTo":
                        return c({
                            key: "SensingOperation",
                            oper: {
                                type: "DistanceTo",
                                target: this.cloneValue(value.oper.target, cb),
                            }
                        })
                    case "KeyPressed":
                        return c({
                            key: "SensingOperation",
                            oper: {
                                type: "KeyPressed",
                                key: this.cloneValue(value.oper.key, cb),
                            }
                        })
                    case "Of":
                        return c({
                            key: "SensingOperation",
                            oper: {
                                type: "Of",
                                object: this.cloneValue(value.oper.object, cb),
                                property: value.oper.property
                            }
                        })
                    case "Current":
                    case "DaysSince2000":
                    case "Username":
                    case "MouseDown":
                    case "MouseX":
                    case "MouseY":
                    case "Loudness":
                    case "Timer":
                        return c(value);
                }
            } break;
            case "Builtin":
                return value;
            case "ListValue": {
                const c = cb.ListValue ?? ((v) => v);
                switch (value.value.key) {
                    case "Index": return c({
                        key: "ListValue",
                        list: value.list,
                        value: {
                            key: "Index",
                            index: this.cloneValue(value.value.index, cb)
                        }
                    })
                    case "Find": return c({
                        key: "ListValue",
                        list: value.list,
                        value: {
                            key: "Find",
                            value: this.cloneValue(value.value.value, cb)
                        }
                    })
                    case "Length": return c(value);
                    case "Contains": return c({
                        key: "ListValue",
                        list: value.list,
                        value: {
                            key: "Contains",
                            value: this.cloneValue(value.value.value, cb)
                        }
                    })
                }
            }
        }
    }

    isFullyLiteral(value: IlValue): boolean {
        let isLit = true;
        this.cloneValue(value, {
            ListValue: v => {
                isLit = false
                return v;
            },
            Variable: v => {
                isLit = false;
                return v;
            }
        });

        return isLit;
    }
}

function isObjectProbablyIlValue(t: any): t is IlValue {
    return typeof t === "object" && "key" in t && t.key === "Integer" || t.key === "Float" || t.key === "String" || t.key === "Variable" || t.key === "Color" || t.key === "Target" || t.key === "UnaryOperation" || t.key === "BinaryOperation" || t.key === "DropOperation" || t.key === "SensingOperation" || t.key === "Argument" || t.key === "Builtin" || t.key === "Costume"  || t.key === "Sound" || t.key === "ListValue"
}