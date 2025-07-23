import { cac } from "cac";
import { version } from "../package.json";
import { getSdkUrl, SdkArch, SdkOS, SdkVersion } from "./enums/sdk";
import { CliError } from "./errors/cli";
import { createDownloader } from "./download";
import P from 'pino'
import pretty from "pino-pretty";

const cli = cac("arkcode-sdk-downloader");

interface DownloadCommandOptions {
  apiVersion: keyof typeof SdkVersion;
  arch: keyof typeof SdkArch;
  os: keyof typeof SdkOS;
  cacheDir: string;
  targetDir: string;
  logType: "explicit" | "full" | "silent";
  logTimeout: number;
}

function isLogType(logType: string): logType is "explicit" | "full" | "silent" {
  return ["explicit", "full", "silent"].includes(logType);
}

cli.command("download", "Start a resumeable task for download OpenHarmony SDK.")
  .option("--api-version <version>", "SDK version (e.g., API12, API13, API14, API15, API18)")
  .option("--arch <arch>", "SDK architecture (e.g., X86, ARM)")
  .option("--os <os>", "SDK operating system (e.g., Windows, Linux, MacOS)")
  .option("--cache-dir <dir>", "Directory to store cache downloaded SDKs", { default: "./.cache" })
  .option("--target-dir <dir>", "Directory to save the downloaded SDK", { default: "./download" })
  .option("--log-type", "Log type, (default: explicit), can be 'explicit', 'full', or 'silent'", { default: "explicit" })
  .option("--log-timeout [ms]", "Timeout for log output in milliseconds, default is 5000ms", { default: 5000 })
  .alias("d")
  .action(async (options: DownloadCommandOptions) => {
    if (!options.apiVersion || !options.arch || !options.os) {
      throw new CliError("Please provide --api-version, --arch, and --os options.", options);
    }
    if (!isLogType(options.logType))
      throw new CliError(`Invalid log type: ${options.logType}. Valid options are 'explicit', 'full', or 'silent'.`, options);
    const url = getSdkUrl(SdkVersion[options.apiVersion], SdkArch[options.arch], SdkOS[options.os])
    if (!url) {
      throw new CliError(`No SDK found for version ${options.apiVersion}, architecture ${options.arch}, and OS ${options.os}.`, options);
    }
    
    const logger = P(pretty({ colorize: true, colorizeObjects: true, singleLine: true }))
    logger.info(options, `CLI Options:`)
    const abortController = new AbortController();
    process.on('exit', () => abortController.abort())
    const downloader = await createDownloader({
      url,
      cacheDir: options.cacheDir,
      targetDir: options.targetDir,
      resumeDownload: true,
      signal: abortController.signal,
    })

    downloader.on('*', (ev, data) => {
      if (options.logType === 'silent') return; 
      if (options.logType === 'full') return logger.info({ event: ev, data }, `Event: ${ev}`);
    })

    if (options.logType === 'explicit') {
      // 每隔 5 秒打印一次下载进度
      let lastLogTime = 0;
      downloader.on('download-progress', (progress) => {
        const now = Date.now();
        if (now - lastLogTime >= options.logTimeout) { // 5000ms = 5秒
          logger.info({
            ...progress,
            msg: `Percentage: ${progress.percentage.toFixed(2)}%, current speed: ${progress.network}${progress.unit}/s`,
          });
          lastLogTime = now;
        }
      })
      downloader.on('zip-extracted', (entry) => {
        // 每隔 5 秒打印一次解压进度
        const now = Date.now();
        if (now - lastLogTime >= options.logTimeout) {
          logger.info(entry, `Extracted file in zip: ${entry.path}...`);
          lastLogTime = now;
        }
      })
      downloader.on('tar-extracted', (entry) => {
        // 每隔 5 秒打印一次解压进度
        const now = Date.now();
        if (now - lastLogTime >= options.logTimeout) { // 5000ms = 5秒
          logger.info(entry, `Extracted file in tar.gz: ${entry.path}...`);
          lastLogTime = now;
        }
      })
    }

    logger.info(`Starting download from ${url}`);
    await downloader.startDownload()
    logger.info(`Download completed and saved to ${options.targetDir}, starting SHA256 check...`);
    await downloader.checkSha256();
    logger.info(`SHA256 check passed, SDK is ready in ${options.targetDir}, starting extract tar...`);
    await downloader.extractTar();
    logger.info(`SDK extracted successfully, starting extract zip...`);
    await downloader.extractZip();
    logger.info(`SDK extracted successfully, cleanup...`);
    await downloader.clean();
    logger.info(`Cleanup completed, SDK is ready in ${options.targetDir}.`);
  })

cli.version(version).help().parse();