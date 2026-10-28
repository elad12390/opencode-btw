import { expect, test } from "bun:test"
import { ScrollBoxRenderable } from "@opentui/core"
import { createSideState, type SideState } from "../src/state"
import { renderPanel } from "./panel-harness"

function stateWithAnswers(): SideState {
  return {
    ...createSideState(),
    conversations: {
      parent: { draft: "", turns: [{ question: "first", answer: "first answer" }, { question: "last", answer: "last answer" }] },
      other: { draft: "keep this", turns: [] },
    },
  }
}

test("slash suggestions can be navigated and selected without sending a model request", async () => {
  const setup = await renderPanel({ state: stateWithAnswers() })
  try {
    await setup.mockInput.typeText("/")
    await setup.flush()
    const frame = setup.captureCharFrame()
    expect(frame).toContain("/help")
    expect(frame).toContain("/clear")
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressEnter()
    await setup.flush()
    expect(setup.confirmations()).toBe(1)
    expect(setup.state().conversations.parent).toBeUndefined()
    expect(setup.state().conversations.other.draft).toBe("keep this")
    expect(setup.submitted()).toHaveLength(0)
  } finally { await setup.cleanup() }
})

test("Escape dismisses slash suggestions before it closes the panel", async () => {
  const setup = await renderPanel()
  try {
    await setup.mockInput.typeText("/")
    await setup.flush()
    expect(setup.renderer.root.findDescendantById("btw-command-menu")).toBeDefined()
    setup.mockInput.pressEscape()
    await setup.flush()
    expect(setup.renderer.root.findDescendantById("btw-command-menu")).toBeUndefined()
    expect(setup.input().plainText).toBe("/")
    expect(setup.closed()).toBe(0)
    setup.mockInput.pressEscape()
    await setup.flush()
    expect(setup.closed()).toBe(1)
  } finally { await setup.cleanup() }
})

test("an open command menu stops intercepting keys when focus leaves the side panel", async () => {
  const setup = await renderPanel()
  try {
    await setup.mockInput.typeText("/")
    await setup.flush()
    setup.setPanelFocused(false)
    await setup.flush()
    expect(setup.renderer.root.findDescendantById("btw-command-menu")).toBeUndefined()
    setup.mockInput.pressEscape()
    await setup.flush()
    expect(setup.closed()).toBe(0)
    expect(setup.input().plainText).toBe("/")
  } finally { await setup.cleanup() }
})

test("keyboard navigation reaches commands below the visible suggestion window", async () => {
  const setup = await renderPanel()
  try {
    await setup.mockInput.typeText("/")
    for (let index = 0; index < 6; index++) setup.mockInput.pressArrow("down")
    await setup.flush()
    expect(setup.captureCharFrame()).toContain("/close")
    setup.mockInput.pressEnter()
    await setup.flush()
    expect(setup.closed()).toBe(1)
    expect(setup.submitted()).toHaveLength(0)
  } finally { await setup.cleanup() }
})

test("/help opens the native command picker and /close closes without generating", async () => {
  const setup = await renderPanel()
  try {
    await setup.mockInput.typeText("/help")
    setup.mockInput.pressEnter()
    await setup.flush()
    expect(setup.helpOptions()).toContain("/clear")
    expect(setup.helpOptions()).toContain("/retry")
    expect(setup.helpOptions()).toContain("/close")
    expect(setup.input().plainText).toBe("")
    await setup.mockInput.typeText("/close")
    setup.mockInput.pressEnter()
    await setup.flush()
    expect(setup.closed()).toBe(1)
    expect(setup.submitted()).toHaveLength(0)
  } finally { await setup.cleanup() }
})

test("choosing an action from /help runs it locally", async () => {
  const setup = await renderPanel({ state: stateWithAnswers(), helpSelection: "copy" })
  try {
    let copied = ""
    setup.renderer.copyToClipboardOSC52 = (text) => { copied = text; return true }
    await setup.mockInput.typeText("/help")
    setup.mockInput.pressEnter()
    await setup.flush()
    expect(copied).toBe("last answer")
    expect(setup.submitted()).toHaveLength(0)
  } finally { await setup.cleanup() }
})

test("a pending help selection cannot act on a different parent session", async () => {
  let choose!: (command: "clear") => void
  const setup = await renderPanel({
    state: stateWithAnswers(),
    helpSelection: () => new Promise((resolve) => { choose = resolve }),
  })
  try {
    await setup.mockInput.typeText("/help")
    setup.mockInput.pressEnter()
    await setup.flush()
    setup.setSessionID("other")
    await setup.flush()
    choose("clear")
    await setup.flush()
    expect(setup.confirmations()).toBe(0)
    expect(setup.state().conversations.other.draft).toBe("keep this")
  } finally { await setup.cleanup() }
})

