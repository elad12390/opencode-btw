import { expect, test } from "bun:test"
import plugin from "../src/tui"
import { PLUGIN_ID } from "../src/identifiers"

test("loads the actual V2 TUI plugin entrypoint", () => {
  expect(plugin.id).toBe(PLUGIN_ID)
  expect(typeof plugin.setup).toBe("function")
})
