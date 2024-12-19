export type Node = Nodify<BaseNode>;
export type Nodify<T> = T & {start: number, end: number, fp: string};
export type BaseNode = 
  | NumberNode
  | StringNode
  | VariableNode
  | ChildOfNode
  | CallNode
  | AssignmentNode
  | DeclarationNode

  | TypeNode
;
export enum NodeKind {
    NumberNode,
    StringNode,
    VariableNode,
    ChildOfNode,
    MethodOfNode,
    CallNode,
    QuickCallNode,
    AssignmentNode,
    DeclarationNode,
    
    IfNode,
    IfElseNode,
    WhileNode,
    ForNode,

    UnaryOperation,
    BinaryOperation,

    TypeNode
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
    readonly typeArguments: TypeNode[],
    readonly arguments: Node[]
}
export type QuickCallNode = {
    readonly type: NodeKind.QuickCallNode,
    readonly callee: Node,
    readonly typeArguments: TypeNode[],
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
    readonly elsePredicate: Node,
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
    Modulo
}
export type BinaryOperation = {
    readonly type: NodeKind.BinaryOperation
    readonly oper: BinaryOperationType,
    readonly left: Node,
    readonly right: Node
}

// Type Node

export type TypeNode = {
    readonly type: NodeKind.TypeNode,
    readonly ref: boolean,
    readonly name: string,
    readonly typeArguments: Nodify<TypeNode>[]
}