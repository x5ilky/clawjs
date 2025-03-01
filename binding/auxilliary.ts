import { IlValue, IlNode } from "../ir/types.ts";
import { abs, add, atan, DataClass, div, eq, if$, mul, not, Num, Serializable, SingleValue, sqrt, sub, Valuesque, Variable } from "./bindings.ts";

export const Vec2 = DataClass(class {
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
    add(other: Vec2) {
        const v = new Vec2();
        v.x.set(add(this.x, other.x));
        v.y.set(add(this.y, other.y));
        return v;
    }
    /**
     * returns new variable
     * @param other other vector2
     */
    sub(other: Vec2) {
        const v = new Vec2();
        v.x.set(sub(this.x, other.x));
        v.y.set(sub(this.y, other.y));
        return v;
    }
    /**
     * returns new variable
     * @param other other vector2
     */
    mul(other: Vec2) {
        const v = new Vec2();
        v.x.set(mul(this.x, other.x));
        v.y.set(mul(this.y, other.y));
        return v;
    }
    /**
     * returns new variable
     * @param other other vector2
     */
    div(other: Vec2) {
        const v = new Vec2();
        v.x.set(div(this.x, other.x));
        v.y.set(div(this.y, other.y));
        return v;
    }
    /**
     * returns the magnitude/distance squared
     */
    magnitudeSquared() {
        return add(mul(this.x, this.x), mul(this.y, this.y));
    }
    magnitude() {
        return sqrt(this.magnitudeSquared())
    }
    normalized() {
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

    dot(other: Vec2) {
        return add(
            mul(this.x, other.x),
            mul(this.y, other.y)
        )
    }

    direction() {
        return atan(div(this.y, this.x))
    }
});
export type Vec2 = InstanceType<typeof Vec2>;

export class SizedList<T extends new () => Serializable & Variable, Size extends number> implements Serializable, Variable {
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
    
    set(values: SizedList<T, Size>): void {
        for (let i = 0; i < values.size; i++) {
            this.values[i].set(values.values[i]);
        }
    }

    nth(count: number) {
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

export const litMax = (a: Valuesque, b: Valuesque) => div(add(add(a, b), abs(sub(a, b))), 2)
export const litMin = (a: Valuesque, b: Valuesque) => div(sub(add(a, b), abs(sub(a, b))), 2)