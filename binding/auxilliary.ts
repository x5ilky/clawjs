import type { IlValue, IlNode } from "../ir/types.ts";
import { abs, add, DataClass, type DataclassOutput, div, eq, if$, type IlWrapper, mul, not, Num, type Serializable, sqrt, sub, trig, type Valuesque, type Variable } from "./bindings.ts";

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
 * Examples:
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
 * Examples:
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
}

export const litMax: (a: Valuesque, b: Valuesque) => IlWrapper = (a: Valuesque, b: Valuesque) => div(add(add(a, b), abs(sub(a, b))), 2)
export const litMin: (a: Valuesque, b: Valuesque) => IlWrapper = (a: Valuesque, b: Valuesque) => div(sub(add(a, b), abs(sub(a, b))), 2)