import { Argument, Argumentify, ArgumentifyRaw, DataClass, reserveCount, Str, Variable } from "./binding/bindings.ts";
import { $, Costume, goto, Num, return$, Serializable, Sprite, Valuesque } from "./binding/bindings.ts";
import { build } from "./binding/buildHelper.ts";
import { IlNode, ScratchArgumentType } from "./ir/types.ts";

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
})
type Vec2 = InstanceType<typeof Vec2>

function def<const T extends (new () => Serializable)[]>(argTypes: T, fn: (...args: Argumentify<InstanceType<T[number]>>[]) => void) {
    const oldFunc = $.currentFunc;
    const id = $.currentFunc = reserveCount();

    const out = {
        type: "Def",
        label: "",
        argAmount: 0,
        args: [] as ScratchArgumentType[],
        id: $.currentFunc,
        warp: false
    } satisfies IlNode;
    const args: any[] = [];
    let totalSize = 0;
    for (const arg of argTypes) {
        const a = new arg();
        const size = a.sizeof();
        totalSize += size;

        for (let i = 0; i < size; i++) {
            out.args.push("Any");
        }
        args.push(Argumentify(a));
    }

    fn(...args);

    $.currentFunc = oldFunc;
    return (...args: InstanceType<T[number]>[]) => {
        return {
            type: "Run",
            id,
            argAmount: totalSize,
            args: args.map(a => a.toSerialized()).flat()
        } satisfies IlNode;
    }
}

const test = def([Vec2], (num) => {
    console.log(num)
    return$(10);
})

cat.onFlag(() => {
    x.set(0);
    goto(10, 20);
    test()
});
build({
    resourceFolder: "resources"
})