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
export const shape = skap.command({
  subc: skap.subcommand({
    ir: irShape,
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
  }
}
if (import.meta.main) main();