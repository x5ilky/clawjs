// deno-lint-ignore-file no-explicit-any no-empty-interface
export type FileFormat = "SVG" | "PNG";
export type StopType = "All" | "ThisScript" | "OtherScripts";
export type ListOper = 
    | { key: "Push", value: IlValue }
    | { key: "RemoveIndex", index: IlValue }
    | { key: "Insert", value: IlValue, index: IlValue }
    | { key: "Clear" }
    | { key: "Replace", value: IlValue, index: IlValue };

export type IlValue = 
    | { key: "Integer", value: number }
    | { key: "Float", value: number }
    | { key: "String", value: string }
    | { key: "Variable", name: string }
    | { key: "UnaryOperation", oper: UnaryOperation, value: IlValue }
    | { key: "BinaryOperation", oper: BinaryOperation, left: IlValue, right: IlValue }
    | { key: "DropOperation", oper: DropOperation, value: IlValue }
    | { key: "Argument", funcName: string, index: number }
    | { key: "Builtin", value: BuiltinValue }
    | { key: "Costume", isBackdrop: boolean, name: string }
    | { key: "ListValue", list:  string, value: ListValue };

export type ListValue =
    | { key: "Index", index: IlValue }
    | { key: "Find", value: IlValue }
    | { key: "Length" }
    | { key: "Contains", value: IlValue };

export type BuiltinValue = 
    | { key: "XPosition" }
    | { key: "YPosition" }
    | { key: "Direction" }
    // true is number, false is name
    | { key: "Costume", numberOrName: boolean }
    | { key: "Backdrop", numberOrName: boolean }
    | { key: "Size" }
export type UnaryOperation = "Not" | "Length" | "Round";
export type DropOperation = 
    | "Abs"
    | "Floor"
    | "Ceiling"
    | "Sqrt"
    | "Sin"
    | "Cos"
    | "Tan"
    | "Asin"
    | "Acos"
    | "Atan"
    | "Ln"
    | "Log"
    | "EPower"
    | "TenPower";
export type BinaryOperation = 
    | "Add"
    | "Sub"
    | "Mul"
    | "Div"
    | "Mod"
    | "And"
    | "Or"
    | "Eq"
    | "Gt"
    | "Lt"
    | "Gte"
    | "Lte"
    | "Join"
    | "LetterOf"
    | "Contains"
    | "Random";

export type ScratchArgumentType = "Any" | "Boolean";

export interface Project {
    targets: Target[],
    monitors: Monitor[],
    extensions: any[],
    meta: Meta
};

interface Target {
  isStage: boolean;
  name: string;
  variables: Map<string, Variable>;
  lists: Lists;
  broadcasts: Broadcasts;
  blocks: Map<string, Block>;
  comments: Comments;
  currentCostume: number;
  costumes: Costume[];
  sounds: unknown[];
  volume: number;
  layerOrder: number;
  tempo?: number;
  videoTransparency?: number;
  videoState?: string;
  textToSpeechLanguage: any;
  visible?: boolean;
  x?: number;
  y?: number;
  size?: number;
  direction?: number;
  draggable?: boolean;
  rotationStyle?: string;
}
export type Variable = [string, number];

export interface Lists {
    // todo
}
export interface Broadcasts {
    // todo
}

export interface Block {
    opcode: string,
    next?: string,
    parent?: string,
    inputs: any,
    fields: any,
    shadow: boolean,
    topLevel: boolean,
    mutation?: any
}

export interface BlockFields {
    variable?: string[]
}

export interface Comments {
    // todo
}

export interface Costume {
    name: string,
    dataFormat: string,
    assetId: string,
    md5ext: string,
    rotationCenterX: number,
    rotationCenterY: number,
    bitmapResolution?: number,
}

export interface Monitor {
    id: string,
    mode: string,
    opcode: string,
    params: Params,
    sprite_name: any,
    value: number,
    width: number,
    height: number,
    x: number,
    y: number,
    visible: boolean,
    slider_min: number,
    slider_max: number,
    is_discrete: boolean,
}

export interface Params {
    VARIABLE: string
}

export interface Meta {
    semver: string,
    vm: string,
    agent: string,
    platform: {
        name: string,
        url: string
    }
};

export type IlNode =
  | { type: "Label"; value: [string, IlNode[]] }
  | { type: "CreateVar"; name: string }
  | { type: "CreateList"; name: string }
  | { type: "ListOper"; list: string; oper: ListOper }
  | { type: "CreateSpr"; id: string; name: string; isStage: boolean }
  | { type: "AddSprCostume"; id: string; name: string; format: FileFormat; file: string; anchorX: number; anchorY: number }
  | { type: "Flag"; target: string; label: string }
  | { type: "Forever"; label: string }
  /* Motion */
  | { type: "MoveSteps"; value: IlValue }
  | { type: "TurnRight"; value: IlValue }
  | { type: "TurnLeft"; value: IlValue }
  | { type: "GotoXY"; x: IlValue; y: IlValue }
  | { type: "GlideToXY"; x: IlValue; y: IlValue; secs: IlValue }
  | { type: "PointDirection"; value: IlValue }
  | { type: "SetX"; value: IlValue }
  | { type: "SetY"; value: IlValue }
  | { type: "ChangeX"; value: IlValue }
  | { type: "ChangeY"; value: IlValue }
  /* Looks */
  | { type: "Say"; value: IlValue }
  | { type: "SayFor"; value: IlValue; secs: IlValue }
  | { type: "Think"; value: IlValue }
  | { type: "ThinkFor"; value: IlValue; secs: IlValue }
  | { type: "SwitchCostume"; value: IlValue }
  | { type: "NextCostume" }
  | { type: "SwitchBackdrop"; value: IlValue }
  | { type: "NextBackdrop" }
  | { type: "ChangeSize"; value: IlValue }
  | { type: "SetSize"; value: IlValue }
  | { type: "Show" }
  | { type: "Hide" }
  | { type: "GotoLayer"; value: boolean }
  | { type: "GoForwardLayers"; value: IlValue }
  /* Definitions */
  | { type: "Def"; label: string; id: string; argAmount: number; args: ScratchArgumentType[]; warp: boolean }
  | { type: "InsertDef"; func: string; sprites: string[] }
  | { type: "Run"; id: string; argAmount: number; args: IlValue[] }
  /* Events and control */
  | { type: "Move"; value: IlValue }
  | { type: "Set"; target: string; value: IlValue }
  | { type: "Change"; target: string; value: IlValue }
  | { type: "Wait"; time: IlValue }
  | { type: "If"; predicate: IlValue; label: string }
  | { type: "IfElse"; predicate: IlValue; label: string; label2: string }
  | { type: "Repeat"; amount: IlValue; label: string }
  | { type: "Return"; func: string; value: IlValue }
  | { type: "Stop"; stopType: StopType }
  | { type: "Value"; value: IlValue }
  | { type: "Keypress"; key: string; label: string; target: string }
  | { type: "Clicked"; label: string; target: string }
  | { type: "WhenBroadcast"; name: string; label: string; target: string }
  | { type: "Broadcast"; value: IlValue }
  | { type: "CreateBroadcast"; name: string }
  | { type: "BroadcastWait"; value: IlValue }
  | { type: "RepeatUntil"; predicate: IlValue; label: string }
  | { type: "WaitUntil"; predicate: IlValue }
  | { type: "Clone"; target: string }
  | { type: "WhenClone"; target: string; label: string }
  | { type: "DeleteClone" }
  | { type: "CreateInstanceVar"; varName: string; value: string }
  | { type: "CloneMyself" };
