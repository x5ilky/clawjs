// deno-lint-ignore-file no-explicit-any
import { MD5 } from "./md5.js";
import { Logger } from "./SkOutput.ts";
import * as path from "jsr:@std/path";
import { BinaryOperation, Block, Broadcasts, BuiltinValue, Comments, DropOperation, FileFormat, IlNode, IlValue, Lists, Project, ScratchArgumentType, Target, UnaryOperation } from "./types.ts";
const FORBIDDEN_VARIABLE_NAME_PREFIX = "FORBIDDEN_RETURN_VALUE_PREFIX_";
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
                    const def = <Block>{
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
                        const l = (<any>this.labels.find(a => a.type === "Label" && a.value[0] === label))!.value[1];
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
        if (stat?.type !== "Label") throw new Error("No stat label, this should be impossible due to order of events");
        for (const node of stat.value[1]) {
            const add = (value: Block) => {
                const {target, label} = (node as Extract<IlNode, { target: string, label: string }>);

                const spriteName = this.sprites.get(target)?.name;
                
                const labelNodes = 
                    (<Extract<IlNode, {type: "Label"}>>(this.labels.find(a => a.type === "Label" && a.value[0] === label)!)).value[1];
                this.convertLabel(labelNodes, label, target);
                
                const sprite = this.project.targets.find(a => a.name === spriteName);
                const lb = this.labelConversions.get(label);
                if (lb === undefined) {
                    this.logger.error(`no label called ${label}`);
                    Deno.exit(1);
                }

                for (const [k, v] of lb) {
                    sprite?.blocks.set(k, v);
                }
                sprite?.blocks.set((++this.blockCounter).toString(), value);
            }
            if (node.type === "Flag" || node.type === "Clicked") {
                const {label} = node;
                add(<Block>{
                    opcode: node.type === "Flag" ? "event_whenflagclicked" : "event_whenthisspriteclicked",
                    next: this.labelHeads.get(label),
                    parent: '',
                    inputs: {},
                    fields: {},
                    shadow: false,
                    topLevel: true
                });
            } else if (node.type === "Keypress") {
                const {label, key} = node;
                add(<Block>{
                    opcode: "event_whenkeypressed",
                    next: this.labelHeads.get(label),
                    parent: '',
                    inputs: {},
                    fields: {
                        "KEY_OPTION": [ 
                            key,
                            null
                        ]
                    },
                    shadow: false,
                    topLevel: true
                });
            } else if (node.type === "WhenBroadcast") {
                const {label, name} = node;
                add(<Block>{
                    opcode: "event_whenbroadcastreceived",
                    next: this.labelHeads.get(label),
                    parent: "",
                    inputs: {},
                    fields: {
                        "BROADCAST_OPTION": [
                            name,
                            this.broadcasts.has(name) ? this.broadcasts.get(name) : (() => {
                                this.logger.error(`No broadcast called: ${name}`);
                                Deno.exit(1);
                            })()
                        ]
                    },
                    shadow: false,
                    topLevel: true,
                })
            } else if (node.type === "WhenClone") {
                const {label} = node;
                add(<Block>{
                    opcode: "control_start_as_clone",
                    next: this.labelHeads.get(label),
                    parent: "",
                    inputs: {},
                    fields: {},
                    shadow: false,
                    topLevel: true,
                });
            }
        }
    }

    private convertValue(
        blocks: Map<string, Block>,
        value: IlValue,
        spr: string
    ): any {
        switch (value.key) {
            case "Float": {
                const num = value.value;
                return [1, [4, num.toString()]];
            }
            case "String": return [1, [10, value.value.toString()]]
            case "BinaryOperation": {
                const {oper, left, right} = value;
                const calculation = ++this.blockCounter;
                const lft = this.convertValue(blocks, left, spr);
                const rght = this.convertValue(blocks, right, spr);
                const inputs = ((oper: BinaryOperation) => {
                    switch (oper) {
                    case "Add":
                    case "Sub":
                    case "Div":
                    case "Mul":
                    case "Mod": return ({
                        "NUM1": lft,
                        "NUM2": rght
                    });

                    case "And":
                    case "Or":
                    case "Eq":
                    case "Gt":
                    case "Lt":
                    case "Gte":
                    case "Lte": return ({
                        "OPERAND1":
                            lft,

                        "OPERAND2":
                            rght
                    });
                    case "Join": 
                    case "Contains": return ({
                        "STRING1": lft,
                        "STRING2": rght
                    });

                    case "LetterOf": return ({
                        "LETTER": lft,
                        "STRING": rght,
                    })
                    }
                })(oper);
                blocks.set(
                    calculation.toString(),
                    <Block> {
                        opcode: ((oper: BinaryOperation) => {
                            switch(oper) {
                                case "Add": return "operator_add";
                                case "Or": return "operator_or";
                                case "Sub": return "operator_subtract";
                                case "Mul": return "operator_multiply";
                                case "Div": return "operator_divide";
                                case "And": return "operator_and";
                                case "Eq": return "operator_equals";
                                case "Gt": return "operator_gt";
                                case "Lt": return "operator_lt";
                                case "Join": return "operator_join";
                                case "Mod": return "operator_mod";
                                case "LetterOf": return "operator_letter_of";
                                case "Contains": return "operator_contains";
                            }
                        })(oper),
                        fields: {},
                        inputs,
                        shadow: false,
                        topLevel: false
                    }
                )
                return [3, calculation.toString()];
            }
            case "UnaryOperation": {
                const { oper, value: v } = value;
                const calculation = ++this.blockCounter;

                const val = this.convertValue(blocks, v, spr);
                const inputs = ((oper: UnaryOperation) => {
                    switch (oper) {
                        case "Not": return { "OPERAND": val, };
                        case "Length": return { "STRING": val };
                        case "Round": return { "NUM": value, };
                    }
                })(oper)
                blocks.set(calculation.toString(), <Block> {
                    opcode: ((oper: UnaryOperation) => {
                        switch (oper) {
                            case "Not": return "operator_not";
                            case "Length": return "operator_length"
                            case "Round": return "opreator_round"
                        }
                    })(oper),
                    fields: {},
                    inputs,
                    shadow: false,
                    topLevel: false
                });
                return [3, calculation.toString()]
            }
            case "DropOperation": {
                const { oper, value:v } = value;
                const calculation = (++this.blockCounter);
                const val = this.convertValue(blocks, v, spr);
                const inputs = {
                    "NUM": val
                };
                blocks.set(calculation.toString(), <Block> {
                    opcode: "operator_mathop",
                    fields: {
                        "OPERATOR": [
                            ((oper: DropOperation) => {
                                switch (oper) {
                                    case "Abs": return "abs";
                                    case "Floor": return "floor";
                                    case "Ceiling": return "ceiling";
                                    case "Sqrt": return "sqrt";
                                    case "Sin": return "sin";
                                    case "Cos": return "cos";
                                    case "Tan": return "tan";
                                    case "Asin": return "asin";
                                    case "Acos": return "acos";
                                    case "Atan": return "atan";
                                    case "Ln": return "ln";
                                    case "Log": return "log";
                                    case "EPower": return "e ^";
                                    case "TenPower": return "10 ^";
                                }
                            })(oper),
                            null
                        ]
                    },
                    inputs,
                    shadow: false,
                    topLevel: false
                });
                return [3, calculation.toString()]
            }
            case "Variable": return [
                3,
                [12, name, this.variable_map.get(name)!],
                null
            ];
            case "Argument": {
                const { funcName: func, index: number } = value;
                const f = this.functions.get(func);
                if (f === undefined) {
                    this.logger.error(`Unknown function ${func}`);
                    Deno.exit(1);
                }
                const typeShit = `${func}:${number}`;
                const sprite = this.sprites.get(spr)!;
                const o = sprite.func_args.get(typeShit);
                return [2, o];
            }
            case "Builtin": {
                const { value: builtinType } = value;
                const opcode = (() => {
                    switch (builtinType.key) {
                        case "Costume": return "looks_costumenumbername";
                        case "XPosition": return "motion_xposition"
                        case "YPosition": return "motion_yposition"
                        case "Direction": return "motion_direction"
                        case "Backdrop": return "looks_backdropnumbername"
                        case "Size": return "looks_size"
                    }
                })();
                const sprite = this.sprites.get(spr);
                if (sprite?.added_builtins.has(builtinType)) {
                    return [3, sprite.added_builtins.get(builtinType), null];
                } else {
                    const id = ++this.blockCounter;
                    blocks.set(
                        id.toString(),
                        <Block> {
                            opcode,
                            inputs: {},
                            fields: (() => {
                                switch(builtinType.key) {
                                    case "Costume": 
                                    case "Backdrop": 
                                    return {
                                        "NUMBER_NAME": [
                                            builtinType.numberOrName ? "number" : "name"
                                        ]
                                    }
                                    default:
                                        return {};
                                }
                            })(),
                            shadow: false,
                            topLevel: false,
                        }
                    )
                    return [3, id, null]
                }
            };
            case "Costume": {
                const {isBackdrop, name} = value;
                const id = ++this.blockCounter;
                if (isBackdrop) {
                    blocks.set(
                        id.toString(),
                        <Block> {
                            opcode: "looks_backdrops",
                            inputs: {},
                            fields: {
                                "BACKDROP": [
                                    name,
                                    null
                                ]
                            },
                            shadow: false,
                            topLevel: false
                        }
                    )
                } else {
                    blocks.set(
                        id.toString(),
                        <Block> {
                            opcode: "looks_costume",
                            inputs: {},
                            fields: {
                                "COSTUME": [
                                    name,
                                    null
                                ]
                            },
                            shadow: false,
                            topLevel: false
                        }
                    )
                }
                return [1, id];
            }
            case "ListValue": {
                const { list, value: v } = value;
                const listMap = this.list_map.get(list);
                if (listMap === undefined) {
                    this.logger.error(`No list called: ${list}`);
                }
                const id = ++this.blockCounter;
                blocks.set(id.toString(), <Block> {
                    opcode: (() => {
                        switch (v.key) {
                            case "Index": return "data_itemoflist"
                            case "Find": return "data_itemnumoflist"
                            case "Length": return "data_lengthoflist"
                            case "Contains": return "data_listcontainsitem"
                        }
                    })(),
                    inputs: (() => {
                        switch (v.key) {
                            case "Index": return { "INDEX": this.convertValue(blocks, v.index, spr) }
                            case "Find": return {
                                "ITEM": this.convertValue(blocks, v.value, spr)
                            }
                            case "Length": return {}
                            case "Contains": return {
                                "ITEM": this.convertValue(blocks, v.value, spr)
                            }
                        }
                    }),
                    fields: {
                        "LIST": [
                            list,
                            listMap
                        ]
                    },
                    shadow: false,
                    topLevel: false
                });
                return [3, id, null];
            }
        }
    }

    private convertLabel(
        nodes: IlNode[],
        name: string,
        spr: string,
    ): [Map<string, Block>, Map<number, string>] {
        const blocks = new Map<string, Block>();
        const heads = new Map<number, string>();

        const add = (value: Block) => {
            blocks.set((++this.blockCounter).toString(), value);
        }
        for (const [i, node] of nodes.entries()) {
            switch (node.type) {
                case "Move": {
                    add({
                        opcode: "motion_movesteps",
                        parent: "",
                        fields: {},
                        inputs: {
                            STEPS: this.convertValue(blocks, node.steps, spr)
                        },
                        shadow: false,
                        topLevel: false,
                    })
                } break;
                case "TurnLeft":
                case "TurnRight": {
                    const { degrees } = node;
                    const value = this.convertValue(blocks, degrees, spr);
                    add(<Block> {
                        opcode: node.type === "TurnLeft" ? "motion_turnleft" : "motion_turnright",
                        parent: "",
                        fields: {},
                        inputs: {
                            DEGREES: value
                        },
                        shadow: false,
                        topLevel: false,
                    });
                } break;
                case "PointDirection": {
                    add({
                        opcode: "motion_pointindirection",
                        parent: "",
                        fields: {},
                        inputs: {
                            DIRECTION: this.convertValue(blocks, node.value, spr)
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "GotoXY": {
                    add({
                        opcode: "motion_gotoxy",
                        parent: "",
                        fields: {},
                        inputs: {
                            X: this.convertValue(blocks, node.x, spr),
                            Y: this.convertValue(blocks, node.y, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "GlideToXY": {
                    add({
                        opcode: "motion_glidesecstoxy",
                        parent: "",
                        fields: {},
                        inputs: {
                            X: this.convertValue(blocks, node.x, spr),
                            Y: this.convertValue(blocks, node.y, spr),
                            SECS: this.convertValue(blocks, node.secs, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "SetX": {
                    add({
                        opcode: "motion_setx",
                        parent: "",
                        fields: {},
                        inputs: {
                            X: this.convertValue(blocks, node.value, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "SetY": {
                    add({
                        opcode: "motion_sety",
                        parent: "",
                        fields: {},
                        inputs: {
                            Y: this.convertValue(blocks, node.value, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;


                case "ChangeX": {
                    add({
                        opcode: "motion_changexby",
                        parent: "",
                        fields: {},
                        inputs: {
                            DX: this.convertValue(blocks, node.value, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;


                case "ChangeY": {
                    add({
                        opcode: "motion_changeyby",
                        parent: "",
                        fields: {},
                        inputs: {
                            DY: this.convertValue(blocks, node.value, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;

                
                case "Say": {
                    add({
                        opcode: "looks_say",
                        parent: "",
                        fields: {},
                        inputs: {
                            MESSAGE: this.convertValue(blocks, node.value, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "SayFor": {
                    add({
                        opcode: "looks_sayforsecs",
                        parent: "",
                        fields: {},
                        inputs: {
                            MESSAGE: this.convertValue(blocks, node.value, spr),
                            SECS: this.convertValue(blocks, node.secs, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;


                case "Think": {
                    add({
                        opcode: "looks_think",
                        parent: "",
                        fields: {},
                        inputs: {
                            MESSAGE: this.convertValue(blocks, node.value, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "ThinkFor": {
                    add({
                        opcode: "looks_thinkforsecs",
                        parent: "",
                        fields: {},
                        inputs: {
                            MESSAGE: this.convertValue(blocks, node.value, spr),
                            SECS: this.convertValue(blocks, node.secs, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "SwitchCostume": {
                    add({
                        opcode: "looks_switchcostumeto",
                        parent: "",
                        fields: {},
                        inputs: {
                            COSTUME: this.convertValue(blocks, node.value, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "NextCostume": {
                    add({
                        opcode: "looks_nextcostume",
                        parent: "",
                        fields: {},
                        inputs: {},
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "SwitchBackdrop": {
                    add({
                        opcode: "looks_switchbackdropto",
                        parent: "",
                        fields: {},
                        inputs: {
                            BACKDROP: this.convertValue(blocks, node.value, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "NextBackdrop": {
                    add({
                        opcode: "looks_nextbackdrop",
                        parent: "",
                        fields: {},
                        inputs: {},
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "ChangeSize": {
                    add({
                        opcode: "looks_changesizeby",
                        parent: "",
                        fields: {},
                        inputs: {
                            CHANGE: this.convertValue(blocks, node.value, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "SetSize": {
                    add({
                        opcode: "looks_setsizeto",
                        parent: "",
                        fields: {},
                        inputs: {
                            SIZE: this.convertValue(blocks, node.value, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;


                case "Show": {
                    add({
                        opcode: "looks_show",
                        parent: "",
                        fields: {},
                        inputs: {},
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "Hide": {
                    add({
                        opcode: "looks_hide",
                        parent: "",
                        fields: {},
                        inputs: {},
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "GotoLayer": {
                    add({
                        opcode: "looks_gotofrontback",
                        parent: "",
                        inputs: {},
                        fields: {
                            FRONT_BACK: [node.value ? "front" : "back", null],
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;


                case "GoForwardLayers": {
                    add({
                        opcode: "looks_goforwardbackwardlayers",
                        parent: "",
                        fields: {
                            "FORWARD_BACKWARD": [
                                "forward",
                                null
                            ]
                        },
                        inputs: {
                            NUM: this.convertValue(blocks, node.value, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "Broadcast": 
                case "BroadcastWait": {
                    let jsonValue = this.convertValue(blocks, node.value, spr);
                    if (node.value.key === "String") {
                        jsonValue = [
                            1,
                            [
                                11,
                                node.value.value,
                                MD5(node.value.value)
                            ]
                        ]
                    }
                    add({
                        opcode: node.type === "Broadcast" ? "event_broadcast" : "event_broadcastandwait",
                        parent: "",
                        fields: {},
                        inputs: {
                            BROADCAST_INPUT: jsonValue
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;

                
                case "Wait": {
                    add({
                        opcode: "control_wait",
                        parent: "",
                        fields: {},
                        inputs: {
                            DURATION: this.convertValue(blocks, node.time, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "WaitUntil": {
                    add({
                        opcode: "control_wait_until",
                        parent: "",
                        fields: {},
                        inputs: {
                            CONDITION: this.convertValue(blocks, node.predicate, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;


                case "If": {
                    const v = this.convertValue(blocks, node.predicate, spr);
                    const loc = (++this.blockCounter).toString();
                    heads.set(i, loc);
                    const labelNode = this.labels.find(
                        v => v.type === "Label" && v.value[0] === node.label
                    );
                    const hds = (() => {
                        if (labelNode?.type !== "Label") throw "unreachable";
                        const [nodes, heads] = this.convertLabel(labelNode.value[1], labelNode.value[0], spr);
                        for (const [k, node] of nodes) {
                            blocks.set(k, node);
                        }
                        return heads;
                    })();

                    blocks.set(loc, <Block> {
                        opcode: "control_if",
                        fields: {},
                        inputs: {
                            CONDITION: v,
                            SUBSTACK: [2, hds.get(0)!]
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;
                case "IfElse": {
                    const v = this.convertValue(blocks, node.predicate, spr);
                    const loc = (++this.blockCounter).toString();
                    heads.set(i, loc);
                    const labelNode = this.labels.find(
                        v => v.type === "Label" && v.value[0] === node.label
                    );
                    const hds = (() => {
                        if (labelNode?.type !== "Label") throw "unreachable";
                        const [nodes, heads] = this.convertLabel(labelNode.value[1], labelNode.value[0], spr);
                        for (const [k, node] of nodes) {
                            blocks.set(k, node);
                        }
                        return heads;
                    })();
                    const labelNode2 = this.labels.find(
                        v => v.type === "Label" && v.value[0] === node.label2
                    );
                    const hds2 = (() => {
                        if (labelNode2?.type !== "Label") throw "unreachable";
                        const [nodes, heads] = this.convertLabel(labelNode2.value[1], labelNode2.value[0], spr);
                        for (const [k, node] of nodes) {
                            blocks.set(k, node);
                        }
                        return heads;
                    })();

                    blocks.set(loc, <Block> {
                        opcode: "control_if",
                        fields: {},
                        inputs: {
                            CONDITION: v,
                            SUBSTACK: [2, hds.get(0)!],
                            SUBSTACK2: [2, hds2.get(0)!]
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "Repeat": {
                    const v = this.convertValue(blocks, node.amount, spr);
                    const loc = (++this.blockCounter).toString();
                    heads.set(i, loc);
                    const labelNode = this.labels.find(
                        v => v.type === "Label" && v.value[0] === node.label
                    );
                    const hds = (() => {
                        if (labelNode?.type !== "Label") throw "unreachable";
                        const [nodes, heads] = this.convertLabel(labelNode.value[1], labelNode.value[0], spr);
                        for (const [k, node] of nodes) {
                            blocks.set(k, node);
                        }
                        return heads;
                    })();

                    blocks.set(loc, <Block> {
                        opcode: "control_repeat",
                        fields: {},
                        inputs: {
                            TIMES: v,
                            SUBSTACK: [2, hds.get(0)!]
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;
                case "RepeatUntil": {
                    const v = this.convertValue(blocks, node.predicate, spr);
                    const loc = (++this.blockCounter).toString();
                    heads.set(i, loc);
                    const labelNode = this.labels.find(
                        v => v.type === "Label" && v.value[0] === node.label
                    );
                    const hds = (() => {
                        if (labelNode?.type !== "Label") throw "unreachable";
                        const [nodes, heads] = this.convertLabel(labelNode.value[1], labelNode.value[0], spr);
                        for (const [k, node] of nodes) {
                            blocks.set(k, node);
                        }
                        return heads;
                    })();

                    blocks.set(loc, <Block> {
                        opcode: "control_repeat_until",
                        fields: {},
                        inputs: {
                            CONDITION: v,
                            SUBSTACK: [2, hds.get(0)!]
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;
                case "Forever": {
                    const loc = (++this.blockCounter).toString();
                    heads.set(i, loc);
                    const labelNode = this.labels.find(
                        v => v.type === "Label" && v.value[0] === node.label
                    );
                    const hds = (() => {
                        if (labelNode?.type !== "Label") throw "unreachable";
                        const [nodes, heads] = this.convertLabel(labelNode.value[1], labelNode.value[0], spr);
                        for (const [k, node] of nodes) {
                            blocks.set(k, node);
                        }
                        return heads;
                    })();
                    const head = hds.get(0)!.toString();

                    blocks.set(loc, <Block> {
                        opcode: "control_forever",
                        fields: {},
                        inputs: {
                            SUBSTACK: [2, head]
                        },
                        shadow: false,
                        topLevel: false
                    });
                    blocks.get(head)!.parent = loc;
                } break;


                case "Stop": {
                    add({
                        opcode: "control_stop",
                        parent: "",
                        fields: {
                            STOP_OPTION: [
                                (() => {
                                    switch(node.stopType) {
                                        case "All": return "all";
                                        case "ThisScript": return "this script"
                                        case "OtherScripts": return "other scripts in sprite";
                                    }
                                })(),
                                null
                            ]
                        },
                        inputs: {},
                        shadow: false,
                        topLevel: false
                    });
                } break;
                case "Clone": {
                    const { target } = node;
                    if (!this.sprites.has(target)) {
                        this.logger.error("no sprite called " + target);
                        Deno.exit(1);
                    }
                    const id = (++this.blockCounter).toString();
                    const menu = (++this.blockCounter).toString();
                    blocks.set(menu, {
                        opcode: "control_create_clone_of_menu",
                        inputs: {},
                        fields: {
                            CLONE_OPTION: [
                                this.sprites.get(target)!.name,
                                null
                            ]
                        },
                        topLevel: false,
                        shadow: false
                    });
                    blocks.set(
                        id,
                        {
                            opcode: "control_create_clone_of",
                            inputs: {
                                CLONE_OPTION: [
                                    1,
                                    menu,
                                ],
                            },
                            fields: {},
                            shadow: false,
                            topLevel: false
                        }
                    );
                    heads.set(i, id);
                } break;
                case "CloneMyself": {
                    const id = (++this.blockCounter).toString();
                    const menu = (++this.blockCounter).toString();
                    blocks.set(menu, {
                        opcode: "control_create_clone_of_menu",
                        inputs: {},
                        fields: {
                            CLONE_OPTION: [
                                "_myself_",
                                null
                            ]
                        },
                        topLevel: false,
                        shadow: false
                    });
                    blocks.set(
                        id,
                        {
                            opcode: "control_create_clone_of",
                            inputs: {
                                CLONE_OPTION: [
                                    1,
                                    menu,
                                ],
                            },
                            fields: {},
                            shadow: false,
                            topLevel: false
                        }
                    );
                    heads.set(i, id);
                } break;

                case "ListOper": {
                    const { list, oper } = node;
                    const listMap = this.list_map.get(list);
                    if (listMap === undefined) {
                        this.logger.error(`List ${list} doesn't exist!`);
                        Deno.exit(1);
                    };
                    add({
                        opcode: (() => {
                            switch (oper.key) {
                                case "Push": return "data_addtolist";
                                case "RemoveIndex": return "data_deleteoflist"
                                case "Insert": return "data_insertatlist"
                                case "Clear": return "data_deletealloflist"
                                case "Replace": return "data_replaceitemoflist"
                            }
                        })(),
                        parent: "",
                        fields: {
                            LIST: [
                                list,
                                listMap
                            ]
                        },
                        inputs: (() => {
                            switch (oper.key) {
                                case "Push": return {
                                    ITEM: this.convertValue(blocks, oper.value, spr)
                                }
                                case "RemoveIndex": return {
                                    INDEX: this.convertValue(blocks, oper.index, spr)
                                }
                                case "Insert": return {
                                    ITEM: this.convertValue(blocks, oper.value, spr),
                                    INDEX: this.convertValue(blocks, oper.index, spr)
                                }
                                case "Clear": return {}
                                case "Replace": return {
                                    ITEM: this.convertValue(blocks, oper.value, spr),
                                    INDEX: this.convertValue(blocks, oper.index, spr)
                                }
                            }
                        })(),
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "Set": {
                    const {target, value: v } = node;
                    add({
                        opcode: "data_setvariableto",
                        parent: "",
                        fields: {
                            VARIABLE: [
                                target,
                                this.variable_map.get(target)!
                            ]
                        },
                        inputs: {
                            VALUE: this.convertValue(blocks, v, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;

                case "Change": {
                    add({
                        opcode: "data_changevariableby",
                        parent: "",
                        fields: {
                            VARIABLE: [
                                node.target,
                                this.variable_map.get(node.target)!
                            ]
                        },
                        inputs: {
                            VALUE: this.convertValue(blocks, node.value, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });
                } break;
                case "Return": {
                    add({
                        opcode: "data_setvariableto",
                        parent: "",
                        fields: {
                            VARIABLE: [
                                `${FORBIDDEN_VARIABLE_NAME_PREFIX}${node.func}`,
                                `${FORBIDDEN_VARIABLE_NAME_PREFIX}${node.func}`
                            ]
                        },
                        inputs: {
                            VALUE: this.convertValue(blocks, node.value, spr),
                        },
                        shadow: false,
                        topLevel: false
                    });

                } break;
                case "Run": {
                    const { id, argAmount, args } = node;
                    const func = this.functions.get(id);
                    if (func === undefined) {
                        this.logger.error(`No function named: ${id}`);
                        Deno.exit(1);
                    }
                    if (func.args.length !== argAmount) {
                        this.logger.error("Mismatching argument count");
                        this.logger.error(`Expected ${argAmount} arguments, got ${func.args.length}`);
                        Deno.exit(1);
                    }
                    const argumentIds = JSON.stringify(func.args.entries().map(([i, _]) => MD5(`${id}:${i+1}`)));
                    const inputs = new Map();
                    let proccode = id;
                    for (const [i, arg] of args.entries()) {
                        if (func.args[i] === "Any") {
                            proccode += " %s"
                        } else proccode += " %b";
                        inputs.set(
                            MD5(`${id}:${i + 1}`),
                            this.convertValue(blocks, arg, spr)
                        );
                    }
                    blocks.set(
                        (++this.blockCounter).toString(),
                        {
                            opcode: "procedures_call",
                            inputs,
                            fields: {},
                            shadow: false,
                            topLevel: false,
                            mutation: {
                                tagName: "mutation",
                                children: [],
                                proccode,
                                argumentids: argumentIds,
                                warp: func.warp
                            }
                        }
                    )
                }
            }
            if (
                node.type === "If" ||
                node.type === "IfElse" ||
                node.type === "Repeat" ||
                node.type === "Forever" ||
                node.type === "Clone" ||
                node.type === "CloneMyself"
            ) {
                // else
            } else {
                heads.set(i, this.blockCounter.toString());
            }
        }
        if (!heads.has(0)) {
            this.logger.error(`Label ${name} is empty!`);
            this.logger.error("Cannot convert empty label!");
            Deno.exit(1);
        }
        this.labelHeads.set(name, heads.get(0)!);
        for (const [i, _] of nodes.entries()) {
            if (heads.has(i+1)) {
                blocks.get(heads.get(i)!)!.next = heads.get(i+1)!;
            }
            if (i > 0 && heads.has(i - 1)) {
                blocks.get(heads.get(i)!)!.parent = heads.get(i-1)!;
            }
        };
        return [blocks, heads];
    }

    private generateVariableHashes() {
        for (const id of this.variables) {
            this.variable_map.set(id, MD5(id));
        }
    }

    private gatherValues() {
        const stat = this.labels.find(a => a.type === "Label" && a.value[0] === "stat") as Extract<IlNode, {type: "Label"}> | undefined;
        if (stat === undefined) {
            this.logger.error("No stat label found");
            Deno.exit(1);
        }
        const field = stat.value[1];
        for (const node of field) {
            switch(node.type) {
                case "CreateSpr": {
                    const { id, name, isStage } = node;
                    if (isStage) {
                        const target = <Target> {
                            isStage: true,
                            blocks: new Map(),
                            broadcasts: <Broadcasts> {},
                            comments: <Comments> {},
                            costumes: [],
                            currentCostume: 0,
                            direction: 0,
                            draggable: false,
                            visible: true,
                            layerOrder: 0,
                            lists: <Lists> {},
                            name,
                            rotationStyle: "all around",
                            size: 100,
                            sounds: [],
                            textToSpeechLanguage: null,
                            variables: new Map(),
                            videoState: "on",
                            videoTransparency: 50,
                            volume: 100,
                            x: 0,
                            y: 10,
                        };
                        this.project.targets.splice(0, 0, target);
                        this.sprites.set(
                            id.toString(),
                            <Sprite> {
                                name,
                                func_args: new Map(),
                                added_builtins: new Map(),
                                costume_paths: []
                            }
                        )
                    } else {
                        this.sprites.set(id.toString(), <Sprite> {
                            name,
                            func_args: new Map(),
                            added_builtins: new Map(),
                            costume_paths: []
                        });
                        this.project.targets.push(<Target> {
                            blocks: new Map,
                            broadcasts: <Broadcasts> {},
                            comments: <Comments> {},
                            costumes: [],
                            currentCostume: 0,
                            direction: 0,
                            draggable: false,
                            visible: true,
                            isStage: false,
                            layerOrder: 1,
                            lists: <Lists> {},
                            name,
                            rotationStyle: "all around",
                            size: 100,
                            sounds: [],
                            tempo: 100,
                            textToSpeechLanguage: null,
                            variables: new Map(),
                            videoState: "on",
                            videoTransparency: 50,
                            volume: 100,
                            x: 0,
                            y: 10
                        });
                    }
                } break;
                case "AddSprCostume": {
                    const { id, format, file, anchorX, anchorY, name } = node;
                    const sprite = this.sprites.get(id);
                    if (sprite === undefined) {
                        this.logger.error(`No sprite with id: ${id}`);
                        Deno.exit(1);
                    }
                    const target = this.project.targets.find(a => a.name === sprite.name)!;
                    const fmt = format.toLowerCase();
                    const targetPath = path.join(this.resourceFolder, file);
                    const fr = Deno.readFileSync(targetPath);
                    sprite.costume_paths.push([targetPath, format]);
                    if (fr === undefined) {
                        this.logger.error(`Couldn't find file ${file}`);
                        Deno.exit(1);
                    }
                    const m = MD5(new TextDecoder().decode(fr));
                    target.costumes.push({
                        name,
                        dataFormat: fmt,
                        assetId: m,
                        md5ext: `${m}.${fmt}`,
                        rotationCenterX: anchorX,
                        rotationCenterY: anchorY,
                        bitmapResolution: format === "PNG" ? 2 : 1
                    });
                } break;
                case "CreateVar": {
                    if (node.name.startsWith(FORBIDDEN_VARIABLE_NAME_PREFIX)) {
                        this.logger.warn(`Variable names probably shouldn't start with ${FORBIDDEN_VARIABLE_NAME_PREFIX}`);
                    }
                    this.variables.push(name);
                } break;
                case "CreateInstanceVar": {
                    if (node.varName.startsWith(FORBIDDEN_VARIABLE_NAME_PREFIX)) {
                        this.logger.warn(`Variable names probably shouldn't start with ${FORBIDDEN_VARIABLE_NAME_PREFIX}`);
                    }
                    this.variables.push(node.varName);
                    const nameHash = MD5(node.varName);
                    const tt = this.project.targets.find(a => a.name === this.sprites.get(node.value)!.name);
                    tt!.variables.set(nameHash, [name, 0]);
                } break;
                case "CreateList": {
                    this.list_map.set(node.name, MD5(node.name));
                } break;
                case "CreateBroadcast": {
                    this.broadcasts.set(node.name, MD5(node.name));
                } break;
                case "Def": {
                    const {label, id, args, warp} = node;
                    for (const [i, _] of args.entries()) {
                        const v = `${id}:${i+1}`;
                        this.variable_map.set(v, MD5(v));
                    }
                    this.functions.set(
                        id,
                        {
                            args,
                            label,
                            warp
                        }
                    );
                    this.variables.push(`${FORBIDDEN_VARIABLE_NAME_PREFIX}${id}`);
                }
            }
        }
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
     * Key is builtin value, value is key in blocks */
    added_builtins: Map<BuiltinValue, string>,
    costume_paths: Array<[string, FileFormat]>,
}

export interface Function {
    label: string,
    args: Array<ScratchArgumentType>,
    warp: boolean,
}