import { LogLevel } from "../SkOutput.ts";
import { EZP } from "../SkOutput.ts";
import { logger } from "../src/main.ts";
import { ClawToken, ClawTokenType, Loc } from "./lexer.ts"
import { BinaryOperationType, UnaryOperation } from "./nodes.ts";
import { UnaryOperationType } from "./nodes.ts";
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
        const sh = new SourceHelper(sourcemap.get(tokens?.[0]?.fp) ?? "");
        this.ezp = new EZP<ClawToken, Node>(tokens, (tok) => {
            const [row, col] = sh.getColRow(tok.start);
            return [tok.fp, row + 1, col + 1];
        });
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
            const literalRule = ezp.instantiateRule("literal", ezp => {
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
                const groupingRule = ezp.addRule("(<value>)", ezp => {
                    const ident = ezp.expect(token => token.type === "Symbol" && token.value === "(");
                    const value = ezp.expectRule(valueRule);
                    const end = ezp.expect(token => token.type === "Symbol" && token.value === ")");
                    return cn(ident, end, {
                        type: NodeKind.Grouping,
                        value
                    })
                })
                return ezp.giveLastThatWorks(groupingRule, variableRule, numberRule, stringRule)
            });
            const precedence2 = ezp.instantiateRule("call or member access", ezp => {
                let lhs = ezp.expectRule(literalRule);
                const operatorNext = () => {
                    const p = ezp.peek();
                    if (p === undefined) return false;
                    if (p.type === "Symbol" && (p.value === "<" || p.value === "(" || p.value === ".")) return true;
                    return false;
                };
                const parseFunctionArguments = (leftLoc: Loc, typeArgs: Nodify<TypeNode>[] | null) => {
                    // function call
                    const args: Node[] = [];
                    let end: Loc = leftLoc;
                    while (true) {
                        if (ezp.peekAnd(t => t.type === "Symbol" && t.value === ")")) {
                            end = ezp.consume();
                            break;
                        }
                        
                        args.push(ezp.expectRule(valueRule));
                        if (ezp.peekAnd(t => t.type === "Symbol" && t.value === ")")) {
                            end = ezp.consume();
                            break;
                        }
                        else if (ezp.peekAnd(t => t.type === "Symbol" && t.value === ",")) {
                            end = ezp.consume();
                            continue;
                        }
                        throw new Error("Expected comma or parentheses");
                    }
                    lhs = cn(lhs, end, {
                        type: NodeKind.CallNode,
                        typeArguments: typeArgs,
                        callee: lhs,
                        arguments: args
                    });
                }
                while (operatorNext()) {
                    const p = ezp.consume();
                    if (p.type === "Symbol" && p.value === "(") {
                        parseFunctionArguments(p, null);
                        continue;
                    } else if (p.type === "Symbol" && p.value === "<") {
                        // function call
                        const typeArgs: Nodify<TypeNode>[] = [];
                        let end: Loc = p;
                        while (true) {
                            if (ezp.peekAnd(t => t.type === "Symbol" && t.value === ">")) {
                                end = ezp.consume();
                                break;
                            }
                            typeArgs.push(ezp.expectRule(typeRule));
                            if (ezp.peekAnd(t => t.type === "Symbol" && t.value === ">")) {
                                end = ezp.consume();
                                break;
                            }
                            else if (ezp.peekAnd(t => t.type === "Symbol" && t.value === ",")) {
                                end = ezp.consume();
                                continue;
                            }
                            throw new Error("Expected comma or right angle bracket");
                        }
                        parseFunctionArguments(end, typeArgs);
                        continue;
                    }
                }
                return lhs;
            })
            const unaryOperatorRule = ezp.instantiateRule("unary operation", (ezp): Node => {
                const peek = ezp.peek();
                if (peek.type === 'Symbol') {
                    if (["!", "~", "-"].includes(peek.value)) {
                        const opToken = ezp.consume() as ClawTokenType<"Symbol">;
                        const rhs = ezp.expectRule(unaryOperatorRule);
                        return cn(opToken, rhs, {
                            type: NodeKind.UnaryOperation,
                            value: rhs,
                            oper: (() => {
                                switch(opToken.value) {
                                    case "!": return UnaryOperationType.Not;
                                    case "~": return UnaryOperationType.BitwiseNot;
                                    case "-": return UnaryOperationType.Negate;
                                    default: throw "unreachable";
                                }
                            })()
                        });
                    }
                }
                return ezp.expectRule(precedence2);
            })
            const binaryOperatorRule = ezp.instantiateRule("binary operation", ezp => {
                const BINARY_OPERATOR_TO_PRECEDENCE = {
                    "||": [BinaryOperationType.Or, 1],
                    "&&": [BinaryOperationType.And, 2],
                    "|": [BinaryOperationType.BitwiseOr, 3],
                    "^": [BinaryOperationType.BitwiseXor, 4],
                    "&": [BinaryOperationType.BitwiseAnd, 5],
                    "==": [BinaryOperationType.Equal, 6],
                    "!=": [BinaryOperationType.NotEqual, 6],
                    ">": [BinaryOperationType.NotEqual, 7],
                    ">=": [BinaryOperationType.NotEqual, 7],
                    "<": [BinaryOperationType.NotEqual, 7],
                    "<=": [BinaryOperationType.NotEqual, 7],
                    "+": [BinaryOperationType.Add, 8],
                    "-": [BinaryOperationType.Subtract, 8],
                    "*": [BinaryOperationType.Multiply, 9],
                    "/": [BinaryOperationType.Divide, 9],
                    "%": [BinaryOperationType.Modulo, 9],
                }
                type BKey = keyof typeof BINARY_OPERATOR_TO_PRECEDENCE;
                const parseExpression = function(lhs: Node, minPrecedence: number) {
                    let lookahead = ezp.peek();
                    while (
                        lookahead !== undefined
                     && lookahead.type === "Symbol" 
                     && lookahead.value in BINARY_OPERATOR_TO_PRECEDENCE
                     && BINARY_OPERATOR_TO_PRECEDENCE[lookahead.value as BKey][1] >= minPrecedence
                    ) {
                        const op = ezp.consume() as ClawTokenType<"Symbol">;
                        const opPrec = BINARY_OPERATOR_TO_PRECEDENCE[op.value as BKey][1];
                        let rhs = ezp.expectRule(unaryOperatorRule);
                        lookahead = ezp.peek();
                        while (
                            lookahead !== undefined
                         && lookahead.type === "Symbol"
                         && lookahead.value in BINARY_OPERATOR_TO_PRECEDENCE
                         && (
                            BINARY_OPERATOR_TO_PRECEDENCE[lookahead.value as BKey][1] > opPrec
                         )
                        ) {
                            rhs = parseExpression(rhs, opPrec + +(BINARY_OPERATOR_TO_PRECEDENCE[lookahead.value as BKey][1] > opPrec))
                            lookahead = ezp.peek();
                            if (lookahead === undefined) break;
                        }
                        lhs = cn(lhs, rhs, {
                            type: NodeKind.BinaryOperation,
                            oper: BINARY_OPERATOR_TO_PRECEDENCE[op.value as BKey][0],
                            left: lhs,
                            right: rhs
                        })
                    }
                    return lhs
                }
                /*
                parse_expression_1(lhs, min_precedence)
                    lookahead := peek next token
                    while lookahead is a binary operator whose precedence is >= min_precedence
                        op := lookahead
                        advance to next token
                        rhs := parse_primary ()
                        lookahead := peek next token
                        while lookahead is a binary operator whose precedence is greater
                                than op's, or a right-associative operator
                                whose precedence is equal to op's
                            rhs := parse_expression_1 (rhs, precedence of op + (1 if lookahead precedence is greater, else 0))
                            lookahead := peek next token
                        lhs := the result of applying op with operands lhs and rhs
                    return lhs
                    */
                return parseExpression(ezp.expectRule(unaryOperatorRule), 0);
            });
            return ezp.giveLastThatWorks(binaryOperatorRule, unaryOperatorRule, precedence2, literalRule);
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