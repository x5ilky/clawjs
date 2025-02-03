export class TypeIndex {
    constructor (
        public types: Map<string, ClawType>,
        public interfaces: Map<string, ClawInterface>
    ) {

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
}
export class StructureClawType extends BaseClawType {
    constructor(
        name: string,
        generics: ClawType[],
        private members: Map<string, ClawType>
    ) { 
        super(name, generics);
    }
}
export class VariableClawType extends BaseClawType {
    constructor(
        name: string,
        generics: ClawType[],
    ) { 
        super(name, generics);
    }
}
export class GenericClawType extends BaseClawType {
    constructor(
        name: string,
        private bounds: ClawInterface[]
    ) { 
        super(name, []);
    }
}
type ClawType = FunctionClawType | StructureClawType | VariableClawType | GenericClawType;

export class ClawInterface {
    generics: ClawType[];
    baseImplementations: ClawType[];
    specificImplementations: {
        generics: GenericClawType[],
        inputs: ClawType[],
        functions: FunctionClawType[]
    }[];

    constructor(generics: ClawType[]) {
        this.generics = generics;
        this.baseImplementations = [];
        this.specificImplementations = [];
    }
}