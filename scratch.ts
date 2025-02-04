import { BuiltinClawType, ClawInterface, GenericClawType, StructureClawType, TypeIndex, VariableClawType } from "./claw/typechecker.ts";

const AddInterface = new ClawInterface("Add", [new GenericClawType("Right", []), new GenericClawType("Output", [])]);

const number = new BuiltinClawType("int", []);
const string = new BuiltinClawType("string", []);
const array = new BuiltinClawType("array", []);
const vec = new StructureClawType("vec", [new GenericClawType("T", [])], new Map([
    ["items", new VariableClawType("array", [new GenericClawType("T", [])], array)]
]));

const ti = new TypeIndex(new Map(), new Map());

ti.types.set("int", number);
ti.interfaces.set("Add", AddInterface);

AddInterface.specificImplementations.push({
    functions: [],
    generics: [
        new VariableClawType(
            "vec", 
            [new GenericClawType("T", [])], 
            vec
        )
    ],
    inputs: [vec, number],
    target: number
})
AddInterface.specificImplementations.push({
    functions: [],
    generics: [new GenericClawType("T", [])],
    inputs: [new GenericClawType("T", []), number],
    target: number
})

const res = ti.getTypeInterfaceImplementations(number, AddInterface, [new VariableClawType("vec", [number], vec), number]);
console.log(res.map(a => a.flatten()))