import { Loc } from "./lexer.ts";

export type Node = BaseNode;
export type BaseNode = 
  | NumberNode
  | StringNode
  | VariableNode
  | StructLiteralNode
  | ChildOfNode
  | MethodOfNode
  | CallNode
  | AssignmentNode
  | DeclarationNode
  | ConstDeclarationNode
  | IfNode
  | IfElseNode
  | WhileNode
  | ForNode
  | ReturnNode
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
  | StructDefinitionNode
  | DataStructDefinitionNode
  | InterfaceNode
  | ImplBaseNode
  | ImplTraitNode
;
export enum NodeKind {
    NumberNode,
    StringNode,
    VariableNode,
    StructLiteralNode,
    ChildOfNode,
    MethodOfNode,
    CallNode,
    AssignmentNode,
    DeclarationNode,
    ConstDeclarationNode,
    
    IfNode,
    IfElseNode,
    WhileNode,
    ForNode,

    IfRuntimeNode,
    IfElseRuntimeNode,
    WhileRuntimeNode,
    ForRuntimeNode,
    ReturnNode,

    UnaryOperation,
    BinaryOperation,
    Grouping,

    TypeNode,
    BoundNode,
    BlockNode,
    LabelNode,

    FunctionDefinitionNode,
    StructDefinitionNode,
    DataStructDefinitionNode,
    InterfaceNode,
    ImplBaseNode,
    ImplTraitNode,
}
export type NumberNode = {
    readonly type: NodeKind.NumberNode,
    readonly value: number
} & Loc;
export type StringNode = {
    readonly type: NodeKind.StringNode,
    readonly value: string
} & Loc;
export type VariableNode = {
    readonly type: NodeKind.VariableNode,
    readonly name: string
} & Loc;
export type StructLiteralNode = {
    readonly type: NodeKind.StructLiteralNode,
    readonly baseType: TypeNode,
    readonly members: {[key: string]: Node}
} & Loc;
export type ChildOfNode = {
    readonly type: NodeKind.ChildOfNode,
    readonly base: Node,
    readonly extension: string
} & Loc;
export type MethodOfNode = {
    readonly type: NodeKind.MethodOfNode,
    readonly base: Node,
    readonly extension: string
} & Loc;
export type CallNode = {
    readonly type: NodeKind.CallNode,
    readonly callee: Node,
    readonly typeArguments: TypeNode[] | null,
    readonly arguments: Node[]
} & Loc;
export type AssignmentNode = {
    readonly type: NodeKind.AssignmentNode,
    readonly assignee: Node,
    readonly value: Node
} & Loc;
export type DeclarationNode = {
    readonly type: NodeKind.DeclarationNode,
    readonly valueType: TypeNode | null,
    readonly name: string,
    readonly value: Node
} & Loc;
export type ConstDeclarationNode = {
    readonly type: NodeKind.ConstDeclarationNode,
    readonly valueType: TypeNode | null,
    readonly name: string,
    readonly value: Node
} & Loc;

export type IfNode = {
    readonly type: NodeKind.IfNode,
    readonly predicate: Node,
    readonly body: Node,
} & Loc;
export type IfElseNode = {
    readonly type: NodeKind.IfElseNode,
    readonly predicate: Node,
    readonly body: Node,
    readonly elseBody: Node,
} & Loc;
export type WhileNode = {
    readonly type: NodeKind.WhileNode,
    readonly predicate: Node,
    readonly body: Node,
} & Loc;
export type ForNode = {
    readonly type: NodeKind.ForNode,
    readonly initialiser: Node,
    readonly predicate: Node,
    readonly post: Node,
    readonly body: Node,
} & Loc;
export type ReturnNode = {
    readonly type: NodeKind.ReturnNode,
    readonly value: Node
} & Loc;
export type IfRuntimeNode = {
    readonly type: NodeKind.IfRuntimeNode,
    readonly predicate: Node,
    readonly body: Node,
} & Loc;
export type IfElseRuntimeNode = {
    readonly type: NodeKind.IfElseRuntimeNode,
    readonly predicate: Node,
    readonly body: Node,
    readonly elseBody: Node,
} & Loc;
export type WhileRuntimeNode = {
    readonly type: NodeKind.WhileRuntimeNode,
    readonly predicate: Node,
    readonly body: Node,
} & Loc;
export type ForRuntimeNode = {
    readonly type: NodeKind.ForRuntimeNode,
    readonly initialiser: Node,
    readonly predicate: Node,
    readonly post: Node,
    readonly body: Node,
} & Loc;


export enum UnaryOperationType {
    Negate,
    BitwiseNot,
    Not,
}
export type UnaryOperation = {
    readonly type: NodeKind.UnaryOperation,
    readonly oper: UnaryOperationType,
    readonly value: Node
} & Loc;
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
} & Loc;
export type Grouping = {
    readonly type: NodeKind.Grouping,
    readonly value: Node
} & Loc;
export type TypeNode = {
    readonly type: NodeKind.TypeNode,
    readonly ref: boolean,
    readonly name: string,
    readonly typeArguments: TypeNode[],
    readonly bounds: string[]
} & Loc;

export type BlockNode = {
    readonly type: NodeKind.BlockNode,
    readonly nodes: Node[]
} & Loc;
export type LabelNode = {
    readonly type: NodeKind.LabelNode,
    readonly nodes: Node[]
} & Loc;

export type FunctionDefinitionNode = {
    readonly type: NodeKind.FunctionDefinitionNode,
    readonly typeArgs: TypeNode[],
    readonly args: [string, TypeNode][],
    readonly nodes: Node,
    readonly name: string,
    readonly returnType: TypeNode
} & Loc;
export type StructDefinitionNode = {
    readonly type: NodeKind.StructDefinitionNode,
    readonly members: [string, TypeNode][],
    readonly name: string,
    readonly generics: string[]
} & Loc;
export type DataStructDefinitionNode = {
    readonly type: NodeKind.DataStructDefinitionNode,
    readonly members: [string, TypeNode][],
    readonly name: string,
    readonly generics: string[]
} & Loc;
export type InterfaceNode = {
    readonly type: NodeKind.InterfaceNode,
    readonly name: string,
    readonly defs: FunctionDefinitionNode[],
    readonly typeArguments: TypeNode[]
} & Loc;
export type ImplBaseNode = {
    readonly type: NodeKind.ImplBaseNode,
    readonly targetType: TypeNode,
    readonly defs: FunctionDefinitionNode[],
    readonly generics: string[],
} & Loc;
export type ImplTraitNode = {
    readonly type: NodeKind.ImplTraitNode,
    readonly trait: TypeNode,
    readonly targetType: TypeNode,
    readonly generics: string[],
} & Loc;