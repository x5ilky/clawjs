import { LogLevel } from "../SkOutput.ts";
import { EZP } from "../SkOutput.ts";
import { logger } from "../src/main.ts";
import { ClawToken, ClawTokenType } from "./lexer.ts"
import { BaseNode, Node, NodeKind, Nodify, TypeNode } from "./nodes.ts";
import { SourceMap } from "./sourcemap.ts";
import { SourceHelper } from "./sourceUtil.ts";

// construct node
function cn<T extends BaseNode>(start: {start: number, end: number, fp: string}, end: {start: number, end: number, fp: string}, value: T): Nodify<T> {
    return {
        start: start.start,
        end: end.end,
        fp: start.fp,
        ...value
    }
}
export class Parser {
    ezp: EZP<ClawToken, Node>
    constructor(tokens: ClawToken[], private sourcemap: SourceMap) {
        this.ezp = new EZP<ClawToken, Node>(tokens);
        const typeRule = this.ezp.instantiateRule<ClawToken, Nodify<TypeNode>>("type", (ezp) => {
            let ref = false;
            if (ezp.doesNext(token => token.type === "Symbol" && token.value === "&")) {
                ezp.consume();
                ref = true;
            }
            const name = ezp.expect(token => token.type === "Identifier") as ClawTokenType<"Identifier">;
            const generics: Nodify<TypeNode>[] = [];
            if (ezp.doesNext(token => token.type === "Symbol" && token.value === "<")) {
                // start generics
                const _start_left = ezp.consume();
                while (true) {
                    if (ezp.doesNext(token => token.type === "Symbol" && token.value === ">")) {
                        const _end_right = ezp.consume();
                        return cn(name, _end_right, {
                            type: NodeKind.TypeNode,
                            name: name.name,
                            ref,
                            typeArguments: generics
                        });
                    }
                    const type = ezp.expectRule(typeRule);
                    generics.push(type as Nodify<TypeNode>)
                    if (ezp.doesNext(token => token.type === "Symbol" && token.value === ">")) continue;
                    ezp.expect(token => token.type === "Symbol" && token.value === ",")
                }
            }
            return cn(name, name, {
                type: NodeKind.TypeNode,
                name: name.name,
                ref,
                typeArguments: generics
            })
        });
        const valueRule = this.ezp.instantiateRule("value", ezp => {
            const literalRule = this.ezp.instantiateRule("literal", ezp => {
                const numberRule = ezp.addRule("number", ezp => {
                    const numberToken = ezp.expect(token => token.type === "NumericLiteral") as ClawTokenType<"NumericLiteral">
                    return cn(numberToken, numberToken, {
                        type: NodeKind.NumberNode,
                        value: numberToken.value
                    });
                });
                const stringRule = ezp.addRule("string", ezp => {
                    const stringToken = ezp.expect(token => token.type === "StringLiteral") as ClawTokenType<"StringLiteral">;
                    return cn(stringToken, stringToken, {
                        type: NodeKind.StringNode,
                        value: stringToken.value
                    });
                })
                const variableRule = ezp.addRule("variable", ezp => {
                    const ident = ezp.expect(token => token.type === "Identifier") as ClawTokenType<"Identifier">;
                    return cn(ident, ident, {
                        type: NodeKind.VariableNode,
                        name: ident.name
                    });
                });
                return ezp.giveLastThatWorks(variableRule, numberRule, stringRule)
            })
            return ezp.giveLastThatWorks(literalRule)
        })
        this.ezp.addRule("statement", ezp => {
            if (ezp.doesNext(token => token.type === "Identifier")) {
                const name = ezp.consume() as ClawTokenType<"Identifier">;
                if (ezp.doesNext(token => token.type === "Symbol" && token.value === ":")) {
                    // variable decl
                    const _colon = ezp.consume();
                    const type = ezp.tryRule(typeRule);
                    const _equals = ezp.expect(tok => tok.type === "Symbol" && tok.value === "=");
                    const value = ezp.expectRule(valueRule);
                    return cn(name, value, {
                        type: NodeKind.DeclarationNode,
                        name: name.name,
                        valueType: type,
                        value
                    })
                }
            }
            throw new Error("None matched")
        })
    }

    parse() {
        return this.ezp.parse()
    }

    errorAt(location: {start: number, end: number, fp: string}, message: string): never {
        const sh = new SourceHelper(this.sourcemap.get(location.fp)!);
        sh.getLines(location.start, location.end);
        logger.printWithTags([
            logger.config.levels[LogLevel.ERROR],
            {
                color: [196, 34, 235],
                priority: -20,
                name: "PARSER"
            }
        ], `${message}`);
        Deno.exit(1);
    }
}