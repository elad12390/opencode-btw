import { expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { createOpenTuiKeymap } from "@opentui/keymap/opentui"
import { ASIDE_COMMAND_ID, COMMAND_PRIORITY } from "../src/identifiers"

test("a higher-priority session.aside command replaces the built-in command", async () => {
  const terminal = await createTestRenderer({ width: 80, height: 24 })
  try {
    const keymap = createOpenTuiKeymap(terminal.renderer)
    let selected = ""
    keymap.registerLayer({
      commands: [{ name: "session.aside", slash: { name: "btw", arguments: true }, run: () => { selected = "native" } }],
    })
    keymap.registerLayer({
      priority: COMMAND_PRIORITY,
      commands: [{ name: ASIDE_COMMAND_ID, slash: { name: "btw", arguments: true }, run: () => { selected = "sidechat" } }],
    })

    const commands = keymap.getCommandEntries({ visibility: "reachable" })
      .filter((entry) => entry.command.name === ASIDE_COMMAND_ID)
    expect(commands).toHaveLength(1)
    expect(keymap.runCommand(ASIDE_COMMAND_ID).ok).toBe(true)
    expect(selected).toBe("sidechat")
  } finally {
    await terminal.dispose()
  }
})
