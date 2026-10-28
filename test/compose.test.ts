import { expect, test } from "bun:test"
import { TextareaRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { registerDefaultKeys } from "@opentui/keymap/addons"
import { createOpenTuiKeymap } from "@opentui/keymap/opentui"
import { submitDraft } from "../src/compose"
import { createSideState, setDraft, startQuestion, type SideRequest } from "../src/state"

test("submits the actual textarea contents even when the saved draft has not caught up", async () => {
  const terminal = await createTestRenderer({ width: 80, height: 24 })
  try {
    const input = new TextareaRenderable(terminal.renderer, { id: "side-input", width: 40, height: 3 })
    terminal.renderer.root.add(input)
    input.setText("What was your previous answer?")
    let state = createSideState()
    let request: SideRequest | undefined
    submitDraft("parent", input, {
      setDraft: (sessionID, value) => { state = setDraft(state, sessionID, value) },
      submit: (sessionID) => {
        const started = startQuestion(state, sessionID)
        if (started) {
          state = started.state
          request = started.request
        }
      },
    })
    expect(request?.prompt).toContain("What was your previous answer?")
  } finally {
    await terminal.dispose()
  }
})

test("Enter submits text through a real OpenTUI textarea", async () => {
  const terminal = await createTestRenderer({ width: 80, height: 24 })
  try {
    let state = createSideState()
    let request: SideRequest | undefined
    const controls = {
      setDraft: (sessionID: string, value: string) => { state = setDraft(state, sessionID, value) },
      submit: (sessionID: string) => {
        const started = startQuestion(state, sessionID)
        if (started) {
          state = started.state
          request = started.request
        }
      },
    }
    const input = new TextareaRenderable(terminal.renderer, {
      id: "side-input",
      width: 40,
      height: 3,
      keyBindings: [{ name: "return", action: "submit" }],
      onSubmit: () => submitDraft("parent", input, controls),
    })
    terminal.renderer.root.add(input)
    input.focus()
    await terminal.renderOnce()
    await terminal.mockInput.typeText("A follow-up question")
    terminal.mockInput.pressEnter()
    await terminal.flush()

    expect(request?.prompt).toContain("A follow-up question")
  } finally {
    await terminal.dispose()
  }
})

test("a focused high-priority keymap submits the current textarea text", async () => {
  const terminal = await createTestRenderer({ width: 80, height: 24 })
  try {
    let state = createSideState()
    let request: SideRequest | undefined
    const controls = {
      setDraft: (sessionID: string, value: string) => { state = setDraft(state, sessionID, value) },
      submit: (sessionID: string) => {
        const started = startQuestion(state, sessionID)
        if (started) {
          state = started.state
          request = started.request
        }
      },
    }
    const input = new TextareaRenderable(terminal.renderer, { id: "side-input", width: 40, height: 3 })
    terminal.renderer.root.add(input)
    const keymap = createOpenTuiKeymap(terminal.renderer)
    registerDefaultKeys(keymap)
    keymap.registerLayer({
      target: input,
      priority: 100,
      commands: [{ name: "side.submit", run: () => submitDraft("parent", input, controls) }],
      bindings: [{ key: "return", cmd: "side.submit" }],
    })
    input.focus()
    await terminal.renderOnce()
    await terminal.mockInput.typeText("Question sent through the keymap")
    terminal.mockInput.pressEnter()
    await terminal.flush()

    expect(request?.prompt).toContain("Question sent through the keymap")
  } finally {
    await terminal.dispose()
  }
})
