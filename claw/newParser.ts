import { LogLevel } from "../SkOutput.ts";
import { logger } from "../src/main.ts";
import { ClawToken, ClawTokenType, Loc, TSymbol } from "./lexer.ts";
import { BaseNode, BinaryOperationType, FunctionDefinitionNode, Node, NodeKind, OfTypeNode, TypeNode, UnaryOperationType } from "./nodes.ts";
import { SourceMap } from "./sourcemap.ts";
import { SourceHelper } from "./sourceUtil.ts";

function cn<T extends Omit<BaseNode, keyof Loc>>(
  start: { start: number; end: number; fp: string },
  end: { start: number; end: number; fp: string },
  value: T,
): T & Loc {
  return {
    start: start.start,
    end: end.end,
    fp: start.fp,
    ...value,
  };
}
class Iterray<T> {
    values: T[]
    iterator: number

    constructor(values: T[]) {
        this.values = values;
        this.iterator = 0;
    }

    hasItems(): boolean {
        return this.iterator < this.values.length
    }

    peek(): T {
        return this.values[this.iterator]
    }

    shift(): T {
        return this.values[this.iterator++]
    }

    push(value: T) {
        this.values.push(value)
    }

    justShifted(): T {
        return this.values[this.iterator - 1];
    }
}
type ApplyTypePredicate<T, E> = (T extends (value: E) => value is (infer R extends E) ? R : E) ;

export class Parser {
    tokens: Iterray<ClawToken>;
    state: number[];
    constructor(tokens: ClawToken[], private sourcemap: SourceMap) {
        this.tokens = new Iterray(tokens);
        this.state = [];
    }

    // deno-lint-ignore no-explicit-any
    try<T>(...fns: ((this: Parser, ...values: any[]) => T)[]): T | null {
        this.save();
        for (const fn of fns) {
            const v = fn.bind(this)();
            if (v !== null) return this.finish(v);
            else {
                this.restore();
                this.save();
            }
        }
        return this.finish(null)
    }


    save() {
        console.log('save:', this.tokens.iterator, new Error().stack!.split("\n")[2])
        this.state.push(this.tokens.iterator);
    }
    load() {
        this.tokens.iterator = this.state.pop()!;
        this.state.push(this.tokens.iterator)
        console.log('load:', this.tokens.iterator, new Error().stack!.split("\n")[2])
        return null;
    }
    restore() {
        this.tokens.iterator = this.state.pop()!;
        console.log('restore:', this.tokens.iterator, new Error().stack!.split("\n")[2])
        return null;
    }
    finish<T>(v: T): T {
        console.log("finish:", this.tokens.iterator, new Error().stack!.split("\n")[2])
        this.state.pop();
        return v;
    }
    errorAt(
        location: { start: number; end: number; fp: string },
        message: string,
    ): never {
        const tag = {
        color: [196, 34, 235] as [number, number, number],
        priority: -20,
        name: "parser",
        };
        const sh = new SourceHelper(this.sourcemap.get(location.fp)!);
        const lines = sh.getLines(location.start, location.end);
        const [col, row] = sh.getColRow(location.start);
        logger.printWithTags([
            logger.config.levels[LogLevel.ERROR],
            tag
        ], `At ${location.fp}:${col + 1}:${row + 1}:`);
        for (const ln of lines) {
            logger.printWithTags([
                logger.config.levels[LogLevel.ERROR],
                tag
            ], ln);
        }
        logger.printWithTags([
            logger.config.levels[LogLevel.ERROR],
            tag
        ], `${message}`);
        Deno.exit(1);
    }

