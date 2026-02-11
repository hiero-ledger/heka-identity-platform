import { EnvProducer, KeplrError, MessageSender, Result, Router } from '@keplr-wallet/router'
import EventEmitter from 'eventemitter3'

export class RNRouterBase extends Router {
  public constructor(
    protected readonly envProducer: EnvProducer,
    protected readonly eventEmitter: EventEmitter
  ) {
    super(envProducer)
  }

  public listen(port: string): void {
    if (!port) {
      throw new Error('Empty port')
    }

    this.port = port
    this.eventEmitter.addListener('message', this.onMessage)
  }

  public unlisten(): void {
    this.port = ''
    this.eventEmitter.removeListener('message', this.onMessage)
  }

  protected onMessage = async (params: {
    message: any
    sender: MessageSender & {
      resolver: (result: Result) => void
    }
  }): Promise<void> => {
    const { message, sender } = params
    if (message.port !== this.port) {
      return
    }

    try {
      const result = await this.handleMessage(message, sender)
      sender.resolver({
        return: result,
      })
      return
    } catch (e: any) {
      const errorMessage = e instanceof Error ? e.message : e?.toString()
      console.log(`Failed to process msg ${message.type}: ${errorMessage}`)
      if (e instanceof KeplrError) {
        sender.resolver({
          error: {
            code: e.code,
            module: e.module,
            message: errorMessage,
          },
        })
      } else if (e) {
        sender.resolver({
          error: errorMessage,
        })
      } else {
        sender.resolver({
          error: 'Unknown error',
        })
      }
    }
  }
}

export class RNRouterBackground extends RNRouterBase {
  public static readonly EventEmitter: EventEmitter = new EventEmitter()

  public constructor(protected readonly envProducer: EnvProducer) {
    super(envProducer, RNRouterBackground.EventEmitter)
  }
}

export class RNRouterUI extends RNRouterBase {
  public static readonly EventEmitter: EventEmitter = new EventEmitter()

  public constructor(protected readonly envProducer: EnvProducer) {
    super(envProducer, RNRouterUI.EventEmitter)
  }
}
