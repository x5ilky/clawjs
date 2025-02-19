import * as path from "jsr:@std/path";
import { logger } from "../src/main.ts";
import { ChainArray, ChainCustomMap, ChainMap, MultiMap } from "./chainmap.ts";
import { Ansi, arreq, arrjoinwith, arrzip } from "../SkOutput.ts";
import { AssignmentNode, BinaryOperation, BinaryOperationType, CallNode, FunctionDefinitionNode, MethodOfNode, Node, NormalTypeNode, UnaryOperation } from "./nodes.ts";
import { NodeKind } from "./nodes.ts";
import { SourceMap } from "./sourcemap.ts";
import { SourceHelper } from "./sourceUtil.ts";
import { TypeNode } from "./nodes.ts";
import { Lexer, Loc } from "./lexer.ts";
import { UnaryOperationType } from "./nodes.ts";
import { Parser } from "./parser.ts";

const BUILTIN_LOC = { fp: "<builtin>", start: 0, end: 0 };

export class TypecheckerError {

}

export class GenericChainMap extends ChainCustomMap<GenericClawType, ClawType> {
  constructor(layers?: GenericChainMap["__inner"]) {
    super((a, b) => {
      return (
        a.name === b.name 
        && a.bounds.length === b.bounds.length 
        && arrzip(a.bounds, b.bounds).every(([a, b]) => a.eq(b))
      )
    });
    if (layers !== undefined)
      this.__inner = layers
  }

  override toString() {
    return `{\n${this.flatten().map(([k, v]) => `${k.toDisplay()} => ${v.toDisplay()}`.split("\n").map(A => "\t" + A).join("\n")).join(",\n")}}`
  }
}

export class TypeIndex {
  baseImplementations: {
    generics: ClawType[];
    inputs: ClawType[];
    functions: FunctionClawType[];
    target: ClawType;
  }[];
  constructor(
    public types: ChainMap<string, ClawType>,
    public interfaces: Map<string, ClawInterface>,
  ) {
    this.baseImplementations = [];
    this.types.push();
  }

  doesTypeImplementInterface(
    type: ClawType,
    int: ClawInterface,
    inputs: ClawType[],
  ) {
    if (type instanceof GenericClawType) {
      if (type.bounds.some(b => b.eq(int))) return true;
    }
    return this.getTypeInterfaceImplementations(type, int, inputs).length > 0;
  }
  getTypeBaseImplementations(
    type: ClawType,
    mapping?: GenericChainMap,
  ) {
    const gcm = mapping ?? new GenericChainMap();
    const works = [];
    outer: for (const spec of this.baseImplementations) { 
      if (spec.target instanceof VariableClawType && spec.target.base instanceof GenericClawType) {
        const base = spec.target.base;
        
        for (const bound of base.bounds) {
          if (!this.getAllTypeInterfaceImplementations(type, bound, gcm).length) 
            continue outer;
        }
      } else if (!spec.target.eq(type)) {
        continue;
      }
  
      gcm.push();
      gcm.set(new GenericClawType("Self", BUILTIN_LOC, []), type);
      const errorStack: string[] = [];
      const _subsituted = this.substituteRaw(spec.inputs, gcm, errorStack, false);
      // for (let i = 0; i < subsituted.length; i++) {
      //   const sub = subsituted[i];
      //   const inp = inputs[i];
      //   if (!inp.eq(sub)) {
      //     gcm.pop();
      //     continue outer;
      //   }
      // }
      if (errorStack.length) {
        gcm.pop();
        continue;
      }
      works.push({ gcm, spec });
      gcm.pop();
    }
    return works;
  }

  typeMatches(left: ClawType, right: ClawType, stop = false): boolean {
    if (left instanceof BuiltinClawType && left.name === "ERROR") return false;
    // if (right instanceof BuiltinClawType && right.name === "ERROR") return false;
    if (left instanceof VariableClawType && left.base instanceof VariableClawType) return this.typeMatches(left.base, right) || this.typeMatches(right, left.base);
    if (right instanceof VariableClawType && right.base instanceof VariableClawType) return this.typeMatches(right.base, left) || this.typeMatches(left, right.base);
    if (left instanceof BuiltinClawType && left.name === "any") return !(right instanceof BuiltinClawType && right.name === "ERROR");
    if (left instanceof GenericClawType && right instanceof GenericClawType) {
      return (
        left.name === right.name && left.bounds.length === right.bounds.length && arreq(left.bounds, right.bounds, (a, b) => a.eq(b))
      );
    }
    if (left instanceof GenericClawType) {
      for (const bound of left.bounds) {
        if (!this.getAllTypeInterfaceImplementations(right, bound).length) return false;
      }
      return true;
    }
    if (right instanceof GenericClawType) {
      for (const bound of right.bounds) {
        if (!this.getAllTypeInterfaceImplementations(left, bound).length) return false;
      }
      return true;
    }
    if (left instanceof FunctionClawType && right instanceof FunctionClawType) {
      return (
        left.name === right.name &&
        arreq(left.generics, right.generics, (a, b) => this.typeMatches(a, b)) &&
        arreq(left.args, right.args, ([_, a], [__, b]) => this.typeMatches(a, b)) &&
        left.output.eq(right.output)
      );
    }
    if (left instanceof VariableClawType) {
      if (right instanceof VariableClawType) {
        return (
          this.typeMatches(left.base, right.base) &&
          arreq(left.generics, right.generics, (a, b) => this.typeMatches(a, b))
        );
      }
      return this.typeMatches(left.base, right);
    }
    if (
      left instanceof StructureClawType && right instanceof StructureClawType
    ) {
      return (
        left.name === right.name &&
        arreq(left.generics, right.generics, (a, b) => this.typeMatches(a, b))
      );
    }
    if (left instanceof BuiltinClawType && right instanceof BuiltinClawType) {
      return (left.name === right.name);
    }
    if (
      left instanceof ReferenceClawType && right instanceof ReferenceClawType
    ) {
      return this.typeMatches(left.base, right.base);
    }
    if (
      left instanceof OfClawType && right instanceof OfClawType
    ) {
      return (
        left.int.eq(right.int) &&
        this.typeMatches(left.base, right.base) &&
        this.typeMatches(left.intType, right.intType)
      )
    }
    if (stop) return false;
    return this.typeMatches(right, left, true);
  }

  getTypeInterfaceImplementations(
    type: ClawType,
    int: ClawInterface,
    inputs: ClawType[],
    mapping?: GenericChainMap,
  ) {
    if (inputs.length !== int.generics.length) {
      logger.error(
        "assert: in TypeIndex.getTypeInterfaceImplementations, inputs.length !== ClawInterface.generics.length",
      );
      throw new TypecheckerError();
    }
    const works = [];
    outer: for (const spec of int.specificImplementations.flatten()) {
      // impl<T> start<T, number> for string
      //      ^ spec.generics
      //               ^ spec.inputs
      //                              ^ spec.target

      const gcm = new GenericChainMap(mapping?.__inner);
      gcm.push();
      if (!this.typeMatches(spec.target, type)) continue
      // if (spec.target instanceof VariableClawType && spec.target.base instanceof GenericClawType) {
      //   const base = spec.target.base;
        
      //   for (const bound of base.bounds) {
      //     if (!this.getAllTypeInterfaceImplementations(type, bound, gcm).length) 
      //       continue outer;
      //   }
      // } else if (!spec.target.eq(type)) {
      //   continue;
      // }
      let tm = new GenericChainMap()
      tm.push()
      const targetMapping = this.tryFindGenericSingle(spec.target, type, gcm, tm);
      if (targetMapping === undefined) throw new Error(`dont even know whne this wouldhappen`)
      for (const [k, v] of targetMapping.flatten()){
        gcm.set(k, v)
      }

      gcm.set(new GenericClawType("Self", BUILTIN_LOC, []), type);
      const errorStack: string[] = [];
      tm = new GenericChainMap()
      tm.push()
      const mp = this.tryFindGenericMulti(spec.inputs, inputs, gcm, tm);
      if (mp === undefined) throw new Error(`dont even know whne this wouldhappen`)
      for (const [k, v] of mp.flatten()){
        gcm.set(k, v)
      }

      const subsituted = this.substituteRaw(spec.inputs, gcm, errorStack, false);
      for (let i = 0; i < subsituted.length; i++) {
        const sub = subsituted[i];
        const inp = inputs[i];
        if (!this.typeMatches(inp, sub)) {
          gcm.pop();
          continue outer;
        }
      }
      if (errorStack.length) {
        gcm.pop();
        continue;
      }
      works.push({ gcm, spec });
    }
    return works;
  }