    eatIfThereIs<F extends (token: ClawToken) => unknown>(pred: F): boolean {
        const v = this.tokens.peek()
        if (v === undefined) return false;
        if (!pred(v)) return false;
        this.tokens.shift();
        return true;
    }
    eatIfThereIsSymbol(symbol: TSymbol): boolean {
        const v = this.tokens.peek()
        if (v === undefined) return false;
        if (!(v.type === "Symbol" && v.value === symbol)) return false;
        this.tokens.shift();
        return true;
    }
    expect<F extends (token: ClawToken) => unknown>(pred: F): ApplyTypePredicate<F, ClawToken> | null {
        const v = this.tokens.shift()
        if (v === undefined) return null;
        if (!pred(v)) return null;
        return v as ApplyTypePredicate<F, ClawToken>;
    }
    expectOrTerm<F extends (token: ClawToken) => unknown>(message: string, pred: F): ApplyTypePredicate<F, ClawToken> {
        const v = this.tokens.shift()
        if (v === undefined) return this.errorAt(this.tokens.values[this.tokens.iterator-2], message);
        if (!pred(v)) return this.errorAt(v, message);
        return v as ApplyTypePredicate<F, ClawToken>;
    }
    expectSymbol<F extends (token: ClawTokenType<"Symbol">) => unknown>(symbolType: TSymbol): ApplyTypePredicate<F, ClawToken> | null {
        const v = this.tokens.shift();
        if (v === undefined) return null;
        if (v.type !== "Symbol") return null;
        if (v.value !== symbolType) return null;
        return v as ApplyTypePredicate<F, ClawToken>;
    }
    expectSymbolOrLoad<F extends (token: ClawTokenType<"Symbol">) => unknown>(symbolType: TSymbol): ApplyTypePredicate<F, ClawToken> | null {
        const v = this.tokens.shift();
        if (v === undefined) return this.load();
        if (v.type !== "Symbol") return this.load();
        if (v.value !== symbolType) return this.load();
        return v as ApplyTypePredicate<F, ClawToken>;
    }

    parse() {
        const nodes = [];
        while(this.tokens.hasItems()) nodes.push(this.parseTopLevel())
        return nodes
    }

    parseTopLevel() {
        const peek = this.tokens.peek();
        if (peek.type === "Keyword" && peek.value === "import") {
            const v = this.parseImport()
            if (v === null) this.errorAt(peek, `Failed to parse import statement`);
            return v;
        }
        if (peek.type === "Keyword" && peek.value === "fn") {
            const v = this.parseFunction()
            if (v === null) this.errorAt(peek, `Failed to parse function definition`);
            return v;
        }
        if (peek.type === "Keyword" && peek.value === "interface") {
            const v = this.parseInterface()
            if (v === null) this.errorAt(peek, `Failed to parse function definition`);
            return v;
        }
        if (peek.type === "Keyword" && peek.value === "impl") {
            this.save();
            const v = this.parseImplBase()
            if (v === null) this.restore();
            else return this.finish(v);
            const v2 = this.parseImplTrait()
            if (v2 === null)
                this.errorAt(peek, `Failed to parse impl statement`);
            return this.finish(v2);
        }
        if (peek.type === "Keyword" && (peek.value === "data" || peek.value === "struct")) {
            return this.parseStructDefinition();
        }

        return this.parseStatement();
    }
    parseStatement() {
        const peek = this.tokens.peek();
        if (peek.type === "Keyword") {
            if (peek.value === "$intrinsic") return this.parseIntrinsic()!;
            if (peek.value === "return") return this.parseReturnRule()!;
            // yes it is guarenteed
        }
        const decl = this.parseDeclaration();
        if (decl !== null) return decl;
        const opAssign = this.parseOpAssign();
        if (opAssign !== null) return opAssign;
        const assign = this.parseAssignment();
        if (assign !== null) return assign;
        const value = this.parseValue();
        if (value !== null) return value;
        throw new Error("no statement matched")
    }

    parseGenericTypeList(): TypeNode[] | null {
        this.save();
        const generics: TypeNode[] = [];
        if (this.eatIfThereIsSymbol("<")) {
            while (true) {
                if (this.eatIfThereIsSymbol(">")) break;
                const v = this.parseType();
                if (v === null) return this.restore();
                if (this.eatIfThereIsSymbol(">")) break;
                if (this.eatIfThereIsSymbol(",")) continue;
                this.errorAt(this.tokens.justShifted(), `Expected commas or right angle bracket`);
            }
        }
        return this.finish(generics);
    }

