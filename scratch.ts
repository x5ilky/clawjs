import { Vec2 } from "./binding/auxilliary.ts";
import { add, Costume, forever, goto, List, repeat$, say, Sprite, stage, wait } from "./binding/bindings.ts";
import { build } from "./binding/buildHelper.ts";
const cat = new Sprite();
const pop = new Costume("SVG", "pop.svg", 50, 50);
cat.addCostume(pop);
const bg = new Costume("SVG", "background.svg", 50, 50);
stage.addCostume(bg);

const pos = new Vec2();
const list = new List(Vec2);

cat.onFlag(() => {
    pos.x.set(0);
    pos.y.set(0);
    list.clear();

    repeat$(10, () => {
        list.push(pos);
        pos.x.set(add(pos.x, 10))
        pos.y.set(add(pos.y, 20))
    })
    repeat$(10, () => {
        const v = list.pop();
        say(v.x);
        wait(1)
    })

});
build({
    resourceFolder: "resources",
    logBuildInfo: true,
    dumpProjectJson: "test.json"
})