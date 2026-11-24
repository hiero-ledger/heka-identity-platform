function setImmediate(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('setImmediate callback must be a function')
  }
  const args = Array.prototype.slice.call(arguments, 1)
  return setTimeout(function () {
    callback.apply(undefined, args)
  }, 0)
}

function clearImmediate(handle) {
  clearTimeout(handle)
}

globalThis.setImmediate = setImmediate
globalThis.clearImmediate = clearImmediate

export default setImmediate