    parseFunctionDefinition(): FunctionDefinitionNode | null {
        this.save();
        const fn = this.expect(a => a.type === "Keyword" && a.value === "fn");
        if (fn === null) return this.restore();
        const name = this.expectOrTerm("Expected function name", token => token.type === "Identifier");
        const typeArgs = this.parseGenericTypeList();
        if (typeArgs === null) return this.restore();
        const startParen = this.expectSymbol("(")
        if (startParen === null) return this.restore();

        const args: [string, TypeNode][] = [];
        while (true) {
            if (this.eatIfThereIsSymbol(")")) break;
            const name = this.expectOrTerm("Expected function argument", token => token.type === "Identifier");
            const colon = this.expectSymbol(":");
            if (colon === null) return this.restore();
            const type = this.parseType();
            if (type === null) return this.restore();
            args.push([name.name, type] as const);
            if (this.eatIfThereIsSymbol(")")) break;
            if (this.eatIfThereIsSymbol(",")) continue;
            this.errorAt(this.tokens.justShifted(), `Expected ending parentheses`);
        }
        const returnType = this.parseType();
        if (returnType === null) return this.restore();
        const end = this.tokens.justShifted();
        return this.finish(cn(fn, end, {
            type: NodeKind.FunctionDefinitionNode,
            name: name.name,
            args,
            typeArgs,
            nodes: cn(end, end, {
                type: NodeKind.BlockNode,
                nodes: []
            }),
            returnType
        }))
    }

    parseFunction(): FunctionDefinitionNode | null {
        this.save();
        const def = this.parseFunctionDefinition();
        if (def === null) return this.errorAt(this.tokens.justShifted(), `Failed to parse function definition`);
        const block = this.parseStatement();
        if (block === null) this.errorAt(def, `Expected function body`);
        return this.finish(cn(def, block, {
            type: NodeKind.FunctionDefinitionNode, 
            name: def.name,
            args: def.args,
            returnType: def.returnType,
            typeArgs: def.typeArgs,
            nodes: block,
        }))
    }

    parseInterface(): Node | null {
        this.save();
        const interfaceToken = this.expect(a => a.type === "Keyword" && a.value === "interface");
        if (interfaceToken === null) return this.restore()
        const interfaceNameToken = this.expectOrTerm("expected identifier name", a => a.type === "Identifier");
        const generics = this.parseGenericTypeList();
        if (generics === null) return this.restore();
        const beginCurly = this.expectSymbol("{");
        if (beginCurly === null) return this.restore()
        const functions = [];
        while (true) {
            if (this.eatIfThereIsSymbol("}")) break;
            const f = this.parseFunctionDefinition();
            if (f === null) this.errorAt(this.tokens.justShifted(), "expected function definition");
            functions.push(f);
        }
        return cn(interfaceToken, this.tokens.justShifted(), {
            type: NodeKind.InterfaceNode,
            name: interfaceNameToken.name,
            defs: functions,
            typeArguments: generics
        });
    }

    parseImplBase(): Node | null {
        this.save();
        const implToken = this.expect(a => a.type === "Keyword" && a.value === "impl");
        if (implToken === null) return this.restore();
        const implGenerics = this.parseGenericTypeList();
        if (implGenerics === null) return this.restore();
        const targetType = this.parseType();
        if (targetType === null) return this.restore();
        const _begin_curly = this.expectSymbol("{");
        if (_begin_curly === null) return this.restore();
        const functions = [];
        while (true) {
            if (this.eatIfThereIsSymbol("}")) break;
            const f = this.parseFunction();
            if (f === null) this.errorAt(this.tokens.justShifted(), "Expected function implementation");
            functions.push(f);
        }
        return this.finish(cn(implToken, this.tokens.justShifted(), {
            type: NodeKind.ImplBaseNode,
            targetType,
            defs: functions,
            generics: implGenerics
        }))
    }
    parseImplTrait(): Node | null {
        this.save();
        const implToken = this.expect(a => a.type === "Keyword" && a.value === "impl");
        if (implToken === null) return this.restore();
        const implGenerics = this.parseGenericTypeList();
        if (implGenerics === null) return this.restore();

        const trait = this.parseType();
        if (trait === null) return this.restore();

        const forToken = this.expect(a => a.type === "Keyword" && a.value === "for");
        if (forToken === null) return this.restore();

        const targetType = this.parseType();
        if (targetType === null) return this.restore();
        const _begin_curly = this.expectSymbol("{");
        if (_begin_curly === null) return this.restore();
        const functions = [];
        while (true) {
            if (this.eatIfThereIsSymbol("}")) break;
            const f = this.parseFunction();
            if (f === null) this.errorAt(this.tokens.justShifted(), "Expected function implementation");
            functions.push(f);
        }
        return this.finish(cn(implToken, this.tokens.justShifted(), {
            type: NodeKind.ImplTraitNode,
            defs: functions,
            generics: implGenerics,
            targetType,
            trait
        }))
    }

