import OriginalConfig from 'src/config/agent'

export default () => {
  const config = OriginalConfig()

  config.initConfig.allowInsecureHttpUrls = true

  // Force the credo agent's DIDComm endpoints to point at the in-process
  // HTTP/WS inbound transports on `localhost`. Without this override, a
  // developer-machine `.env` (loaded automatically by NestJS ConfigModule)
  // can leak `EXPRESS_HOST` / `AGENT_HTTP_ENDPOINT` into the test process,
  // causing every OOB invitation to embed an unreachable endpoint and the
  // holder's outbound DIDComm POST to hang against an HTTP server that
  // does not handle DIDComm. The cross-tenant connection / Aries issuance /
  // Aries verification e2e tests then time out indefinitely.
  const httpEndpoint = `http://localhost:${config.httpPort}`
  const wsEndpoint = `ws://localhost:${config.wsPort}`
  config.httpEndpoint = httpEndpoint
  config.wsEndpoint = wsEndpoint
  config.didCommConfig = {
    ...config.didCommConfig,
    endpoints: [httpEndpoint, wsEndpoint],
  }

  return config
}
