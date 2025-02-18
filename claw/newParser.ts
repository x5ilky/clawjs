import { LogLevel } from "../SkOutput.ts";
import { logger } from "../src/main.ts";
import { ClawToken, ClawTokenType, Loc, TSymbol } from "./lexer.ts";
import { BaseNode, DeclarationNode, Node, NodeKind, OfTypeNode, TypeNode } from "./nodes.ts";
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
}
type ApplyTypePredicate<T, E> = (T extends (value: E) => value is (infer R extends E) ? R : E) ;

export class Parser {
    tokens: Iterray<ClawToken>;
    state: number[];
    constructor(tokens: ClawToken[], private sourcemap: SourceMap) {
        this.tokens = new Iterray(tokens);
        this.state = [];
    }

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
        ], `At ${location.fp}:${col + 1}:${row}:`);
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
        while(this.tokens.hasItems()) nodes.push(this.parseStatement())
        return nodes
    }

    parseStatement() {
        const peek = this.tokens.peek();
        const decl = this.parseDeclaration();
        if (decl !== null) return decl;
        throw new Error("no statement matched")
    }

    parseDeclaration(): DeclarationNode | null {
        this.save();
        const name = this.expect(t => t.type === "Identifier");
        if (name === null) return this.restore();
        const colon = this.expect(t => t.type === "Symbol" && t.value === ":");
        if (colon === null) return this.restore();
        const type = this.parseType();
        const equals = this.expect(t => t.type === "Symbol" && t.value === "=");
        if (equals === null) return this.restore();
        const value = this.parseValue();
        if (value === null) return this.restore();
        return cn(name, value, {
            type: NodeKind.DeclarationNode,
            name: name.name,
            valueType: type,
            value
        });
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
            console.log(this.tokens.iterator)
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
    parseValue(): Node | null {
        return this.try(
            this.parseLiteral
        )
    }

    parseStructLiteral(): Node | null {
        this.save();
        const type = this.parseType();
        if (type === null) return this.restore();
        const colon1 = this.expectSymbol(":")
        if (colon1 === null) return this.restore();
        const colon2 = this.expectSymbol(":")
        if (colon2 === null) return this.restore();
        const startCurly = this.expectSymbol("{")
        if (startCurly === null) return this.restore();
        const members: {[key: string]: Node} = {};
        let left: Loc = startCurly;
        while (true) {
            if (this.eatIfThereIsSymbol("}")) break;
            const name = this.expectOrTerm("Expected struct member key", v => v.type === "Identifier");
            const colon = this.expectOrTerm("Expected colon", v => v.type === "Symbol" && v.value === ":");
            const value = this.parseValue();
            if (value === null) return this.restore();
            members[name.name] = value;
            if (this.eatIfThereIsSymbol(",")) continue;
            if (this.eatIfThereIsSymbol("}")) break;
            this.errorAt(value, `Expected comma or right curly`);
        }
        // todo
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
        
        return this.finish(null)
    }
}