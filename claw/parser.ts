import { EZP, EZPError, LogLevel } from "../SkOutput.ts";
import { logger } from "../src/main.ts";
import { ClawToken, ClawTokenType, Loc } from "./lexer.ts";
import {
  BaseNode,
  BinaryOperationType,
  Node,
  NodeKind,
  Nodify,
  TypeNode,
  UnaryOperationType,
} from "./nodes.ts";
import { SourceMap } from "./sourcemap.ts";
import { SourceHelper } from "./sourceUtil.ts";

// construct node
function cn<T extends BaseNode>(
  start: { start: number; end: number; fp: string },
  end: { start: number; end: number; fp: string },
  value: T,
): Nodify<T> {
  return {
    start: start.start,
    end: end.end,
    fp: start.fp,
    ...value,
  };
}
export class Parser {
  ezp: EZP<ClawToken, Node>;
  constructor(tokens: ClawToken[], private sourcemap: SourceMap) {
    const sh = new SourceHelper(sourcemap.get(tokens?.[0]?.fp) ?? "");
    this.ezp = new EZP<ClawToken, Node>(tokens, (tok) => {
      const [row, col] = sh.getColRow(tok.start);
      return [tok.fp, row + 1, col + 1];
    });
    const typeRule = this.ezp.instantiateRule<ClawToken, Nodify<TypeNode>>(
      "type",
      (ezp) => {
        let ref = false;
        if (
          ezp.doesNext((token) =>
            token.type === "Symbol" && token.value === "&"
          )
        ) {
          ezp.consume();
          ref = true;
        }
        const name = ezp.expect((token) =>
          token.type === "Identifier"
        ) as ClawTokenType<"Identifier">;
        const generics: Nodify<TypeNode>[] = [];
        if (
          ezp.doesNext((token) =>
            token.type === "Symbol" && token.value === "<"
          )
        ) {
          // start generics
          const _start_left = ezp.consume();
          while (true) {
            if (
              ezp.doesNext((token) =>
                token.type === "Symbol" && token.value === ">"
              )
            ) {
              const _end_right = ezp.consume();
              return cn(name, _end_right, {
                type: NodeKind.TypeNode,
                name: name.name,
                ref,
                typeArguments: generics,
              });
            }
            const type = ezp.expectRule(typeRule);
            generics.push(type as Nodify<TypeNode>);
            if (
              ezp.doesNext((token) =>
                token.type === "Symbol" && token.value === ">"
              )
            ) continue;
            ezp.expect((token) =>
              token.type === "Symbol" && token.value === ","
            );
          }
        }
        return cn(name, name, {
          type: NodeKind.TypeNode,
          name: name.name,
          ref,
          typeArguments: generics,
        });
      },
    );
    const valueRule = this.ezp.instantiateRule("value", (ezp) => {
      const literalRule = ezp.instantiateRule("literal", (ezp) => {
        const numberRule = ezp.addRule("number", (ezp) => {
          const numberToken = ezp.expect((token) =>
            token.type === "NumericLiteral"
          ) as ClawTokenType<"NumericLiteral">;
          return cn(numberToken, numberToken, {
            type: NodeKind.NumberNode,
            value: numberToken.value,
          });
        });
        const stringRule = ezp.addRule("string", (ezp) => {
          const stringToken = ezp.expect((token) =>
            token.type === "StringLiteral"
          ) as ClawTokenType<"StringLiteral">;
          return cn(stringToken, stringToken, {
            type: NodeKind.StringNode,
            value: stringToken.value,
          });
        });
        const variableRule = ezp.addRule("variable", (ezp) => {
          const ident = ezp.expect((token) =>
            token.type === "Identifier"
          ) as ClawTokenType<"Identifier">;
          return cn(ident, ident, {
            type: NodeKind.VariableNode,
            name: ident.name,
          });
        });
        const groupingRule = ezp.addRule("(<value>)", (ezp) => {
          const ident = ezp.expect((token) =>
            token.type === "Symbol" && token.value === "("
          );
          const value = ezp.expectRule(valueRule);
          const end = ezp.expect((token) =>
            token.type === "Symbol" && token.value === ")"
          );
          return cn(ident, end, {
            type: NodeKind.Grouping,
            value,
          });
        });
        const blockRule = ezp.addRule("block", (ezp) => {
          const _start = ezp.expect((token) =>
            token.type === "Symbol" && token.value === "{"
          );
          const blocks = [];
          let end: Loc = _start;
          while (true) {
            if (
              ezp.peekAnd((token) =>
                token.type === "Symbol" && token.value === "}"
              )
            ) {
              end = ezp.consume();
              break;
            }
            blocks.push(
              end = ezp.expectRuleOrTerm(
                "Expected statement inside block",
                statementRule,
              ),
            );
          }
          return cn(_start, end, {
            type: NodeKind.BlockNode,
            nodes: blocks,
          });
        });
        const labelRule = ezp.addRule("label", (ezp) => {
          const _start = ezp.expect((token) =>
            token.type === "Symbol" && token.value === "!{"
          );
          const blocks = [];
          let end: Loc = _start;
          while (true) {
            if (
              ezp.peekAnd((token) =>
                token.type === "Symbol" && token.value === "}"
              )
            ) {
              end = ezp.consume();
              break;
            }
            blocks.push(
              end = ezp.expectRuleOrTerm(
                "Expected statement inside block",
                statementRule,
              ),
            );
          }
          return cn(_start, end, {
            type: NodeKind.LabelNode,
            nodes: blocks,
          });
        });
        return ezp.getFirstThatWorksOrTerm(
          "Expected a value",
          groupingRule,
          variableRule,
          numberRule,
          stringRule,
          blockRule,
          labelRule,
        );
      });
      const precedence2 = ezp.instantiateRule(
        "call or member access",
        (ezp) => {
          let lhs = ezp.expectRuleOrTerm("Expected value", literalRule);
          const operatorNext = (ezp: EZP<ClawToken, Node>) => {
            const p = ezp.peek();
            if (p === undefined) return false;
            if (
              p.type === "Symbol" &&
              (p.value === "<" || p.value === "(" || p.value === "." ||
                p.value === ":")
            ) return true;
            return false;
          };
          const parseFunctionArguments = (
            leftLoc: Loc,
            typeArgs: Nodify<TypeNode>[] | null,
            ezp: EZP<ClawToken, Node>,
          ) => {
            // function call
            const args: Node[] = [];
            let end: Loc = leftLoc;
            while (true) {
              if (ezp.peekAnd((t) => t.type === "Symbol" && t.value === ")")) {
                end = ezp.consume();
                break;
              }

              args.push(ezp.expectRule(valueRule));
              if (ezp.peekAnd((t) => t.type === "Symbol" && t.value === ")")) {
                end = ezp.consume();
                break;
              } else if (
                ezp.peekAnd((t) => t.type === "Symbol" && t.value === ",")
              ) {
                end = ezp.consume();
                continue;
              }
              throw new Error("Expected comma or parentheses");
            }
            lhs = cn(lhs, end, {
              type: NodeKind.CallNode,
              typeArguments: typeArgs,
              callee: lhs,
              arguments: args,
            });
          };
          const functionCallRule = ezp.instantiateRule(
            "function call",
            (ezp) => {
              const p = ezp.expect((token) =>
                token.type === "Symbol" && token.value === "("
              );
              parseFunctionArguments(p, null, ezp);
              return lhs;
            },
          );
          const functionWithTypeArgsRule = ezp.instantiateRule(
            "function call with generics",
            (ezp) => {
              const p = ezp.expect((token) =>
                token.type === "Symbol" && token.value === "<"
              );
              const typeArgs: Nodify<TypeNode>[] = [];
              let end: Loc = p;
              while (true) {
                if (
                  ezp.peekAnd((t) => t.type === "Symbol" && t.value === ">")
                ) {
                  end = ezp.consume();
                  break;
                }
                typeArgs.push(ezp.expectRule(typeRule));
                if (
                  ezp.peekAnd((t) => t.type === "Symbol" && t.value === ">")
                ) {
                  end = ezp.consume();
                  break;
                } else if (
                  ezp.peekAnd((t) => t.type === "Symbol" && t.value === ",")
                ) {
                  end = ezp.consume();
                  continue;
                }
                throw new EZPError("Expected comma or right angle bracket");
              }
              parseFunctionArguments(end, typeArgs, ezp);
              return lhs;
            },
          );
          const childRule = ezp.instantiateRule("member access", (ezp) => {
            const _dot = ezp.expect((tok) =>
              tok.type === "Symbol" && tok.value === "."
            );
            const name = ezp.expect((tok) =>
              tok.type === "Identifier"
            ) as ClawTokenType<"Identifier">;
            lhs = cn(lhs, name, {
              type: NodeKind.ChildOfNode,
              base: lhs,
              extension: name.name,
            });
            return lhs;
          });
          const methodAccessRule = ezp.instantiateRule(
            "method access",
            (ezp) => {
              const _dot = ezp.expect((tok) =>
                tok.type === "Symbol" && tok.value === ":"
              );
              const name = ezp.expect((tok) =>
                tok.type === "Identifier"
              ) as ClawTokenType<"Identifier">;
              lhs = cn(lhs, name, {
                type: NodeKind.MethodOfNode,
                base: lhs,
                extension: name.name,
              });
              return lhs;
            },
          );
          while (operatorNext(ezp)) {
            if ((ezp.peek() as ClawTokenType<"Symbol">).value === "<") {
                // this is so that we dont accidently try force parsing the less than operator as a function generic call
                const r = ezp.tryRule(functionWithTypeArgsRule);
                if (r === null) break;
            }
            ezp.getFirstThatWorksOrTerm(
              "Expected function call or function call with generics",
              functionCallRule,
              methodAccessRule,
              childRule,
            );
          }
          return lhs;
        },
      );
      const unaryOperatorRule = ezp.instantiateRule(
        "unary operation",
        (ezp): Node => {
          const peek = ezp.peek();
          if (peek === undefined) throw new EZPError("Expected value");
          if (peek.type === "Symbol") {
            if (["!", "~", "-"].includes(peek.value)) {
              const opToken = ezp.consume() as ClawTokenType<"Symbol">;
              const rhs = ezp.expectRule(unaryOperatorRule);
              return cn(opToken, rhs, {
                type: NodeKind.UnaryOperation,
                value: rhs,
                oper: (() => {
                  switch (opToken.value) {
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
              });
            }
          }
          return ezp.expectRule(precedence2);
        },
      );
      const binaryOperatorRule = ezp.instantiateRule(
        "binary operation",
        (ezp) => {
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
          const parseExpression = function (lhs: Node, minPrecedence: number) {
            let lookahead = ezp.peek();
            console.log("lookahead", lookahead)
            while (
              lookahead !== undefined &&
              lookahead.type === "Symbol" &&
              lookahead.value in BINARY_OPERATOR_TO_PRECEDENCE &&
              BINARY_OPERATOR_TO_PRECEDENCE[lookahead.value as BKey][1] >=
                minPrecedence
            ) {
              const op = ezp.consume() as ClawTokenType<"Symbol">;
              const opPrec = BINARY_OPERATOR_TO_PRECEDENCE[op.value as BKey][1];
                console.log(BinaryOperationType[opPrec]);
              let rhs = ezp.expectRule(unaryOperatorRule);
              lookahead = ezp.peek();
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
                  rhs,
                  opPrec +
                    +(BINARY_OPERATOR_TO_PRECEDENCE[lookahead.value as BKey][
                      1
                    ] > opPrec),
                );
                lookahead = ezp.peek();
                if (lookahead === undefined) break;
              }
              lhs = cn(lhs, rhs, {
                type: NodeKind.BinaryOperation,
                oper: BINARY_OPERATOR_TO_PRECEDENCE[op.value as BKey][0],
                left: lhs,
                right: rhs,
              });
            }
            return lhs;
          };

          console.log("parse")
          return parseExpression(ezp.expectRule(unaryOperatorRule), 0);
        },
      );
      return ezp.expectRuleOrTerm("expected value", binaryOperatorRule);
    });
    const controlFlowRule = this.ezp.instantiateRule("control flow", (ezp) => {
      const ifRule = ezp.instantiateRule("if statement", (ezp) => {
        const tok = ezp.expect((token) =>
          token.type === "Keyword" && token.value === "if"
        );
        const pred = ezp.expectRuleOrTerm(
          "Expected predicate for if statement",
          valueRule,
        );
        const block = ezp.expectRuleOrTerm(
          "Expected block for if statement",
          valueRule,
        );
        return cn(tok, block, {
          type: NodeKind.IfNode,
          predicate: pred,
          body: block,
        });
      });
      const ifRRule = ezp.instantiateRule("if! statement", (ezp) => {
        const tok = ezp.expect((token) =>
          token.type === "Keyword" && token.value === "if!"
        );
        const pred = ezp.expectRuleOrTerm(
          "Expected predicate for if! statement",
          valueRule,
        );
        const block = ezp.expectRuleOrTerm(
          "Expected block for if! statement",
          valueRule,
        );
        return cn(tok, block, {
          type: NodeKind.IfRuntimeNode,
          predicate: pred,
          body: block,
        });
      });
      const forRule = ezp.instantiateRule("for loop", (ezp) => {
        const tok = ezp.expect((token) =>
          token.type === "Keyword" && token.value === "for"
        );
        console.log("for");
        const initial = ezp.expectRuleOrTerm(
          "Expected statement for for loop",
          statementRule,
        );
        console.log("initial", initial);
        ezp.expect(a => a.type === "Symbol" && a.value === ";");
        console.log("...prediacte", ezp.tokens)
        const predicate = ezp.expectRuleOrTerm(
          "Expected predicate for for loop",
          valueRule,
        );
        console.log("predicate", predicate);
        ezp.expect(a => a.type === "Symbol" && a.value === ";");
        const post = ezp.expectRuleOrTerm(
          "Expected post statement for for loop",
          statementRule,
        );
        const block = ezp.expectRuleOrTerm(
          "Expected block for for statement",
          valueRule,
        );
        return cn(tok, block, {
          type: NodeKind.ForNode,
          body: block,
          initialiser: initial,
          post,
          predicate,
        });
      });
      const forRRule = ezp.instantiateRule("for! loop", (ezp) => {
        const tok = ezp.expect((token) =>
          token.type === "Keyword" && token.value === "for!"
        );
        const initial = ezp.expectRuleOrTerm(
          "Expected statement for for! loop",
          statementRule,
        );
        const predicate = ezp.expectRuleOrTerm(
          "Expected predicate for for! loop",
          valueRule,
        );
        const post = ezp.expectRuleOrTerm(
          "Expected post statement for for! loop",
          statementRule,
        );
        const block = ezp.expectRuleOrTerm(
          "Expected block for for! statement",
          valueRule,
        );
        return cn(tok, block, {
          type: NodeKind.ForNode,
          body: block,
          initialiser: initial,
          post,
          predicate,
        });
      });
      const whileRule = ezp.instantiateRule("while statement", (ezp) => {
        const tok = ezp.expect((token) =>
          token.type === "Keyword" && token.value === "while"
        );
        const pred = ezp.expectRuleOrTerm(
          "Expected predicate for if statement",
          valueRule,
        );
        const block = ezp.expectRuleOrTerm(
          "Expected block for if statement",
          valueRule,
        );
        return cn(tok, block, {
          type: NodeKind.WhileNode,
          predicate: pred,
          body: block,
        });
      });
      const whileRRule = ezp.instantiateRule("while! statement", (ezp) => {
        const tok = ezp.expect((token) =>
          token.type === "Keyword" && token.value === "while!"
        );
        const pred = ezp.expectRuleOrTerm(
          "Expected predicate for while! statement",
          valueRule,
        );
        const block = ezp.expectRuleOrTerm(
          "Expected block for while! statement",
          valueRule,
        );
        return cn(tok, block, {
          type: NodeKind.WhileRuntimeNode,
          predicate: pred,
          body: block,
        });
      });
      const ifElseRule = ezp.instantiateRule("if-else statement", (ezp) => {
        const tok = ezp.expect((token) =>
          token.type === "Keyword" && token.value === "if"
        );
        const pred = ezp.expectRuleOrTerm(
          "Expected predicate for if statement",
          valueRule,
        );
        const block = ezp.expectRuleOrTerm(
          "Expected block for if statement",
          valueRule,
        );
        const _elseT = ezp.expect((token) =>
          token.type === "Keyword" && token.value === "else"
        );
        const block2 = ezp.expectRuleOrTerm(
          "Expected block for if-else statement",
          valueRule,
        );
        return cn(tok, block, {
          type: NodeKind.IfElseNode,
          predicate: pred,
          body: block,
          elseBody: block2,
        });
      });
      const ifElseRRule = ezp.instantiateRule("if-else! statement", (ezp) => {
        const tok = ezp.expect((token) =>
          token.type === "Keyword" && token.value === "if!"
        );
        const pred = ezp.expectRule(valueRule);
        const block = ezp.expectRule(valueRule);
        const _elseT = ezp.expect((token) =>
          token.type === "Keyword" && token.value === "else!"
        );
        const block2 = ezp.expectRuleOrTerm(
          "Expected block for if-else! statement",
          valueRule,
        );
        return cn(tok, block, {
          type: NodeKind.IfElseRuntimeNode,
          predicate: pred,
          body: block,
          elseBody: block2,
        });
      });
      const v = ezp.getFirstThatWorks(
        ifElseRule,
        ifElseRRule,
        ifRRule,
        ifRule,
        whileRule,
        whileRRule,
        forRule,
        forRRule,
      );
      console.log(v);
      return v;
    });
    const statementRule = this.ezp.addRule("statement", (ezp) => {
      const declRule = ezp.instantiateRule("declaration", (ezp) => {
        const name = ezp.expect((token) =>
          token.type === "Identifier"
        ) as ClawTokenType<"Identifier">;
        console.log("decl", name)
        const _colon = ezp.expect((token) =>
          token.type === "Symbol" && token.value === ":"
        );
        console.log("decl_colon", _colon)
        // variable decl
        const type = ezp.tryRule(typeRule);
        console.log("decltype", type)
        const _equals = ezp.expect((tok) =>
          tok.type === "Symbol" && tok.value === "="
        );
        console.log("decl_equals", _equals)
        const value = ezp.expectRuleOrTerm(
          "Expected value after equals sign",
          valueRule,
        );
        console.log("declvalue", value)
        return cn(name, value, {
          type: NodeKind.DeclarationNode,
          name: name.name,
          valueType: type,
          value,
        });
      });
      const assignRule = ezp.instantiateRule("assignment", (ezp) => {
        const base = ezp.expectRule(valueRule);
        const _equals = ezp.expect((tok) =>
          tok.type === "Symbol" && tok.value === "="
        );
        const value = ezp.expectRuleOrTerm(
          "Expected value after equals sign",
          valueRule,
        );
        return cn(base, value, {
          type: NodeKind.AssignmentNode,
          assignee: base,
          value,
        });
      });
      const VALID_ASSIGN_OPERATOR = (
        op: ClawTokenType<"Symbol">["value"],
      ): boolean => {
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
      const OP_TO_OPERATOR = (opequals: string) => {
        switch(opequals) {
          case "+=": return BinaryOperationType.Add;
          case "-=": return BinaryOperationType.Subtract;
          case "*=": return BinaryOperationType.Multiply;
          case "/=": return BinaryOperationType.Divide;
          case "%=": return BinaryOperationType.Modulo;
          case "^=": return BinaryOperationType.BitwiseXor;
          case "|=": return BinaryOperationType.BitwiseOr;
          case "&=": return BinaryOperationType.BitwiseAnd;
          case "||=": return BinaryOperationType.Or;
          case "&&=": return BinaryOperationType.And;
          default: throw "unreachable"
        }
      }
      const assignOpRule = ezp.instantiateRule("operator assignment", (ezp) => {
        const base = ezp.expectRule(valueRule);
        const opequals = ezp.expect((tok) => tok.type === "Symbol" && VALID_ASSIGN_OPERATOR(tok.value)) as ClawTokenType<"Symbol">;
        const value = ezp.expectRule(valueRule);
        return cn(base, value, {
            type: NodeKind.AssignmentNode,
            assignee: base,
            value: cn(value, value, {
                type: NodeKind.BinaryOperation,
                oper: OP_TO_OPERATOR(opequals.value),
                left: base,
                right: value,
            })
        })
      });

      return ezp.getFirstThatWorksOrTerm(
        "expected statement",
        controlFlowRule,
        declRule,
        assignOpRule,
        assignRule,
        valueRule,
      );
    });
  }

  parse() {
    return this.ezp.parse();
  }

  errorAt(
    location: { start: number; end: number; fp: string },
    message: string,
  ): never {
    const sh = new SourceHelper(this.sourcemap.get(location.fp)!);
    sh.getLines(location.start, location.end);
    logger.printWithTags([
      logger.config.levels[LogLevel.ERROR],
      {
        color: [196, 34, 235],
        priority: -20,
        name: "PARSER",
      },
    ], `${message}`);
    Deno.exit(1);
  }
}
