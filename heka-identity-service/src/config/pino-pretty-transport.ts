// To use messageFormat as a function it is needed to wrap pino-pretty in a custom module.
// See https://github.com/pinojs/pino-pretty/tree/master#handling-non-serializable-options for details.

import { createColors } from 'colorette'
import { LogDescriptor } from 'pino'
import pinoPretty, { PrettyOptions } from 'pino-pretty'

const colorette = createColors({ useColor: true })

const contextColor = colorette.green

function formatContext(log: LogDescriptor): string | undefined {
  const context = typeof log['context'] === 'string' ? log['context'] : undefined
  return context ? contextColor(context) : undefined
}

function formatMessage(log: LogDescriptor, messageKey: string): string | undefined {
  const message = log[messageKey]
  return typeof message === 'string' ? message : undefined
}

function messageFormat(log: LogDescriptor, messageKey: string, levelLabel: string): string {
  let line = ''

  const context = formatContext(log)
  if (context) {
    line = context
  }

  const message = formatMessage(log, messageKey)
  if (message) {
    line = line ? `${line} ${message}` : message
  }
  return line
}

export default (opts: PrettyOptions) =>
  pinoPretty({
    ...opts,
    messageFormat,
  })
