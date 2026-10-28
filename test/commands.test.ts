import { expect, test } from "bun:test"
import { SIDE_COMMANDS, sideCommand, sideCommandSuggestions } from "../src/commands"

test("matches only complete local commands, not ordinary questions or paths", () => {
  expect(sideCommand(" /HELP ")?.name).toBe("help")
  expect(sideCommand("/clear please explain this")).toBeUndefined()
  expect(sideCommand("/usr/local/bin")).toBeUndefined()
  expect(sideCommand("/unknown")).toBeUndefined()
})

test("suggests only a slash token and filters by command name", () => {
  expect(sideCommandSuggestions("/")).toHaveLength(SIDE_COMMANDS.length)
  expect(sideCommandSuggestions("/c").map((command) => command.name)).toEqual(["clear", "copy", "close"])
  expect(sideCommandSuggestions("/usr/local")).toEqual([])
  expect(sideCommandSuggestions("/clear question")).toEqual([])
})
