import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const tmp = join(root, "tmp")
mkdirSync(tmp, { recursive: true })
const work = mkdtempSync(join(tmp, "package-check-"))

function run(command: string[], cwd: string) {
  const result = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed:\n${result.stderr.toString()}${result.stdout.toString()}`)
  }
  return result.stdout.toString()
}

try {
  run([process.execPath, "run", "build"], root)
  const [pack] = JSON.parse(run(["npm", "pack", "--json", "--ignore-scripts", "--pack-destination", work], root)) as {
    filename: string
    files: { path: string }[]
  }[]
  const files = pack.files.map((file) => file.path)
  const required = ["LICENSE", "README.md", "THIRD_PARTY_NOTICES.md", "assets/demo.gif", "dist/tui.js", "package.json"]
  for (const file of required) {
    if (!files.includes(file)) throw new Error(`Package is missing ${file}`)
  }
  for (const file of files) {
    if (!required.includes(file)) {
      throw new Error(`Unexpected file in package: ${file}`)
    }
  }

  const consumer = join(work, "consumer")
  mkdirSync(consumer)
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "btw-package-check", private: true, type: "module" }))
  run([process.execPath, "add", join(work, pack.filename)], consumer)
  copyFileSync(join(root, "scripts/package-smoke.tsx"), join(consumer, "package-smoke.tsx"))
  console.log(run([process.execPath, "--preload", "@opentui/solid/preload", "--preload", "@opentui/solid/runtime-plugin-support", "package-smoke.tsx"], consumer).trim())
  const installed = JSON.parse(readFileSync(join(consumer, "node_modules/opencode-btw-sidechat/package.json"), "utf8"))
  console.log(`Verified ${installed.name}@${installed.version} (${files.length} files)`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
