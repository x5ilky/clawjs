import { SourceMapping } from "node:module";
import { logger } from "../src/main.ts";
import { ChainCustomMap } from "./chainmap.ts";
import { appendFile } from "node:fs";
import { arreq } from "../SkOutput.ts";

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
        return this.getTypeInterfaceImplementations(type, int, inputs).length > 0;
    }
    getTypeInterfaceImplementations(type: ClawType, int: ClawInterface, inputs: ClawType[]) {
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
            if (!spec.target.eq(type)) continue;
            const mapping = new GenericChainMap();
            mapping.push();
            this.extractGeneric(spec.inputs, inputs, mapping);
            const errorStack: string[] = [];
            const _subsituted = this.substituteRaw(spec.inputs, mapping, errorStack)
            if (errorStack.length) {
                continue;
            }
            works.push(mapping)
        }
        return works;
    }
    substituteRaw(types: ClawType[], mappings: GenericChainMap, errorStack: string[]) {
        const outTypes: ClawType[] = [];
        for (const type of types) {
            outTypes.push(this.substituteRawSingle(type, mappings, errorStack))
        }
        return outTypes;
    }
    substituteRawSingle(type: ClawType, mappings: GenericChainMap, errorStack: string[]): ClawType {
        if (type instanceof GenericClawType) {
            const t = mappings.get(type);
            if (t === undefined) {
                errorStack.push(`No generic "${type.toDisplay()}"`)
                return new VariableClawType("ERROR", [])
            }
            return t[1];
        } else if (type instanceof VariableClawType) {
            return new VariableClawType(type.name, this.substituteRaw(type.generics, mappings, errorStack));
        } else {
            errorStack.push(`Unimplemented claw type: ${type.toDisplay()}`);
        }
        return new VariableClawType("ERROR", [])
    }

    extractGeneric(template: ClawType[], values: ClawType[], gcm: GenericChainMap) {
        const mapping = new GenericChainMap();

        if (values.length !== template.length) {
            logger.error("in TypeIndex.extractGeneric, template.length !== values.length")
            logger.error("failed to extract generic due to template being wildly different from extractee")
            Deno.exit(1);
        }

        for (let i = 0; i < values.length; i++) {
            const temp = template[i];
            const val = values[i];

            this.extractGenericSingle(temp, val, gcm);
        }

        return mapping;
    }

    extractGenericSingle(template: ClawType, value: ClawType, gcm: GenericChainMap) {
        if (template instanceof VariableClawType) {
            if (value.name !== template.name) {
                logger.error(`${template.toDisplay()} cannot map onto ${value.toDisplay()}`);
                return;
            }
            this.extractGeneric(template.generics, value.generics, gcm);
        } else if (template instanceof GenericClawType) {
            for (const bound of template.bounds) {
                if (!this.doesTypeImplementInterface(value, bound, value.generics)) {
                    logger.error(`${value.toDisplay()} does not implement bound ${bound.toDisplay()}`)
                    return;
                }
            }
            gcm.set(template, value);
        } else {
            logger.error(`Unimplemented claw type: ${template.toDisplay()}`)
        }
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

    eq(other: ClawType): boolean {
        if (this instanceof GenericClawType && other instanceof GenericClawType) {
            return this.name === other.name;
        }
        if (this instanceof FunctionClawType && other instanceof FunctionClawType) {
            return (
                this.name === other.name && arreq(this.generics, other.generics, (a, b) => a.eq(b))    
            );
        }
        if (this instanceof VariableClawType && other instanceof VariableClawType) {
            return (
                this.name === other.name && arreq(this.generics, other.generics, (a, b) => a.eq(b))
            )
        }
        if (this instanceof StructureClawType && other instanceof StructureClawType) {
            return (
                this.name === other.name
                && arreq(this.generics, other.generics, (a, b) => a.eq(b))
            )
        }
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
        public bounds: ClawInterface[]
    ) { 
        super(name, []);
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