import 'react-native-get-random-values'
import '@ethersproject/shims'
import EventEmitter from 'eventemitter3'
import { TextDecoder, TextEncoder } from 'text-encoding-polyfill'

global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Hermes doesn't implement String.prototype.isWellFormed (ES2024).
// '@scure/base' (used by Credo for UTF-8 encoding) falls back to a shim when it's missing,
// but in production bundles Metro evaluates that check at build time (in Node, where the method exists)
// and keeps only the 'str.isWellFormed()' call, which throws at runtime without this polyfill.
const stringPrototype = String.prototype
if (typeof stringPrototype.isWellFormed !== 'function') {
  Object.defineProperty(stringPrototype, 'isWellFormed', {
    configurable: true,
    writable: true,
    value: function isWellFormed() {
      // encodeURI throws on lone surrogates, i.e. on strings that are not well-formed UTF-16
      try {
        encodeURI(this)
        return true
      } catch {
        return false
      }
    },
  })
}

if (typeof __dirname === 'undefined') global.__dirname = '/'
if (typeof __filename === 'undefined') global.__filename = ''
if (typeof process === 'undefined') {
  global.process = require('process')
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const processPolyfill = require('process')
  for (const propKey in processPolyfill) {
    if (!(propKey in process)) {
      process[propKey] = processPolyfill[propKey]
    }
  }
}

process.browser = false
// eslint-disable-next-line @typescript-eslint/no-var-requires
if (typeof Buffer === 'undefined') global.Buffer = require('buffer').Buffer

if (!global.atob || !global.btoa) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Buffer = require('buffer').Buffer
  global.atob = (data) => {
    return Buffer.from(data, 'base64').toString()
  }

  global.btoa = (data) => {
    return Buffer.from(data).toString('base64')
  }
}

const isDev = typeof __DEV__ === 'boolean' && __DEV__
process.env['NODE_ENV'] = isDev ? 'development' : 'production'

const eventListener = new EventEmitter()

window.addEventListener = (type, fn, options) => {
  if (options && options.once) {
    eventListener.once(type, fn)
  } else {
    eventListener.addListener(type, fn)
  }
}

window.removeEventListener = (type, fn) => {
  eventListener.removeListener(type, fn)
}

window.dispatchEvent = (event) => {
  eventListener.emit(event.type)
}
