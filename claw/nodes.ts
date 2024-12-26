import { Loc } from "./lexer.ts";

export type Node = Nodify<BaseNode>;
export type Nodify<T> = T & Loc;
export type BaseNode = 
  | NumberNode
  | StringNode
  | VariableNode
  | ChildOfNode
  | MethodOfNode
  | CallNode
  | AssignmentNode
  | DeclarationNode
  | IfNode
  | IfElseNode
  | WhileNode
  | ForNode
  | IfRuntimeNode
  | IfElseRuntimeNode
  | WhileRuntimeNode
  | ForRuntimeNode
  | UnaryOperation
  | BinaryOperation
  | Grouping
  | TypeNode
  | BlockNode
  | LabelNode
  | FunctionDefinitionNode
  | InterfaceNode
;
export enum NodeKind {
    NumberNode,
    StringNode,
    VariableNode,
    ChildOfNode,
    MethodOfNode,
    CallNode,
    AssignmentNode,
    DeclarationNode,
    
    IfNode,
    IfElseNode,
    WhileNode,
    ForNode,

    IfRuntimeNode,
    IfElseRuntimeNode,
    WhileRuntimeNode,
    ForRuntimeNode,

    UnaryOperation,
    BinaryOperation,
    Grouping,

    TypeNode,
    BoundNode,
    BlockNode,
    LabelNode,

    FunctionDefinitionNode,
    InterfaceNode,
}
export type NumberNode = {
    readonly type: NodeKind.NumberNode,
    readonly value: number
}
export type StringNode = {
    readonly type: NodeKind.StringNode,
    readonly value: string
}
export type VariableNode = {
    readonly type: NodeKind.VariableNode,
    readonly name: string
}
export type ChildOfNode = {
    readonly type: NodeKind.ChildOfNode,
    readonly base: Node,
    readonly extension: string
}
export type MethodOfNode = {
    readonly type: NodeKind.MethodOfNode,
    readonly base: Node,
    readonly extension: string
}
export type CallNode = {
    readonly type: NodeKind.CallNode,
    readonly callee: Node,
    readonly typeArguments: Nodify<TypeNode>[] | null,
    readonly arguments: Node[]
}
export type AssignmentNode = {
    readonly type: NodeKind.AssignmentNode,
    readonly assignee: Node,
    readonly value: Node
}
export type DeclarationNode = {
    readonly type: NodeKind.DeclarationNode,
    readonly valueType: Nodify<TypeNode> | null,
    readonly name: string,
    readonly value: Node
}

export type IfNode = {
    readonly type: NodeKind.IfNode,
    readonly predicate: Node,
    readonly body: Node,
}
export type IfElseNode = {
    readonly type: NodeKind.IfElseNode,
    readonly predicate: Node,
    readonly body: Node,
    readonly elseBody: Node,
}
export type WhileNode = {
    readonly type: NodeKind.WhileNode,
    readonly predicate: Node,
    readonly body: Node,
}
export type ForNode = {
    readonly type: NodeKind.ForNode,
    readonly initialiser: Node,
    readonly predicate: Node,
    readonly post: Node,
    readonly body: Node,
}
export type IfRuntimeNode = {
    readonly type: NodeKind.IfRuntimeNode,
    readonly predicate: Node,
    readonly body: Node,
}
export type IfElseRuntimeNode = {
    readonly type: NodeKind.IfElseRuntimeNode,
    readonly predicate: Node,
    readonly body: Node,
    readonly elseBody: Node,
}
export type WhileRuntimeNode = {
    readonly type: NodeKind.WhileRuntimeNode,
    readonly predicate: Node,
    readonly body: Node,
}
export type ForRuntimeNode = {
    readonly type: NodeKind.ForRuntimeNode,
    readonly initialiser: Node,
    readonly predicate: Node,
    readonly post: Node,
    readonly body: Node,
}


export enum UnaryOperationType {
    Negate,
    BitwiseNot,
    Not,
}
export type UnaryOperation = {
    readonly type: NodeKind.UnaryOperation,
    readonly oper: UnaryOperationType,
    readonly value: Node
}
export enum BinaryOperationType {
    Add,
    Subtract,
    Multiply,
    Divide,
    BitwiseXor,
    BitwiseOr,
    BitwiseAnd,
    And,
    Or,
    Modulo,
    Equal,
    NotEqual,
    Gt,
    Gte,
    Lt,
    Lte
}
export type BinaryOperation = {
    readonly type: NodeKind.BinaryOperation
    readonly oper: BinaryOperationType,
    readonly left: Node,
    readonly right: Node
}
export type Grouping = {
    readonly type: NodeKind.Grouping,
    readonly value: Node
}
export type TypeNode = {
    readonly type: NodeKind.TypeNode,
    readonly ref: boolean,
    readonly name: string,
    readonly typeArguments: Nodify<TypeNode>[],
    readonly bounds: string[]
}

export type BlockNode = {
    readonly type: NodeKind.BlockNode,
    readonly nodes: Node[]
}
export type LabelNode = {
    readonly type: NodeKind.LabelNode,
    readonly nodes: Node[]
}

export type FunctionDefinitionNode = {
    readonly type: NodeKind.FunctionDefinitionNode,
    readonly args: [string, Nodify<TypeNode>][],
    readonly nodes: Node,
    readonly name: string,
    readonly returnType: Nodify<TypeNode>
}
export type InterfaceNode = {
    readonly type: NodeKind.InterfaceNode,
    readonly name: string,
    readonly defs: Nodify<FunctionDefinitionNode>[],
    readonly generics: Nodify<TypeNode>[]
}