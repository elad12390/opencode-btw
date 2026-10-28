import { expect, test } from "bun:test"
import { clearSideConversation } from "../src/clear"
import { createSideState, getConversation, setDraft, startQuestion } from "../src/state"

test("clear confirmation applies only to its intended session", async () => {
  let state = setDraft(setDraft(createSideState(), "one", "first"), "two", "second")
  await clearSideConversation("one", {
    state: () => state,
    update: (next) => { state = next },
    confirm: async () => false,
    notifyPending: () => { throw new Error("not pending") },
  })
  expect(getConversation(state, "one").draft).toBe("first")
  await clearSideConversation("one", {
    state: () => state,
    update: (next) => { state = next },
    confirm: async () => true,
    notifyPending: () => { throw new Error("not pending") },
  })
  expect(getConversation(state, "one").draft).toBe("")
  expect(getConversation(state, "two").draft).toBe("second")
})

test("clear rechecks pending requests after an open confirmation", async () => {
  let state = setDraft(createSideState(), "one", "question")
  let resolveConfirm!: (value: boolean) => void
  let notices = 0
  const pending = clearSideConversation("one", {
    state: () => state,
    update: (next) => { state = next },
    confirm: () => new Promise((resolve) => { resolveConfirm = resolve }),
    notifyPending: () => { notices++ },
  })
  state = startQuestion(state, "one")!.state
  resolveConfirm(true)
  await pending
  expect(getConversation(state, "one").pending?.question).toBe("question")
  expect(notices).toBe(1)
})