test("a suggestion can be chosen with the mouse", async () => {
  const setup = await renderPanel({ state: stateWithAnswers() })
  try {
    let copied = ""
    setup.renderer.copyToClipboardOSC52 = (text) => { copied = text; return true }
    await setup.mockInput.typeText("/co")
    await setup.flush()
    const copy = setup.renderer.root.findDescendantById("btw-command-copy")!
    await setup.mockMouse.click(copy.screenX, copy.screenY)
    await setup.flush()
    expect(copied).toBe("last answer")
    expect(setup.submitted()).toHaveLength(0)
  } finally { await setup.cleanup() }
})

test("/clear preserves the conversation when cancelled or while a question is pending", async () => {
  const cancelled = await renderPanel({ state: stateWithAnswers(), confirmClear: async () => false })
  try {
    await cancelled.mockInput.typeText("/clear")
    cancelled.mockInput.pressEnter()
    await cancelled.flush()
    expect(cancelled.confirmations()).toBe(1)
    expect(cancelled.state().conversations.parent.turns).toHaveLength(2)
    expect(cancelled.submitted()).toHaveLength(0)
  } finally { await cancelled.cleanup() }

  const pendingState: SideState = {
    ...stateWithAnswers(),
    conversations: { ...stateWithAnswers().conversations, parent: { ...stateWithAnswers().conversations.parent, pending: { id: 1, question: "in flight" } } },
  }
  const pending = await renderPanel({ state: pendingState })
  try {
    await pending.mockInput.typeText("/clear")
    pending.mockInput.pressEnter()
    await pending.flush()
    expect(pending.confirmations()).toBe(0)
    expect(pending.state().conversations.parent.pending?.question).toBe("in flight")
    expect(pending.toasts().join(" ")).toContain("Wait for the side question")
    expect(pending.submitted()).toHaveLength(0)
    await pending.mockInput.typeText("/close")
    pending.mockInput.pressEnter()
    await pending.flush()
    expect(pending.closed()).toBe(1)
    expect(pending.state().conversations.parent.pending?.question).toBe("in flight")
  } finally { await pending.cleanup() }
})

test("/copy copies the last answer and gives feedback when there is none", async () => {
  const setup = await renderPanel({ state: stateWithAnswers() })
  try {
    let copied = ""
    setup.renderer.copyToClipboardOSC52 = (text) => { copied = text; return true }
    await setup.mockInput.typeText("/copy")
    setup.mockInput.pressEnter()
    await setup.flush()
    expect(copied).toBe("last answer")
    expect(setup.submitted()).toHaveLength(0)
  } finally { await setup.cleanup() }
  const empty = await renderPanel()
  try {
    await empty.mockInput.typeText("/copy")
    empty.mockInput.pressEnter()
    await empty.flush()
    expect(empty.toasts().join(" ")).toContain("no side answer")
    expect(empty.submitted()).toHaveLength(0)
  } finally { await empty.cleanup() }
})

test("/retry retries only a failed side question", async () => {
  const failed: SideState = {
    ...createSideState(),
    conversations: { parent: { draft: "", turns: [], failedQuestion: "failed question", error: "unavailable" } },
  }
  const setup = await renderPanel({ state: failed })
  try {
    await setup.mockInput.typeText("/retry")
    setup.mockInput.pressEnter()
    await setup.flush()
    expect(setup.submitted()).toHaveLength(1)
    expect(setup.submitted()[0]).toContain("failed question")
    expect(setup.submitted()[0]).not.toContain("/retry")
  } finally { await setup.cleanup() }
  const empty = await renderPanel()
  try {
    await empty.mockInput.typeText("/retry")
    empty.mockInput.pressEnter()
    await empty.flush()
    expect(empty.toasts().join(" ")).toContain("no failed side question")
    expect(empty.submitted()).toHaveLength(0)
  } finally { await empty.cleanup() }
})

