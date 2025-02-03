import { logger } from "../src/main.ts";
import { ChainCustomMap } from "./chainmap.ts";

export class GenericChainMap extends ChainCustomMap<GenericClawType, ClawType> {
    constructor() {
        super((a, b) => a.eq(b));
    }
}

export class TypeIndex {
    constructor (
        public types: Map<string, ClawType>,
        public interfaces: Map<string, ClawInterface>
    ) {

    }

    doesTypeImplementInterface(type: ClawType, int: ClawInterface, inputs: ClawType[]) {
        if (inputs.length !== int.generics.length) {
            logger.error("assert: in TypeIndex.doesTypeImplementInterface, inputs.length !== ClawInterface.generics.length")
            Deno.exit(1);
        }
        const works = [];
        for (const spec of int.specificImplementations) {
            // impl<T> start<T, number> for string
            //      ^ spec.generics
            //               ^ spec.inputs
            //                              ^ spec.target
            const mapping = new GenericChainMap();
            this.extractGeneric();
            const subsituted = this.substituteRaw(spec.inputs, mapping)
            console.log(subsituted);
        }
    }
    substituteRaw(types: ClawType[], mappings: GenericChainMap) {
        const outTypes: ClawType[] = [];
        for (const type of types) {
            if (type instanceof GenericClawType) {
                const t = mappings.get(type);
                if (t === undefined) {
                    logger.error(`No generic "${type.toDisplay()}"`)
                    Deno.exit(1);
                }
            } else {
                logger.error(`Unimplemented claw type`)
            }
        }
        return outTypes;
    }

    extractGeneric() {
        // todo

        throw new Error("TODO")
    }
}
export class BaseClawType {
    constructor(
        public name: string,
        public generics: ClawType[],
    ) {
    }

    isBuiltinType() {
        if ([
            "int",
            "int!",
            "string",
            "string!",
            "bool",
            "bool!",
        ].includes(this.name)) return true;
        return false;
    }
    getImplementedTraits(ti: TypeIndex) {
        
    }

    toDisplay(): string {
        logger.error("UNIMPLEMENTED")
        throw new Error("UNIMPLEMENTED");
    };
}

export class FunctionClawType extends BaseClawType {
    constructor(
        name: string,
        generics: ClawType[],
        private args: ClawType[],
        private output: ClawType
    ) {
        super(name, generics);
    }

    override toDisplay(): string {
        return `fn (${this.args.map(a => a.toDisplay()).join(", ")}) -> ${this.output.toDisplay()}`
    }
}
export class StructureClawType extends BaseClawType {
    constructor(
        name: string,
        generics: ClawType[],
        private members: Map<string, ClawType>
    ) { 
        super(name, generics);
    }

    override toDisplay(): string {
        return `struct ${name} {\n${this.members.entries().map(([k, v]) => `\t${k}: ${v.toDisplay()}`)}\n}`
    }
}
export class VariableClawType extends BaseClawType {
    constructor(
        name: string,
        generics: ClawType[],
    ) { 
        super(name, generics);
    }

    override toDisplay(): string {
        if (this.generics.length) 
            return `${this.name}<${this.generics.map(a => a.toDisplay()).join(", ")}>`;
        return `${this.name}`
    }
}
export class GenericClawType extends BaseClawType {
    constructor(
        name: string,
        private bounds: ClawInterface[]
    ) { 
        super(name, []);
    }

    eq(other: GenericClawType): boolean {
        if (this.name === other.name) return true;
        return false;
    }

    override toDisplay(): string {
        if (this.bounds.length) {
            return `${this.name}: ${this.bounds.map(a => a.toDisplay())}`
        }
        return this.name
    }
}
type ClawType = FunctionClawType | StructureClawType | VariableClawType | GenericClawType;

export class ClawInterface {
    generics: ClawType[];
    name: string;
    specificImplementations: {
        generics: GenericClawType[],
        inputs: ClawType[],
        functions: FunctionClawType[]
        target: ClawType
    }[];

    constructor(name: string, generics: ClawType[]) {
        this.name = name;
        this.generics = generics;
        this.specificImplementations = [];
    }

    toDisplay() {
        return `interface ${this.name}`
    }
}