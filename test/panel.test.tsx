import { expect, test } from "bun:test"
import { ScrollBoxRenderable } from "@opentui/core"
import { clearConversation, createSideState, startQuestion, type SideState } from "../src/state"
import { renderPanel } from "./panel-harness"

function conversation(questions: readonly string[]): SideState {
  return {
    ...createSideState(),
    conversations: { parent: { draft: "", turns: questions.map((question) => ({ question, answer: `Answer to ${question}` })) } },
  }
}

test("the actual panel renders the conversation as native-style cards and rendered Markdown", async () => {
  const setup = await renderPanel({ state: { ...createSideState(), conversations: { parent: {
    draft: "",
    turns: [{ question: "What changed?", answer: "A **bold answer** with `code`." }],
  } } } })
  try {
    setup.renderer.start()
    const frame = await setup.waitForFrame((value) => value.includes("bold answer") && value.includes("What changed?"), { maxPasses: 300 })
    expect(frame).toContain("/btw")
    expect(frame).toContain("What changed?")
    expect(frame).toContain("bold answer")
    expect(frame).not.toContain("**bold answer**")
    expect(frame).toContain("Ask a follow-up")
  } finally { await setup.cleanup() }
})

test("the native managed editor honors configured submit/newline keys and keeps Alt+F for word navigation", async () => {
  const setup = await renderPanel({ editorBindings: [
    { key: "return", cmd: "input.newline" },
    { key: "ctrl+return", cmd: "input.submit" },
    { key: "alt+f", cmd: "input.word.forward" },
  ] })
  try {
    const input = setup.input()
    await setup.mockInput.typeText("first second")
    input.cursorOffset = 0
    setup.mockInput.pressKey("f", { meta: true })
    await setup.flush()
    expect(input.cursorOffset).toBeGreaterThan(0)
    expect(setup.expanded()).toBe(0)
    input.cursorOffset = input.plainText.length
    setup.mockInput.pressEnter()
    await setup.flush()
    expect(input.plainText).toBe("first second\n")
    expect(setup.submitted()).toHaveLength(0)
    await setup.mockInput.typeText("follow-up")
    setup.mockInput.pressEnter({ ctrl: true })
    await setup.flush()
    expect(setup.submitted()).toHaveLength(1)
    expect(setup.submitted()[0]).toContain("first second\nfollow-up")
  } finally { await setup.cleanup() }
})

test("Up and Down recall side questions and restore the unfinished side draft", async () => {
  const setup = await renderPanel({ state: conversation(["first side question", "second side question"]) })
  try {
    const input = setup.input()
    await setup.mockInput.typeText("unfinished draft")
    setup.mockInput.pressArrow("up")
    setup.mockInput.pressArrow("up")
    await setup.flush()
    expect(input.plainText).toBe("second side question")
    setup.mockInput.pressArrow("up")
    await setup.flush()
    expect(input.plainText).toBe("first side question")
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressArrow("down")
    await setup.flush()
    expect(input.plainText).toBe("unfinished draft")
  } finally { await setup.cleanup() }
})

test("clearing the side conversation also clears its navigable prompt history", async () => {
  const setup = await renderPanel({ state: conversation(["private previous question"]) })
  try {
    setup.mockInput.pressArrow("up")
    await setup.flush()
    expect(setup.input().plainText).toBe("private previous question")
    setup.setState(clearConversation(setup.state(), "parent"))
    await setup.flush()
    expect(setup.input().plainText).toBe("")
    setup.mockInput.pressArrow("up")
    await setup.flush()
    expect(setup.input().plainText).toBe("")
  } finally { await setup.cleanup() }
})

test("switching parent sessions never exposes the previous session's side history", async () => {
  const state: SideState = {
    ...createSideState(),
    conversations: {
      parent: { draft: "", turns: [{ question: "parent secret", answer: "parent answer" }] },
      other: { draft: "", turns: [{ question: "other question", answer: "other answer" }] },
    },
  }
  const setup = await renderPanel({ state })
  try {
    setup.mockInput.pressArrow("up")
    await setup.flush()
    expect(setup.input().plainText).toBe("parent secret")
    setup.setSessionID("other")
    await setup.flush()
    expect(setup.input().plainText).toBe("")
    setup.mockInput.pressArrow("up")
    await setup.flush()
    expect(setup.input().plainText).toBe("other question")
  } finally { await setup.cleanup() }
})

