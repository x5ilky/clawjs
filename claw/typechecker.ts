import { logger } from "../src/main.ts";
import { ChainCustomMap, ChainMap } from "./chainmap.ts";
import { Ansi, arreq, arrjoinwith, arrzip } from "../SkOutput.ts";
import { BinaryOperationType, Node } from "./nodes.ts";
import { NodeKind } from "./nodes.ts";
import { SourceMap } from "./sourcemap.ts";
import { SourceHelper } from "./sourceUtil.ts";
import { TypeNode } from "./nodes.ts";

const BUILTIN_LOC = { fp: "<builtin>", start: 0, end: 0 };

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
    outer: for (const spec of int.specificImplementations) {
      // impl<T> start<T, number> for string
      //      ^ spec.generics
      //               ^ spec.inputs
      //                              ^ spec.target
      if (!spec.target.eq(type)) {
        continue;
      }
      const mapping = new GenericChainMap();
      mapping.push();
      mapping.set(new GenericClawType("Self", BUILTIN_LOC, []), type);
      this.extractGeneric(spec.inputs, inputs, mapping);
      const errorStack: string[] = [];
      const subsituted = this.substituteRaw(spec.inputs, mapping, errorStack);
      for (let i = 0; i < subsituted.length; i++) {
        const sub = subsituted[i];
        const inp = inputs[i];
        if (!inp.eq(sub)) {
          continue outer;
        } 
      }
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
        return new BuiltinClawType("ERROR", [], BUILTIN_LOC);
      }
      return t[1];
    } else if (type instanceof VariableClawType) {
      return new VariableClawType(
        type.name,
        this.substituteRaw(type.generics, mappings, errorStack),
        BUILTIN_LOC,
        this.substituteRawSingle(type.base, mappings, errorStack),
      );
    } else if (type instanceof StructureClawType) {
      return new StructureClawType(
        type.name,
        type.generics,
        BUILTIN_LOC,
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
        BUILTIN_LOC,
        this.substituteRaw(type.args, mappings, errorStack),
        this.substituteRawSingle(type.output, mappings, errorStack),
      );
    } else if (type instanceof BuiltinClawType) {
      return new BuiltinClawType(type.name, [], BUILTIN_LOC);
    } else if (type instanceof ReferenceClawType) {
      return new ReferenceClawType(
        BUILTIN_LOC,
        this.substituteRawSingle(type.base, mappings, errorStack),
      );
    }
    return new BuiltinClawType("ERROR", [], BUILTIN_LOC);
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
        logger.error(`provided value should be a reference`);
        logger.error(`expected: ${template.toDisplay()}`);
        logger.error(`got: ${value.toDisplay()}`);
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
    public loc: { fp: string; start: number; end: number },
  ) {
    if (name === "ERROR") {
      console.log(`ERROR type generated, stack trace: ${new Error().stack}`);
    }
  }

  eq(other: ClawType, stop: boolean = false): boolean {
    if (this instanceof BuiltinClawType && this.name === "any") return true;
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
    if (
      this instanceof ReferenceClawType && other instanceof ReferenceClawType
    ) {
      return (this.base.eq(other.base));
    }
    if (stop) return false;
    return other.eq(this, true);
  }

  toDisplay(): string {
    logger.error("UNIMPLEMENTED");
    throw new Error("UNIMPLEMENTED");
  }

  withLoc(loc: BaseClawType["loc"]) {
    this.loc = loc;
    return this; 
  }
}

export class FunctionClawType extends BaseClawType {
  constructor(
    name: string,
    generics: ClawType[],
    loc: { fp: string; start: number; end: number },
    public args: ClawType[],
    public output: ClawType,
  ) {
    super(name, generics, loc);
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
    loc: { fp: string; start: number; end: number },
    public members: Map<string, ClawType>,
  ) {
    super(name, generics, loc);
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
    loc: { fp: string; start: number; end: number },
    public base: ClawType,
  ) {
    super(name, generics, loc);
  }

  override toDisplay(): string {
    if (this.generics.length) {
      return `${this.base.name}<${
        this.generics.map((a) => a.toDisplay()).join(", ")
      }>`;
    }
    return `${this.base.name}`;
  }
}