test("/latest scrolls to the bottom and /expand respects the available terminal width", async () => {
  const many = { ...createSideState(), conversations: { parent: {
    draft: "", turns: Array.from({ length: 12 }, (_, index) => ({ question: `question ${index}`, answer: `answer ${index}` })),
  } } }
  const setup = await renderPanel({ width: 100, height: 18, state: many })
  try {
    const scroll = setup.renderer.root.findDescendantById("btw-transcript") as ScrollBoxRenderable
    setup.mockInput.pressKey("\u001b[5~")
    await setup.flush()
    expect(scroll.scrollTop).toBeLessThan(scroll.scrollHeight - scroll.viewport.height)
    await setup.mockInput.typeText("/latest")
    setup.mockInput.pressEnter()
    await setup.flush()
    expect(scroll.scrollTop).toBe(Math.max(0, scroll.scrollHeight - scroll.viewport.height))
    await setup.mockInput.typeText("/expand")
    setup.mockInput.pressEnter()
    await setup.flush()
    expect(setup.expanded()).toBe(1)
    expect(setup.submitted()).toHaveLength(0)
  } finally { await setup.cleanup() }
  const narrow = await renderPanel({ width: 56 })
  try {
    await narrow.mockInput.typeText("/expand")
    narrow.mockInput.pressEnter()
    await narrow.flush()
    expect(narrow.expanded()).toBe(0)
    expect(narrow.toasts().join(" ")).toContain("too narrow")
  } finally { await narrow.cleanup() }
})

test("unknown slash text and commands with extra words remain ordinary side questions", async () => {
  const setup = await renderPanel()
  try {
    await setup.mockInput.typeText("/usr/local/bin is this safe?")
    setup.mockInput.pressEnter()
    await setup.flush()
    expect(setup.submitted()[0]).toContain("/usr/local/bin is this safe?")
    setup.finish("An answer")
    await setup.flush()
    await setup.mockInput.typeText("/clear what does this mean?")
    setup.mockInput.pressEnter()
    await setup.flush()
    expect(setup.submitted()[1]).toContain("/clear what does this mean?")
    expect(setup.confirmations()).toBe(0)
  } finally { await setup.cleanup() }
})

test("a stale suggestion never turns newly typed question text into a local command", async () => {
  let suppress = false
  const setup = await renderPanel({ suppressDraftUpdate: () => suppress })
  try {
    await setup.mockInput.typeText("/c")
    await setup.flush()
    expect(setup.renderer.root.findDescendantById("btw-command-clear")).toBeDefined()
    suppress = true
    await setup.mockInput.typeText("lear what does this mean?")
    suppress = false
    setup.mockInput.pressEnter()
    await setup.flush()
    expect(setup.confirmations()).toBe(0)
    expect(setup.submitted()).toHaveLength(1)
    expect(setup.submitted()[0]).toContain("/clear what does this mean?")
  } finally { await setup.cleanup() }
})

test("a stale suggestion cannot replace a newly typed exact command", async () => {
  let suppress = false
  const setup = await renderPanel({ suppressDraftUpdate: () => suppress })
  try {
    await setup.mockInput.typeText("/c")
    await setup.flush()
    suppress = true
    await setup.mockInput.typeText("lose")
    suppress = false
    setup.mockInput.pressEnter()
    await setup.flush()
    expect(setup.closed()).toBe(1)
    expect(setup.confirmations()).toBe(0)
    expect(setup.submitted()).toHaveLength(0)
  } finally { await setup.cleanup() }
})

test("autocomplete uses OpenCode's configured selection shortcut", async () => {
  const setup = await renderPanel({ state: stateWithAnswers(), navigationBindings: { "prompt.autocomplete.select": "ctrl+g" } })
  try {
    await setup.mockInput.typeText("/cl")
    setup.mockInput.pressKey("g", { ctrl: true })
    await setup.flush()
    expect(setup.confirmations()).toBe(1)
    expect(setup.state().conversations.parent).toBeUndefined()
    expect(setup.submitted()).toHaveLength(0)
  } finally { await setup.cleanup() }
})

test("the configured input-submit shortcut also runs an exact local command", async () => {
  const setup = await renderPanel({ editorBindings: [
    { key: "return", cmd: "input.newline" },
    { key: "ctrl+return", cmd: "input.submit" },
  ] })
  try {
    await setup.mockInput.typeText("/help")
    setup.mockInput.pressEnter({ ctrl: true })
    await setup.flush()
    expect(setup.helpOptions()).toContain("/help")
    expect(setup.submitted()).toHaveLength(0)
  } finally { await setup.cleanup() }
})

test("the command menu remains usable in a narrow terminal", async () => {
  const setup = await renderPanel({ width: 27, height: 12 })
  try {
    await setup.mockInput.typeText("/")
    await setup.flush()
    expect(setup.captureCharFrame()).toContain("/help")
    expect(setup.captureCharFrame()).toContain("up/down choose")
    expect(setup.input().height).toBeGreaterThan(0)
    expect(setup.input().screenY).toBeLessThan(12)
    setup.mockInput.pressEnter()
    await setup.flush()
    expect(setup.helpOptions()).toContain("/help")
  } finally { await setup.cleanup() }
})
