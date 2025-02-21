import { IlNode } from "../ir/types.ts";
import { ChainMap } from "./chainmap.ts";
import { IntrinsicInstr, IR } from "./flattener.ts";

type ClawValue = 
    | {
        type: "number",
        value: number
    }
    | {
        type: "string",
        value: string
    }
    | {
        type: "boolean",
        value: boolean
    } 
    | {
        type: "struct",
        value: Map<string, ClawValue>
    }
    | {
        type: "void"
    }
    | {
        type: "jsobject",
        // deno-lint-ignore no-explicit-any
        value: any
    }
    | {
        type: "label",
        name: string,
        blocks: IlNode[]
    }
    | {
        type: "array",
        values: ClawValue[]
    };
// deno-lint-ignore no-explicit-any
function ClawValueToObject(v: ClawValue): any {
    switch (v.type) {
        case "string": return v.value
        case "number": return v.value
        case "boolean": return v.value
        case "struct": return Object.fromEntries(v.value.entries().map(a => [a[0], ClawValueToObject(a[1])]))
        case "void": return void 0;
        case "jsobject": return v.value
        case "label": return v
        case "array": return v.values.map(a => ClawValueToObject(a))
    }
}
// deno-lint-ignore no-explicit-any
function ObjectToClawValue(v: any): ClawValue {
    if (typeof v === "string") return { type: "string", value: v };
    if (typeof v === "number") return { type: "number", value: v };
    if (typeof v === "boolean") return { type: "boolean", value: v };
    if (typeof v === "object") return { type: "jsobject", value: new Map(Object.entries(v).map(([k, v]) => [k, ObjectToClawValue(v)])) };
    if (Array.isArray(v)) return { type: "array", values: v.map(ObjectToClawValue) };
    return {type: "void"}
}

function printSync(input: string | Uint8Array, to = Deno.stdout) {
    let bytesWritten = 0
    const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
    while (bytesWritten < bytes.length) {
        bytesWritten += to.writeSync(bytes.subarray(bytesWritten))
    }
}

export class Interpreter {
    ip: number;
    variables: Map<string, ClawValue>;
    scope: ChainMap<string, ClawValue>;
    callStack: number[];
    counter: number;
    labels: Map<string, IlNode[]>;

    constructor() {
        this.ip = 0;
        this.variables = new Map();
        this.scope = new ChainMap();
        this.callStack = [];
        this.counter = 0;
        this.labels = new Map();
    }

    reserve(): string {
        return `CL_${this.counter++}`
    }
    interpret(ir: IR[]) {
        while (this.ip < ir.length) {
            const DEBUG_FLAG = false;
            if (DEBUG_FLAG) {
                console.log(this.ip, ir.slice(this.ip, this.ip+3).map(a => `${a.type} ${Object.entries(a).filter(([k, v]) => k !== "type").map(([k, v]) => `${k} = ${v}`).join(", ")}`))
                console.log(this.callStack, this.variables)
                this.interpretOne(ir[this.ip]);
                console.log(this.ip)
                prompt("")
            } else {
                this.interpretOne(ir[this.ip])
            }
        }
    }

    setValue(id: string, value: ClawValue) {
        if (id[0] === "@") {
            this.scope.set(id, value);
        } else this.variables.set(id, value);
    }
    getValue(id: string) {
        if (id[0] === "@") {
            return this.scope.get(id)!;
        } else return this.variables.get(id)!;
    }