export class ReferenceClawType extends BaseClawType {
  constructor(
    loc: { fp: string; start: number; end: number },
    public base: ClawType,
  ) {
    super("&" + base.name, [], loc);
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
    loc: { fp: string; start: number; end: number },
    public bounds: ClawInterface[],
  ) {
    super(name, [], loc);
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

export const ANY_TYPE = (loc: BaseClawType["loc"]) =>
  new BuiltinClawType("any", [], loc);

export class TCReturnValue {
  constructor(
    public value: ClawType,
  ) {

  }
}

export class Typechecker {
  ti: TypeIndex;
  gcm: GenericChainMap;
  scope: ChainMap<string, ClawType>;

  constructor(public sourcemap: SourceMap) {
    this.ti = new TypeIndex(new ChainMap(), new Map());
    this.gcm = new GenericChainMap();
    this.gcm.push();
    this.scope = new ChainMap();
    this.scope.push();
    this.addBuiltinTypes();
    this.sourcemap.set("<builtin>", "")
  }

  addBuiltinTypes() {
    const num = () => this.ti.getTypeFromName("int")!;;
    const bool = () => this.ti.getTypeFromName("bool")!;;
    this.ti.types.set("int", new BuiltinClawType("int", [], BUILTIN_LOC));
    this.ti.types.set("string", new BuiltinClawType("string", [], BUILTIN_LOC));
    this.ti.types.set("bool", new BuiltinClawType("bool", [], BUILTIN_LOC));
    this.ti.types.set("void", new BuiltinClawType("void", [], BUILTIN_LOC));
    this.ti.types.set("int!", new BuiltinClawType("int!", [], BUILTIN_LOC));
    this.ti.types.set(
      "string!",
      new BuiltinClawType("string!", [], BUILTIN_LOC),
    );
    this.ti.types.set("bool!", new BuiltinClawType("bool!", [], BUILTIN_LOC));
    this.ti.types.set("void!", new BuiltinClawType("void!", [], BUILTIN_LOC));
    this.ti.types.set("any", ANY_TYPE(BUILTIN_LOC));

    const Self = new GenericClawType("Self", BUILTIN_LOC, []);

    const addInterface = (interfaceName: string, functionName: string, takes: ClawType, returns: ClawType) => {
      const AddInterface = new ClawInterface(interfaceName, [
        new GenericClawType("Right", BUILTIN_LOC, []), 
        new GenericClawType("Output", BUILTIN_LOC, [])
      ], new Map([
          [functionName, 
            new FunctionClawType(
              functionName,
              [], 
              BUILTIN_LOC,
              [Self, new GenericClawType("Right", BUILTIN_LOC, [])], 
              new GenericClawType("Output", BUILTIN_LOC, [])
            )
          ]
      ]));
      AddInterface.specificImplementations.push({
        functions: [
          new FunctionClawType(functionName, [], BUILTIN_LOC, [takes], returns)
        ],
        generics: [],
        inputs: [takes, returns],
        target: num()
      })
      this.ti.interfaces.set(interfaceName, AddInterface);
    }
    addInterface("Add", "add", num(), num());
    addInterface("Sub", "sub", num(), num());
    addInterface("Mul", "mul", num(), num());
    addInterface("Div", "div", num(), num());
    addInterface("BitwiseXor", "bitwise_xor", num(), num());
    addInterface("BitwiseOr", "bitwise_or", num(), num());
    addInterface("BitwiseAnd", "bitwise_and", num(), num());
    addInterface("And", "and", num(), bool());
    addInterface("Or", "or", num(), bool());
    addInterface("Mod", "modulo", num(), bool());
    addInterface("Eq", "eq", num(), bool());
    addInterface("NEq", "neq", num(), bool());
    addInterface("Gt", "gt", num(), bool());
    addInterface("Gte", "gte", num(), bool());
    addInterface("Lt", "lt", num(), bool());
    addInterface("Lt", "lte", num(), bool());

    
  }

  typecheck(nodes: Node[]): Node[] {
    return this.typecheckForReturn(nodes)[0];
  }
  typecheckForReturn(nodes: Node[]): [Node[], TCReturnValue[]] {
    const out = [];
    let returnVals: TCReturnValue[] = [];
    this.scope.push();
    for (const node of nodes) {
      try {
        out.push(this.typecheckSingle(node));
      } catch (e) {
        if (e instanceof Error) throw e;
        else if (Array.isArray(e)) {
          returnVals = returnVals.concat(e);
        }
      }
    }
    this.scope.pop();
    return [out, returnVals];
  }
  
  typecheckSingle(node: Node): Node {
    switch (node.type) {
      case NodeKind.ConstDeclarationNode:
      case NodeKind.DeclarationNode: {
        let type = this.evaluateTypeFromValue(node.value);
        if (node.valueType !== null) {
          const targetType = this.resolveTypeNode(node.valueType, this.gcm);
          if (!type.eq(targetType)) {
            this.errorAt(node, `annotated type and actual type are different:`);
            this.errorNoteAt(
              node.valueType,
              `expected: ${targetType.toDisplay()}`,
            );
            this.errorNoteAt(node.value, `received: ${type.toDisplay()}`);
          }
          type = targetType;
        }
        this.scope.set(node.name, type);
        return node;
      }
      case NodeKind.AssignmentNode: {
        const value = this.evaluateTypeFromValue(node.assignee);
        const type = this.evaluateTypeFromValue(node.value);
        if (!value.eq(type)) {
          this.errorAt(node, `variable type and assigned type are different:`);
          this.errorNoteAt(node.assignee, `expected: ${value.toDisplay()}`);
          this.errorNoteAt(node.value, `received: ${type.toDisplay()}`);
        }
        return node;
      }
      case NodeKind.CallNode: {
        this.evaluateTypeFromValue(node);

        return node;
      }
      case NodeKind.FunctionDefinitionNode: {
        const ta = this.resolveTypeGenerics(node.typeArgs);
        this.ti.types.push();
        for (const t of ta) this.ti.types.set(t.name, t);

        const args = [];
        for (const arg of node.args) {
          const v = this.resolveTypeNode(arg[1], this.gcm);
          args.push(v);
        }

        const returnValue = this.resolveTypeNode(node.returnType, this.gcm);
        const fn = new FunctionClawType(node.name, ta, node, args, returnValue);
        this.scope.set(fn.name, fn);
        const types = this.typecheckForReturn([node.nodes])[1];
        if (types.length === 0 && !returnValue.eq(this.ti.getTypeFromName("void")!)) {
          this.errorAt(node.returnType, `Expected return value to be ${returnValue.toDisplay()}, instead got void`);
        }
        for (const type of types) {
          if (!type.value.eq(returnValue)) {
            this.errorAt(type.value.loc, `Mismatching return types`);
            this.errorNoteAt(returnValue.loc, `Definition here`);
          }
        }

        this.ti.types.pop();
        return node;
      }

      case NodeKind.BlockNode: {
        this.scope.push();

        const [_nodes, retVals] = this.typecheckForReturn(node.nodes);
        if (retVals.length) {
          throw retVals;
        }

        this.scope.pop();
        return node;
      }
      case NodeKind.ReturnNode: {
        throw [new TCReturnValue(this.evaluateTypeFromValue(node.value))];
      }
      case NodeKind.IfRuntimeNode:
      case NodeKind.IfNode: {
        const name = node.type === NodeKind.IfNode ? "bool" : "bool!";
        const predValue = this.evaluateTypeFromValue(node.predicate);
        if (!predValue.eq(this.ti.getTypeFromName(name)!)) {
          this.errorAt(node.predicate, `Predicate has to be a ${name}`);
        }
        const [_nodes, body] = this.typecheckForReturn([node.body]);
        if (body.length) {
          throw body;
        }
        return node;
      }
      case NodeKind.IfElseRuntimeNode:
      case NodeKind.IfElseNode: {
        const name = node.type === NodeKind.IfElseNode ? "bool" : "bool!";
        const predValue = this.evaluateTypeFromValue(node.predicate);
        if (!predValue.eq(this.ti.getTypeFromName(name)!)) {
          this.errorAt(node.predicate, `Predicate has to be a ${name}`);
        }
        const [_nodes, body] = this.typecheckForReturn([node.body]);
        const [_nodes2, elseBody] = this.typecheckForReturn([node.elseBody]);
        if (body.length || elseBody.length) {
          throw body.concat(elseBody);
        }
        return node;
      }
      case NodeKind.WhileRuntimeNode:
      case NodeKind.WhileNode: {
        const name = node.type === NodeKind.WhileNode ? "bool" : "bool!";
        const predValue = this.evaluateTypeFromValue(node.predicate);
        if (!predValue.eq(this.ti.getTypeFromName(name)!)) {
          this.errorAt(node.predicate, `Predicate has to be a ${name}`);
        }
        const [_nodes, body] = this.typecheckForReturn([node.body]);
        if (body.length) {
          throw body;
        }
        return node;
      }

      case NodeKind.ForRuntimeNode: 
      case NodeKind.ForNode: {
        const name = node.type === NodeKind.ForNode ? "bool" : "bool!";
        const predValue = this.evaluateTypeFromValue(node.predicate);
        if (!predValue.eq(this.ti.getTypeFromName(name)!)) {
          this.errorAt(node.predicate, `Predicate has to be a ${name}`);
        }
        this.typecheckSingle(node.initialiser);
        this.typecheckSingle(node.post);
        const [_nodes, body] = this.typecheckForReturn([node.body]);
        if (body.length) {
          throw body;
        }
        return node;
      };
      
      case NodeKind.Grouping:
        return this.typecheckSingle(node.value);
      case NodeKind.StructDefinitionNode: {
        const name = node.name;
        const generics = this.resolveTypeGenerics(node.generics);
        this.ti.types.push();
        for (const t of generics) this.ti.types.set(t.name, t);
        const newMap = new Map();
        for (const [k, v] of node.members) {
          newMap.set(k, this.resolveTypeNode(v, this.gcm));
        }
        this.ti.types.pop();

        this.ti.types.set(name, new StructureClawType(name, generics, node, newMap));
        return node;
      }
      case NodeKind.DataStructDefinitionNode:
      case NodeKind.InterfaceNode:
      case NodeKind.ImplBaseNode:
      case NodeKind.ImplTraitNode:
        logger.error(`Unimplemented node type: ${NodeKind[node.type]}`);
        Deno.exit(1);
        break;
      default:
        this.errorAt(node, `${NodeKind[node.type]} is not a valid statement`);
        return node;
    }
  }

  resolveTypeNode(typenode: TypeNode, gcm: GenericChainMap): ClawType {
    if (typenode.ref) {
      return new ReferenceClawType(
        typenode,
        this.resolveTypeNode({
          ...typenode,
          ref: false,
        }, gcm),
      );
    }
    let type = this.ti.getTypeFromName(typenode.name);
    if (type === undefined) {
      const bounds = [];
      for (const bound of typenode.bounds) {
        const b = this.ti.getInterfaceFromName(typenode.name);
        if (b === undefined) {
          this.errorAt(typenode, `No interface called ${bound}`);
          return ANY_TYPE(typenode);
        }
        bounds.push(b);
      }
      const tryGeneric = gcm.get(
        new GenericClawType(typenode.name, typenode, bounds),
      );
      if (tryGeneric === undefined) {
        this.errorAt(typenode, `No type/generic called ${typenode.name}`);
        return ANY_TYPE(typenode);
      }
      type = tryGeneric[1];
    }
    if (!assertType<ClawType>(type)) throw new Error();
    const generics = [];
    for (const ta of typenode.typeArguments) {
      generics.push(this.resolveTypeNode(ta, gcm));
    }
    if (type.generics.length !== generics.length) {
      this.errorAt(typenode, `Too many type arguments`);
      logger.error(
        `Expected ${type.generics.length} type arguments, instead got ${generics.length}`,
      );
    }
    if (!(type instanceof VariableClawType)) {
      type = new VariableClawType(type.name, generics, typenode, type);
    }
    return type;
  }

  resolveTypeGenerics(tns: TypeNode[]) {
    const typeArgs = [];
    for (const ta of tns) {
      const bounds = [];
      for (const bound of ta.bounds) {
        const b = this.ti.getInterfaceFromName(bound)
        if (b === undefined) {
          this.errorAt(ta, `No interface called ${bound}`);
        } else bounds.push(b);
      }
      typeArgs.push(new GenericClawType(ta.name, ta, bounds))
    }

    return typeArgs;
  }

  evaluateTypeFromValue(node: Node): ClawType {
    // todo(x5ilky): finish this function

    switch (node.type) {
      case NodeKind.NumberNode:
        return this.ti.getTypeFromName("int")!.withLoc(node);
      case NodeKind.StringNode:
        return this.ti.getTypeFromName("string")!.withLoc(node);
      case NodeKind.VariableNode: {
        const val = this.scope.get(node.name);
        if (val === undefined) {
          this.errorAt(node, `No variable called ${node.name}`);
          Deno.exit(1);
        }
        return val;
      }
      case NodeKind.StructLiteralNode: {
        const type = this.resolveTypeNode(node.baseType, this.gcm) as VariableClawType;
        if (!(type.base instanceof StructureClawType)) {
          this.errorAt(node.baseType, `Structure literal base type is not a struct`);
          return Deno.exit(1);
        }
        
        const base = type.base;
        if (Object.keys(node.members).length !== base.members.size) {
          this.errorAt(node, `Mismatching member counts`);
          this.errorNoteAt(type.loc, `Expected ${base.members.size}, instead: ${Object.keys(node.members).length}`);
        }
        this.gcm.push();
        for (const [gen, correct] of arrzip(type.generics, base.generics)) this.gcm.set(correct as GenericClawType, gen);
        for (const k in node.members) {
          const v = node.members[k];
          const vType = this.evaluateTypeFromValue(v);
          const matching = base.members.get(k);
          if (matching === undefined) {
            this.errorAt(v, `Type ${type.toDisplay()} does not have member ${k}`);
            continue;
          }
          const errorStack: string[] = [];
          const subs = this.ti.substituteRawSingle(matching, this.gcm, errorStack);
          if (!vType.eq(subs)) {
            this.errorAt(v, `Mismatching member type`);
            this.errorNoteAt(type.base.loc, `Expected ${subs.toDisplay()}, got ${vType.toDisplay()}`)
          }
        }
        this.gcm.pop();

        return type;
      } break;
      case NodeKind.CallNode: {
        const fn = this.evaluateTypeFromValue(node.callee);
        if (!(fn instanceof FunctionClawType)) {
          this.errorAt(node, `Callee is not a function`);
          logger.error(`received: ${fn.toDisplay()}`);
          Deno.exit(1);
        }
        const generics: ClawType[] = [];
        if (node.typeArguments !== null) {
          for (const ta of node.typeArguments) {
            generics.push(this.resolveTypeNode(ta, this.gcm));
          }
        }
        const args: ClawType[] = [];
        for (const a of node.arguments) {
          args.push(this.evaluateTypeFromValue(a));
        }
        if (fn.generics.length !== generics.length) {
          this.errorAt(node, `Mismatched type argument count`);
          this.errorNoteAt(fn.loc, "Definition here");
          logger.error(
            `Expected ${fn.generics.length}, instead received ${generics.length}`,
          );
          Deno.exit(1);
        }
        if (fn.args.length !== args.length) {
          this.errorAt(node, `Mismatched argument count`);
          this.errorNoteAt(fn.loc, "Definition here");
          logger.error(
            `Expected ${fn.args.length}, instead received ${args.length}`,
          );
          Deno.exit(1);
        }
        this.gcm.push();
        for (const [key, value] of arrzip(fn.generics, generics)) {
          this.gcm.set(key as GenericClawType, value);
        }
        const errorStack: string[] = [];
        const mapped = this.ti.substituteRaw(fn.args, this.gcm, errorStack);
        if (errorStack.length) {
          this.errorAt(node, `Failed to substitute generics`);
          logger.error(mapped);
          Deno.exit(1);
        }

        for (const [key, value] of arrzip(fn.args, args)) {
          if (!key.eq(value)) {
            this.errorAt(value.loc, `Mismatched argument type`);
            this.errorNoteAt(key.loc, `Definition here`);
            logger.error(`expected: ${key.toDisplay()}`);
            logger.error(`received: ${value.toDisplay()}`);
          }
        }
        this.gcm.pop();
        return this.ti.substituteRawSingle(fn.output, this.gcm, errorStack);
      }
      case NodeKind.UnaryOperation:
        // todo
        throw "todo";
      case NodeKind.BinaryOperation: {
        const OPER_TO_TRAIT = {
          [BinaryOperationType.Add]: "Add",
          [BinaryOperationType.Subtract]: "Sub",
          [BinaryOperationType.Multiply]: "Mul",
          [BinaryOperationType.Divide]: "Div",
          [BinaryOperationType.BitwiseXor]: "BitwiseXor",
          [BinaryOperationType.BitwiseOr]: "BitwiseOr",
          [BinaryOperationType.BitwiseAnd]: "BitwiseAnd",
          [BinaryOperationType.And]: "And",
          [BinaryOperationType.Or]: "Or",
          [BinaryOperationType.Modulo]: "Mod",
          [BinaryOperationType.Equal]: "Eq",
          [BinaryOperationType.NotEqual]: "Neq",
          [BinaryOperationType.Gt]: "Gt",
          [BinaryOperationType.Gte]: "Gte",
          [BinaryOperationType.Lt]: "Lt",
          [BinaryOperationType.Lte]: "Lte",
        };
        const itfName = OPER_TO_TRAIT[node.oper];
        const itf = this.ti.getInterfaceFromName(itfName);
        if (itf === undefined) {
          this.errorAt(node, `Internal error, no trait for builtin binary operation`);
          Deno.exit(1);
        }
        const leftType = this.evaluateTypeFromValue(node.left);
        const rightType = this.evaluateTypeFromValue(node.right);
        const impls = this.ti.getTypeInterfaceImplementations(leftType, itf, [rightType, ANY_TYPE(BUILTIN_LOC)]);
        if (!impls.length) {
          this.errorAt(node, `No implementation for operator ${itfName}<${rightType.toDisplay()}> for ${leftType.toDisplay()}`);
          logger.error(`Implement ${itfName}<${rightType.toDisplay()}, ...> for ${leftType.toDisplay()} to let it use operators`) ;
          Deno.exit(1);
        }
        if (impls.length > 1) {
          this.errorAt(node, `TODO: sort implementations by specifity, defaulting to first implementation`);
        }
        const impl = impls[0];
        const returnValue = impl.spec.functions[0].output;
        return returnValue;
      }
      case NodeKind.ChildOfNode:
      case NodeKind.MethodOfNode:
      case NodeKind.BlockNode:
      case NodeKind.LabelNode:
        logger.error(
          `Unimplemented node in evaluateTypeFromValue: ${NodeKind[node.type]}`,
        );
        Deno.exit(1);
        break;
      case NodeKind.Grouping:
        return this.evaluateTypeFromValue(node.value);
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
    const [col, row] = sh.getColRow(location.start);
    logger.error(message);
    logger.error(`At ${location.fp}:${col + 1}:${row}:`);
    const lines = sh.getRawLines(location.start, location.end);

    for (const line of lines) {
      let out = "";
      let pad = "";
      for (const [char, index] of line) {
        if (location.start <= index && index < location.end) {
          out += Ansi.yellow + char + Ansi.reset;
          pad += "^";
        } else {
          pad += " ";
          out += Ansi.gray + char + Ansi.reset;
        }
      }
      logger.error(out);
      logger.error(pad);
    } 
  }

  errorNoteAt(
    location: { start: number; end: number; fp: string },
    message: string,
  ) {
    const sh = new SourceHelper(this.sourcemap.get(location.fp)!);
    const lines = sh.getRawLines(location.start, location.end);
    const [col, _row] = sh.getColRow(location.start);
    logger.error(Ansi.yellow + "note: " + Ansi.reset + message + ` (${location.fp}:${col+1})`);

    for (const line of lines) {
      let out = "";
      let pad = "";
      for (const [char, index] of line) {
        if (location.start <= index && index < location.end) {
          out += Ansi.yellow + char + Ansi.reset;
          pad += "^";
        } else {
          pad += " ";
          out += Ansi.gray + char + Ansi.reset;
        }
      }
      logger.error(out);
      logger.error(pad);
    } 
  }

}