    parseStructDefinition(): Node | null {
        this.save();
        const structToken = this.expect(a => a.type === "Keyword" && (a.value === "struct" || a.value === "data"));
        if (structToken === null) return this.restore();
        const structName = this.expectOrTerm("Expected struct name", token => token.type === "Identifier");
        const generics = this.parseGenericTypeList();
        if (generics === null) return this.restore();

        const startCurly = this.expectSymbol("{");
        if (startCurly === null) this.errorAt(this.tokens.justShifted(), `Expected left curly`);
        const members: [string, TypeNode][] = [];
        while (true) {
            if (this.eatIfThereIsSymbol("}")) break;
            const name = this.expectOrTerm("Expected member name", token => token.type === "Identifier");
            this.expectOrTerm("Expected colon", token => token.type === "Symbol" && token.value === ":");
            const type = this.parseType();
            if (type === null) this.errorAt(this.tokens.justShifted(), `Expected member type`);
            members.push([name.name, type]);

            if (this.eatIfThereIsSymbol("}")) break;
            if (this.eatIfThereIsSymbol(",")) continue;
            this.errorAt(type, "Expected ending curly brackets or comma");
        }
        return this.finish(cn(structToken, this.tokens.justShifted(), {
            type:
                (structToken.type === "Keyword" && structToken.value === "data")
                    ? NodeKind.DataStructDefinitionNode
                    : NodeKind.StructDefinitionNode,
            generics,
            members,
            name: structName.name
        }))
    }

    parseReturnRule(): Node | null {
        this.save();
        const returnToken = this.expect(token => token.type === "Keyword" && token.value === "return");
        if (returnToken === null) return this.restore();
        const value = this.parseValue();
        if (value === null) this.errorAt(returnToken, `Expected return value`);
        return this.finish(cn(returnToken, value, {
            type: NodeKind.ReturnNode,
            value
        }));
    }
    parseIntrinsic(): Node | null {
        this.save();
        const intrinsicToken = this.expect(a => a.type === "Keyword" && a.value === "$intrinsic");
        if (intrinsicToken === null) return this.restore();
        const s = this.expectOrTerm("Expected intrinsic string literal", a => a.type === 'StringLiteral');
        return this.finish(cn(intrinsicToken, s, {
            type: NodeKind.IntrinsicNode,
            string: s.value
        }));
    }

