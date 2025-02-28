import { $, Costume, DataClass, def, goto, Num, return$, say, Sprite } from "./binding/bindings.ts";
import { build } from "./binding/buildHelper.ts";

const cat = new Sprite();
const pop = new Costume("SVG", "pop.svg", 50, 50);
cat.addCostume(pop);

const x = new Num();

const Vec2 = DataClass(class {
    x: Num;
    y: Num;
    constructor() {
        this.x = new Num()
        this.y = new Num()
    }
});
type Vec2 = InstanceType<typeof Vec2>;

const test = def([Vec2], (num) => {
    console.log(num)
    return$(10);
}, Num)

const v = new Vec2()
cat.onFlag(() => {
    x.set(0);
    goto(10, 20);
    say(test(v))
});
console.log($.labels)
build({
    resourceFolder: "resources"
})