  getAllTypeInterfaceImplementations(
    type: ClawType,
    int: ClawInterface,
    mapping?: GenericChainMap
  ) {
    const gcm = mapping ?? new GenericChainMap();
    const works = [];
    for (const spec of int.specificImplementations.flatten()) {
      // impl<T> start<T, number> for string
      //      ^ spec.generics
      //               ^ spec.inputs
      //                              ^ spec.target
      if (!spec.target.eq(type)) {
        continue;
      }
  
      gcm.push();
      gcm.set(new GenericClawType("Self", BUILTIN_LOC, []), type);
      const errorStack: string[] = [];
      const subsituted = this.substituteRaw(spec.inputs, gcm, errorStack); 
      for (let i = 0; i < subsituted.length; i++) {
        if (errorStack.length) {
          gcm.pop();
          continue;
        }
      }
      works.push({ gcm, spec });
      gcm.pop();
    }
    return works;
  }

  substituteRaw(
    types: ClawType[],
    mappings: GenericChainMap,
    errorStack: string[],
    careAboutGenerics: boolean = true
  ) {
    const outTypes: ClawType[] = [];
    for (const type of types) {
      outTypes.push(this.substituteRawSingle(type, mappings, errorStack, careAboutGenerics));
    }
    return outTypes;
  }
  substituteRawSingle(
    type: ClawType,
    mappings: GenericChainMap,
    errorStack: string[],
    careAboutGenerics: boolean = true
  ): ClawType {
    if (type instanceof GenericClawType) {
      const t = mappings.get(type);
      if (t === undefined) {
        if (careAboutGenerics) {
          errorStack.push(`No generic "${type.toDisplay()}"`);
        }
        return new BuiltinClawType("ERROR", [], BUILTIN_LOC);
      }
      return t[1];
    } else if (type instanceof VariableClawType) {
      const generics = this.substituteRaw(type.generics, mappings, errorStack, careAboutGenerics);
      
      return new VariableClawType(
        type.name,
        generics,
        type.loc,
        this.substituteRawSingle(type.base, mappings, errorStack, careAboutGenerics),
      );
    } else if (type instanceof StructureClawType) {
      return new StructureClawType(
        type.name,
        type.generics, 
        type.loc,
        type.members,
      );
    } else if (type instanceof FunctionClawType) {
      return new FunctionClawType(
        type.name,
        type.generics,
        type.loc,
        arrzip(type.args.map(a => a[0]), this.substituteRaw(type.args.map(a => a[1]), mappings, errorStack, careAboutGenerics)),
        this.substituteRawSingle(type.output, mappings, errorStack, careAboutGenerics),
        type.body
      );
    } else if (type instanceof BuiltinClawType) {
      return new BuiltinClawType(type.name, [], BUILTIN_LOC);
    } else if (type instanceof ReferenceClawType) {
      return new ReferenceClawType(
        type.loc,
        this.substituteRawSingle(type.base, mappings, errorStack, careAboutGenerics),
      );
    } else if (type instanceof OfClawType) {
      // const base = this.substituteRawSingle(type.base, mappings, errorStack);
      // return base;
      return this.getTypeFromName("any")!;
    }
    throw new Error("UNIMPLEMENTED CLAWTYPE VARIANT")
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
      logger.error(
        `value in question: ${
          arrjoinwith(values, (a) => a.toDisplay(), ", ")
        }`,
      );
      throw new TypecheckerError();
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
    v: ClawType,
    gcm: GenericChainMap,
  ) {
    const errorStack: string[] = [];
    this.tryExtractGenericSingle(template, v, gcm, errorStack);
    if (errorStack.length) {
      for (const e of errorStack) logger.error(e);
    }
  }

  tryExtractGeneric(
    template: ClawType[],
    values: ClawType[],
    gcm: GenericChainMap,
    errorStack: string[]
  ): GenericChainMap {
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
      logger.error(
        `value in question: ${
          arrjoinwith(values, (a) => a.toDisplay(), ", ")
        }`,
      );
      throw new TypecheckerError();
    }

    for (let i = 0; i < values.length; i++) {
      const temp = template[i];
      const val = values[i];

      this.tryExtractGenericSingle(temp, val, gcm, errorStack);
    }

