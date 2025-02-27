import { reserveCount, Variable } from "./binding/bindings.ts";
import { $, Costume, goto, Num, return$, Serializable, Sprite, Valuesque } from "./binding/bindings.ts";
import { build } from "./binding/buildHelper.ts";
import { IlNode, ScratchArgumentType } from "./ir/types.ts";

const cat = new Sprite();
const pop = new Costume("SVG", "pop.svg", 50, 50);
cat.addCostume(pop);

const x = new Num();

cat.onFlag(() => {
    x.set(0);
    goto(10, 20)
});

function def<const T extends (new () => Serializable)[]>(argTypes: T, fn: (...args: InstanceType<T[number]>[]) => void) {
    const oldFunc = $.currentFunc;
    $.currentFunc = reserveCount();

    const out = {
        type: "Def",
        label: "",
        argAmount: 0,
        args: [] as ScratchArgumentType[],
        id: $.currentFunc,
        warp: false
    } satisfies IlNode;
    const args = [];
    let argC = 0;
    for (const arg of argTypes) {
        const a = new arg();
        const size = a.sizeof();

        for (let i = 0; i < size; i++) {
            out.args.push("Any");
        }
    }


    $.currentFunc = oldFunc;
}

const test = def([Num], (num) => {
    return$(10);
})

build({
    resourceFolder: "resources"
})