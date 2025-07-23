export class CliError<CliOptions extends Record<string, any>> extends Error {
  constructor(message: string, public cliOptions: CliOptions) {
    super(message)
  }
}