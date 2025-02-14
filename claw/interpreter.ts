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
    };
export class Interpreter {
    ip: number;
    variables: Map<string, ClawValue>;
    scope: ChainMap<string, ClawValue>;
    callStack: number[];

    constructor() {
        this.ip = 0;
        this.variables = new Map();
        this.scope = new ChainMap();
        this.callStack = [];
    }

    interpret(ir: IR[]) {
        while (this.ip < ir.length) {
            const DEBUG_FLAG = false;
            if (DEBUG_FLAG) {
                console.log(this.ip, ir.slice(this.ip, this.ip+3))
                console.log(this.callStack)
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
            case "$ibop-Add-int-int": {
                const [left, right] = int.args;
                const [l, r] = [this.getValue(left), this.getValue(right)];
                if (l.type === "number" && r.type === "number") return {
                    type: "number",
                    value: l.value + r.value
                };
            } break;
            case "$ibop-Sub-int-int": {
                const [left, right] = int.args;
                const [l, r] = [this.getValue(left), this.getValue(right)];
                if (l.type === "number" && r.type === "number") return {
                    type: "number",
                    value: l.value - r.value
                };
            } break;
            case "$ibop-Mul-int-int": {
                const [left, right] = int.args;
                const [l, r] = [this.getValue(left), this.getValue(right)];
                if (l.type === "number" && r.type === "number") return {
                    type: "number",
                    value: l.value * r.value
                };
            } break;
            case "$ibop-Div-int-int": {
                const [left, right] = int.args;
                const [l, r] = [this.getValue(left), this.getValue(right)];
                if (l.type === "number" && r.type === "number") return {
                    type: "number",
                    value: l.value / r.value
                };
            } break;
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
                    console.log(`${value.value}`); 
                    return undefined;
                } else if (value.type === "string") {
                    console.log(`${value.value}`);
                    return undefined;
                } else if (value.type === "boolean") {
                    console.log(`${value.value ? "true" : "false"}`)
                }
                return undefined;
            }
            default: {
                throw new Error(`Unknown intrinsic: ${int.name}`)
            }
        }
    }
}