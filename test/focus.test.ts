import { expect, test } from "bun:test"
import { TextareaRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { restorePreviousFocus } from "../src/focus"

test("closing the side panel restores focus to the previously focused main editor", async () => {
  const terminal = await createTestRenderer({ width: 80, height: 24 })
  try {
    const main = new TextareaRenderable(terminal.renderer, { id: "main", width: 40, height: 3 })
    const side = new TextareaRenderable(terminal.renderer, { id: "side", width: 40, height: 3 })
    terminal.renderer.root.add(main)
    terminal.renderer.root.add(side)
    main.focus()
    side.focus()
    side.destroy()

    restorePreviousFocus(terminal.renderer, main, () => true)
    await Promise.resolve()
    expect(terminal.renderer.currentFocusedRenderable).toBe(main)
  } finally {
    await terminal.dispose()
  }
})

test("closing a panel does not steal focus from another active editor", async () => {
  const terminal = await createTestRenderer({ width: 80, height: 24 })
  try {
    const main = new TextareaRenderable(terminal.renderer, { id: "main", width: 40, height: 3 })
    const other = new TextareaRenderable(terminal.renderer, { id: "other", width: 40, height: 3 })
    terminal.renderer.root.add(main)
    terminal.renderer.root.add(other)
    other.focus()

    restorePreviousFocus(terminal.renderer, main, () => true)
    await Promise.resolve()
    expect(terminal.renderer.currentFocusedRenderable).toBe(other)
  } finally {
    await terminal.dispose()
  }
})

test("does not restore an editor after the active session changes", async () => {
  const terminal = await createTestRenderer({ width: 80, height: 24 })
  try {
    const main = new TextareaRenderable(terminal.renderer, { id: "main", width: 40, height: 3 })
    terminal.renderer.root.add(main)

    restorePreviousFocus(terminal.renderer, main, () => false)
    await Promise.resolve()
    expect(terminal.renderer.currentFocusedRenderable).not.toBe(main)
  } finally {
    await terminal.dispose()
  }
})
