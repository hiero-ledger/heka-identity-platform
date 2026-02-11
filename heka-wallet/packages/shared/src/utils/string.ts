export function countSubstring(str: string, subStr: string): number {
  return str.split(subStr).length - 1
}

/**
 * Converts a camelCase string to a sentence format (first letter capitalized, rest in lower case).
 * i.e. sanitizeString("helloWorld")  // returns: 'Hello world'
 */
export function sanitizeString(str: string) {
  const result = str.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
  let words = result.split(' ')
  words = words.map((word, index) => {
    if (index === 0 || word.toUpperCase() === word) {
      return word.charAt(0).toUpperCase() + word.slice(1)
    }
    return word.charAt(0).toLowerCase() + word.slice(1)
  })
  return words.join(' ')
}
