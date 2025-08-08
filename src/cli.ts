import type { SdkArch, SdkOS, SdkVersion } from './enums/sdk'
import { cac } from 'cac'
import { version } from '../package.json'
import { runCommandLineDownload } from './command-line'

const cli = cac('arkcode-sdk-downloader')

interface DownloadCommandLineOptions {
  apiVersion: keyof typeof SdkVersion
  arch: keyof typeof SdkArch
  os: keyof typeof SdkOS
  cacheDir: string
  targetDir: string
  logType: 'explicit' | 'full' | 'silent'
  logTimeout: number
}

cli.command('download', 'Start a resumeable task for download OpenHarmony SDK.')
  .option('--api-version <version>', 'SDK version (e.g., API12, API13, API14, API15, API18)')
  .option('--arch <arch>', 'SDK architecture (e.g., X86, ARM)')
  .option('--os <os>', 'SDK operating system (e.g., Windows, Linux, MacOS)')
  .option('--cache-dir <dir>', 'Directory to store cache downloaded SDKs', { default: './.cache' })
  .option('--target-dir <dir>', 'Directory to save the downloaded SDK', { default: './download' })
  .option('--log-type', 'Log type, (default: explicit), can be \'explicit\', \'full\', or \'silent\'', { default: 'explicit' })
  .option('--log-timeout [ms]', 'Timeout for log output in milliseconds, default is 5000ms', { default: 5000 })
  .alias('d')
  .action(async (options: DownloadCommandLineOptions) => runCommandLineDownload(options))

cli.version(version).help().parse()
