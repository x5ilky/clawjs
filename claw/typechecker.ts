import { logger } from "../src/main.ts";
import { ChainCustomMap, ChainMap } from "./chainmap.ts";
import { arreq, arrjoinwith, LogLevel } from "../SkOutput.ts";
import { Node } from "./nodes.ts";
import { NodeKind } from "./nodes.ts";
import { SourceMap } from "./sourcemap.ts";
import { SourceHelper } from "./sourceUtil.ts";
import { TypeNode } from "./nodes.ts";

export class GenericChainMap extends ChainCustomMap<GenericClawType, ClawType> {
  constructor() {
    super((a, b) => a.eq(b));
  }
}

export class TypeIndex {
  constructor(
    public types: ChainMap<string, ClawType>,
    public interfaces: Map<string, ClawInterface>,
  ) {
    this.types.push();
  }

  doesTypeImplementInterface(
    type: ClawType,
    int: ClawInterface,
    inputs: ClawType[],
  ) {
    return this.getTypeInterfaceImplementations(type, int, inputs).length > 0;
  }
  getTypeInterfaceImplementations(
    type: ClawType,
    int: ClawInterface,
    inputs: ClawType[],
  ) {
    if (inputs.length !== int.generics.length) {
      logger.error(
        "assert: in TypeIndex.getTypeInterfaceImplementations, inputs.length !== ClawInterface.generics.length",
      );
      Deno.exit(1);
    }
    const works = [];
    for (const spec of int.specificImplementations) {
      // impl<T> start<T, number> for string
      //      ^ spec.generics
      //               ^ spec.inputs
      //                              ^ spec.target
      if (!spec.target.eq(type)) {
        continue;
      }
      const mapping = new GenericChainMap();
      mapping.push();
      mapping.set(new GenericClawType("Self", []), type);
      this.extractGeneric(spec.inputs, inputs, mapping);
      const errorStack: string[] = [];
      const _subsituted = this.substituteRaw(spec.inputs, mapping, errorStack);
      if (errorStack.length) {
        continue;
      }
      works.push({ mapping, spec });
    }
    return works;
  }
  substituteRaw(
    types: ClawType[],
    mappings: GenericChainMap,
    errorStack: string[],
  ) {
    const outTypes: ClawType[] = [];
    for (const type of types) {
      outTypes.push(this.substituteRawSingle(type, mappings, errorStack));
    }
    return outTypes;
  }
  substituteRawSingle(
    type: ClawType,
    mappings: GenericChainMap,
    errorStack: string[],
  ): ClawType {
    if (type instanceof GenericClawType) {
      const t = mappings.get(type);
      if (t === undefined) {
        errorStack.push(`No generic "${type.toDisplay()}"`);
        return new BuiltinClawType("ERROR", []);
      }
      return t[1];
    } else if (type instanceof VariableClawType) {
      return new VariableClawType(
        type.name,
        this.substituteRaw(type.generics, mappings, errorStack),
        this.substituteRawSingle(type.base, mappings, errorStack),
      );
    } else if (type instanceof StructureClawType) {
      return new StructureClawType(
        type.name,
        type.generics,
        new Map(
          type.members.entries().map(([k, v]) =>
            [k, this.substituteRawSingle(v, mappings, errorStack)] as const
          ),
        ),
      );
    } else if (type instanceof FunctionClawType) {
      return new FunctionClawType(
        type.name,
        type.generics,
        this.substituteRaw(type.args, mappings, errorStack),
        this.substituteRawSingle(type.output, mappings, errorStack),
      );
    } else if (type instanceof BuiltinClawType) {
      return new BuiltinClawType(type.name, []);
    } else if (type instanceof ReferenceClawType) {
      return new ReferenceClawType(this.substituteRawSingle(type.base, mappings, errorStack));
    }
    return new BuiltinClawType("ERROR", []);
  }

  extractGeneric(
    template: ClawType[],
    values: ClawType[],
    gcm: GenericChainMap,
  ) {
    const mapping = new GenericChainMap();

    if (values.length !== template.length) {
      logger.error(
        "in TypeIndex.extractGeneric, template.length !== values.length",
      );
      logger.error(
        "failed to extract generic due to template being wildly different from extractee",
      );
      logger.error(
        `template in question: ${
          arrjoinwith(template, (a) => a.toDisplay(), ", ")
        }`,
      );
      Deno.exit(1);
    }

    for (let i = 0; i < values.length; i++) {
      const temp = template[i];
      const val = values[i];

      this.extractGenericSingle(temp, val, gcm);
    }

    return mapping;
  }

