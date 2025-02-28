import { sub } from "./binding/bindings.ts";
import { mul } from "./binding/bindings.ts";
import { if$ } from "./binding/bindings.ts";
import { lt } from "./binding/bindings.ts";
import { add, Costume, DataClass, forever, goto, Num, Sprite } from "./binding/bindings.ts";
import { build } from "./binding/buildHelper.ts";
const cat = new Sprite();
const pop = new Costume("SVG", "pop.svg", 50, 50);
cat.addCostume(pop);
const Vec2 = DataClass(class {
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
});
type Vec2 = InstanceType<typeof Vec2>;
const pos = new Vec2();
const vel = new Vec2();

cat.onFlag(() => {
    pos.x.set(0);
    pos.y.set(240);
    vel.x.set(0);
    vel.y.set(0);
    forever(() => {
        goto(pos.x, pos.y);
        pos.set(pos.add(vel));
        vel.y.set(sub(vel.y, 0.2));
        if$ (lt(pos.y, -180), () => {
            vel.y.set(mul(vel.y, -1))
        })
    })
});
build({
    resourceFolder: "resources"
})