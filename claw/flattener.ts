import { notDeepEqual } from "node:assert";
import { Ansi } from "../SkOutput.ts";
import { logger } from "../src/main.ts";
import { ChainMap } from "./chainmap.ts";
import { Node, NodeKind } from "./nodes.ts";
import { SourceMap } from "./sourcemap.ts";
import { SourceHelper } from "./sourceUtil.ts";

type LetInstr = {
  type: "LetInstr";
  name: string;
};
type TempInstr = {
  type: "TempInstr";
  name: string;
};
type SetInstr = {
  type: "SetInstr";
  target: string;
  value: string;
};
type SetNumberInstr = {
  type: "SetNumberInstr";
  target: string;
  value: number;
};
type SetStringInstr = {
  type: "SetStringInstr";
  target: string;
  value: string;
};
type SetBooleanInstr = {
  type: "SetBooleanInstr";
  target: string;
  value: boolean;
};
type SetStructInstr = {
  type: "SetStructInstr";
  target: string;
  values: Map<string, string>;
};
type SetArgInstr = {
  type: "SetArgInstr";
  target: string;
  count: number;
};
type JumpInstr = {
  type: "JumpInstr";
  ip: number;
};
type JumpIfFalseInstr = {
  type: "JumpIfFalseInstr";
  ip: number;
  value: string;
};

type PushScope = {
  type: "PushScope";
};
type PopScope = {
  type: "PopScope";
};
type RetInstr = {
  type: "RetInstr"; // should return and also pop scope
};
type CallInstr = {
  type: "CallInstr";
  location: number;
  args: string[];
};
type CallValueInstr = {
  type: "CallValueInstr";
  value: string;
  args: string[];
};
export type IntrinsicInstr = {
  type: "IntrinsicInstr";
  name: string;
  args: string[];
  target: string;
};
type GetChildOfInstr = {
  type: "GetChildOfInstr",
  target: string;
  value: string;
  child: string;
}
type CreateLabelInstr = {
  type: "CreateLabelInstr";
  target: string;
}

export type IR =
  | LetInstr
  | TempInstr
  | SetInstr
  | SetNumberInstr
  | SetStringInstr
  | SetBooleanInstr
  | SetStructInstr
  | SetArgInstr
  | JumpInstr
  | JumpIfFalseInstr
  | PushScope
  | PopScope
  | RetInstr
  | CallInstr
  | CallValueInstr
  | IntrinsicInstr
  | GetChildOfInstr
  | CreateLabelInstr;

const RET_VAR_NAME = "ret";

export class Flattener {
  counter: number;
  output: IR[];
  scope: ChainMap<string, string>;
  implementations: Map<string, { nodes: Node[]; args: string[] }>;
  scopes: number[];
  implMap: Map<string, number>;

  constructor(
    private sourcemap: SourceMap,
    implementations: Flattener["implementations"],
  ) {
    this.counter = 0;
    this.scopes = [0];
    this.output = [];
    this.scope = new ChainMap();
    this.implementations = implementations;
    this.implMap = new Map();
    sourcemap.set("<builtin>", "");
  }

  push(...ir: IR[]) {
    this.output.push(...ir);
  }

  reserve(): string {
    return "@" + (this.counter++).toString();
  }

  convertAll(nodes: Node[]) {
    this.scope.push();
    this.push({
      type: "PushScope",
    });
    for (const node of nodes) this.convertStatement(node);
    this.push({
      type: "PopScope",
    });
    this.scope.pop();
    return this.output;
  }
  convertScope(nodes: Node[]) {
    this.scope.push();
    this.scopes[this.scopes.length-1]++;
    for (const node of nodes) this.convertStatement(node);
    this.scopes[this.scopes.length-1]--;
    this.scope.pop();
  }
  insertImplementation(id: string): number {
    if (this.implMap.has(id)) return this.implMap.get(id)!;

    const impl = this.implementations.get(id);
    if (impl === undefined || impl === null) {
      throw new Error(`no implementation: "${id}", this is internal bug`)
    }
    const idd = this.output.length;
    this.implMap.set(id, idd);
    this.scope.push();
    this.push({
      type: "PushScope",
    });
    this.scopes.push(0);
    for (let i = 0; i < impl.args.length; i++) {
      const arg = `$arg-${impl.args[i]}-${this.reserve()}`;
      this.push({
        type: "LetInstr",
        name: arg,
      }, {
        type: "SetArgInstr",
        target: arg,
        count: i,
      });
      this.scope.set(impl.args[i], arg)
    }
    for (const node of impl.nodes) this.convertStatement(node);
    this.scopes.pop();
    this.push({
      type: "PopScope",
    });
    this.push({
      type: "RetInstr",
    });
    this.scope.pop();
    return idd;
  }