  extractGenericSingle(
    template: ClawType,
    value: ClawType,
    gcm: GenericChainMap,
  ) {
    if (template instanceof VariableClawType) {
      if (!(value instanceof VariableClawType)) {
        logger.error(
          `${template.toDisplay()} cannot map onto ${value.toDisplay()}`,
        );
        return;
      }
      if (!value.base.eq(template.base)) {
        logger.error(
          `${template.toDisplay()} cannot map onto ${value.toDisplay()}`,
        );
        return;
      }
      this.extractGeneric(template.generics, value.generics, gcm);
    } else if (template instanceof GenericClawType) {
      for (const bound of template.bounds) {
        if (!this.doesTypeImplementInterface(value, bound, value.generics)) {
          logger.error(
            `${value.toDisplay()} does not implement bound ${bound.toDisplay()}`,
          );
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
        logger.error(
          `${value.toDisplay()} has different member count to template`,
        );
        logger.error(`expected: ${template.toDisplay()}`);
        return;
      }

      if ([...templateMembers].every((x) => valueMembers.has(x))) {
        this.extractGeneric(
          template.members.values().toArray(),
          value.members.values().toArray(),
          gcm,
        );
      } else {
        logger.error("template and value members have different members");
      }
    } else if (template instanceof BuiltinClawType) {
      return (
        value instanceof BuiltinClawType &&
        template.eq(value)
      );
    } else if (template instanceof ReferenceClawType) {
      if (!(value instanceof ReferenceClawType)) {
        logger.error(`provided value should be a reference`)
        logger.error(`expected: ${template.toDisplay()}`)
        logger.error(`got: ${value.toDisplay()}`)
        return;
      }
      this.extractGenericSingle(template.base, value.base, gcm);
    }
  }

  getTypeFromName(name: string) {
    return this.types.get(name);
  }
  getInterfaceFromName(name: string) {
    return this.interfaces.get(name);
  }
}
export class BaseClawType {
  constructor(
    public name: string,
    public generics: ClawType[],
  ) {
    if (name === "ERROR") {
      console.log(`ERROR type generated, stack trace: ${new Error().stack}`);
    }
  }

  eq(other: ClawType, stop: boolean = false): boolean {
    if (this instanceof GenericClawType && other instanceof GenericClawType) {
      return this.name === other.name;
    }
    if (this instanceof FunctionClawType && other instanceof FunctionClawType) {
      return (
        this.name === other.name &&
        arreq(this.generics, other.generics, (a, b) => a.eq(b))
      );
    }
    if (this instanceof VariableClawType) {
      if (other instanceof VariableClawType) {
        return (
          this.name === other.name &&
          arreq(this.generics, other.generics, (a, b) => a.eq(b))
        );
      }
      return this.base.eq(other);
    }
    if (
      this instanceof StructureClawType && other instanceof StructureClawType
    ) {
      return (
        this.name === other.name &&
        arreq(this.generics, other.generics, (a, b) => a.eq(b))
      );
    }
    if (this instanceof BuiltinClawType && other instanceof BuiltinClawType) {
      return (this.name === other.name);
    }
    if (this instanceof ReferenceClawType && other instanceof ReferenceClawType) {
      return (this.base.eq(other.base))
    }
    if (stop) return false;
    return other.eq(this, true);
  }

  toDisplay(): string {
    logger.error("UNIMPLEMENTED");
    throw new Error("UNIMPLEMENTED");
  }
}

export class FunctionClawType extends BaseClawType {
  constructor(
    name: string,
    generics: ClawType[],
    public args: ClawType[],
    public output: ClawType,
  ) {
    super(name, generics);
  }

  override toDisplay(): string {
    return `fn (${
      this.args.map((a) => a.toDisplay()).join(", ")
    }) -> ${this.output.toDisplay()}`;
  }
}
export class StructureClawType extends BaseClawType {
  constructor(
    name: string,
    generics: ClawType[],
    public members: Map<string, ClawType>,
  ) {
    super(name, generics);
  }