    parseUseInterface() {
        this.save();
        const i = this.expect(a => a.type === "Keyword" && a.value === "useinterface");
        if (i === null) return this.restore();
        const s = this.expectOrTerm("expected interface name", a => a.type === "Identifier");
        return this.finish(cn(i, s, {
            type: NodeKind.UseInterfaceNode,
            string: s.name,
            nodes: []
        }))

    }
    parseImport(): Node | null {
        this.save();
        const i = this.expect(a => a.type === "Keyword" && a.value === "import");
        if (i === null) return this.restore();
        const s = this.expectOrTerm("expected import path", a => a.type === "StringLiteral");
        return this.finish(cn(i, s, {
            type: NodeKind.ImportNode,
            string: s?.value,
            nodes: []
        }))
    }
    parseDeclaration(): Node | null {
        this.save();
        const name = this.expect(t => t.type === "Identifier");
        if (name === null) return this.restore();
        const colon = this.expect(t => t.type === "Symbol" && t.value === ":");
        if (colon === null) return this.restore();
        const type = this.parseType();
        const equals = this.expect(t => t.type === "Symbol" && (t.value === "=" || t.value === ":"));
        if (equals === null) return this.restore();
        const value = this.parseValue();
        if (value === null) return this.restore();
        return this.finish(<Node>cn(name, value, <Node>{
            type: (equals.type === "Symbol" && equals.value === ":") ? NodeKind.ConstDeclarationNode : NodeKind.DeclarationNode,
            name: name.name,
            valueType: type,
            value
        }));
    }
    parseAssignment(): Node | null {
        this.save();
        const base = this.parseValue();
        if (base === null) return this.restore();
        const equals = this.expect(t => t.type === "Symbol" && t.value === "=");
        if (equals === null) return this.restore();
        const value = this.parseValue();
        if (value === null) return this.restore();
        return cn(base, value, {
            type: NodeKind.AssignmentNode,
            assignee: base,
            value
        });
    }
    VALID_ASSIGN_OPERATOR(
        op: ClawTokenType<"Symbol">["value"],
    ): op is
        | "+="
        | "-="
        | "*="
        | "/="
        | "%="
        | "^="
        | "|="
        | "&="
        | "||="
        | "&&=" {
        switch (op) {
            case "+=":
            case "-=":
            case "*=":
            case "/=":
            case "%=":
            case "^=":
            case "|=":
            case "&=":
            case "||=":
            case "&&=":
                return true;
            default:
                return false;
        }
    };
    OP_TO_OPERATOR(opequals: string) {
        switch (opequals) {
            case "+=":
                return BinaryOperationType.Add;
            case "-=":
                return BinaryOperationType.Subtract;
            case "*=":
                return BinaryOperationType.Multiply;
            case "/=":
                return BinaryOperationType.Divide;
            case "%=":
                return BinaryOperationType.Modulo;
            case "^=":
                return BinaryOperationType.BitwiseXor;
            case "|=":
                return BinaryOperationType.BitwiseOr;
            case "&=":
                return BinaryOperationType.BitwiseAnd;
            case "||=":
                return BinaryOperationType.Or;
            case "&&=":
                return BinaryOperationType.And;
            default:
                throw "unreachable";
        }
    };
    parseOpAssign(): Node | null {
        this.save();
        const base = this.parseValue();
        if (base === null) return this.restore();
        const opequals = this.expect((tok) =>
          tok.type === "Symbol" && this.VALID_ASSIGN_OPERATOR(tok.value)
        ) as ClawTokenType<"Symbol">;
        if (opequals === null) return this.restore();
        const value = this.parseValue();
        if (value === null) return this.restore();
        return this.finish(cn(base, value, {
          type: NodeKind.AssignmentNode,
          assignee: base,
          value: cn(value, value, {
            type: NodeKind.BinaryOperation,
            oper: this.OP_TO_OPERATOR(opequals.value),
            left: base,
            right: value,
          }),
        }));
    }
    parseType(): TypeNode | null {
        return this.try(
            this.parseBaseType,
            this.parseGroupType,
            this.parseOfType,
        )
    }
    parseGroupType(): TypeNode | null {
        this.save();
        const _left_paren = this.expectSymbol("(")
        if (_left_paren === null) return this.restore();
        const inner = this.parseType();
        if (inner === null) return this.restore();
        const _right_paren = this.expectSymbol(")")
        if (_right_paren === null) return this.restore();
        return this.finish(inner);
    }
    parseOfType(): OfTypeNode | null {
        this.save();
        const traitName = this.parseType();
        if (traitName === null) return this.restore();
        const _right_paren = this.expectSymbol(".")
        if (_right_paren === null) return this.restore();
        const traitType = this.parseType();
        if (traitType === null) return this.restore();
        const _of_keyword = this.expect(t => t.type === "Keyword" && t.value === "of")
        if (_of_keyword === null) return this.restore();
        const inner = this.parseType();
        if (inner === null) return this.restore();
        return this.finish(cn(traitName, inner, {
            type: NodeKind.OfTypeNode,
            baseType: inner,
            int: traitName,
            intType: traitType
        }));
    }
    parseBaseType(): TypeNode | null {
        this.save()
        const bounds: string[] = [];
        const name = this.expect(a => a.type === "Identifier");
        if (name === null) return this.restore();
        const generics: TypeNode[] | null = this.generateTypeList(); 
        if (generics === null) return this.restore();
        while (this.eatIfThereIsSymbol("+")) {
            const boundName = this.expect(a => a.type === "Identifier");
            if (boundName === null) return this.restore();
            bounds.push(boundName.name);
        }
        return this.finish(cn(name, name, {
            type: NodeKind.NormalTypeNode,
            name: name.name,
            ref: false,
            typeArguments: generics,
            bounds
        }));
    }

