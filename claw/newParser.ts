import { ClawToken, ClawTokenType, Loc, TSymbol } from "./lexer.ts";
import { BaseNode, DeclarationNode, Node, NodeKind, OfTypeNode, TypeNode } from "./nodes.ts";
import { SourceMap } from "./sourcemap.ts";

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
        for (const fn of fns) {
            const v = fn.bind(this)();
            if (v !== null) return v;
        }
        return null
    }

    save() {
        console.log('save:', this.tokens.iterator, new Error().stack!.split("\n")[2])
        this.state.push(this.tokens.iterator);
    }
    restore() {
        this.tokens.iterator = this.state.pop()!;
        console.log('restore:', this.tokens.iterator)
        return null;
    }
    finish<T>(v: T): T {
        this.state.pop();
        return v;
    }

    expect<F extends (token: ClawToken) => unknown>(pred: F): ApplyTypePredicate<F, ClawToken> | null {
        const v = this.tokens.shift()
        if (v === undefined) return null;
        if (!pred(v)) return null;
        return v as ApplyTypePredicate<F, ClawToken>;
    }
    expectSymbol<F extends (token: ClawTokenType<"Symbol">) => unknown>(symbolType: TSymbol): ApplyTypePredicate<F, ClawToken> | null {
        const v = this.tokens.shift()
        if (v === undefined) return null;
        if (v.type !== "Symbol") return null;
        if (v.value !== symbolType) return null;
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
        console.log(type, this.tokens)
        const equals = this.expect(t => t.type === "Symbol" && t.value === "=");
        if (equals === null) return this.restore();
        const value = this.parseValue();
        if (value === null) return this.restore();
        return null;
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
        while (this.expectSymbol("+") !== null) {
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
        if (this.expectSymbol("<") !== null) {
            while (true) {
                if (this.expectSymbol(">") !== null) break;
                const v = this.parseType();
                if (v === null) return this.restore();
                generics.push(v);

                if (this.expectSymbol(">") !== null) break;
                if (this.expectSymbol(",") !== null) continue;
            }
        }

        return this.finish(generics);
    }
    parseValue(): Node | null {
        return null 
    }
}