  override toDisplay(): string {
    let genTxt = ``;
    if (this.generics.length) {
      genTxt = `<${arrjoinwith(this.generics, (a) => a.toDisplay(), ", ")}>`;
    }
    return `struct ${this.name}${genTxt} {\n${
      arrjoinwith(this.members.entries().toArray(), ([k, v]) =>
        `\t${k}: ${v.toDisplay()}`, ", ")
    }\n}`;
  }
}
export class VariableClawType extends BaseClawType {
  constructor(
    name: string,
    generics: ClawType[],
    public base: ClawType,
  ) {
    super(name, generics);
  }

  override toDisplay(): string {
    if (this.generics.length) {
      return `${this.name}<${
        this.generics.map((a) => a.toDisplay()).join(", ")
      }>`;
    }
    return `${this.name}`;
  }
}

export class ReferenceClawType extends BaseClawType {
  constructor(
    public base: ClawType,
  ) {
    super("&" + base.name, []);
  }

  override toDisplay(): string {
    return `${this.name}`;
  }
}

export class BuiltinClawType extends BaseClawType {
  override toDisplay(): string {
    return this.name;
  }
}
export class GenericClawType extends BaseClawType {
  constructor(
    name: string,
    public bounds: ClawInterface[],
  ) {
    super(name, []);
  }

  override toDisplay(): string {
    if (this.bounds.length) {
      return `${this.name}: ${this.bounds.map((a) => a.toDisplay())}`;
    }
    return this.name;
  }
}
type ClawType =
  | FunctionClawType
  | StructureClawType
  | VariableClawType
  | GenericClawType
  | BaseClawType
  | ReferenceClawType;

export class ClawInterface {
  generics: ClawType[];
  name: string;
  functions: Map<string, FunctionClawType>;
  specificImplementations: {
    generics: ClawType[];
    inputs: ClawType[];
    functions: FunctionClawType[];
    target: ClawType;
  }[];

  constructor(
    name: string,
    generics: ClawType[],
    functions: Map<string, FunctionClawType>,
  ) {
    this.name = name;
    this.generics = generics;
    this.functions = functions;
    this.specificImplementations = [];
  }

  toDisplay() {
    return `interface ${this.name}`;
  }
}

// deno-lint-ignore no-explicit-any
function assertType<TTarget>(_v: any): _v is TTarget {
  return true;
}

export const ANY_TYPE = new BuiltinClawType("any", []);
export class Typechecker {
  ti: TypeIndex;
  gcm: GenericChainMap;
  scope: ChainMap<string, ClawType>


  constructor(public sourcemap: SourceMap) {
    this.ti = new TypeIndex(new ChainMap(), new Map());
    this.gcm = new GenericChainMap();
    this.gcm.push();
    this.scope = new ChainMap();
    this.scope.push();
    this.addBuiltinTypes();
  }

  addBuiltinTypes() {
    this.ti.types.set("int", new BuiltinClawType("int", []))
    this.ti.types.set("string", new BuiltinClawType("string", []))
    this.ti.types.set("bool", new BuiltinClawType("bool", []))
    this.ti.types.set("int!", new BuiltinClawType("int!", []))
    this.ti.types.set("string!", new BuiltinClawType("string!", []))
    this.ti.types.set("bool!", new BuiltinClawType("bool!", []))
    this.ti.types.set("any", ANY_TYPE)
  }

  typecheck(nodes: Node[]): Node[] {
    const out = [];
    for (const node of nodes) {
        out.push(this.typecheckSingle(node));
    }
    return out;
  }
  typecheckSingle(node: Node): Node {
    if (node.type === NodeKind.DeclarationNode) {
      const type = this.evaluateTypeFromValue(node.value);
      if (node.valueType !== null) {
        const targetType = this.resolveTypeNode(node.valueType, this.gcm);
        if (!type.eq(targetType)) {
          this.errorAt(node, `annotated type and actual type are different:`)
          this.errorExcerptAt(node.valueType, `expected: ${targetType.toDisplay()}`)
          this.errorExcerptAt(node.value, `received: ${type.toDisplay()}`)
        }
      }
      return node;
    }
    this.errorAt(node, `Unimplemented typechecker node: ${NodeKind[node.type]}`);
    return node;
  }

