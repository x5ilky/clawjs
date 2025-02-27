import { Costume, goto, Num, Sprite } from "./binding/bindings.ts";
import { build } from "./binding/buildHelper.ts";

const cat = new Sprite();
const pop = new Costume("SVG", "pop.svg", 50, 50);
cat.addCostume(pop);

const x = new Num();

cat.onFlag(() => {
    x.set(0);
    goto(10, 20)
});

build({
    resourceFolder: "resources"
})