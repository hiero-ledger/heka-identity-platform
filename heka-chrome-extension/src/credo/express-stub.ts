// @credo-ts/openid4vc imports express at the top level. The holder API does not call it.
export default function express(): never {
  throw new Error('Express is not available in the browser extension')
}

export const Router = express