  convertValue(node: Node): { variableName: string } {
    switch (node.type) {
      case NodeKind.NumberNode: {
        const n = this.reserve();
        this.push({
          type: "TempInstr",
          name: n,
        }, {
          type: "SetNumberInstr",
          target: n,
          value: node.value,
        });
        return { variableName: n };
      }
      case NodeKind.StringNode: {
        const n = this.reserve();
        this.push({
          type: "TempInstr",
          name: n,
        }, {
          type: "SetStringInstr",
          target: n,
          value: node.value,
        });
        return { variableName: n };
      }
      case NodeKind.BooleanNode: {
        const n = this.reserve();
        this.push({
          type: "TempInstr",
          name: n,
        }, {
          type: "SetBooleanInstr",
          target: n,
          value: node.value,
        });
        return { variableName: n };
      }
      case NodeKind.UnaryOperation: {
        const left = this.convertValue(node.value);
        const d = {
          type: "CallInstr",
          location: -1,
          args: [left.variableName],
        } satisfies IR;
        const j = {
          type: "JumpInstr",
          ip: -1
        } satisfies JumpInstr
        this.push(d, j);
        const a = this.insertImplementation(node.target!);
        d.location = a;
        j.ip = this.output.length;
        const name = this.reserve();
        this.push({
          type: "TempInstr",
          name,
        });
        this.push({
          type: "SetInstr",
          target: name,
          value: RET_VAR_NAME,
        });
        return { variableName: name };
      }
      case NodeKind.BinaryOperation: {
        const left = this.convertValue(node.left);
        const right = this.convertValue(node.right);
        const d = {
          type: "CallInstr",
          location: -1,
          args: [left.variableName, right.variableName],
        } satisfies IR;
        const j = {
          type: "JumpInstr",
          ip: -1
        } satisfies JumpInstr
        this.push(d, j);
        console.log(node, node.target)
        const a = this.insertImplementation(node.target!);
        d.location = a;
        const name = this.reserve();
        j.ip = this.output.length;
        this.push({
          type: "TempInstr",
          name,
        });
        this.push({
          type: "SetInstr",
          target: name,
          value: RET_VAR_NAME,
        });
        return { variableName: name };
      }
      case NodeKind.VariableNode: {
        return {
          variableName: this.scope.get(node.name)!,
        };
      }
      case NodeKind.StructLiteralNode: {
        const name = this.reserve();
        const values = new Map();
        for (const k in node.members) {
            values.set(k, this.convertValue(node.members[k]).variableName);
        }
        this.push({
          type: "TempInstr",
          name,
        }, {
          type: "SetStructInstr",
          target: name,
          values
        });
        return {
            variableName: name
        };
      }
      case NodeKind.CallNode: {
        const name = this.reserve();

        const args = [];
        if (node.callee.type === NodeKind.MethodOfNode) {
          args.push(this.convertValue(node.callee.base).variableName)
        }
        for (const j of node.arguments) {
          args.push(this.convertValue(j).variableName);
        }
        
        const k = {
            type: "CallInstr",
            args,
            location: -1
        } satisfies CallInstr
        const j = {
          type: "JumpInstr",
          ip: -1
        } satisfies JumpInstr
        this.push(k, j);
        if (node.target !== undefined) {
          k.location = this.insertImplementation(node.target)
        } else {
          this.errorAt(node, `Target is undefined, this shouldn't really be possible, this is a bug in the typechecker`);
          throw new Error()
        }
        j.ip = this.output.length;
        this.push({
            type: "TempInstr",
            name
        }, {
            type: "SetInstr",
            target: name,
            value: RET_VAR_NAME
        });
        return {
            variableName: name
        }
      }
      case NodeKind.ChildOfNode: {
        if (node.target !== undefined) {
          const jump = {
            type: "JumpInstr",
            ip: -1
          } satisfies IR;
          this.push(jump);
          const ip = this.insertImplementation(node.target);
          const name = this.reserve();
          jump.ip = this.output.length;
          this.push({
            type: "TempInstr",
            name
          }, {
            type: "SetNumberInstr",
            target: name,
            value: ip
          });
          return {
            variableName: name
          }
        } else {
          const name = this.reserve();
          this.push({
            type: "TempInstr",
            name
          }, {
            type: "GetChildOfInstr",
            target: name,
            value: this.convertValue(node.base).variableName,
            child: node.extension
          });
          return {
            variableName: name
          }
        }
      }
        
      case NodeKind.MethodOfNode: {
        // nah
        throw new Error("unreachable")
      }
        /* falls through */
      case NodeKind.Grouping: {
        return this.convertValue(node.value);
      }
      case NodeKind.LabelNode: {
        this.push({
          type: "PushScope"
        });
        this.scope.push();
        this.scopes[this.scopes.length-1]++;
        const scopeName = `$scope-${this.reserve()}`;
        this.scope.set(`$scope`, scopeName);
        this.push({
          type: "LetInstr",
          name: scopeName
        }, {
          type: "CreateLabelInstr",
          target: scopeName
        });
        this.convertScope(node.nodes);
        this.scopes[this.scopes.length-1]--;
        this.scope.pop();
        this.push({
          type: "PopScope"
        });
        return {
          variableName: scopeName
        }
      }
      case NodeKind.IntrinsicNode: {
        const name = this.reserve();
        if (node.string.startsWith("$ibop")) {
          this.push({
            type: "IntrinsicInstr",
            name: node.string,
            args: [this.scope.get("self")!, this.scope.get("other")!],
            target: name
          });
        } else if (node.string.startsWith("$iuop")) {
          this.push({
            type: "IntrinsicInstr",
            name: node.string,
            args: [this.scope.get("self")!],
            target: name
          });
        } else if (node.string.startsWith("$1args")) {
          this.push({
            type: "IntrinsicInstr",
            name: node.string,
            args: [this.scope.get("$1")!],
            target: name
          });
        } else if (node.string.startsWith("$2args")) {
          this.push({
            type: "IntrinsicInstr",
            name: node.string,
            args: [this.scope.get("$1")!, this.scope.get("$2")!],
            target: name
          });
        } else if (node.string.startsWith("$3args")) {
          this.push({
            type: "IntrinsicInstr",
            name: node.string,
            args: [this.scope.get("$1")!, this.scope.get("$2")!, this.scope.get("$3")!],
            target: name
          });
        } else {
          this.push({
            type: "IntrinsicInstr",
            name: node.string,
            args: [],
            target: name
          });
        }
        return { variableName: name };
      }

      case NodeKind.UseInterfaceNode:
      case NodeKind.ImportNode:
      case NodeKind.ExportNode:
      case NodeKind.AssignmentNode:
      case NodeKind.DeclarationNode:
      case NodeKind.ConstDeclarationNode:
      case NodeKind.IfNode:
      case NodeKind.IfElseNode:
      case NodeKind.WhileNode:
      case NodeKind.ForNode:
      case NodeKind.IfRuntimeNode:
      case NodeKind.IfElseRuntimeNode:
      case NodeKind.WhileRuntimeNode:
      case NodeKind.ForRuntimeNode:
      case NodeKind.ReturnNode:
      case NodeKind.BlockNode:
      case NodeKind.FunctionDefinitionNode:
      case NodeKind.StructDefinitionNode:
      case NodeKind.DataStructDefinitionNode:
      case NodeKind.InterfaceNode:
      case NodeKind.ImplBaseNode:
      case NodeKind.ImplTraitNode:
      case NodeKind.NormalTypeNode:
      case NodeKind.OfTypeNode:
        this.errorAt(
          node,
          `Cannot be a value, probably bug in the typechecker`,
        );
        throw new Error("unreachable");
    }
  }
  convertStatement(node: Node) {
    switch (node.type) {
      case NodeKind.DeclarationNode:
        {
          const name = node.name + `$` + this.reserve();
          this.push({
            type: "LetInstr",
            name: name,
          });
          const valueS = this.convertValue(node.value);
          this.push({
            type: "SetInstr",
            target: name,
            value: valueS.variableName,
          });
          this.scope.set(node.name, name);
        }
        break;
      case NodeKind.IntrinsicNode:
        {
          this.convertValue(node);
        }
        break;

      case NodeKind.BlockNode:
        {
            this.convertScope(node.nodes);
        } break;
      case NodeKind.ReturnNode:
        {
          this.push({
            type: "SetInstr",
            target: RET_VAR_NAME,
            value: this.convertValue(node.value).variableName
          })
          for (let i = 0; i < this.scopes[this.scopes.length-1]; i++) {
            this.push({
              type: "PopScope"
            })
          }
          this.push({
            type: "RetInstr"
          }) 
        } break
      case NodeKind.CallNode: {
        this.convertValue(node);
      } break;
      case NodeKind.AssignmentNode: {
        if (node.target !== undefined) {
          const name = this.convertValue(node.assignee);
          const value = this.convertValue(node.value);
          const k = {
            type: "JumpInstr",
            ip: -1
          } satisfies IR;
          const j = {
            type: "CallInstr",
            location: -1,
            args: [name.variableName, value.variableName]
          } satisfies IR;
          this.push(j, k) 
          const impl = this.insertImplementation(node.target);
          j.location = impl;
          k.ip = this.output.length;
          this.push({
            type: "SetInstr",
            target: name.variableName,
            value: RET_VAR_NAME
          });
        } else {
          const name = this.convertValue(node.assignee);
          this.push({
            type: "SetInstr",
            target: name.variableName,
            value: this.convertValue(node.value).variableName
          })
        }
      } break;
      case NodeKind.ConstDeclarationNode: {
        const name = node.name + `$` + this.reserve();
        this.push({
          type: "LetInstr",
          name: name,
        });
        const valueS = this.convertValue(node.value);
        this.push({
          type: "SetInstr",
          target: name,
          value: valueS.variableName,
        });
        this.scope.set(node.name, name);
      } break;
      case NodeKind.IfNode: {
        const value = this.convertValue(node.predicate);
        const k = {
          type: "JumpIfFalseInstr",
          ip: -1,
          value: value.variableName
        } satisfies IR;
        this.push(k);
        this.convertScope([node.body]);
        k.ip = this.output.length
      } break;
      case NodeKind.IfElseNode: {
        const value = this.convertValue(node.predicate);
        const k = {
          type: "JumpIfFalseInstr",
          ip: -1,
          value: value.variableName
        } satisfies IR;
        this.push(k);
        this.convertScope([node.body]);
        k.ip = this.output.length
        const k2 = {
          type: "JumpInstr",
          ip: -1,
        } satisfies IR;
        this.push(k2);
        this.convertScope([node.elseBody]);
        k2.ip = this.output.length;
      } break
      case NodeKind.WhileNode: {
        const i = this.output.length;
        const value = this.convertValue(node.predicate);
        const k = {
          type: "JumpIfFalseInstr",
          ip: -1,
          value: value.variableName
        } satisfies IR;
        this.push(k);
        this.convertScope([node.body]);
        this.push({
          type: "JumpInstr",
          ip: i
        })
        k.ip = this.output.length;
      } break;

      case NodeKind.ForNode: {
        this.convertStatement(node.initialiser);
        const i = this.output.length;
        const value = this.convertValue(node.predicate);
        const k = {
          type: "JumpIfFalseInstr",
          ip: -1,
          value: value.variableName
        } satisfies IR;
        this.push(k);
        this.convertScope([node.body, node.post]);
        this.push({
          type: "JumpInstr",
          ip: i
        })
        k.ip = this.output.length;
      } break;
      case NodeKind.IfRuntimeNode:
      case NodeKind.IfElseRuntimeNode:
      case NodeKind.WhileRuntimeNode:
      case NodeKind.ForRuntimeNode:
        this.errorAt(node, `Unimplemented node: ${NodeKind[node.type]}`);
        break;
      case NodeKind.ImportNode: {
        this.convertAll(node.nodes);
      } break;
      case NodeKind.ExportNode: {
        this.convertStatement(node.sub);
        this.scope.__inner[0].set(node.sub.name, this.scope.get(node.sub.name)!)
      } break
      case NodeKind.FunctionDefinitionNode:
      case NodeKind.StructDefinitionNode:
      case NodeKind.DataStructDefinitionNode:
      case NodeKind.InterfaceNode:
      case NodeKind.ImplBaseNode:
      case NodeKind.ImplTraitNode:
      case NodeKind.UseInterfaceNode:
        // skip
        break;

      case NodeKind.NumberNode:
      case NodeKind.StringNode:
      case NodeKind.VariableNode:
      case NodeKind.StructLiteralNode:
      case NodeKind.ChildOfNode:
      case NodeKind.MethodOfNode:
      case NodeKind.UnaryOperation:
      case NodeKind.BinaryOperation:
      case NodeKind.Grouping:
      case NodeKind.NormalTypeNode:
      case NodeKind.OfTypeNode:
      case NodeKind.LabelNode:
        this.errorAt(node, `${NodeKind[node.type]}`);
    }
  }
  errorAt(
    location: { start: number; end: number; fp: string },
    message: string,
  ) {
    const sh = new SourceHelper(this.sourcemap.get(location.fp)!);
    const [col, row] = sh.getColRow(location.start);
    logger.error(message);
    logger.error(`At ${location.fp}:${col + 1}:${row}:`);
    const lines = sh.getRawLines(location.start, location.end);

    for (const line of lines) {
      let out = "";
      let pad = "";
      for (const [char, index] of line) {
        if (location.start <= index && index < location.end) {
          out += Ansi.yellow + char + Ansi.reset;
          pad += "^";
        } else {
          pad += " ";
          out += Ansi.gray + char + Ansi.reset;
        }
      }
      logger.error(out);
      logger.error(pad);
    }
  }
  warnAt(
    location: { start: number; end: number; fp: string },
    message: string,
  ) {
    const sh = new SourceHelper(this.sourcemap.get(location.fp)!);
    const [col, row] = sh.getColRow(location.start);
    logger.warn(message);
    logger.warn(`At ${location.fp}:${col + 1}:${row}:`);
    const lines = sh.getRawLines(location.start, location.end);

    for (const line of lines) {
      let out = "";
      let pad = "";
      for (const [char, index] of line) {
        if (location.start <= index && index < location.end) {
          out += Ansi.yellow + char + Ansi.reset;
          pad += "^";
        } else {
          pad += " ";
          out += Ansi.gray + char + Ansi.reset;
        }
      }
      logger.warn(out);
      logger.warn(pad);
    }
  }

  errorNoteAt(
    location: { start: number; end: number; fp: string },
    message: string,
  ) {
    const sh = new SourceHelper(this.sourcemap.get(location.fp)!);
    const lines = sh.getRawLines(location.start, location.end);
    const [col, _row] = sh.getColRow(location.start);
    logger.error(
      Ansi.yellow + "note: " + Ansi.reset + message +
        ` (${location.fp}:${col + 1})`,
    );

    for (const line of lines) {
      let out = "";
      let pad = "";
      for (const [char, index] of line) {
        if (location.start <= index && index < location.end) {
          out += Ansi.yellow + char + Ansi.reset;
          pad += "^";
        } else {
          pad += " ";
          out += Ansi.gray + char + Ansi.reset;
        }
      }
      logger.error(out);
      logger.error(pad);
    }
  }
}
