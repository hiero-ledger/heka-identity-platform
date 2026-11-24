import cbor from 'cbor-x/index-no-eval'

export const Encoder = cbor.Encoder
export const Decoder = cbor.Decoder
export const encode = cbor.encode
export const decode = cbor.decode
export const addExtension = cbor.addExtension
export const Tag = cbor.Tag
export default cbor