    generateTypeList(): TypeNode[] | null {
        this.save();
        const generics = [];
        if (this.eatIfThereIs(t => t.type === "Symbol" && t.value === "<")) {
            while (true) {
                if (this.eatIfThereIsSymbol(">")) break;
                const v = this.parseType();
                if (v === null) return this.restore();
                generics.push(v);

                if (this.eatIfThereIsSymbol(">")) break;
                if (this.eatIfThereIsSymbol(",")) continue;
            }
        }

        return this.finish(generics);
    }

    parseFunctionArgs(
        lhs: Node,
        typeArgs: TypeNode[] | null,
    ) {
        this.save();
        const args: Node[] = [];
        while (true) {
            if (this.eatIfThereIsSymbol(")")) break;
            const v = this.parseValue();
            if (v === null) return this.restore();
            args.push(v);

            if (this.eatIfThereIsSymbol(")")) continue;
            if (this.eatIfThereIsSymbol(",")) break;
            this.errorAt(this.tokens.justShifted(), `Expected commas or parentheses`);
        }
        return this.finish(cn(lhs, this.tokens.justShifted(), {
            type: NodeKind.CallNode,
            typeArguments: typeArgs,
            callee: lhs,
            arguments: args
        }))
    }

    tryParseFunctionWithTypeArgs(lhs: Node): Node | null {
        this.save();
        const p = this.expectSymbol("<");
        if (p === null) return this.restore();
        const typeArgs: TypeNode[] = [];
        while (true) {
            if (this.eatIfThereIsSymbol(">")) break;
            const v = this.parseType();
            if (v === null) return this.restore();
            typeArgs.push(v);

            if (this.eatIfThereIsSymbol(",")) continue;
            if (this.eatIfThereIsSymbol(">")) break;
        }
        const leftParen = this.expectSymbol("(");
        if (leftParen === null) return this.restore();
        const v = this.parseFunctionArgs(lhs, typeArgs);
        if (v === null) return this.restore();
        lhs = v;
        return this.finish(lhs);
    }
    parseFunctionCall(lhs: Node): Node | null {
        this.save();
        const leftParen = this.expectSymbol("(");
        if (leftParen === null) return this.restore();
        const v = this.parseFunctionArgs(lhs, null);
        if (v === null) return this.restore();
        lhs = v;
        return this.finish(lhs);
    }

    parseValue(): Node | null {
        return this.parseBinaryOperator()
    }

    parseStructLiteral(): Node | null {
        this.save();
        const type = this.parseType();
        if (type === null) return this.restore();
        const colon1 = this.expectSymbol(":");
        if (colon1 === null) return this.restore();
        const colon2 = this.expectSymbol(":");
        if (colon2 === null) return this.restore();
        const startCurly = this.expectSymbol("{");
        if (startCurly === null) return this.restore();
        const members: {[key: string]: Node} = {};
        while (true) {
            if (this.eatIfThereIsSymbol("}")) break;
            const name = this.expectOrTerm("Expected struct member key", v => v.type === "Identifier");
            this.expectOrTerm("Expected colon", v => v.type === "Symbol" && v.value === ":");
            const value = this.parseValue();
            if (value === null) return this.restore();
            members[name.name] = value;
            if (this.eatIfThereIsSymbol(",")) continue;
            if (this.eatIfThereIsSymbol("}")) break;
            this.errorAt(value, `Expected comma or right curly`);
        }
        return this.finish(cn(type, this.tokens.justShifted(), {
            type: NodeKind.StructLiteralNode,
            baseType: type,
            members
        }));
        // todo
    }