test("the transcript scrolls independently and the panel controls are clickable", async () => {
  const setup = await renderPanel({ width: 56, height: 18, state: conversation(Array.from({ length: 12 }, (_, i) => `question ${i}`)) })
  try {
    await setup.flush()
    const scroll = setup.renderer.root.findDescendantById("btw-transcript") as ScrollBoxRenderable
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.height)
    const bottom = scroll.scrollTop
    setup.mockInput.pressKey("\u001b[5~")
    await setup.flush()
    expect(scroll.scrollTop).toBeLessThan(bottom)
    const beforeWheel = scroll.scrollTop
    await setup.mockMouse.scroll(scroll.screenX + 2, scroll.screenY + 2, "up")
    await setup.flush()
    expect(scroll.scrollTop).toBeLessThanOrEqual(beforeWheel)
    const expand = setup.renderer.root.findDescendantById("btw-expand")!
    await setup.mockMouse.click(expand.x, expand.y)
    await setup.flush()
    expect(setup.expanded()).toBe(1)
    const close = setup.renderer.root.findDescendantById("btw-close")!
    await setup.mockMouse.click(close.x, close.y)
    expect(setup.closed()).toBe(1)
  } finally { await setup.cleanup() }
})

test("clicking the transcript still leaves Escape available to close the side panel", async () => {
  const setup = await renderPanel({ state: conversation(["question"]) })
  try {
    const scroll = setup.renderer.root.findDescendantById("btw-transcript") as ScrollBoxRenderable
    await setup.mockMouse.click(scroll.screenX + 5, scroll.screenY + 1)
    setup.mockInput.pressEscape()
    await setup.flush()
    expect(setup.closed()).toBe(1)
  } finally { await setup.cleanup() }
})

test("side-panel shortcuts stop intercepting keys when the main pane has focus", async () => {
  const setup = await renderPanel({ height: 18, state: conversation(Array.from({ length: 12 }, (_, index) => `question ${index}`)) })
  try {
    const scroll = setup.renderer.root.findDescendantById("btw-transcript") as ScrollBoxRenderable
    const position = scroll.scrollTop
    setup.setPanelFocused(false)
    await setup.flush()
    setup.mockInput.pressKey("\u001b[5~")
    setup.mockInput.pressEscape()
    await setup.flush()
    expect(scroll.scrollTop).toBe(position)
    expect(setup.closed()).toBe(0)
  } finally { await setup.cleanup() }
})

test("Ctrl+C clears only the side draft and Escape clears a selection before closing", async () => {
  const setup = await renderPanel()
  try {
    const input = setup.input()
    await setup.mockInput.typeText("an unfinished question")
    setup.mockInput.pressCtrlC()
    await setup.flush()
    expect(input.plainText).toBe("")
    expect(setup.closed()).toBe(0)
    await setup.mockInput.typeText("select this text")
    setup.renderer.startSelection(input, input.screenX, input.screenY)
    setup.renderer.updateSelection(input, input.screenX + 6, input.screenY, { finishDragging: true })
    expect(setup.renderer.getSelection()).not.toBeNull()
    setup.mockInput.pressEscape()
    await setup.flush()
    expect(setup.renderer.getSelection()).toBeNull()
    expect(setup.closed()).toBe(0)
    setup.mockInput.pressEscape()
    await setup.flush()
    expect(setup.closed()).toBe(1)
  } finally { await setup.cleanup() }
})

test("a follow-up typed during a pending answer is preserved rather than submitted or lost", async () => {
  const setup = await renderPanel()
  try {
    await setup.mockInput.typeText("first question")
    setup.mockInput.pressEnter()
    await setup.flush()
    expect(setup.submitted()).toHaveLength(1)
    await setup.mockInput.typeText("next question")
    setup.mockInput.pressEnter()
    await setup.flush()
    expect(setup.submitted()).toHaveLength(1)
    expect(setup.input().plainText).toBe("next question")
    setup.finish("First answer")
    await setup.flush()
    expect(setup.input().plainText).toBe("next question")
    setup.mockInput.pressEnter()
    await setup.flush()
    expect(setup.submitted()).toHaveLength(2)
    expect(setup.submitted()[1]).toContain("First answer")
    expect(setup.submitted()[1]).toContain("next question")
  } finally { await setup.cleanup() }
})

