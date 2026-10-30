// Runs the Gradle wrapper in android/ with the given arguments, on any OS.
// ./gradlew is a shell script that Windows cannot start; there the wrapper is gradlew.bat.
const { spawnSync } = require('child_process')
const path = require('path')

const androidDir = path.join(__dirname, 'android')
const args = process.argv.slice(2)
// Node starts a .bat file only through cmd.exe
const [command, commandArgs] =
  process.platform === 'win32'
    ? ['cmd.exe', ['/c', path.join(androidDir, 'gradlew.bat'), ...args]]
    : [path.join(androidDir, 'gradlew'), args]

const result = spawnSync(command, commandArgs, { cwd: androidDir, stdio: 'inherit' })

if (result.error) {
  process.stderr.write(`${result.error.message}\n`)
}
process.exit(result.status ?? 1)
