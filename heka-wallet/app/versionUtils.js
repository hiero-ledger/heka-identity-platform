const semver = require("semver")

const version = process.argv[2]
// make a single version number from semver. just add all the versions together. To avoid overlapping, separate major, minor and
// patch versions by multiplying by powers of 10. The exact power of 10 depends on how many versions do you expect.
// For example, if you expect roughly 200 patch versions in one minor version, multiply minor version by 10^3
// Examples: input: 2.3.4, output: 203004.
// input: 2.35.431, output: 235431
console.log(semver.major(version) * 100000 + semver.minor(version) * 1000 + semver.patch(version))