    parseChild(lhs: Node): Node | null {
        this.save();
        const _dot = this.expectSymbol(".");
        if (_dot === null) return this.restore();
        const name = this.expect(a => a.type === "Identifier");
        if (name === null) return this.restore();
        return cn(lhs, name, {
            type: NodeKind.ChildOfNode,
            base: lhs,
            extension: name.name
        });
    }

    parseUnaryOperator(): Node | null {
        this.save();
        const peek = this.tokens.peek();
        if (peek === undefined) return null;
        if (peek.type === "Symbol") {
            if (["!", "~", "-"].includes(peek.value)) {
                const opToken = this.tokens.shift();
                const rhs = this.parseUnaryOperator();
                if (rhs === null) return this.restore();
                return this.finish(cn(opToken, rhs, {
                    type: NodeKind.UnaryOperation,
                    value: rhs,
                    oper: (() => {
                        switch ((opToken as ClawTokenType<"Symbol">).value) {
                            case "!":
                                return UnaryOperationType.Not;
                            case "~":
                                return UnaryOperationType.BitwiseNot;
                            case "-":
                                return UnaryOperationType.Negate;
                            default:
                                throw "unreachable";
                        }
                    })(),
                }));
            }
        }
        return this.finish(this.parseMemberAccess());
    }
    parseBinaryOperator(): Node | null {
        const BINARY_OPERATOR_TO_PRECEDENCE = {
            "||": [BinaryOperationType.Or, 1],
            "&&": [BinaryOperationType.And, 2],
            "|": [BinaryOperationType.BitwiseOr, 3],
            "^": [BinaryOperationType.BitwiseXor, 4],
            "&": [BinaryOperationType.BitwiseAnd, 5],
            "==": [BinaryOperationType.Equal, 6],
            "!=": [BinaryOperationType.NotEqual, 6],
            ">": [BinaryOperationType.Gt, 7],
            ">=": [BinaryOperationType.Gte, 7],
            "<": [BinaryOperationType.Lt, 7],
            "<=": [BinaryOperationType.Lte, 7],
            "+": [BinaryOperationType.Add, 8],
            "-": [BinaryOperationType.Subtract, 8],
            "*": [BinaryOperationType.Multiply, 9],
            "/": [BinaryOperationType.Divide, 9],
            "%": [BinaryOperationType.Modulo, 9],
        };
        type BKey = keyof typeof BINARY_OPERATOR_TO_PRECEDENCE;
        const parseExpression = (lhs: Node, minPrecedence: number) => {
            let lookahead = this.tokens.peek();
            while (
                lookahead !== undefined &&
                lookahead.type === "Symbol" &&
                lookahead.value in BINARY_OPERATOR_TO_PRECEDENCE &&
                BINARY_OPERATOR_TO_PRECEDENCE[lookahead.value as BKey][1] >=
                minPrecedence
            ) {
                const op = this.tokens.shift() as ClawTokenType<"Symbol">;
                const opPrec = BINARY_OPERATOR_TO_PRECEDENCE[op.value as BKey][1];
                let rhs = this.parseUnaryOperator();
                if (rhs === null) return null;
                
                lookahead = this.tokens.peek();
                while (
                    lookahead !== undefined &&
                    lookahead.type === "Symbol" &&
                    lookahead.value in BINARY_OPERATOR_TO_PRECEDENCE &&
                    (
                        BINARY_OPERATOR_TO_PRECEDENCE[lookahead.value as BKey][1] >
                        opPrec
                    )
                ) {
                    rhs = parseExpression(
                        rhs!,
                        opPrec +
                        +(BINARY_OPERATOR_TO_PRECEDENCE[lookahead.value as BKey][
                            1
                        ] > opPrec),
                    );
                    lookahead = this.tokens.peek();
                    if (lookahead === undefined) break;
                }
                lhs = cn(lhs, rhs!, {
                    type: NodeKind.BinaryOperation,
                    oper: BINARY_OPERATOR_TO_PRECEDENCE[op.value as BKey][0],
                    left: lhs,
                    right: rhs,
                }) as Node;
            }
            return lhs;
        };

        const init = this.parseUnaryOperator();
        if (init === null) return this.restore();
        const v = parseExpression(init, 0);
        if (v === null) return this.restore();
        return v;
    }

