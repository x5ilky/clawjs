/**
 * @module
 * Module for helpful functions, classes and dataclasses that 
 * don't have a direct translation to scratch.
 * 
 * @example
 * ```ts
 * import { Vec2 } from "claw"
 * 
 * const v = new Vec2()
 * v.x.set(0)
 * v.y.set(1) 
 * ```
 */

// deno-lint-ignore-file no-explicit-any
import type { IlValue, IlNode } from "../ir/types.ts";
import { abs, add, and, DataClass, type DataclassOutput, div, eq, gt, gte, if$, type IlWrapper, join, log, lt, lte, mod, mul, not, Num, or, say, type Serializable, sqrt, stop, Str, sub, tenpower, trig, type Valuesque, type Variable, warp } from "./bindings.ts";
import * as mathjs from "mathjs";
class Vec2Raw {
    x: Num;
    y: Num;
    constructor() {
        this.x = new Num()
        this.y = new Num()
    }

    /**
     * returns new variable
     * @param other other vector2
     */
    add(other: Vec2): Vec2 {
        const v = new Vec2();
        v.x.set(add(this.x, other.x));
        v.y.set(add(this.y, other.y));
        return v;
    }
    /**
     * returns new variable
     * @param other other vector2
     */
    sub(other: Vec2): Vec2 {
        const v = new Vec2();
        v.x.set(sub(this.x, other.x));
        v.y.set(sub(this.y, other.y));
        return v;
    }
    /**
     * returns new variable
     * @param other other vector2
     */
    mul(other: Vec2): Vec2 {
        const v = new Vec2();
        v.x.set(mul(this.x, other.x));
        v.y.set(mul(this.y, other.y));
        return v;
    }
    /**
     * returns new variable
     * @param other other vector2
     */
    div(other: Vec2): Vec2 {
        const v = new Vec2();
        v.x.set(div(this.x, other.x));
        v.y.set(div(this.y, other.y));
        return v;
    }
    /**
     * returns the magnitude/distance squared
     */
    magnitudeSquared(): IlWrapper {
        return add(mul(this.x, this.x), mul(this.y, this.y));
    }
    magnitude(): IlWrapper {
        return sqrt(this.magnitudeSquared())
    }
    normalized(): Vec2 {
        const v = new Vec2();
        v.x.set(this.x)
        v.y.set(this.y)
        const magnitude = this.magnitude();
        if$(not(eq(magnitude, 0)), () => {
            v.x.set(div(v.x, magnitude));
            v.y.set(div(v.y, magnitude));
        });
        
        return v;
    }

    dot(other: Vec2): IlWrapper {
        return add(
            mul(this.x, other.x),
            mul(this.y, other.y)
        )
    }

    directionRadians(): IlWrapper {
        return trig.radians.atan(div(this.y, this.x))
    }
    direction(): IlWrapper {
        return trig.degrees.atan(div(this.y, this.x))
    }

    rotate(angleDegrees: Valuesque): Vec2 {
        const n = new Vec2();    
        n.x.set(sub(
            mul(this.x, trig.degrees.cos(angleDegrees)),
            mul(this.y, trig.degrees.sin(angleDegrees)),
        ))
        n.y.set(sub(
            mul(this.x, trig.degrees.sin(angleDegrees)),
            mul(this.y, trig.degrees.cos(angleDegrees)),
        ));
        return n;
    }

    static literal(x: Valuesque, y: Valuesque): Vec2 {
        const v = new Vec2();
        v.x.set(x);
        v.y.set(y);
        return v;
    }
}

/**
 * ## Runtime `Vector2` type in scratch
 * 
 * @example
 * ```ts
 * const v = new Vec2();
 * v.x.set(0)
 * v.y.set(1)
 * 
 * const d = v.add(2); // creates new vector
 * 
 * ```
 */
export const Vec2: DataclassOutput<typeof Vec2Raw> = DataClass(Vec2Raw);
export type Vec2 = InstanceType<typeof Vec2>;

/**
 * ## Fixed List
 * Equivalent to something like `int foo[5];` in C;
 * 
 * @example
 * ```ts
 * const ns = new FixedList(Num, 5)
 * // creates 5 Num's under the hood, no lists
 * 
 * ns.nth(0).set(5) // .nth() can only have a literal argument
 * ```
 */
export class FixedList<T extends new () => Serializable & Variable, Size extends number> implements Serializable, Variable {
    type: T;
    size: Size;
    values: InstanceType<T>[];
    
    constructor(type: T, size: Size) {
        this.type = type;
        this.size = size;
        this.values = [];
        for (let i = 0; i < size; i++) {
            this.values.push(new type() as InstanceType<T>)
        }
    }

    sizeof(): number {
      return this.size;
    }
    
    set(values: FixedList<T, Size>): void {
        for (let i = 0; i < values.size; i++) {
            this.values[i].set(values.values[i]);
        }
    }

