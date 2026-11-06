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

  // Likewise for the OID4VC router: a `.env` `AGENT_OID4VCI_ENDPOINT` (typically an
  // ngrok tunnel) would otherwise be baked into credential offers and
  // authorization requests, and the in-process holder would fetch request
  // objects from the tunnel instead of the local router.
  const oid4VcEndpoint = `http://localhost:${config.oidConfig.port}`
  config.oidConfig = {
    ...config.oidConfig,
    issuanceEndpoint: `${oid4VcEndpoint}/oid4vci`,
    verificationEndpoint: `${oid4VcEndpoint}/oid4vp`,
  }

  return config
}