    parseMethodAccess(lhs: Node): Node | null {
        this.save();
        const _dot = this.expectSymbol(":");
        if (_dot === null) return this.restore();
        const name = this.expect(a => a.type === "Identifier");
        if (name === null) return this.restore();
        return cn(lhs, name, {
            type: NodeKind.MethodOfNode,
            base: lhs,
            extension: name.name
        });
    }

    parseMemberAccess(): Node | null {
        this.save();
        let lhs = this.parseLiteral();
        if (lhs === null) return this.restore();
        const operatorNext = () => {
            const p = this.tokens.peek();
            if (p === undefined) return false
            if (
              p.type === "Symbol" &&
              (p.value === "<" || p.value === "(" || p.value === "." ||
                p.value === ":")
            ) return true;
            return false;
        };

        while (operatorNext()) {
            if ((this.tokens.peek() as ClawTokenType<"Symbol">).value === "<") {
                const r = this.tryParseFunctionWithTypeArgs(lhs);
                if (r === null) break;
                else {
                    lhs = r;
                    continue;
                }
            }
            return this.try(
                () => this.parseFunctionCall(lhs!),
                () => this.parseMethodAccess(lhs!),
                () => this.parseChild(lhs!)
            )
        }
        return this.finish(lhs);
    }

    parseLiteral(): Node | null {
        this.save();
        const peek = this.tokens.shift();
        if (peek.type === "NumericLiteral") {
            return this.finish(cn(peek, peek, {
                type: NodeKind.NumberNode,
                value: peek.value
            }))
        }
        if (peek.type === "StringLiteral") {
            return this.finish(cn(peek, peek, {
                type: NodeKind.StringNode,
                value: peek.value
            }))
        }
        if (peek.type === "BooleanLiteral") {
            return this.finish(cn(peek, peek, {
                type: NodeKind.BooleanNode,
                value: peek.value
            }))
        }
        if (peek.type === "Identifier") {
            return this.finish(cn(peek, peek, {
                type: NodeKind.VariableNode,
                name: peek.name
            }))
        }
        if (peek.type === "Symbol" && peek.value === "(") {
            const value = this.parseValue();
            if (value === null) return this.restore();
            const _end = this.expectSymbol(")");
            if (_end === null) return this.restore();
            return this.finish(cn(peek, _end, {
                type: NodeKind.Grouping,
                value
            }))
        }
        if (peek.type === "Symbol" && peek.value === "{") {
            const blocks = [];
            let end: Loc = peek;
            while (true) {
                if (this.eatIfThereIsSymbol("}")) break;
                blocks.push(end = this.parseStatement());
                if (end === null) return this.restore();
            }
            return this.finish(cn(peek, end, {
                type: NodeKind.BlockNode,
                nodes: blocks
            }));
        }
        if (peek.type === "Symbol" && peek.value === "!{") {
            const blocks = [];
            let end: Loc = peek;
            while (true) {
                if (this.eatIfThereIsSymbol("}")) break;
                blocks.push(end = this.parseStatement());
                if (end === null) return this.restore();
            }
            return this.finish(cn(peek, end, {
                type: NodeKind.LabelNode,
                nodes: blocks
            }));
        }
        this.load();
        const structLit = this.parseStructLiteral();
        if (structLit !== null) return structLit
        
        return this.finish(null)
    }
}