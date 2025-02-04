import { BuiltinClawType, ClawInterface, FunctionClawType, GenericClawType, StructureClawType, TypeIndex, VariableClawType } from "./claw/typechecker.ts";

const self = new BuiltinClawType("self", []);
const AddInterface = new ClawInterface("Add", [new GenericClawType("Right", []), new GenericClawType("Output", [])], new Map([
    ["add", new FunctionClawType("add", [], [self, new GenericClawType("Right", [])], new GenericClawType("Output", []))]
]));
const DoubleInterface = new ClawInterface("Double", [], new Map([
    ["double", new FunctionClawType("double", [], [self], self)]
]));


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
    inputs: [new VariableClawType("vec", [new GenericClawType("T", [])], vec), number],
    target: number
})
AddInterface.specificImplementations.push({
    functions: [],
    generics: [new GenericClawType("T", [])],
    inputs: [new GenericClawType("T", []), number],
    target: number
})

// should match Add<Vec<T>, number>
// where T = Vec<number>
//  or
// where T = number
const res = ti.getTypeInterfaceImplementations(number, AddInterface, [new VariableClawType("vec", [number], vec), number]);
console.log(res.map(a => a.flatten()))