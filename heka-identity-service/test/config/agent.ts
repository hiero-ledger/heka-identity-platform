import OriginalConfig from 'src/config/agent'

export default () => {
  const config = OriginalConfig()

  config.initConfig.allowInsecureHttpUrls = true

  return config
}
