import { ClawInterface, GenericClawType, TypeIndex, VariableClawType } from "./claw/typechecker.ts";

const AddInterface = new ClawInterface("Add", [new GenericClawType("Right", []), new GenericClawType("Output", [])]);

const number = new VariableClawType("int", []);

const ti = new TypeIndex(new Map(), new Map());

ti.types.set("int", number);
ti.interfaces.set("Add", AddInterface);

AddInterface.specificImplementations.push({
    functions: [],
    generics: [new GenericClawType("T", [])],
    inputs: [new GenericClawType("T", []), number],
    target: number
})

const res = ti.doesTypeImplementInterface(number, AddInterface, [number, number]);
console.log(res)