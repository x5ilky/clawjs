import {
    BlobReader,
    BlobWriter,
    TextReader,
    ZipWriter,
} from "../vendor/deno.land/x/zipjs@v2.7.53/index.js";
import { Convertor } from "../ir/convertor.ts";
import type { IlNode } from "../ir/types.ts";
import { LogLevel } from "../SkOutput.ts";
import { logger } from "../src/main.ts";
import { MD5 } from "../external/md5.js";
import { $, stage } from "./bindings.ts";
import { Optimizer, type OptimizerOptions } from "../ir/optimizer.ts";
import * as path from "@std/path";

export type BuildOptions = {
    resourceFolder: string;
    outputFileName: string;
    logBuildInfo?: boolean;
    dumpProjectJson?: string | null;
    dumpBC?: string | null;
    optimizerFlags?: Partial<OptimizerOptions>;
    openFile?: boolean;
};
export async function build(options: BuildOptions) {
    await buildSingle(options);
    if (options.openFile) {
        const checkPaths = [];
        if (Deno.build.os === "windows") {
            const LOCALAPPDATA = Deno.env.get("LOCALAPPDATA");
            if (LOCALAPPDATA) {
                checkPaths.push(
                    path.join(LOCALAPPDATA, `Programs`, `Turbowarp`),
                    path.join(
                        LOCALAPPDATA.replace(/^C/, "D"),
                        `Programs`,
                        `Turbowarp`,
                    ),
                );
            }
            for (const p of checkPaths) {
                try {
                    const fl = path.join(p, `Turbowarp.exe`);
                    await Deno.stat(fl);
                    const command = new Deno.Command(fl, {
                        args: [options.outputFileName],
                    });
                    command.spawn();
                    break;
                } catch (e) {
                    if (e instanceof Deno.errors.NotFound) {
                        continue;
                    }
                    throw e;
                }
            }
        } else {
            throw new Error(`Auto-open is only implemented on windows`);
        }
    }
}

async function buildSingle(options: BuildOptions) {
    if (stage.costumes.length === 0) {
        logger.error("Stage has no backdrops, you have to add one");
        return;
    }
    options.logBuildInfo ??= false;

    const labelData = $.labels.map((a) =>
        <IlNode> { type: "Label", value: [a.name, a.nodes] }
    );
    const optimizer = new Optimizer(labelData, options.optimizerFlags);
    optimizer.optimize();
    if (options.dumpBC) {
        Deno.writeTextFileSync(options.dumpBC, JSON.stringify(labelData));
    }

    if (options.logBuildInfo) logger.info(`${$.labels.length} labels`);
    if (options.logBuildInfo) logger.start(LogLevel.INFO, "converting");
    const convertor = new Convertor(labelData, {
        resourcesFolderPath: options.resourceFolder,
        logger,
        warnOnEmptyLabels: false,
    });
    const project = convertor.create();
    if (typeof options.dumpProjectJson === "string") {
        Deno.writeTextFileSync(
            options.dumpProjectJson,
            project.toJsonStringified(),
        );
    }
    if (options.logBuildInfo) logger.end(LogLevel.INFO, "converting");
    logger.start(LogLevel.INFO, "creating zip");
    const zipFileWriter = new BlobWriter();
    const zipWriter = new ZipWriter(zipFileWriter);
    await zipWriter.add(
        "project.json",
        new TextReader(project.toJsonStringified()),
    );

    for (const [_, spr] of convertor.sprites) {
        for (const [path, format] of spr.costume_paths) {
            const file = Deno.readFileSync(path);
            const fileName = `${MD5(Array.from(file).map((a) => String.fromCharCode(a))
                                .join(""),)}.${format.toLowerCase()}`;
            try {
                await zipWriter.add(fileName, new BlobReader(new Blob([file])));
            } catch {
                //
            }
        }
        for (const [path, format] of spr.sound_paths) {
            const file = Deno.readFileSync(path);
            const fileName = `${MD5(Array.from(file).map((a) => String.fromCharCode(a))
                                .join(""),)}.${format.toLowerCase()}`;
            try {
                await zipWriter.add(fileName, new BlobReader(new Blob([file])));
            } catch {
                //
            }
        }
    }

    await zipWriter.close();
    logger.end(LogLevel.INFO, "creating zip");

    // Retrieves the Blob object containing the zip content into `zipFileBlob`. It
    // is also returned by zipWriter.close() for more convenience.
    const zipFileBlob = await zipFileWriter.getData();
    await Deno.writeFile(options.outputFileName, await zipFileBlob.bytes());
    logger.info(`Written to ${path.normalize(options.outputFileName)}`);
}
