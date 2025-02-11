import { Lexer } from "../claw/lexer.ts";
import { NodeKind } from "../claw/nodes.ts";
import { Parser } from "../claw/parser.ts";
import { SourceMap } from "../claw/sourcemap.ts";
import { Typechecker, TypecheckerError } from "../claw/typechecker.ts";
import { Logger, LogLevel, skap } from "../SkOutput.ts";
import { irBuild } from "./ir.ts";

export const logger = new Logger({
  prefixTags: [{
    priority: -10,
    color: [198, 23, 64],
    name: "claw"
  }],
  tagSuffix: "",
  tagPrefix: "",
  levels: {
    [LogLevel.DEBUG]: {color: [77, 183, 53], name: "debug", priority: 0},
    [LogLevel.INFO]: {color: [54, 219, 180], name: "info", priority: 10},
    [LogLevel.WARN]: {color: [219, 158, 54], name: "warn", priority: 20},
    [LogLevel.ERROR]: {color: [219, 54, 54], name: "error", priority: 30}
  }
})
const irShape = skap.command({
  subc: skap.subcommand({
    build: skap.command({
      inputFile:            skap.string("-i").description("The input file").required(),
      outputFile:           skap.string("-o").default("./output.sb3").description("Name/path of the emitted sb3 file"),
      resourcesFolder:      skap.string("-R").description("Directory where resources are located"),
      debugEmitProjectJson: skap.string("-Demitprojectjson"),
      debugEmitParsedIr:    skap.string("-Demitparsedir")
    })
  }).required()
}).description("commands related to the intermediate representation");
const devShape = skap.command({
  subc: skap.subcommand({
    lex: skap.command({
      inputFile:     skap.string("-i").required().description("The source file"),
      debugDumpFile: skap.string("-Ddumpfile").description("Whether or not to dump the file, if so, what path"),
      format:        skap.boolean("-F")
    }).description("lex an input file"),
    parse: skap.command({
      inputFile:     skap.string("-i").required().description("The source file"),
      debugDumpFile: skap.string("-Ddumpfile").description("Whether or not to dump the file, if so, what path"),
      format:        skap.boolean("-F")
    }).description("parse an input file into ast"),
    check: skap.command({
      inputFile:     skap.string("-i").required().description("The source file"),
    }).description("check a singular file for type errors")
  }).required()
})
export const shape = skap.command({
  subc: skap.subcommand({
    ir: irShape,
    dev: devShape,
  }).required()
})

async function ir(cmd: skap.SkapInfer<typeof shape>) {
  const s = cmd.subc.commands.ir!;
  if (s.subc.selected === "build") {
    await irBuild(cmd)
  }
}
async function main() {
  const cmd = shape.parse(Deno.args, {
    customError: e => {
      logger.error(e);
      Deno.exit(1)
    }
  });
  if (cmd.subc.selected === "ir") {
    await ir(cmd)
  } else if (cmd.subc.selected === "dev") {
    await dev(cmd.subc.commands.dev!)
  }
}
async function dev(cmd: skap.SkapInfer<typeof devShape>) {
  if (cmd.subc.selected === "lex") {
    const { inputFile, debugDumpFile, format } = cmd.subc.commands.lex!;
    const smap = new SourceMap();
    smap.set(inputFile, await Deno.readTextFile(inputFile));
    const lexer = new Lexer(inputFile, smap);
    const tokens = lexer.lex();
    const out = format ? JSON.stringify(tokens, null, 4) : JSON.stringify(tokens);
    if (debugDumpFile === undefined) {
      console.log(out);
    } else {
      await Deno.writeTextFile(debugDumpFile, out);
    }
  } else if (cmd.subc.selected === "parse") {
    const { inputFile, debugDumpFile, format } = cmd.subc.commands.parse!;
    const smap = new SourceMap();
    smap.set(inputFile, await Deno.readTextFile(inputFile));
    const lexer = new Lexer(inputFile, smap);
    const tokens = lexer.lex();
    const parser = new Parser(tokens, smap);
    const parsed = parser.parse();
    if (parsed instanceof Error) {
      logger.error(parsed);
    }
    // deno-lint-ignore no-explicit-any
    const replacer = function(this: any, key: string, value: any) {
      if (key === "type") {
        return NodeKind[value.toString()]
      }
      return value
    }
    const out = format ? JSON.stringify(parsed, replacer, 4) : JSON.stringify(parsed, replacer)
    if (debugDumpFile) await Deno.writeTextFile(debugDumpFile, out);
    else console.log(out);
  } else if (cmd.subc.selected === "check") {
    const { inputFile } = cmd.subc.commands.check!;
    const smap = new SourceMap();
    smap.set(inputFile, await Deno.readTextFile(inputFile));
    const lexer = new Lexer(inputFile, smap);
    const tokens = lexer.lex();
    const parser = new Parser(tokens, smap);
    const parsed = parser.parse();
    if (parsed instanceof Error) {
      logger.error("Failed to parse file");
      Deno.exit(1);
    }

    const tc = new Typechecker(smap);
    try {
      tc.typecheck(parsed)
    } catch (e) {
      if (e instanceof TypecheckerError) {
        logger.error("Error in typechecking")
      }
    }
  }
}

if (import.meta.main) main();