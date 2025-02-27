import { $, Costume, Sprite } from "./binding/bindings.ts";

const cat = new Sprite();
const pop = new Costume("SVG", "pop.svg", 50, 50);
cat.addCostume(pop);

cat.onFlag(() => {
    
});

console.log($.labels)