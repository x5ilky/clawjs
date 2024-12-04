import { MD5 } from "./md5.js";
import { Logger } from "./SkOutput.ts";
import { Block, BuiltinValue, FileFormat, IlNode, Project, ScratchArgumentType } from "./types.ts";

export class Convertor {
    variable_map: Map<string, string>;
    broadcasts: Map<string, string>;
    list_map: Map<string, string>;
    variables: Array<string>;
    sprites: Map<string, Sprite>;
    functions: Map<string, Function>;

    project: Project;
    labels: Array<IlNode>;
    labelConversions: Map<string, Map<string, Block>>;
    labelHeads: Map<string, string>;
    options: LogOptions;

    blockCounter: number;

    functionArgsMaps: Map<string, string>;
    resourceFolder: string;
    
    constructor(labels: IlNode[], path: string, public logger: Logger) {
        this.variable_map = new Map()
        this.list_map = new Map()
        this.broadcasts = new Map()
        this.variables = []
        this.sprites = new Map()
        this.project = { 
            targets: [],
            monitors: [],
            extensions: [],
            meta: {
                semver: "3.0.0",
                vm: "0.2.0",
                agent: "",
                platform: { 
                    name: "Claw Scratch IL Converter",
                    url: "github.com/x5ilky/claw"
                }
            }
        }
        this.labels = labels
        this.functions = new Map()
        this.labelConversions = new Map()
        this.labelHeads = new Map()
        this.functionArgsMaps = new Map()
        this.options = { 
            print_variable_hashes: false,
            print_variables: false
        }
        this.blockCounter = 0
        this.resourceFolder = path
    }

    public create(): Project {
        this.gatherValues();

        if (this.options.print_variables) {
            this.logger.info(this.variables);
        }
        this.generateVariableHashes();
        if (this.options.print_variable_hashes) {
            this.logger.info(this.variable_map);
        }
        this.insertFunctions();
        this.insertEvents();

        for (const label of this.labels) {
            if (label.type === "Label") {
                if (label.value[0] === "stat") continue;
                if (!this.labelConversions.has(label.value[0])) {
                    this.logger.warn(`Label: ${label.value[0]} is unused! Please consider removing this label`);
                }
            }
        }
        
        return this.project
    }

    private insertFunctions() {
        const stat = this.labels.find(a => a.type === "Label" && a.value[0] === "stat");
        if (stat === undefined) {
            this.logger.error("fatal: no stat label, shouldn't be possible due to order of events");
            throw new Error();
        }
        if (stat.type !== "Label") throw new Error("Unreachable");
        const nodes = stat.value[1];
        for (const node of nodes) {
            if (node.type === "InsertDef") {
                const { func, sprites } = node;
                const fnData = this.functions.get(func)!;
                const argumentIds = JSON.stringify(fnData.args.entries().map(([i, _]) => MD5(`${func}:${i+1}`)));
                const argumentNames = 
                    JSON.stringify(
                        fnData.args.entries()
                        .map(([i, _]) => `${func}:${i+1}`)
                    );
                const argumentDefaults =
                    JSON.stringify(
                        fnData.args
                        .map(t => t === "Any" ? "" : "false")
                    );
                let proccode = func.toString();
                for (const arg of fnData.args) {
                    if (arg === "Any") proccode += " %s";
                    if (arg === "Boolean") proccode += " %b";
                }
                const label = this.functions.get(func)!.label;
                for (const sprite of sprites) {
                    const defId = (++this.blockCounter).toString();
                    const prototypeId = (++this.blockCounter).toString();
                    let def = <Block>{
                        opcode: "procedures_definition",
                        inputs: {
                            "custom_block": [
                                1,
                                prototypeId
                            ]
                        },
                        fields: {},
                        shadow: false,
                        topLevel: true,
                    };
                    const prototype = <Block>{
                        opcode: "procedures_prototype",
                        parent: defId,
                        inputs: {},
                        fields: {},
                        shadow: true,
                        topLevel: false,
                        mutation: {
                            tagName: "mutation",
                            children: [],
                            proccode: proccode,
                            argumentids: argumentIds,
                            argumentnames: argumentNames,
                            argumentdefaults: argumentDefaults,
                            warp: fnData.warp.toString()
                        }
                    }
                    if (sprite.length === 0) continue;

                    const spr_name = this.sprites.get(sprite);
                    if (spr_name === undefined) {
                        this.logger.error(`No sprite with id: ${sprite}`);
                        Deno.exit(1);
                    }

                    {
                        const spr = 
                            this.project.targets.find(v => v.name === spr_name.name)!;
                        for (const [i, arg] of fnData.args.entries()) {
                            const d = (++this.blockCounter).toString();
                            const p = `${func}:${i + 1}`;
                            spr_name.func_args.set(p, d);
                            this.functionArgsMaps.set(p, d);
                            if (arg === "Any") {
                                spr.blocks.set(d, <Block> {
                                    opcode: "argument_reporter_string_number",
                                    inputs: {},
                                    fields: {
                                        "VALUE": [
                                            p,
                                            null
                                        ]
                                    },
                                    shadow: false,
                                    topLevel: false
                                });
                            } else if (arg === "Boolean") {
                                spr.blocks.set(d, <Block> {
                                    opcode: "argument_reporter_boolean",
                                    inputs: {},
                                    fields: {
                                        "VALUE": [
                                            p,
                                            null
                                        ]
                                    },
                                    shadow: false,
                                    topLevel: false
                                });
                            }
                        }
                    }

                    {
                        const l = this.labels.find(a => a.type === "Label" && a.value[0] === label);
                        this.convertLabel(l, label, sprite);
                    }
                    const labelNodes = this.labelConversions.get(label);
                    const spr = this.project.targets.find(v => v.name === spr_name.name);
                    if (labelNodes === undefined) throw new Error("presumbably unreachalbe");
                    for (const [k, v] of labelNodes) {
                        spr?.blocks.set(k, v);
                    }
                    def.next = this.labelHeads.get(label);
                    spr?.blocks.set(defId, def);
                    spr?.blocks.set(prototypeId, prototype);
                }
            }
        }
    }

    private insertEvents() {
        const stat = this.labels.find(a => a.type === "Label" && a.value[0] === "stat");
        if (stat?.type !== "Label") throw new Error("dfsdf");
    }
}

export interface LogOptions {
    print_variables: boolean,
    print_variable_hashes: boolean,
}

export interface Sprite {
    name: string,
    func_args: Map<string, string>,
    /**
     * Key is builtin value, value is key in blocks
     */
    added_builtins: Map<BuiltinValue, string>,
    costume_paths: Array<[string, FileFormat]>,
}

export interface Function {
    label: string,
    args: Array<ScratchArgumentType>,
    warp: boolean,
}