    return mapping;
  }

  tryExtractGenericSingle(
    template: ClawType,
    v: ClawType,
    gcm: GenericChainMap,
    errorStack: string[]
  ) {
    let value = v;
    if (template instanceof VariableClawType) {
      if (!(value instanceof VariableClawType)) {
        value = new VariableClawType(value.name, [], value.loc, value);
      }
      if (!assertType<VariableClawType>(value)) return;
      if (!this.typeMatches(value.base, template.base)) {
        errorStack.push(
          `${template.toDisplay()} cannot map onto ${value.toDisplay()}`,
        );
        return;
      }
      const ANY = this.getTypeFromName("any")!;
      if (value.eq(ANY) || template.eq(ANY)) return;
      this.extractGeneric(template.generics, value.generics, gcm);
    } else if (template instanceof GenericClawType) {
      for (const bound of template.bounds) {
        if (!this.doesTypeImplementInterface(value, bound, value.generics)) {
          errorStack.push(
            `${value.toDisplay()} does not implement bound ${bound.toDisplay()}`,
          );
          return;
        }
      }
      gcm.set(template, value);
    } else if (template instanceof FunctionClawType) {
      if (!(value instanceof FunctionClawType)) {
        errorStack.push(`${value.toDisplay()} is not a function type`);
        return;
      }
      if (value.args.length !== template.args.length) {
        errorStack.push(`${value.toDisplay()} has different argument count`);
        errorStack.push(`expected: ${template.toDisplay()}`);
        return;
      }
      this.extractGeneric(template.args.map(a => a[1]), value.args.map(a => a[1]), gcm);
      this.extractGenericSingle(template.output, value.output, gcm);
    } else if (template instanceof StructureClawType) {
      if (!(value instanceof StructureClawType)) {
        errorStack.push(`${value.toDisplay()} is not a structure type`);
        errorStack.push(`expected: ${template.toDisplay()}`);
        return;
      }
      const templateMembers = new Set(template.members.keys().toArray());
      const valueMembers = new Set(value.members.keys().toArray());
      if (templateMembers.size !== valueMembers.size) {
        errorStack.push(
          `${value.toDisplay()} has different member count to template`,
        );
        errorStack.push(`expected: ${template.toDisplay()}`);
        return;
      }

      if ([...templateMembers].every((x) => valueMembers.has(x))) {
        this.extractGeneric(
          template.members.values().toArray(),
          value.members.values().toArray(),
          gcm,
        );
      } else {
        errorStack.push("template and value members have different members");
      }
    } else if (template instanceof BuiltinClawType) {
      return (
        value instanceof BuiltinClawType &&
        template.eq(value)
      );
    } else if (template instanceof ReferenceClawType) {
      if (!(value instanceof ReferenceClawType)) {
        errorStack.push(`provided value should be a reference`);
        errorStack.push(`expected: ${template.toDisplay()}`);
        errorStack.push(`got: ${value.toDisplay()}`);
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

  tryFindGeneric(args: [string, ClawType][], got: ClawType[], gcm: GenericChainMap): GenericChainMap | undefined {
    let m: GenericChainMap | undefined = new GenericChainMap();
    m.push();
    for (const [[_, d], v] of arrzip(args, got)) {
      m = this.tryFindGenericSingle(d, v, gcm, m);
    }
    
    return m;
  }
  tryFindGenericMulti(arg: ClawType[], got: ClawType[], gcm: GenericChainMap, m?: GenericChainMap): GenericChainMap | undefined {
    for (const [d, v] of arrzip(arg, got)) {
      m = this.tryFindGenericSingle(d, v, gcm, m);
    }
    return m;
  }
  tryFindGenericSingle(arg: ClawType, got: ClawType, gcm: GenericChainMap, m?: GenericChainMap): GenericChainMap | undefined {
    if (arg instanceof GenericClawType) {
      m?.set(arg, got);
    } else if (arg instanceof VariableClawType) {
      if (got instanceof VariableClawType) {
        this.tryFindGenericMulti(arg.generics, got.generics, gcm, m);
        this.tryFindGenericSingle(arg.base, got.base, gcm, m);
      } else if (arg.generics.length === 0) {
        this.tryFindGenericSingle(arg.base, got, gcm, m);
      } else return undefined;
    } else if (arg instanceof StructureClawType) return m;
    else if (arg instanceof ReferenceClawType) {
      if (got instanceof ReferenceClawType) {
        this.tryFindGenericSingle(arg.base, got.base, gcm, m);
      } else {
        return undefined;
      }
    }
    else if (arg instanceof FunctionClawType) {
      if (got instanceof FunctionClawType) {
        this.tryFindGenericMulti(arg.args.map(a => a[1]), got.args.map(a => a[1]), gcm, m);
      } else {
        return undefined;
      }
    }
    return m;
  }
}
export class BaseClawType {
  constructor(
    public name: string,
    public generics: ClawType[],
    public loc: { fp: string; start: number; end: number },
  ) {
    // if (name === 'ERROR') console.log(`error type made: ${new Error().stack}`)
  }

  eq(other: ClawType, stop: boolean = false): boolean {
    if (this instanceof BuiltinClawType && this.name === "ERROR") return false;
    // if (other instanceof BuiltinClawType && other.name === "ERROR") return false;
    if (this instanceof VariableClawType && this.base instanceof VariableClawType) return this.base.eq(other) || other.eq(this.base);
    if (other instanceof VariableClawType && other.base instanceof VariableClawType) return other.base.eq(this) || this.eq(other.base);
    if (this instanceof BuiltinClawType && this.name === "any") return !(other instanceof BuiltinClawType && other.name === "ERROR");
    if (this instanceof GenericClawType && other instanceof GenericClawType) {
      return (
        this.name === other.name
      );
    }
    if (this instanceof FunctionClawType && other instanceof FunctionClawType) {
      return (
        this.name === other.name &&
        arreq(this.generics, other.generics, (a, b) => a.eq(b)) &&
        arreq(this.args, other.args, ([_, a], [__, b]) => a.eq(b)) &&
        this.output.eq(other.output)
      );
    }
    if (this instanceof VariableClawType) {
      if (other instanceof VariableClawType) {
        return (
          this.base.eq(other.base) &&
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
    if (
      this instanceof OfClawType && other instanceof OfClawType
    ) {
      return (
        this.int.eq(other.int) &&
        this.base.eq(other.base) &&
        this.intType.eq(other.intType)
      )
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
    public args: [string, ClawType][],
    public output: ClawType,
    public body: { args: string[], nodes: Node[] } | null
  ) {
    super(name, generics, loc);
  }

  override toDisplay(): string {
    let g = ``
    if (this.generics.length) {
      g = "<" + arrjoinwith(this.generics, a => a.toDisplay(), ", ") + ">";
    }
    return `fn ${this.name}${g}(${
      this.args.map(([k, v]) => `${k}: ${v.toDisplay()}`).join(", ")
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
        `  ${k}: ${v.toDisplay()}`, ",\n")
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
    if (this.base instanceof VariableClawType) return this.base.toDisplay()
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
      return `${this.name} + ${this.bounds.map((a) => a.toDisplay()).join(" + ")}`;
    }
    return this.name;
  }
}
export class OfClawType extends BaseClawType {
  constructor (
    loc: Loc,
    public int: ClawInterface,
    public inputs: ClawType[],
    public intType: GenericClawType,
    public base: ClawType
  ) {
    super("", [], loc);
    this.name = this.toDisplay();
  }

  override toDisplay(): string {
    let g = ``;
    if (this.inputs.length) {
      g = `<${arrjoinwith(this.inputs, a => a.toDisplay(), ", ")}>`
    }
    return `(${this.int.name}${g}.${this.intType.toDisplay()} of ${this.base.toDisplay()})`
  }
}
export type ClawType =
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
  specificImplementations: ChainArray<{
    generics: ClawType[];
    inputs: ClawType[];
    functions: FunctionClawType[];
    target: ClawType;
  }>;

  constructor(
    name: string,
    generics: ClawType[],
    functions: Map<string, FunctionClawType>,
  ) {
    this.name = name;
    this.generics = generics;
    this.functions = functions;
    this.specificImplementations = new ChainArray();
    this.specificImplementations.stack();
  }

  toDisplay() {
    return `interface ${this.name}`;
  }

  eq(other: ClawInterface) {
    return other.name === this.name
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

export class ClawConfig {
  stdlibPath: string;
  skipDeepCheck: boolean;

  timers: {
    typechecking: number,
    parsing: number,
  }

  constructor() {
    this.stdlibPath = "";
    this.skipDeepCheck = false;
    this.timers = {
      typechecking: 0,
      parsing: 0
    };
  }
}

export class Typechecker {
  ti: TypeIndex;
  gcm: GenericChainMap;
  scope: ChainMap<string, ClawType>;
  implementations: Map<string, { args: string[], nodes: Node[] }>;
  imported: {
    interface: Map<string, string[]>
  };

  constructor(public sourcemap: SourceMap, public config: ClawConfig) {
    this.ti = new TypeIndex(new ChainMap(), new Map());
    this.gcm = new GenericChainMap();
    this.gcm.push();
    this.imported = { interface: new Map() };
    this.scope = new ChainMap();
    this.scope.push();
    this.addBuiltinTypes();
    this.scope.set("$scope", this.ti.getTypeFromName("label")!);
    this.sourcemap.set("<builtin>", "")
    this.implementations = new Map();
  }

  addBuiltinTypesToImports() {

  }
  addBuiltinTypes() {
    const num = () => this.ti.getTypeFromName("number")!;;
    const bool = () => this.ti.getTypeFromName("bool")!;;
    this.ti.types.set("number", new BuiltinClawType("number", [], BUILTIN_LOC));
    this.ti.types.set("string", new BuiltinClawType("string", [], BUILTIN_LOC));
    this.ti.types.set("bool", new BuiltinClawType("bool", [], BUILTIN_LOC));
    this.ti.types.set("void", new BuiltinClawType("void", [], BUILTIN_LOC));
    this.ti.types.set("JsObject", new BuiltinClawType("JsObject", [], BUILTIN_LOC));
    this.ti.types.set("array", new BuiltinClawType("array", [new GenericClawType("T", BUILTIN_LOC, [])], BUILTIN_LOC));
    this.ti.types.set("label", new BuiltinClawType("label", [], BUILTIN_LOC));
    this.ti.types.set("int!", new BuiltinClawType("int!", [], BUILTIN_LOC));
    this.ti.types.set(
      "string!",
      new BuiltinClawType("string!", [], BUILTIN_LOC),
    );
    this.ti.types.set("bool!", new BuiltinClawType("bool!", [], BUILTIN_LOC));
    this.ti.types.set("void!", new BuiltinClawType("void!", [], BUILTIN_LOC));
    this.ti.types.set("any", ANY_TYPE(BUILTIN_LOC));

    const Self = new GenericClawType("Self", BUILTIN_LOC, []);

    const addBinaryInterface = (interfaceName: string, functionName: string, takes: ClawType, returns: ClawType) => {
      const AddInterface = new ClawInterface(interfaceName, [
        new GenericClawType("Right", BUILTIN_LOC, []), 
        new GenericClawType("Output", BUILTIN_LOC, [])
      ], new Map([
          [functionName, 
            new FunctionClawType(
              functionName,
              [], 
              BUILTIN_LOC,
              [["self", Self], ["right", new GenericClawType("Right", BUILTIN_LOC, [])]], 
              new GenericClawType("Output", BUILTIN_LOC, []),
              null
            )
          ]
      ]));
      AddInterface.specificImplementations.push({
        functions: [
          new FunctionClawType(functionName, [], BUILTIN_LOC, [["self", Self], ["right", takes]], returns, {
            args: ["self", "other"],
            nodes: [
              {
                ...BUILTIN_LOC, 
                type: NodeKind.ReturnNode, 
                value: {
                  ...BUILTIN_LOC,
                  type: NodeKind.IntrinsicNode,
                  string: `$ibop-${interfaceName}-${takes.toDisplay()}-${returns.toDisplay()}`
                }
              }
            ]
          })
        ],
        generics: [],
        inputs: [takes, returns],
        target: num()
      })
      this.ti.interfaces.set(interfaceName, AddInterface);
    }
    const addUnaryInterface = (interfaceName: string, functionName: string, target: ClawType, returns: ClawType) => {
      const AddInterface = new ClawInterface(interfaceName, [
        new GenericClawType("Output", BUILTIN_LOC, [])
      ], new Map([
          [functionName, 
            new FunctionClawType(
              functionName,
              [], 
              BUILTIN_LOC,
              [["self", target]], 
              new GenericClawType("Output", BUILTIN_LOC, []),
              null
            )
          ]
      ]));
      AddInterface.specificImplementations.push({
        functions: [
          new FunctionClawType(functionName, [], BUILTIN_LOC, [["self", target]], returns, { 
            args: ["self"],
            nodes: [
              {
                ...BUILTIN_LOC, 
                type: NodeKind.ReturnNode, 
                value: {
                  ...BUILTIN_LOC,
                  type: NodeKind.IntrinsicNode,
                  string: `$iuop-${interfaceName}-${target.toDisplay()}-${returns.toDisplay()}`
                }
              }
            ]
           })

        ],
        generics: [],
        inputs: [returns],
        target
      })
      this.ti.interfaces.set(interfaceName, AddInterface);
    }
    addBinaryInterface("Add", "add", num(), num());
    addBinaryInterface("Sub", "sub", num(), num());
    addBinaryInterface("Mul", "mul", num(), num());
    addBinaryInterface("Div", "div", num(), num());
    addBinaryInterface("Mod", "modulo", num(), num());
    addBinaryInterface("BitwiseXor", "bitwise_xor", num(), num());
    addBinaryInterface("BitwiseOr", "bitwise_or", num(), num());
    addBinaryInterface("BitwiseAnd", "bitwise_and", num(), num());
    addBinaryInterface("And", "and", num(), bool());
    addBinaryInterface("Or", "or", num(), bool());
    addBinaryInterface("Eq", "eq", num(), bool());
    addBinaryInterface("Neq", "neq", num(), bool());
    addBinaryInterface("Gt", "gt", num(), bool());
    addBinaryInterface("Gte", "gte", num(), bool());
    addBinaryInterface("Lt", "lt", num(), bool());
    addBinaryInterface("Lte", "lte", num(), bool());
    addUnaryInterface("Negate", "neg", num(), num());
    addUnaryInterface("BitwiseNot", "bnot", num(), num());
    addUnaryInterface("Not", "not", bool(), bool());
    

    const RuntimeInterface = new ClawInterface(
      "Runtime",
      [],
      new Map([
        ["to_scratch_value", 
            new FunctionClawType(
                "to_scratch_value", 
                [], 
                BUILTIN_LOC, 
                [["self", Self]], 
                this.ti.getTypeFromName("JsObject")!, 
                null)],
        ["sizeof", new FunctionClawType("sizeof", [], BUILTIN_LOC, [], num(), null)]
      ])
    );
    this.ti.interfaces.set("Runtime", RuntimeInterface);
    const AssignInterface = new ClawInterface(
      "Assign",
      [new GenericClawType("T", BUILTIN_LOC, [])],
      new Map([
        ["assign", 
            new FunctionClawType(
                "assign", 
                [], 
                BUILTIN_LOC, 
                [["self", Self], ["new_value", new GenericClawType("T", BUILTIN_LOC, [])]], 
                Self,
                null)],
      ])
    );
    this.ti.interfaces.set("Assign", AssignInterface);
  }

  typecheckFile(nodes: Node[]): Node[] {
    if (nodes.length) {
      this.imported.interface.set(nodes[0].fp, ["Runtime"]);
      const n = this.typecheckForReturn(nodes)[0];
      return n;
    }
    return [];
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
        } else throw e;
      }
    }
    this.scope.pop();
    if (returnVals.length === 0) {
      returnVals.push(new TCReturnValue(this.ti.getTypeFromName("void")!));
    }
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

        const assignment = 
          this.ti.getTypeInterfaceImplementations(
            value, 
            this.ti.getInterfaceFromName("Assign")!, 
            [type]
          );
        if (assignment.length > 1) {
          this.errorAt(node, `Cannot have multiple competeting assignment implementations`);
          for (const a of assignment) {
            this.errorNoteAt(a.spec.functions[0].loc, `Assignment implementations here:`);
          }
          throw new TypecheckerError();
        } else if (assignment.length === 1) {
          const f = assignment[0].spec.functions[0];
          const fn = this.ti.substituteRawSingle(f, assignment[0].gcm, []);
          this.doFunctionBody(node, fn as FunctionClawType);
          return node;
        }

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
        return this.typecheckFunction(node);
      }

      case NodeKind.BlockNode: {
        this.scope.push();

        const [_nodes, retVals] = this.typecheckForReturn(node.nodes);
        if (retVals.length) {
          throw retVals;
        }

        this.scope.pop();
        return {
          ...node,
          nodes: _nodes
        };
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
          ;
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
        return {
          ...node,
          body: {
            ...node,
            type: NodeKind.BlockNode,
            nodes: _nodes
          },
        }
      }
      case NodeKind.ForRuntimeNode: 
      case NodeKind.ForNode: {
        this.typecheckSingle(node.initialiser);
        const name = node.type === NodeKind.ForNode ? "bool" : "bool!";
        const predValue = this.evaluateTypeFromValue(node.predicate);
        if (!predValue.eq(this.ti.getTypeFromName(name)!)) {
          this.errorAt(node.predicate, `Predicate has to be a ${name}`);
        }
        this.typecheckSingle(node.post);
        const [_nodes, body] = this.typecheckForReturn([node.body]);
        if (body.length) {
          throw body;
        }
        return node;
      };
      case NodeKind.IntrinsicNode: return node; 
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
      case NodeKind.DataStructDefinitionNode: {
        const name = node.name;
        const generics = this.resolveTypeGenerics(node.generics);
        this.ti.types.push();
        for (const t of generics) this.ti.types.set(t.name, t);
        const newMap: Map<string, ClawType> = new Map();
        for (const [k, v] of node.members) {
          newMap.set(k, this.resolveTypeNode(v, this.gcm));
        }
        for (const [k, v] of newMap) {
          if (!this.ti.doesTypeImplementInterface(v, this.ti.getInterfaceFromName("Runtime")!, [])) {
            this.errorAt(v.loc, `(${k}): ${v.toDisplay()} does not implement Runtime, cannot be a data struct`);
          }
        }
        this.ti.types.pop();

        this.ti.types.set(name, new StructureClawType(name, generics, node, newMap));
        return node;

      }
      case NodeKind.InterfaceNode: {
        const name = node.name;
        this.ti.types.push();
        const ta = this.resolveTypeGenerics(node.typeArguments);
        for (const t of ta) this.ti.types.set(t.name, t);
        const map = new Map<string, FunctionClawType>();
        for (const def of node.defs) {
          this.ti.types.push();
          const ta = this.resolveTypeGenerics(def.typeArgs);
          for (const t of ta) this.ti.types.set(t.name, t);
          this.ti.types.set("Self", new GenericClawType("Self", BUILTIN_LOC, []))

          const retType = this.resolveTypeNode(def.returnType, this.gcm);
          const args = [];
          for (const [_n, arg] of def.args) {
            args.push([_n, this.resolveTypeNode(arg, this.gcm)] as [string, ClawType]);
          }
          map.set(def.name, new FunctionClawType(def.name, ta, def, args, retType, { nodes: [def.nodes], args: args.map(a => a[0]) }));
          this.ti.types.pop();
        }
        this.ti.types.pop();
        const int = new ClawInterface(name, ta, map);
        this.ti.interfaces.set(name, int)
        this.imported.interface.get(node.fp)!.push(name)

        return node;
      }

      case NodeKind.ImplBaseNode: {
        this.gcm.push();
        const tas = this.resolveTypeGenerics(node.generics);
        this.ti.types.push();
        for (const ta of tas) this.ti.types.set(ta.name, ta);
        for (const ta of tas) this.gcm.set(ta, ta);
        const tt = this.resolveTypeNode(node.targetType, this.gcm);
        this.gcm.set(new GenericClawType("Self", BUILTIN_LOC, []), tt);

        const map = new Map<string, FunctionClawType>();
        for (const def of node.defs) {
          this.ti.types.push();
          const ta = this.resolveTypeGenerics(def.typeArgs);
          for (const t of ta) this.ti.types.set(t.name, t);
          for (const t of ta) this.gcm.set(t, t);
          this.addGenericImplementations(tas)
          this.addGenericImplementations(ta)

          const retType = this.resolveTypeNode(def.returnType, this.gcm);
          const args = [];
          for (const [_n, arg] of def.args) {
            args.push([_n, this.resolveTypeNode(arg, this.gcm)] as [string, ClawType]);
          }
          for (const [_n, arg] of args) {
            this.scope.set(_n, arg)
          }
          const v = new FunctionClawType(def.name, ta, def, args, retType, { nodes: [def.nodes], args: args.map(a => a[0]) })
          
          this.removeGenericImplementations(ta)
          this.removeGenericImplementations(tas)
          map.set(def.name, v);
          this.ti.types.pop();
        }
        this.ti.baseImplementations.push({
          generics: tas,
          target: tt,
          inputs: tt.generics,
          functions: map.values().toArray()
        });
        for (const def of node.defs) {
          const mapped = map.get(def.name)!;
          this.addGenericImplementations(tas)
          this.addGenericImplementations(mapped.generics as GenericClawType[])
          const [_nodes, actualRetType] = this.typecheckForReturn([def.nodes]);
          for (const rt of actualRetType) {
            if (!rt.value.eq(mapped.output)) {
              this.errorAt(rt.value.loc, `Mismatched return types, expected: ${mapped.output.toDisplay()}, got: ${rt.value.toDisplay()}`);
              this.errorNoteAt(mapped.output.loc, `Return type specified here:`)
              continue;
            }
          }
          this.removeGenericImplementations(tas)
          this.removeGenericImplementations(mapped.generics as GenericClawType[])

        }
        for (const def of node.defs) {
          const f = map.get(def.name)!;
          this.scope.push();
          for (const [k, v] of f.args) {
            this.scope.set(k, v); 
          }
          this.addGenericImplementations(f.generics as GenericClawType[])
          for (const k of f.generics) {
            this.ti.types.set(k.name, k);
          }
          const [_n, returnVals] = this.typecheckForReturn([def.nodes]);
          for (const retVal of returnVals) {
            if (!retVal.value.eq(f.output)) {
              this.errorAt(retVal.value.loc, `Mismatched return types, expected: ${f.output.toDisplay()}, got: ${retVal.value.toDisplay()}`);
              this.errorNoteAt(f.output.loc, `Return type specified here:`);
              throw new TypecheckerError();
            }
          }
          this.removeGenericImplementations(f.generics as GenericClawType[])
          this.scope.pop();
        }
        this.ti.types.pop();
        this.gcm.pop();
        return node;
      }

      case NodeKind.ImplTraitNode: {
        this.gcm.push();
        this.ti.types.push();
        const tas = this.resolveTypeGenerics(node.generics);
          for (const ta of tas) this.ti.types.set(ta.name, ta);
          for (const ta of tas) this.gcm.set(ta, ta);
          const tt = this.resolveTypeNode(node.targetType, this.gcm);
        const [trait, inputs] = this.resolveInterface(node.trait);
        if (inputs.length !== trait.generics.length) {
          this.errorAt(node.trait, `Mismatched input count for impl interface`);
          throw new TypecheckerError();
        }
        this.gcm.set(new GenericClawType("Self", tt.loc, []), tt);
        const map = new Map<string, FunctionClawType>();
        if (node.defs.length !== trait.functions.size) {
          this.errorAt(node, `Not enough method implementations, expected ${trait.functions.size}, got ${node.defs.length}`);
          return node;
        } 
        for (const def of node.defs) {
          if (!trait.functions.has(def.name)) {
            this.errorAt(def, `Interface ${trait.name} has no method ${def.name}`);
            return node;
          }
          this.ti.types.push();
          const ta = this.resolveTypeGenerics(def.typeArgs);
          for (const t of ta) this.ti.types.set(t.name, t);
          this.addGenericImplementations(tas)
          this.addGenericImplementations(ta)

          const retType = this.resolveTypeNode(def.returnType, this.gcm);
          const args = [];
          for (const [_n, arg] of def.args) {
            args.push([_n, this.resolveTypeNode(arg, this.gcm)] as [string, ClawType]);
          }
          for (const [_n, arg] of args) {
            this.scope.set(_n, arg)
          }
          const v = new FunctionClawType(def.name, ta, def, args, retType, { nodes: [def.nodes], args: args.map(a => a[0]) })
          const errorStack: string[] = [];
          
          this.gcm.push()
          for (let i = 0; i < inputs.length; i++) this.gcm.set(trait.generics[i] as GenericClawType, inputs[i])
          const template = this.ti.substituteRawSingle(trait.functions.get(def.name)!, this.gcm, errorStack);
          this.gcm.pop()

          if (!template.eq(v)) {
            this.errorAt(def, `Mismatching function definition`);
            this.errorNoteAt(trait.functions.get(def.name)!.loc, `Expected: ${template.toDisplay()}, got: ${v.toDisplay()}`);
            return node;
          }
          const [_nodes, actualRetType] = this.typecheckForReturn([def.nodes]);
          for (const rt of actualRetType) {
            if (!rt.value.eq(retType)) {
              this.errorAt(rt.value.loc, `Mismatched return types, expected: ${retType.toDisplay()}, got: ${rt.value.toDisplay()}`);
              this.errorNoteAt(retType.loc, `Return type specified here:`)
              continue;
            }
          }
          this.removeGenericImplementations(ta)
          this.removeGenericImplementations(tas)
          map.set(def.name, v);
          this.ti.types.pop();
        }
        this.gcm.pop();
        this.ti.types.pop();
        trait.specificImplementations.push({
          generics: tas,
          target: tt,
          inputs,
          functions: map.values().toArray()
        });
        return node;
      }
      case NodeKind.ImportNode: {
        if (node.string.startsWith(".")) {
          // relative file
          
        } else if (node.string.startsWith("intrinsic")) {
          if (node.string === "intrinsic.ops") {
            this.addBuiltinTypesToImports();
          }
        } else {
          const PATH_MAP = {
            "std": "std/mod.claw",
            "std/binding": "std/binding.claw",
            "std/intrin": "std/intrin.claw",
            "std/sprite": "std/sprite.claw",
            "std/option": "std/option.claw",
            "std/costume": "std/costume.claw",
            "std/var": "std/var.claw",
            "std/block": "std/block.claw",
            "std/display": "std/display.claw",
          };
          const mapped = PATH_MAP?.[node.string as keyof typeof PATH_MAP];
          if (mapped === undefined) {
            this.errorAt(node, `Unknown std lib: ${node.string}`);
            throw new TypecheckerError()
          }
          if (this.imported.interface.has(mapped)) return node;
          node.nodes = this.importFileAt(mapped);
        }
        
        return node;
      }

      case NodeKind.ExportNode: {
        this.typecheckSingle(node.sub);
        this.scope.__inner[0].set(node.sub.name, this.scope.get(node.sub.name)!);
        return node;
      }

      case NodeKind.UseInterfaceNode: {
        const int = this.ti.getInterfaceFromName(node.interfaceName);
        if (int === undefined) {
          this.errorAt(node, `No interface called ${node.interfaceName}`);
          throw new TypecheckerError();
        }
        this.imported.interface.get(node.fp)!.push(node.interfaceName);
        return node;
      }

      default:
        this.errorAt(node, `${NodeKind[node.type]} is not a valid statement`);
        return node;
    }
  }

  resolveTypeNode(typenode: TypeNode, gcm: GenericChainMap): ClawType {
    if (typenode.type === NodeKind.NormalTypeNode) {
      return this.resolveNormalTypeNode(typenode, gcm);
    }
    const [int, inputs] = this.resolveInterface(typenode.int);
    const type = this.resolveTypeGenericSingle(typenode.intType);
    if (int === undefined) {
      this.errorAt(typenode, `No interface called ${typenode.int}`);
      throw new TypecheckerError();
    }
    if (!int.generics.some(a => a.eq(type))) {
      this.errorAt(typenode.intType, `${int.toDisplay()} does not have a generic ${type.toDisplay()}`);
      throw new TypecheckerError();
    }
    const base = this.resolveTypeNode(typenode.baseType, gcm);
    return new OfClawType(typenode, int, inputs, type, base);
  }
  resolveNormalTypeNode(typenode: NormalTypeNode, gcm: GenericChainMap): ClawType {
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
    if (!(type instanceof GenericClawType && type.bounds.length)) {
      for (const ta of typenode.typeArguments) {
        generics.push(this.resolveTypeNode(ta, gcm));
      }
      if (type.generics.length !== generics.length) {
        this.errorAt(typenode, `Too many type arguments`);
        logger.error(
          `Expected ${type.generics.length} type arguments, instead got ${generics.length}`,
        );
      }
    } 
    if (!(type instanceof VariableClawType)) {
      type = new VariableClawType(type.name, generics, typenode, type);
    }
    return type;
  }

  resolveTypeGenerics(tns: TypeNode[]) {
    const typeArgs = [];
    for (const ta of tns) {
      typeArgs.push(this.resolveTypeGenericSingle(ta))
    }

    return typeArgs;
  }
  resolveTypeGenericSingle(ta: TypeNode) {
    if (ta.type === NodeKind.OfTypeNode) {
      this.errorAt(ta, `Generic cannot be Of type`);
      throw new TypecheckerError();
    }
    const bounds = [];
    for (const bound of ta.bounds) {
      const b = this.ti.getInterfaceFromName(bound)
      if (b === undefined) {
        this.errorAt(ta, `No interface called ${bound}`);
      } else bounds.push(b);
    }
    return new GenericClawType(ta.name, ta, bounds)

  }

  resolveInterface(tn: TypeNode): [ClawInterface, ClawType[]] {
    if (tn.type === NodeKind.OfTypeNode) {
      this.errorAt(tn, `Interfaces are in format Foo<bar, baz>`);
      throw new TypecheckerError();
    }
    const int = this.ti.getInterfaceFromName(tn.name);
    if (int === undefined) {
      this.errorAt(tn, `No interface called ${tn.name}`);
      throw new TypecheckerError();
    }
    const tas = [];
    for (const t of tn.typeArguments) {
      const v = this.resolveTypeNode(t, this.gcm);
      tas.push(v);
    }
    return [int, tas];
  }

  addGenericImplementations(ta: GenericClawType[]) {
    for (const t of ta) {
      for (const bound of t.bounds) {
        const map = (v: ClawType) => {
          if (v instanceof GenericClawType) {
            if (v.name === "Self") {
              return t;
            }
            const v2 = new OfClawType(v.loc, bound, [], v, t);
            return v2;
          }
          return v;
        };
        const inputs = bound.generics.map(map);
        bound.specificImplementations.stack();
        bound.specificImplementations.push({
          functions: bound.functions.values().map((v) => {
            // add(self: Self, other: Right) Output
            //  convert
            // add(self: T, other: (Add.Right of T)) (Add.Output of T)
            const V = new FunctionClawType(v.name, v.generics, v.loc, v.args.map(([k, v]) => [k, map(v)]), map(v.output), null)
            return V;
          }).toArray(),
          generics: [],
          inputs: inputs,
          target: t
        });
        // this.gcm.set(base, base);
      }
    }
  }

  removeGenericImplementations(ta: GenericClawType[]) {
    for (const t of ta) {
      for (const bound of t.bounds) {
        bound.specificImplementations.take();
      }
    }
  }

  typecheckFunction(node: FunctionDefinitionNode) {
    const ta = this.resolveTypeGenerics(node.typeArgs);
    this.ti.types.push();
    for (const t of ta) this.ti.types.set(t.name, t);
    this.gcm.push();
    for (const t of ta) this.gcm.set(t, t);

    const args: [string, ClawType][] = [];
    for (const arg of node.args) {
      const v = this.resolveTypeNode(arg[1], this.gcm);
      args.push([arg[0], v] as [string, ClawType]);
    }


    const returnValue = this.resolveTypeNode(node.returnType, this.gcm);
    const fn = new FunctionClawType(node.name, ta, node, args, returnValue, { nodes: [node.nodes], args: args.map(a => a[0]) });
    this.scope.set(fn.name, fn);
    this.scope.push();
    for (const [narg, arg] of arrzip(node.args, args)) this.scope.set(narg[0], arg[1]);

    this.addGenericImplementations(ta);

    const types = this.typecheckForReturn([node.nodes])[1];
    for (const type of types) {
      if (!type.value.eq(returnValue)) {
        this.errorAt(type.value.loc, `Mismatching return types, expected: ${returnValue.toDisplay()}, got: ${type.value.toDisplay()}`);
        this.errorNoteAt(returnValue.loc, `Definition here`);
      }
    }
    this.removeGenericImplementations(ta)
    this.scope.pop();

    this.gcm.pop();
    this.ti.types.pop();
    return node;
  }

  doFunctionBody(node: BinaryOperation | UnaryOperation | AssignmentNode | CallNode, fn: FunctionClawType) {
    if (fn.body !== null) {
      this.scope.push();
      this.ti.types.push();
      for (const k of fn.generics) {
        this.ti.types.set(k.name, k)
      }
      console.log(node.fp, node.start)
      for (const [k, v] of fn.args) {
        console.log("setting args", k, v.toDisplay())
        this.scope.set(k, v);
      }
      try {
        this.typecheckForReturn(fn.body.nodes);
      } catch (e) {
        if (e instanceof TypecheckerError) {
          this.errorNoteAt(node, `Error arrised from this call`)
          throw new TypecheckerError()
        }
      }
      this.ti.types.pop();
      this.scope.pop()
      
      node.target = `${fn.toDisplay()}@${fn.loc.fp}:${fn.loc.start}`;
      this.implementations.set(node.target, fn.body!);
    } 
  }

  typeMatches(left: ClawType, right: ClawType): boolean {
    return this.ti.typeMatches(this.getValueBase(left), this.getValueBase(right))
  }

  evaluateTypeFromValue(node: Node): ClawType {
    switch (node.type) {
      case NodeKind.NumberNode:
        return this.ti.getTypeFromName("number")!.withLoc(node);
      case NodeKind.StringNode:
        return this.ti.getTypeFromName("string")!.withLoc(node);
      case NodeKind.BooleanNode:
        return this.ti.getTypeFromName("bool")!.withLoc(node);
      case NodeKind.VariableNode: {
        const val = this.scope.get(node.name);
        if (val === undefined) {
          this.errorAt(node, `No variable called ${node.name}`);
          throw new TypecheckerError();
        }
        return val;
      }
      case NodeKind.StructLiteralNode: {
        const type = this.resolveTypeNode(node.baseType, this.gcm) as VariableClawType;
        if (!(type.base instanceof StructureClawType)) {
          this.errorAt(node.baseType, `Structure literal base type is not a struct`);
          throw new TypecheckerError();
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
      }
      case NodeKind.CallNode: {
        let fn;
        if (node.callee.type === NodeKind.MethodOfNode)
          fn = this.evaluateMethodOf(node.callee); 
        else
          fn = this.evaluateTypeFromValue(node.callee);
        if (node.callee.fp.includes("var.claw")) 
          console.log(node, fn.toDisplay(), this.scope.get("value")?.toDisplay())

        if (!(fn instanceof FunctionClawType)) {
          this.errorAt(node, `Callee is not a function`);
          logger.error(`received: ${fn.toDisplay()}`);
          throw new TypecheckerError();
        }
        const args: ClawType[] = [];
        for (const a of node.arguments) {
          args.push(this.evaluateTypeFromValue(a));
        }

        let generics: ClawType[] = [];
        if (node.typeArguments !== null) {
          for (const ta of node.typeArguments) {
            generics.push(this.resolveTypeNode(ta, this.gcm));
          }
        } else {
          const errorStack: string[] = [];
          const fnargs = node.callee.type === NodeKind.MethodOfNode ? fn.args.slice(1) : fn.args
          const mapping = this.ti.tryFindGeneric(fnargs, args, this.gcm);
          if (mapping === undefined) {
            this.errorAt(node, `Failed to automatically resolve generics, please manually specify them`);
            throw new TypecheckerError()
          }

          for (const gen of fn.generics) {
            if (!mapping.has(gen as GenericClawType)) {
              this.errorAt(node, `Failed to automatically resolve generics, please manually specify them`);
              throw new TypecheckerError()
            }
          }
          const sub = this.ti.substituteRaw(fn.generics, mapping, errorStack);
          generics = sub;
        }
        if (node.callee.type === NodeKind.MethodOfNode) {
          args.splice(0, 0, this.evaluateTypeFromValue(node.callee.base))
        }
        if (fn.generics.length !== generics.length) {
          this.errorAt(node, `Mismatched type argument count`);
          this.errorNoteAt(fn.loc, "Definition here");
          logger.error(
            `Expected ${fn.generics.length}, instead received ${generics.length}`,
          );
          throw new TypecheckerError();
        }
        for (const [actual, generic] of arrzip(generics, fn.generics)) {
          if (!(generic instanceof GenericClawType)) throw new Error("should be unreachable");
          for (const bound of generic.bounds) {
            if (!this.ti.doesTypeImplementInterface(actual, bound, new Array(bound.generics.length).fill(this.ti.getTypeFromName("any")!))) {
              this.errorAt(actual.loc, `${actual.toDisplay()} does not implement ${bound.toDisplay()}`);
            };
          }
        }

        if (fn.args.length !== args.length) {
          this.errorAt(node, `Mismatched argument count`);
          this.errorNoteAt(fn.loc, "Definition here");
          logger.error(
            `Expected ${fn.args.length}, instead received ${args.length}`,
          );
          throw new TypecheckerError();
        }
        this.gcm.push();
        for (const [key, value] of arrzip(fn.generics, generics)) {
          this.gcm.set(key as GenericClawType, value);
        }
        const errorStack: string[] = [];
        const mapped = this.ti.substituteRaw(fn.args.map(a => a[1]), this.gcm, errorStack, false);
        if (mapped.some(a => a.eq(new BuiltinClawType("ERROR", [], BUILTIN_LOC)))) {
          this.errorAt(node, `Failed to substitute generics: ${errorStack.join("\n")}`);
          throw new TypecheckerError();
        }
        
        for (const [key, value] of arrzip(mapped, args)) {
          if (!this.typeMatches(key, value)) {
            this.errorAt(value.loc, `Mismatched argument type`);
            this.errorNoteAt(key.loc, `Definition here`);
            logger.error(`expected: ${key.toDisplay()}`);
            logger.error(`received: ${value.toDisplay()}`);
          }
        }

        this.ti.types.push()
        for (const [k, v] of arrzip(fn.generics, generics)) {
          this.ti.types.set(k.name, k);
          this.gcm.set(k as GenericClawType, v);
        }
        const out = this.ti.substituteRawSingle(fn.output, this.gcm, errorStack, false);
        const f = this.ti.substituteRawSingle(fn, this.gcm, errorStack, false);
        this.doFunctionBody(node, f as FunctionClawType);

        this.ti.types.pop()
        
        this.gcm.pop();
        return out;
      }
      case NodeKind.UnaryOperation: {
        const OPER_TO_TRAIT = {
          [UnaryOperationType.Negate]: "Negate",
          [UnaryOperationType.Not]: "Not",
          [UnaryOperationType.BitwiseNot]: "BitwiseNot",
        };
        const itfName = OPER_TO_TRAIT[node.oper];
        const itf = this.ti.getInterfaceFromName(itfName);
        if (itf === undefined) {
          this.errorAt(node, `Internal error, no trait for builtin unary operation`);
          throw new TypecheckerError();
        }
        const leftType = this.evaluateTypeFromValue(node.value);
        const impls = this.ti.getTypeInterfaceImplementations(leftType, itf, [ANY_TYPE(BUILTIN_LOC)], this.gcm);
        if (!impls.length) {
          this.errorAt(node, `No implementation for operator ${itfName}<...> for ${leftType.toDisplay()}`);
          logger.error(`Implement ${itfName}<...> for ${leftType.toDisplay()} to let it use operators`) ;
          throw new TypecheckerError();
        }
        const sortedImpls = impls.map(v => {
          const GENERICS = v.spec.generics.length;
          return [v, GENERICS] as const
        });
        
        if (sortedImpls.length > 1) {
          this.warnAt(node, `TODO: sort implementations by specifity better, defaulting to first implementation`);
        }

        const [[impl]] = sortedImpls.toSorted((a, b) => a[1] - b[1]);
        let fn = impl.spec.functions[0]!;
        fn = this.ti.substituteRawSingle(fn, impl.gcm, []) as FunctionClawType
        
        this.doFunctionBody(node, fn)

        const returnValue = impl.spec.functions[0].output;
        return returnValue;
      }
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
          throw new TypecheckerError();
        }
        const leftType = this.evaluateTypeFromValue(node.left);
        const rightType = this.evaluateTypeFromValue(node.right);
        const impls = this.ti.getTypeInterfaceImplementations(leftType, itf, [rightType, ANY_TYPE(BUILTIN_LOC)], this.gcm);
        if (!impls.length) {
          this.errorAt(node, `No implementation for operator ${itfName}<${rightType.toDisplay()}> for ${leftType.toDisplay()}`);
          logger.error(`Implement ${itfName}<${rightType.toDisplay()}, ...> for ${leftType.toDisplay()} to let it use operators`) ;
          throw new TypecheckerError();
        }
        const sortedImpls = impls.map(v => {
          const GENERICS = v.spec.generics.length;
          return [v, GENERICS] as const
        });
        
        if (sortedImpls.length > 1) {
          this.warnAt(node, `TODO: sort implementations by specifity better, defaulting to first implementation`);
        }
        const [[impl]] = sortedImpls.toSorted((a, b) => a[1] - b[1]);
        let fn = impl.spec.functions[0]!;
        fn = this.ti.substituteRawSingle(fn, impl.gcm, []) as FunctionClawType
        
        this.doFunctionBody(node, fn)
        this.gcm.pop();

        
        const returnValue = impl.spec.functions[0].output;
        return returnValue;
      }
      case NodeKind.ChildOfNode: {
        const baseValue = this.evaluateTypeFromValue(node.base);
        const child = this.getTypeChild(node.base, baseValue, node.extension);
        if (child instanceof FunctionClawType) {
          const fn = child;
          node.target = `${fn.name}-${fn.toDisplay()}@${fn.loc.fp}:${fn.loc.start}`;
          this.implementations.set(node.target, fn.body!);
        }
        return child;
      }
      case NodeKind.LabelNode: {
        this.scope.push()
        this.typecheck(node.nodes);
        this.scope.pop();
        return this.ti.getTypeFromName("label")!;
      } 
      case NodeKind.MethodOfNode: {
        this.errorAt(node, `Cannot use method as a value`)
        throw new TypecheckerError();
      }
      case NodeKind.Grouping:
        return this.evaluateTypeFromValue(node.value);
      case NodeKind.IntrinsicNode:
        return ANY_TYPE(node);
        
      case NodeKind.UseInterfaceNode:
      case NodeKind.ImportNode:
      case NodeKind.ExportNode:
      case NodeKind.NormalTypeNode:
      case NodeKind.OfTypeNode:
      case NodeKind.FunctionDefinitionNode:
      case NodeKind.BlockNode:
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
        throw new TypecheckerError();
    }
  }
  evaluateMethodOf(node: MethodOfNode) {

    const baseValue = this.evaluateTypeFromValue(node.base);
    const child = this.getTypeChild(node.base, baseValue, node.extension);
    if (!(child instanceof FunctionClawType)) {
      this.errorAt(node.base, `${baseValue.toDisplay()}.${node.extension} is not a function type`);
      throw new TypecheckerError();
    }
    const base = child.args[0];
    if (base === undefined) {
      this.errorAt(child.loc, `${child.toDisplay()} does not have self type`);
      throw new TypecheckerError();
    }
    if (!this.ti.typeMatches(this.getValueBase(baseValue), this.getValueBase(base[1]))) {
      this.errorAt(node.base, `${baseValue.toDisplay()} != ${base[1].toDisplay()}`);
      throw new TypecheckerError();
    }
    const fn = child;
    node.target = `${fn.toDisplay()}@${fn.loc.fp}:${fn.loc.start}`;
    this.implementations.set(node.target, fn.body!);
    return new FunctionClawType(
      child.name, 
      child.generics, 
      child.loc, 
      child.args, 
      child.output, 
      child.body!
    );
  }

  getValueBase(f: ClawType) {
    if (f instanceof VariableClawType) return f.base;
    else {
      return f;
    }
  }
  getTypeChild(loc: Loc, base: ClawType, extension: string): ClawType {
    if (base instanceof StructureClawType) {
      const member = base.members.get(extension);
      if (member !== undefined) return member;
      else {
        const methods = this.getMethodsOfChild(base, this.getFileInterfaces(loc.fp));
        // const methods = this.getMethodsOfChild(base, this.ti.interfaces.values().toArray());
        if (methods.has(extension)) {
          const v = methods.get(extension)![0];
          return v;
        } else {
          this.errorAt(loc, `${base.toDisplay()} has no (.) method/variable ${extension}`);
          throw new TypecheckerError();
        }
      }
    } else if (base instanceof ReferenceClawType) {
      return this.getTypeChild(loc, base.base, extension);
    } else if (base instanceof VariableClawType) {
      this.gcm.push();

      if (base.base instanceof StructureClawType) {
        for (const [k, v] of arrzip(base.base.generics, base.generics)) {
          this.gcm.set(k as GenericClawType, v);
        }
      }
      this.gcm.set(new GenericClawType("Self", BUILTIN_LOC, []), base);
      const errorStack: string[] = []
      const b = this.getTypeChild(loc, base.base, extension);
      if (b instanceof FunctionClawType) {
        for (const k of b.generics) {
          this.gcm.set(k as GenericClawType, k);
        }
      }
      const v = this.ti.substituteRawSingle(b, this.gcm, errorStack);
      this.gcm.pop();
      return v;
    } else if (base instanceof GenericClawType) {
      const methods = this.getMethodsOfChild(base, base.bounds);
      if (methods.has(extension)) {
        const v = methods.get(extension)![0];
        return v;
      } else {
        this.errorAt(loc, `${base.toDisplay()} has no method/variable ${extension}`);
        throw new TypecheckerError();
      }
    } else if (base instanceof FunctionClawType) {
      this.errorAt(base.loc, "Cannot get the member of a function");
      throw new TypecheckerError();
    } else if (base instanceof BuiltinClawType) {
      // const methods = this.getMethodsOfChild(base, this.ti.interfaces.values().toArray());
      // todo: make this work better
      const methods = this.getMethodsOfChild(base, this.getFileInterfaces(loc.fp));
      if (methods.has(extension)) {
        const v = methods.get(extension)![0];
        return v;
      } else {
        this.errorAt(loc, `${base.toDisplay()} has no method/variable ${extension}`);
        throw new TypecheckerError();
      }
    }

    this.errorAt(base.loc, `Unimplemented`);
    throw new TypecheckerError();
  }

  getMethodsOfChild(type: ClawType, interfaces: ClawInterface[]): MultiMap<string, FunctionClawType> {
    const out = new MultiMap<string, FunctionClawType>();
    const base = this.getValueBase(type);
    if (base instanceof GenericClawType) {
      this.addGenericImplementations([base])
    }
    
    for (const int of interfaces) {
      const all = this.ti.getAllTypeInterfaceImplementations(type, int);
      for (const impl of all) {
        for (const fn of impl.spec.functions) {
          out.push(fn.name, fn);
        }
      }
    }
    this.gcm.push();
    this.gcm.set(new GenericClawType("Self", BUILTIN_LOC, []), type)
    const other = this.ti.getTypeBaseImplementations(type, this.gcm)
    for (const impl of other) {
      for (const fn of impl.spec.functions) {
        out.push(fn.name, fn);
      }
    }
    this.gcm.pop();
    if (base instanceof GenericClawType) {
      this.removeGenericImplementations([base])
    }

    return out;
  }

  importFileAt(fp: string): Node[] {
    const STD_FIND_PATH = this.config.stdlibPath;
    const p = path.join(STD_FIND_PATH, fp);
    try {
      const f = Deno.readTextFileSync(p);
      this.sourcemap.set(p, f);
      const before = performance.now();

      const lexer = new Lexer(p, this.sourcemap);
      const tokens = lexer.lex();
      const parser = new Parser(tokens, this.sourcemap);
      const parsed = parser.parse();

      const after = performance.now()
      this.config.timers.parsing += after - before
      if (parsed instanceof Error) {
        throw new TypecheckerError();
      }

      this.typecheckFile(parsed);
      this.config.timers.typechecking += performance.now() - after
      return parsed;

    } catch (e) {
      if (e instanceof Error) {
        logger.error(`Failed to open file ${fp}:`);
        logger.error(`${e.message}`);
        logger.error(`${e.stack}`);
        throw new TypecheckerError();
      } 
      throw e;
    }
  }

  getFileInterfaces(fp: string): ClawInterface[] {
    return this.imported.interface.get(fp)!.map(a => this.ti.getInterfaceFromName(a)!);
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
  warnAt(
    location: { start: number; end: number; fp: string },
    message: string,
  ) {
    const sh = new SourceHelper(this.sourcemap.get(location.fp)!);
    const [col, row] = sh.getColRow(location.start);
    logger.warn(message);
    logger.warn(`At ${location.fp}:${col + 1}:${row}:`);
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
      logger.warn(out);
      logger.warn(pad);
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
