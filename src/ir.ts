import {
    BlobWriter,
    TextReader,
    ZipWriter,
} from "../vendor/deno.land/x/zipjs@v2.7.53/index.js";
import { LogLevel, type skap } from "../SkOutput.ts";
import { logger, type shape } from "./main.ts";
import { IrParser } from "../ir/parser.ts";
import { Convertor } from "../ir/convertor.ts";
import { MD5 } from "../external/md5.js";

export async function irBuild(cmd: skap.SkapInfer<typeof shape>) {
    logger.start(LogLevel.INFO, "sb3 creation");
    const s = cmd.subc.commands.ir!;
    const subc = s.subc.commands.build!;
    // build
    logger.info("Parsing");
    const input = Deno.readTextFileSync(subc.inputFile);
    const irParser = new IrParser(input, logger);

    const nodes = irParser.parse();
    if (subc.debugEmitParsedIr !== undefined) {
        await Deno.writeTextFile(subc.debugEmitParsedIr, JSON.stringify(nodes));
    }
    logger.info("Converting");
    const convertor = new Convertor(nodes, {
        resourcesFolderPath: subc.resourcesFolder ?? "",
        logger,
        warnOnEmptyLabels: true,
    });
    const project = convertor.create();

    logger.info("Creating sb3...");
    const zipFileWriter = new BlobWriter();
    const zipWriter = new ZipWriter(zipFileWriter);
    if (subc.debugEmitProjectJson !== undefined) {
        await Deno.writeTextFile(
            subc.debugEmitProjectJson,
            project.toJsonStringified(),
        );
    }
    await zipWriter.add(
        "project.json",
        new TextReader(project.toJsonStringified()),
    );

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
    await Deno.writeFile(subc.outputFile, await zipFileBlob.bytes());
    logger.end(LogLevel.INFO, "sb3 creation");
}