    private interpretOne(ir: IR) {
        switch (ir.type) {
            case "LetInstr": {
                this.variables.set(ir.name, {
                    type: "void"
                });
                this.ip++;
            } break;
            case "TempInstr": {
                this.scope.set(ir.name, {
                    type: "void"
                });
                this.ip++;
            } break;
            case "SetInstr": {
                this.setValue(ir.target, this.getValue(ir.value));
                this.ip++;
            } break;
            case "SetNumberInstr": {
                this.setValue(ir.target, {
                    type: "number",
                    value: ir.value
                });
                this.ip++;
            } break
            case "SetStringInstr": {
                this.setValue(ir.target, {
                    type: "string",
                    value: ir.value
                });
                this.ip++;
            } break;
            case "SetBooleanInstr": {
                this.setValue(ir.target, {
                    type: "boolean",
                    value: ir.value
                });
                this.ip++;
            } break;
            case "SetStructInstr": {
                this.setValue(ir.target, {
                    type: "struct",
                    value: new Map(ir.values.entries().map(([k, v]) => [k, this.getValue(v)!]))
                });;
                this.ip++;
            } break;
            case "SetArgInstr": {
                this.setValue(ir.target, this.getValue(`$internal-arg-${ir.count}`));
                this.ip++;
            } break
            case "JumpInstr": {
                this.ip = ir.ip;
            } break
            case "JumpIfFalseInstr": {
                const value = this.getValue(ir.value);
                if (value.type === "boolean" && value.value === false) this.ip = ir.ip;
                else 
                    this.ip++;
            } break;
            case "PushScope": this.scope.push(); this.ip++; break;
            case "PopScope": this.scope.pop(); this.ip++; break
            case "RetInstr": {
                this.ip = this.callStack.pop()!;
                this.ip++;
            } break;
            case "CallInstr": {
                for (let i = 0; i < ir.args.length; i++) {
                    this.setValue(`$internal-arg-${i}`, this.getValue(ir.args[i]));
                }
                // if (ir.comment.includes("to_scratch_value") || ir.comment.includes("set")) console.log("call", ir.comment)
                this.callStack.push(this.ip);
                this.ip = ir.location;
            } break;
            case "CallValueInstr": {
                for (let i = 0; i < ir.args.length; i++) {
                    this.setValue(`$internal-arg-${i}`, this.getValue(ir.args[i]));
                }
                const v = this.getValue(ir.value);
                if (v.type === "number") {
                    this.ip = v.value;
                }
            } break;
            case "IntrinsicInstr": {
                this.doIntrinsic(ir);
                this.ip++;
            } break;
            case "GetChildOfInstr": {
                const v = this.getValue(ir.value);
                if (v.type === "struct") {
                    this.setValue(ir.target, v.value.get(ir.child)!);
                }
                this.ip++;
            } break;
            case "CreateLabelInstr": {
                // todo
                this.setValue(ir.target, {
                    type: "label",
                    name: this.reserve(),
                    blocks: []
                })
                this.ip++;
            } break;
            case "CloneInstr": {
                this.setValue(ir.target, structuredClone(this.getValue(ir.value)))
                this.ip++;
            } break;
        }
    }
    doIntrinsic(int: IntrinsicInstr) {
        const v = this.evalIntrinsic(int);
        if (v !== undefined) {
            this.setValue(int.target, v);
        }
    }
    evalIntrinsicOperator(int: IntrinsicInstr): ClawValue | undefined {
        switch (int.name) {
            case "$iuop-Not-bool-bool": {
                const [left] = int.args;
                const [l] = [this.getValue(left)];
                if (l.type === "boolean") return {
                    type: "boolean",
                    value: !l.value
                };
            } break;
            case "$iuop-Negate-number-number": {
                const [left] = int.args;
                const [l] = [this.getValue(left)];
                if (l.type === "number") return {
                    type: "number",
                    value: -l.value
                };
            } break;
            case "$iuop-BitwiseNot-number-number": {
                const [left] = int.args;
                const [l] = [this.getValue(left)];
                if (l.type === "number") return {
                    type: "number",
                    value: ~l.value
                };
            } break;
            case "$ibop-Add-number-number": {
                const [left, right] = int.args;
                const [l, r] = [this.getValue(left), this.getValue(right)];
                if (l.type === "number" && r.type === "number") return {
                    type: "number",
                    value: l.value + r.value
                };
            } break;
            case "$ibop-Sub-number-number": {
                const [left, right] = int.args;
                const [l, r] = [this.getValue(left), this.getValue(right)];
                if (l.type === "number" && r.type === "number") return {
                    type: "number",
                    value: l.value - r.value
                };
            } break;
            case "$ibop-Mul-number-number": {
                const [left, right] = int.args;
                const [l, r] = [this.getValue(left), this.getValue(right)];
                if (l.type === "number" && r.type === "number") return {
                    type: "number",
                    value: l.value * r.value
                };
            } break;
            case "$ibop-Div-number-number": {
                const [left, right] = int.args;
                const [l, r] = [this.getValue(left), this.getValue(right)];
                if (l.type === "number" && r.type === "number") return {
                    type: "number",
                    value: l.value / r.value
                };
            } break;
            case "$ibop-Mod-number-number": {
                const [left, right] = int.args;
                const [l, r] = [this.getValue(left), this.getValue(right)];
                if (l.type === "number" && r.type === "number") return {
                    type: "number",
                    value: l.value % r.value
                };
            } break;
            case "$ibop-Lt-number-bool": {
                const [left, right] = int.args;
                const [l, r] = [this.getValue(left), this.getValue(right)];
                if (l.type === "number" && r.type === "number") return {
                    type: "boolean",
                    value: l.value < r.value
                };
            } break;
            case "$ibop-Gt-number-bool": {
                const [left, right] = int.args;
                const [l, r] = [this.getValue(left), this.getValue(right)];
                if (l.type === "number" && r.type === "number") return {
                    type: "boolean",
                    value: l.value > r.value
                };
            } break;
            case "$ibop-Lte-number-bool": {
                const [left, right] = int.args;
                const [l, r] = [this.getValue(left), this.getValue(right)];
                if (l.type === "number" && r.type === "number") return {
                    type: "boolean",
                    value: l.value <= r.value
                };
            } break;
            case "$ibop-Gte-number-bool": {
                const [left, right] = int.args;
                const [l, r] = [this.getValue(left), this.getValue(right)];
                if (l.type === "number" && r.type === "number") return {
                    type: "boolean",
                    value: l.value >= r.value
                };
            } break;
            case "$ibop-Eq-number-bool": {
                const [left, right] = int.args;
                const [l, r] = [this.getValue(left), this.getValue(right)];
                if (l.type === "number" && r.type === "number") return {
                    type: "boolean",
                    value: l.value == r.value
                };
            } break;
            case "$ibop-Neq-number-bool": {
                const [left, right] = int.args;
                const [l, r] = [this.getValue(left), this.getValue(right)];
                if (l.type === "number" && r.type === "number") return {
                    type: "boolean",
                    value: l.value != r.value
                };
            } break;
            case "$ibop-BitwiseXor-number-number": {
                const [left, right] = int.args;
                const [l, r] = [this.getValue(left), this.getValue(right)];
                if (l.type === "number" && r.type === "number") return {
                    type: "number",
                    value: l.value ^ r.value
                };
            } break;
            case "$ibop-BitwiseAnd-number-number": {
                const [left, right] = int.args;
                const [l, r] = [this.getValue(left), this.getValue(right)];
                if (l.type === "number" && r.type === "number") return {
                    type: "number",
                    value: l.value & r.value
                };
            } break;
            case "$ibop-BitwiseOr-number-number": {
                const [left, right] = int.args;
                const [l, r] = [this.getValue(left), this.getValue(right)];
                if (l.type === "number" && r.type === "number") return {
                    type: "number",
                    value: l.value | r.value
                };
            } break;
            default: {
                throw new Error(`Unknown operation ${int.name}`)
            }
        }
    }
    evalIntrinsic(int: IntrinsicInstr): ClawValue | undefined {
        if (int.name.startsWith("$ibop")) return this.evalIntrinsicOperator(int);
        if (int.name.startsWith("$iuop")) return this.evalIntrinsicOperator(int);
        switch (int.name) {
            case "$1args-print": {
                const [vi] = int.args;
                const value = this.getValue(vi);
                if (value.type === "number") {
                    printSync(`${value.value}`); 
                    return undefined;
                } else if (value.type === "string") {
                    printSync(`${value.value}`);
                    return undefined;
                } else if (value.type === "boolean") {
                    printSync(`${value.value ? "true" : "false"}`)
                } else {
                    printSync(`${JSON.stringify(ClawValueToObject(value))}`);
                }
                return undefined;
            }
            case "$0args-js_object_create": {
                return {
                    type: "jsobject",
                    value: {}
                }
            }
            case "$3args-js_object_set": {
                const [targetId, keyId, valueId] = int.args;
                const t = this.getValue(targetId);
                if (t.type !== "jsobject") throw new Error(`target not jsobject`);
                const k = this.getValue(keyId);
                if (k.type !== "string") throw new Error(`key not string`);
                const v = this.getValue(valueId);
                t.value[k.value] = ClawValueToObject(v)
                // console.log("set", t.value, "[", k.value, "] =", ClawValueToObject(v), valueId)
                // prompt()
                return {
                    type: "void"
                }
            }
            case "$1args-set_label": {
                const label = this.getValue(int.args[0]);
                if (label.type !== "label") throw new Error(`label not label`);
                this.labels.set(label.name, label.blocks);
                return {
                    type: "void"
                }
            }
            case "$0args-create_stat_label": {
                return {
                    type: "label",
                    name: "stat",
                    blocks: []
                }
            }
            case "$2args-label_push_object": {
                const [labelId, objectId] = int.args;
                const label = this.getValue(labelId);
                if (label.type !== "label") throw new Error(`label not label`);
                const object = this.getValue(objectId);
                if (object.type !== "jsobject") throw new Error(`object not object`);
                label.blocks.push(object.value)
                return {
                    type: "void"
                }
            }
            case "$0args-array_new": {
                return {
                    type: "array",
                    values: []
                }
            }
            case "$2args-array_push": {
                const [targetId, valueId] = int.args;
                const a = this.getValue(targetId);
                if (a.type !== "array") throw new Error("array is not array");
                const v = this.getValue(valueId);
                a.values.push(v);
                return {
                    type: "void"
                }
            }
            case "$1args-array_len": {
                const [targetId] = int.args;
                const a = this.getValue(targetId);
                if (a.type !== "array") throw new Error("array is not array");
                return {
                    type: "number",
                    value: a.values.length
                }
            }
            case "$2args-array_get": {
                const [targetId, indexId] = int.args;
                const a = this.getValue(targetId);
                if (a.type !== "array") throw new Error("array is not array");
                const b = this.getValue(indexId);
                if (b.type !== "number") throw new Error("array index is not number");
                return a.values[b.value];
            }
            case "$3args-array_set": {
                const [targetId, indexId, valueId] = int.args;
                const a = this.getValue(targetId);
                if (a.type !== "array") throw new Error("array is not array");
                const b = this.getValue(indexId);
                if (b.type !== "number") throw new Error("array index is not number");
                const v = this.getValue(valueId);
                return a.values[b.value] = v;
            }
            case "$1args-array_pop": {
                const [targetId] = int.args;
                const a = this.getValue(targetId);
                if (a.type !== "array") throw new Error("array is not array");
                const v = a.values.pop();
                return v!;
            }
            case "$0args-reserve": {
                return {
                    type: "string",
                    value: this.reserve()
                }
            }
            case "$1args-get_label_name": {
                const [labelId] = int.args;
                const label = this.getValue(labelId);
                if (label.type !== "label") throw new Error("label not label");
                return {
                    type: "string",
                    value: label.name
                }
            }
            default: {
                throw new Error(`Unknown intrinsic: ${int.name}`)
            }
        }
    }
}