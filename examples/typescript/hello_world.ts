import { build, Costume, sayFor, Sprite, stage } from "../../mod.ts";

// create a sprite
const spr = new Sprite();
// create a costume/backdrop
const pop = Costume.fromPath("pop.svg");
const emptyBackdrop = Costume.fromPath("background.svg");
stage.addCostume(emptyBackdrop); // stage has to have a backdrop (costume)
spr.addCostume(pop);

spr.onFlag(() => {
    sayFor("Hello, world!", 5);
})


// provide resources folder here:
build({
    outputFileName: "hello_world.sb3",
    resourceFolder: "resources"
})

// how to run:
//  $ cd ./examples/typescript
//  $ deno run -A hello_world.ts
// claw info START creating zip
// claw info END   creating zip
// open the outputed .sb3 in turbowarp or scratch