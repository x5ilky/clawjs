import {
  BlobWriter,
  TextReader,
  ZipWriter,
} from "https://deno.land/x/zipjs/index.js";
import * as path from "@std/path"
import { Flattener } from "../claw/flattener.ts";
import { Interpreter } from "../claw/interpreter.ts";
import { Lexer } from "../claw/lexer.ts";
import { NodeKind } from "../claw/nodes.ts";
import { Parser } from "../claw/newParser.ts";
import { SourceMap } from "../claw/sourcemap.ts";
import { ClawConfig, Typechecker, TypecheckerError } from "../claw/typechecker.ts";
import { Logger, LogLevel, skap } from "../SkOutput.ts";
import { irBuild } from "./ir.ts";
import { Convertor } from "../ir/convertor.ts";
import { IlNode } from "../ir/types.ts";
import { IR } from "../claw/flattener.ts";
import { MD5 } from "../external/md5.js";

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
    }).description("check a singular file for type errors"),
    interpretFromBcDump: skap.command({
      inputFile:     skap.string("-i").required().description("The debug-dump.txt")
    })
  }).required()
})
export const shape = skap.command({
  subc: skap.subcommand({
    ir: irShape,
    dev: devShape,
    run: skap.command({
      inputFile: skap.string("-i").required().description("input file path"),
      dumpBc: skap.boolean("-Ddumpbc").description("dump flattened bytecode"),
      time: skap.boolean("-T").description("time the steps"),
      resourceFolder: skap.string("-F").description("resource folder path").required(),
      output: skap.string('-o').description("output file name").default("out.sb3")
    }).description("run a file"),
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
  } else if (cmd.subc.selected === "run") {
    const { inputFile, dumpBc, time, resourceFolder, output } = cmd.subc.commands.run!;
    const smap = new SourceMap();
    smap.set(inputFile, await Deno.readTextFile(inputFile));
    const beforeParse = performance.now();
    const lexer = new Lexer(inputFile, smap);
    const tokens = lexer.lex();
    const parser = new Parser(tokens, smap);
    const parsed = parser.parse();
    if (parsed instanceof Error) {
      logger.error("Failed to parse file");
      Deno.exit(1);
    }
    const afterParse = performance.now();
    if (time) logger.info(`took ${(afterParse - beforeParse).toFixed(3)}ms to parse`)

    const config = new ClawConfig();
    config.stdlibPath = path.join(import.meta.dirname!, "..", "lib", "std")
    config.skipDeepCheck = true;
    console.profile("test")
    const tc = new Typechecker(smap, config);
    try {
      tc.typecheckFile(parsed)
    } catch (e) {
      if (e instanceof TypecheckerError) {
        logger.error("Error in typechecking")
        Deno.exit(1);
      }
    }
    console.profileEnd("test")
    const afterTypecheck = performance.now();
    if (time) logger.info(`took ${(afterTypecheck-afterParse).toFixed(3)}ms to typecheck (including imports)`);

    const flattener = new Flattener(smap, tc.implementations);
    const ir = flattener.convertAll(parsed);

    const afterFlatten = performance.now();
    if (time) logger.info(`took ${(afterFlatten - afterTypecheck).toFixed(3)}ms to flatten`);
    if (dumpBc) {
      Deno.writeTextFileSync("clawjs-bc-debug-dump.txt", ir.map((a, i) => `${i}: ` + JSON.stringify(a)).join("\n"))
    }
    const interpreter = new Interpreter();
    interpreter.interpret(ir);
    const afterInterpret = performance.now();

    if (time) logger.info(`took ${(afterInterpret - afterFlatten).toFixed(3)}ms to interpret`);

    const convertor = new Convertor(interpreter.labels.entries().toArray().map(a => ({
      type: "Label",
      value: a
    } satisfies IlNode)), resourceFolder!, logger);
    const project = convertor.create();


    const zipFileWriter = new BlobWriter();
    const zipWriter = new ZipWriter(zipFileWriter);
    await zipWriter.add("project.json", new TextReader(project.toJsonStringified()));

    for (const [_, spr] of convertor.sprites) {
        for (const [path, format] of spr.costume_paths) {
            const file = Deno.readTextFileSync(path);
            const fileName = `${MD5(file)}.${format.toLowerCase()}`;
            await zipWriter.add(fileName, new TextReader(file));
        }
        for (const [path, format] of spr.sound_paths) {
            const file = Deno.readTextFileSync(path);
            const fileName = `${MD5(file)}.${format.toLowerCase()}`;
            await zipWriter.add(fileName, new TextReader(file));
        }
    }

    await zipWriter.close();

    // Retrieves the Blob object containing the zip content into `zipFileBlob`. It
    // is also returned by zipWriter.close() for more convenience.
    const zipFileBlob = await zipFileWriter.getData();
    await Deno.writeFile(output, await zipFileBlob.bytes())
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
    const beforeParse = performance.now();
    const parser = new Parser(tokens, smap);
    const parsed = parser.parse();
    if (parsed instanceof Error) {
      logger.error(parsed);
    }
    const afterParse = performance.now();
    logger.info(`parsed in ${(afterParse - beforeParse).toFixed(3)}ms`)
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

    const config = new ClawConfig();
    const tc = new Typechecker(smap, config);
    try {
      tc.typecheckFile(parsed)
    } catch (e) {
      if (e instanceof TypecheckerError) {
        logger.error("Error in typechecking")
      }
    }
  } else if (cmd.subc.selected === "interpretFromBcDump") {
    const { inputFile } = cmd.subc.commands.interpretFromBcDump!;
    const f = Deno.readTextFileSync(inputFile);
    const fl = f.split("\n")
    const o: IR[] = [];
    for (const l of fl) {
      const v = l.slice(l.split("{", 1).length + 2);
      const p: IR = JSON.parse(v);
      if (p.type === "SetStructInstr") p.values = new Map(Object.entries(p.values))
    }
    const interpreter = new Interpreter();
    interpreter.interpret(o);
  }
}

if (import.meta.main) main();