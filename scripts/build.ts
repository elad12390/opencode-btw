import solidPlugin from "@opentui/solid/bun-plugin"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const result = await Bun.build({
  entrypoints: [join(root, "src/tui.tsx")],
  outdir: join(root, "dist"),
  target: "bun",
  packages: "external",
  plugins: [solidPlugin],
})

if (!result.success) {
  for (const error of result.logs) console.error(error)
  process.exit(1)
}

console.log("Built the OpenCode TUI plugin")
