// deno-lint-ignore-file no-explicit-any
import { $, Costume, DataClass, goto, List, Num, Serializable, Sprite } from "./binding/bindings.ts";
import { IlNode, IlValue } from "./ir/types.ts";

const Vec2 = DataClass(class {
    x: Num;
    y: Num;

    constructor() {
        this.x = new Num();
        this.y = new Num();
    }
});
export type Vec2 = InstanceType<typeof Vec2>;
const Test = DataClass(class {
    test: Num;
    pos: Vec2;

    constructor() {
        this.test = new Num();
        this.pos = new Vec2();
    }
})
export type Test = InstanceType<typeof Test>;

const list = new List<Num>();

const cat = new Sprite();
const pop = new Costume("SVG", "pop.svg", 50, 50);
cat.addCostume(pop);

cat.onFlag(() => {
    const t = new Test();
    list.push(t.pos.x)
    goto(10, 20)
});




console.log($.labels)