    nth(count: number): InstanceType<T> {
        return this.values[count];
    }

    fromSerialized(values: IlValue[]): IlNode[] {
        const out = [];
        for (let i = 0; i < this.size; i++) { 
            out.push(...this.values[i].fromSerialized(values));
        }
        return out;
    }

    toSerialized(): IlValue[] {
        const out = [];
        for (let i = 0; i < this.size; i++) { 
            out.push(...this.values[i].toSerialized());
        }
        return out;
    }
    literal(...values: InstanceType<T>[]) {
      if (this.size !== values.length) throw new Error(`literal function took different argument length compared to specified FixedArray size`);
      for (let i = 0; i < this.size; i++) {
        this.nth(i).set(values[i]);
      }
    }
}

/**
 * Literal `max` function 
 * @param a 
 * @param b 
 * @returns Max of the two numbers using only arithmetic
 */
export const litMax: (a: Valuesque, b: Valuesque) => IlWrapper = (a: Valuesque, b: Valuesque) => div(add(add(a, b), abs(sub(a, b))), 2)
/**
 * Literal `min` function 
 * @param a 
 * @param b 
 * @returns Min of the two numbers using only arithmetic
 */
export const litMin: (a: Valuesque, b: Valuesque) => IlWrapper = (a: Valuesque, b: Valuesque) => div(sub(add(a, b), abs(sub(a, b))), 2)
const panicVariable = new Str();
const panicInner = warp([Str], (message) => {
  panicVariable.set(join(message, ", at:" + new Error().stack));
  say(panicVariable);
  stop("OtherScripts")
})
/**
 * Quits the scratch program and outputs an error message 
 * @param message Panic message
 */
export function panic(message: string): void {
  panicInner(Str.literal(message));
}
export const sign: (x: Valuesque) => IlWrapper = (x: Valuesque) => mul(not(eq(x, 0)), div(x, abs(x)));
/**
 * Power (exponent) function
 * @param base Base (cannot be negative)
 * @param exponent Exponent
 * @returns `base`^`exponent`
 */
export const pow: (base: Valuesque, exponent: Valuesque) => IlWrapper = (base: Valuesque, exponent: Valuesque) => (tenpower(mul(exponent, log(abs(base)))));

/**
 * **Op**erator shorthand
 * 
 * @example
 * ```ts
 * const a = new Num();
 * a.set(op`${a} + 5`); // instead of add(a, 5)
 * a.set(op`${a} ^ 7 + 3`); // operator precedence *is* implemented
 * ```
 * @returns Shorthand for operations
 */
export function op(values: TemplateStringsArray, ...rest: Valuesque[]): Valuesque {
  let toParsed = "";
  const vMap = new Map();
  let inc = 0;
  for (const [v, r] of values.map((a, i) => [a, rest[i]])) {
    toParsed += v;
    if (r) {
      const va = `v${inc}`;
      vMap.set(va, rest[inc++]);
      toParsed += va;
    }
  }
  toParsed = toParsed.replace(/&&/g, " and ");
  toParsed = toParsed.replace(/\|\|/g, " or ");
  toParsed = toParsed.replace(/!=/g, "notequal");
  toParsed = toParsed.replace(/!/g, " not ");
  toParsed = toParsed.replace(/notequal/g, " != ");
  const parsed = mathjs.parse(toParsed);
  const expor = function (n: mathjs.MathNode): Valuesque {
    switch (n.type) {
      case "OperatorNode": {
        const node = n as mathjs.OperatorNode;
        const map = {
          "divide": div,
          "multiply": mul,
          "add": add,
          "subtract": sub,
          "and": and,
          "or": or,
          "not": not,
          "largerEq": gte,
          "smallerEq": lte,
          "larger": gt,
          "smaller": lt,
          "pow": pow,
          "equal": eq,
          "unequal": (a: Valuesque, b: Valuesque) => not(eq(a, b)),
          "unaryMinus": (a: Valuesque) => mul(a, -1),
          "unaryPlus": (a: Valuesque) => a,
          "mod": mod
        };
        console.log(node.fn);
        const args = node.args.map(a => expor(a));
        return (map[node.fn as keyof typeof map] as any)(...args);
      }
      case "ParenthesisNode": {
        const node = n as mathjs.ParenthesisNode;
        return expor(node.content)
      }
      case "SymbolNode": {
        const node = n as mathjs.SymbolNode;
        return vMap.get(node.name)!;
      }
      case "BlockNode": {
        const node = n as mathjs.BlockNode;
        return node.blocks.map(a => expor(a.node))[0]
      }
      case "ConstantNode": {
        const node = n as mathjs.ConstantNode;
        return typeof node.value === "number" ? node.value : typeof node.value === "string" ? vMap.get(node.value)! : node.value;
      }
      default: throw "unknown: " + n.type
    }
  }
  return expor(parsed)
}