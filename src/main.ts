import { Logger, skap } from "../SkOutput.ts";
import { irBuild } from "./ir.ts";

export const logger = new Logger({
  prefixTags: [{
    priority: -10,
    color: [198, 23, 64],
    name: "Claw"
  }]
})
const irShape = skap.command({
  subc: skap.subcommand({
    build: skap.command({
      inputFile: skap.string("-i").description("The input file").required(),
      outputFile: skap.string("-o").default("./output.sb3").description("Name/path of the emitted sb3 file"),
      resourcesFolder: skap.string("-R").description("Directory where resources are located"),
      debugEmitProjectJson: skap.string("-Demitprojectjson")
    })
  }).required()
})
export const shape = skap.command({
  subc: skap.subcommand({
    ir: irShape
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