test("clicking send submits a pasted multiline side question", async () => {
  const setup = await renderPanel()
  try {
    const initialHeight = setup.input().height
    await setup.mockInput.pasteBracketedText("first line\nsecond line")
    await setup.flush()
    expect(setup.input().height).toBeGreaterThan(initialHeight)
    const send = setup.renderer.root.findDescendantById("btw-send")!
    await setup.mockMouse.click(send.screenX, send.screenY)
    await setup.flush()
    expect(setup.submitted()).toHaveLength(1)
    expect(setup.submitted()[0]).toContain("first line\nsecond line")
  } finally { await setup.cleanup() }
})

test("copy sends only the latest side answer to the terminal clipboard", async () => {
  const setup = await renderPanel({ state: conversation(["earlier", "latest"]) })
  try {
    let copied = ""
    setup.renderer.copyToClipboardOSC52 = (text) => { copied = text; return true }
    const copy = setup.renderer.root.findDescendantById("btw-copy")!
    await setup.mockMouse.click(copy.screenX, copy.screenY)
    expect(copied).toBe("Answer to latest")
  } finally { await setup.cleanup() }
})

test("a failed question can be retried without discarding earlier answers", async () => {
  const state: SideState = {
    ...createSideState(),
    conversations: { parent: {
      draft: "failed question",
      turns: [{ question: "earlier", answer: "earlier answer" }],
      error: "Connection failed",
      failedQuestion: "failed question",
    } },
  }
  const setup = await renderPanel({ state })
  try {
    expect(setup.captureCharFrame()).toContain("Connection failed")
    setup.mockInput.pressKey("r", { ctrl: true })
    await setup.flush()
    expect(setup.submitted()).toHaveLength(1)
    expect(setup.submitted()[0]).toContain("failed question")
    expect(setup.submitted()[0]).toContain("earlier answer")
  } finally { await setup.cleanup() }
})

test("side transcript navigation follows a customized session scrolling shortcut", async () => {
  const setup = await renderPanel({
    height: 18,
    state: conversation(Array.from({ length: 12 }, (_, index) => `question ${index}`)),
    navigationBindings: { "session.page.up": "ctrl+alt+z" },
  })
  try {
    const scroll = setup.renderer.root.findDescendantById("btw-transcript") as ScrollBoxRenderable
    const bottom = scroll.scrollTop
    setup.mockInput.pressKey("\u001b[5~")
    await setup.flush()
    expect(scroll.scrollTop).toBe(bottom)
    setup.mockInput.pressKey("z", { ctrl: true, meta: true })
    await setup.flush()
    expect(scroll.scrollTop).toBeLessThan(bottom)
  } finally { await setup.cleanup() }
})

test("a new side answer does not pull the transcript away while the user is reading older messages", async () => {
  const setup = await renderPanel({ height: 18, state: conversation(Array.from({ length: 12 }, (_, index) => `question ${index}`)) })
  try {
    const scroll = setup.renderer.root.findDescendantById("btw-transcript") as ScrollBoxRenderable
    setup.mockInput.pressKey("\u001b[5~")
    await setup.flush()
    const position = scroll.scrollTop
    const started = startQuestion(setup.state(), "parent", "another question")!
    setup.setState(started.state)
    await setup.flush()
    setup.finish("The new answer")
    await setup.flush()
    expect(scroll.scrollTop).toBe(position)
  } finally { await setup.cleanup() }
})

test("a narrow, short terminal still shows a usable composer and close control", async () => {
  const setup = await renderPanel({ width: 27, height: 12 })
  try {
    const frame = setup.captureCharFrame()
    expect(frame).toContain("/btw")
    expect(frame).toContain("esc")
    expect(frame).toContain("Ask anything")
    expect(setup.input().height).toBeGreaterThan(0)
    expect(setup.input().y).toBeLessThan(12)
  } finally { await setup.cleanup() }
})
