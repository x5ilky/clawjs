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

type PushScope = {
  type: "PushScope";
};
type PopScope = {
  type: "PopScope";
};
type RetInstr = {
  type: "RetInstr";
};
type CallInstr = {
  type: "CallInstr";
  location: number;
  args: string[];
};
type IntrinsicInstr = {
  type: "IntrinsicInstr";
  name: string;
};

type IR =
  | LetInstr
  | TempInstr
  | SetInstr
  | SetNumberInstr
  | SetStringInstr
  | SetStructInstr
  | SetArgInstr
  | JumpInstr
  | PushScope
  | PopScope
  | RetInstr
  | CallInstr
  | IntrinsicInstr;
const RET_VAR_NAME = "ret";

export class Flattener {
  counter: number;
  output: IR[];
  scope: ChainMap<string, string>;
  implementations: Map<string, { nodes: Node[]; args: string[] }>;
  implMap: Map<string, number>;

  constructor(
    private sourcemap: SourceMap,
    implementations: Flattener["implementations"],
  ) {
    this.counter = 0;
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
    this.push({
      type: "PushScope",
    });
    for (const node of nodes) this.convertStatement(node);
    this.push({
      type: "PopScope",
    });
    this.scope.pop();
  }
  insertImplementation(id: string): number {
    if (this.implMap.has(id)) return this.implMap.get(id)!;

    const impl = this.implementations.get(id)!;
    const idd = this.output.length;
    this.implMap.set(id, idd);
    this.scope.push();
    this.push({
      type: "PushScope",
    });
    for (let i = 0; i < impl.args.length; i++) {
      const arg = `$arg-${impl.args[i]}`;
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
    this.push({
      type: "RetInstr",
    });
    this.push({
      type: "PopScope",
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
      case NodeKind.UnaryOperation: {
        const left = this.convertValue(node.value);
        const d = {
          type: "CallInstr",
          location: -1,
          args: [left.variableName],
        } satisfies IR;
        this.push(d);
        const a = this.insertImplementation(node.target!);
        d.location = a;
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
        this.push(d);
        const a = this.insertImplementation(node.target!);
        d.location = a;
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
        for (const j of node.arguments) {
            args.push(this.convertValue(j).variableName);
        }
        const k = {
            type: "CallInstr",
            args,
            location: -1
        } satisfies CallInstr
        this.push(k);
        if (node.target !== undefined) {
            k.location = this.insertImplementation(node.target)
        } else {
            this.errorAt(node, `Target is undefined, this shouldn't really be possible, this is a bug in the typechecker`);
        }
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
      case NodeKind.ChildOfNode:
      case NodeKind.MethodOfNode:
      case NodeKind.Grouping:
      case NodeKind.NormalTypeNode:
      case NodeKind.OfTypeNode:
      case NodeKind.LabelNode:
        this.errorAt(node, `Unimplemented value type: ${NodeKind[node.type]}`);
        Deno.exit(1);
        break;
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
      case NodeKind.IntrinsicNode:
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
          this.push({
            type: "IntrinsicInstr",
            name: node.string,
          });
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
        } break
      case NodeKind.CallNode:
      case NodeKind.AssignmentNode:
      case NodeKind.ConstDeclarationNode:
      case NodeKind.IfNode:
      case NodeKind.IfElseNode:
      case NodeKind.WhileNode:
      case NodeKind.ForNode:
      case NodeKind.IfRuntimeNode:
      case NodeKind.IfElseRuntimeNode:
      case NodeKind.WhileRuntimeNode:
      case NodeKind.ForRuntimeNode:
        this.errorAt(node, `Unimplemented node: ${NodeKind[node.type]}`);
        break;
      case NodeKind.FunctionDefinitionNode:
      case NodeKind.StructDefinitionNode:
      case NodeKind.DataStructDefinitionNode:
      case NodeKind.InterfaceNode:
      case NodeKind.ImplBaseNode:
      case NodeKind.ImplTraitNode:
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
