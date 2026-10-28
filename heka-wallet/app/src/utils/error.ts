// Credo loggers take a data record, so an error is logged as its stack or message.
export function formatError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error)
}
