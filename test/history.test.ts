import { expect, test } from "bun:test"
import { nextQuestion, previousQuestion } from "../src/history"
import type { Conversation } from "../src/state"

test("side prompt history is isolated and restores the draft after browsing", () => {
  const conversation: Conversation = {
    draft: "unfinished",
    turns: [{ question: "one", answer: "first" }, { question: "two", answer: "second" }],
  }
  const newest = previousQuestion(conversation, "unfinished")!
  expect(newest.text).toBe("two")
  const oldest = previousQuestion(conversation, newest.text, newest.navigation)!
  expect(oldest.text).toBe("one")
  const forward = nextQuestion(oldest.navigation)!
  expect(forward.text).toBe("two")
  const restored = nextQuestion(forward.navigation)!
  expect(restored.text).toBe("unfinished")
  expect(restored.navigation).toBeUndefined()
})

test("failed and pending questions remain in side-prompt history", () => {
  const pending: Conversation = { turns: [], draft: "", pending: { id: 1, question: "working" } }
  const failed: Conversation = { turns: [], draft: "", failedQuestion: "failed" }
  expect(previousQuestion(pending, "")?.text).toBe("working")
  expect(previousQuestion(failed, "")?.text).toBe("failed")
  expect(previousQuestion({ turns: [], draft: "" }, "new")).toBeUndefined()
})