  resolveTypeNode(typenode: TypeNode, gcm: GenericChainMap): ClawType {
    if (typenode.ref) {
        return new ReferenceClawType(this.resolveTypeNode({
            ...typenode,
            ref: false
        }, gcm));
    }
    let type = this.ti.getTypeFromName(typenode.name);
    if (type === undefined) {
        const bounds = [];
        for (const bound of typenode.bounds) {
            const b = this.ti.getInterfaceFromName(typenode.name);
            if (b === undefined) {
                this.errorAt(typenode, `No interface called ${bound}`);
                return ANY_TYPE
            }
            bounds.push(b);
        }
        const tryGeneric = gcm.get(new GenericClawType(typenode.name, bounds))
        if (tryGeneric === undefined) {
            this.errorAt(typenode, `No type/generic called ${typenode.name}`);
            return ANY_TYPE
        }
        type = tryGeneric[1];
    }
    if (!assertType<ClawType>(type)) throw new Error();
    const generics = [];
    for (const ta of typenode.typeArguments) {
      generics.push(this.resolveTypeNode(ta, gcm));
    }
    if (type.generics.length !== generics.length) {
      this.errorAt(typenode, `Too many type arguments`)
      logger.error(`Expected ${type.generics.length} type arguments, instead got ${generics.length}`)
    }
    if (!(type instanceof VariableClawType)) type = new VariableClawType(type.name, generics, type);
    return type;
  }

  evaluateTypeFromValue(node: Node): ClawType {
    // todo(x5ilky): finish this function

    switch(node.type) {
      case NodeKind.NumberNode:
        return this.ti.getTypeFromName("int")!;
      case NodeKind.StringNode:
        return this.ti.getTypeFromName("string")!;
      case NodeKind.VariableNode: {
        const val = this.scope.get(node.name);
        if (val === undefined) {
          this.errorAt(node, `No variable called ${node.name}`);
          Deno.exit(1);
        }
        return val;
      }
      case NodeKind.StructLiteralNode:
      case NodeKind.ChildOfNode:
      case NodeKind.MethodOfNode:
      case NodeKind.CallNode:
      case NodeKind.UnaryOperation:
      case NodeKind.BinaryOperation:
      case NodeKind.BlockNode:
      case NodeKind.LabelNode:
        logger.error(`Unimplemented node in evaluateTypeFromValue: ${NodeKind[node.type]}`);
        Deno.exit(1);
        break;
      case NodeKind.Grouping:
      case NodeKind.TypeNode:
      case NodeKind.FunctionDefinitionNode:
      case NodeKind.StructDefinitionNode:
      case NodeKind.DataStructDefinitionNode:
      case NodeKind.InterfaceNode:
      case NodeKind.ImplBaseNode:
      case NodeKind.ImplTraitNode:
      case NodeKind.AssignmentNode:
      case NodeKind.DeclarationNode:
      case NodeKind.ConstDeclarationNode:
      case NodeKind.IfNode:
      case NodeKind.IfElseNode:
      case NodeKind.WhileNode:
      case NodeKind.ForNode:
      case NodeKind.IfRuntimeNode:
      case NodeKind.IfElseRuntimeNode:
      case NodeKind.WhileRuntimeNode:
      case NodeKind.ForRuntimeNode:
      case NodeKind.ReturnNode:
        logger.error(`${NodeKind[node.type]} cannot be used as value`);
        Deno.exit(1);
        break;
    }

  }

  errorAt(
    location: { start: number; end: number; fp: string },
    message: string,
  ) {
    const sh = new SourceHelper(this.sourcemap.get(location.fp)!);
    const lines = sh.getLines(location.start, location.end);
    const [col, row] = sh.getColRow(location.start);
    logger.printWithTags([
      logger.config.levels[LogLevel.ERROR],
      {
        color: [192, 123, 0],
        priority: -20,
        name: "typechecker",
      },
    ], `At ${location.fp}:${col + 1}:${row}:`);
    for (const ln of lines) {
      logger.printWithTags([
        logger.config.levels[LogLevel.ERROR],
        {
          color: [192, 123, 0],
          priority: -20,
          name: "typechecker",
        },
      ], ln);
    }
    logger.printWithTags([
      logger.config.levels[LogLevel.ERROR],
        {
            color: [192, 123, 0],
            priority: -20,
            name: "typechecker",
        },
    ], `${message}`);
  }

  errorExcerptAt(
    location: { start: number; end: number; fp: string },
    message: string,
  ) {
    const sh = new SourceHelper(this.sourcemap.get(location.fp)!);
    const lines = sh.getLines(location.start, location.end);

    logger.error(lines.map(a => "\t" + a.trim()));
    logger.error(message);
  }
}
