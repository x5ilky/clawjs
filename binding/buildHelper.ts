import {
  BlobWriter,
  TextReader,
  ZipWriter,
} from "https://deno.land/x/zipjs/index.js";
import { Convertor } from "../ir/convertor.ts";
import { IlNode } from "../ir/types.ts";
import { LogLevel } from "../SkOutput.ts";
import { logger } from "../src/main.ts";
import { MD5 } from "../external/md5.js";
import { $, stage } from "./bindings.ts";

export type BuildOptions = {
    resourceFolder: string,
    logBuildInfo?: boolean,
    dumpProjectJson?: string | null,
    dumpBC?: string | null
};
export async function build(options: BuildOptions) {
    if (stage.costumes.length === 0) {
        logger.error("Stage has no backdrops, you have to add one");
        return;
    }
    options.logBuildInfo ??= false;
    if (options.dumpBC) {
        Deno.writeTextFileSync(options.dumpBC, JSON.stringify($.labels))
    }

    if (options.logBuildInfo) logger.info(`${$.labels.length} labels`)
    if (options.logBuildInfo) logger.start(LogLevel.INFO, "converting") 
    const convertor = new Convertor($.labels.map(a => <IlNode>{type: "Label", value: [a.name, a.nodes]}), options.resourceFolder, logger);
    const project = convertor.create()
    if (typeof options.dumpProjectJson === "string") {
        Deno.writeTextFileSync(options.dumpProjectJson, project.toJsonStringified());
    }
    if (options.logBuildInfo) logger.end(LogLevel.INFO, "converting") 
    logger.start(LogLevel.INFO, "creating zip")
    const zipFileWriter = new BlobWriter();
    const zipWriter = new ZipWriter(zipFileWriter);
    await zipWriter.add("project.json", new TextReader(project.toJsonStringified()));

    for (const [_, spr] of convertor.sprites) {
        for (const [path, format] of spr.costume_paths) {
            const file = Deno.readTextFileSync(path);
            const fileName = `${MD5(file)}.${format.toLowerCase()}`;
            try {
                await zipWriter.add(fileName, new TextReader(file));
            } catch {
                //
            }
        }
        for (const [path, format] of spr.sound_paths) {
            const file = Deno.readTextFileSync(path);
            const fileName = `${MD5(file)}.${format.toLowerCase()}`;
            try {
                await zipWriter.add(fileName, new TextReader(file));
            } catch {
                //
            }
        }
    }

    await zipWriter.close();
    logger.end(LogLevel.INFO, "creating zip")

    // Retrieves the Blob object containing the zip content into `zipFileBlob`. It
    // is also returned by zipWriter.close() for more convenience.
    const zipFileBlob = await zipFileWriter.getData();
    await Deno.writeFile("out.sb3", await zipFileBlob.bytes())
}