import { logger } from "../src/main.ts";
import { ChainCustomMap } from "./chainmap.ts";
import { arreq, arrjoinwith } from "../SkOutput.ts";

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
            logger.error("assert: in TypeIndex.getTypeInterfaceImplementations, inputs.length !== ClawInterface.generics.length")
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
                return new BuiltinClawType("ERROR", [])
            }
            return t[1];
        } else if (type instanceof VariableClawType) {
            return new VariableClawType(type.name, this.substituteRaw(type.generics, mappings, errorStack), this.substituteRawSingle(type.base, mappings, errorStack));
        } else if (type instanceof StructureClawType) {
            return new StructureClawType(
                type.name, 
                type.generics, 
                new Map(
                    type.members.entries().map(([k, v]) => [k, this.substituteRawSingle(v, mappings, errorStack)] as const)
                )
            );
        } else if (type instanceof FunctionClawType) {
            return new FunctionClawType(
                type.name,
                type.generics,
                this.substituteRaw(type.args, mappings, errorStack),
                this.substituteRawSingle(type.output, mappings, errorStack)
            );
        } else if (type instanceof BuiltinClawType) {
            return new BuiltinClawType(type.name, []);
        }
        return new BuiltinClawType("ERROR", [])
    }

    extractGeneric(template: ClawType[], values: ClawType[], gcm: GenericChainMap) {
        const mapping = new GenericChainMap();

        if (values.length !== template.length) {
            logger.error("in TypeIndex.extractGeneric, template.length !== values.length")
            logger.error("failed to extract generic due to template being wildly different from extractee")
            logger.error(`template in question: ${arrjoinwith(template, a => a.toDisplay(), ", ")}`)
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
            if (!(value instanceof VariableClawType)) {
                logger.error(`${template.toDisplay()} cannot map onto ${value.toDisplay()}`);
                return;
            }
            if (!value.base.eq(template.base)) {
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
        } else if (template instanceof FunctionClawType) {
            if (!(value instanceof FunctionClawType)) {
                logger.error(`${value.toDisplay()} is not a function type`);
                return;
            }
            if (value.args.length !== template.args.length) {
                logger.error(`${value.toDisplay()} has different argument count`);
                logger.error(`expected: ${template.toDisplay()}`);
                return;
            }
            this.extractGeneric(template.args, value.args, gcm);
            this.extractGenericSingle(template.output, value.output, gcm);
        } else if (template instanceof StructureClawType) {
            if (!(value instanceof StructureClawType)) {
                logger.error(`${value.toDisplay()} is not a structure type`);
                logger.error(`expected: ${template.toDisplay()}`);
                return;
            }
            const templateMembers = new Set(template.members.keys().toArray());
            const valueMembers = new Set(value.members.keys().toArray());
            if (templateMembers.size !== valueMembers.size) {
                logger.error(`${value.toDisplay()} has different member count to template`);
                logger.error(`expected: ${template.toDisplay()}`);
                return;
            }

            if ([...templateMembers].every(x => valueMembers.has(x))) {
                this.extractGeneric(
                    template.members.values().toArray(),
                    value.members.values().toArray(),
                    gcm
                );
            } else {
                logger.error("template and value members have different members");
            }
        } else if (template instanceof BuiltinClawType) {
            return (
                value instanceof BuiltinClawType
                && template.eq(value)
            )
        }
        
    }
}
export class BaseClawType {
    constructor(
        public name: string,
        public generics: ClawType[],
    ) {
        if (name === "ERROR") {
            console.log(`ERROR type generated, stack trace: ${new Error().stack}`)
        }
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
        if (this instanceof BuiltinClawType && other instanceof BuiltinClawType) {
            return (this.name === other.name)
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
        public args: ClawType[],
        public output: ClawType
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
        public members: Map<string, ClawType>
    ) { 
        super(name, generics);
    }

    override toDisplay(): string {
        let genTxt = ``;
        if (this.generics.length) 
            genTxt = `<${arrjoinwith(this.generics, (a) => a.toDisplay(), ", ")}>`
        return `struct ${this.name}${genTxt} {\n${arrjoinwith(this.members.entries().toArray(), ([k, v]) => `\t${k}: ${v.toDisplay()}`, ", ")}\n}`
    }
}
export class VariableClawType extends BaseClawType {
    constructor(
        name: string,
        generics: ClawType[],
        public base: ClawType
    ) { 
        super(name, generics);
    }

    override toDisplay(): string {
        if (this.generics.length) 
            return `${this.name}<${this.generics.map(a => a.toDisplay()).join(", ")}>`;
        return `${this.name}`
    }
}
export class BuiltinClawType extends BaseClawType {
    override toDisplay(): string {
        return this.name
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
type ClawType = FunctionClawType | StructureClawType | VariableClawType | GenericClawType | BaseClawType;

export class ClawInterface {
    generics: ClawType[];
    name: string;
    functions: Map<string, FunctionClawType>;
    specificImplementations: {
        generics: ClawType[],
        inputs: ClawType[],
        functions: FunctionClawType[]
        target: ClawType
    }[];

    constructor(name: string, generics: ClawType[], functions: Map<string, FunctionClawType>) {
        this.name = name;
        this.generics = generics;
        this.functions = functions;
        this.specificImplementations = [];
    }

    toDisplay() {
        return `interface ${this.name}`
    }
}