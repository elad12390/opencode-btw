import { describe, expect, test } from "bun:test"
import {
  createSideState,
  clearConversation,
  getConversation,
  setDraft,
  startQuestion,
  finishQuestion,
  failQuestion,
} from "../src/state"

describe("side conversations", () => {
  test("builds a question for the parent session without modifying its transcript", () => {
    const state = setDraft(createSideState(), "parent-1", "Why did the test fail?")
    const result = startQuestion(state, "parent-1")

    expect(result?.request.sessionID).toBe("parent-1")
    expect(result?.request.prompt).toContain("Why did the test fail?")
    expect(result?.request.prompt).toContain("Do not call tools")
    expect(getConversation(state, "parent-1").turns).toEqual([])
    expect(getConversation(result!.state, "parent-1").pending?.question).toBe("Why did the test fail?")
    expect(getConversation(result!.state, "parent-1").draft).toBe("")
  })

  test("includes completed side exchanges in follow-ups, but not in other sessions", () => {
    let state = setDraft(createSideState(), "parent-1", "What happened?")
    const first = startQuestion(state, "parent-1")!
    state = finishQuestion(first.state, "parent-1", first.request.id, "The build failed.")
    state = setDraft(state, "parent-1", "Why?")
    const followup = startQuestion(state, "parent-1")!

    expect(followup.request.prompt).toContain("What happened?")
    expect(followup.request.prompt).toContain("The build failed.")
    expect(followup.request.prompt).toContain("Why?")

    state = setDraft(followup.state, "parent-2", "A different question")
    const other = startQuestion(state, "parent-2")!
    expect(other.request.prompt).not.toContain("The build failed.")
    expect(other.request.prompt).not.toContain("What happened?")
  })

  test("keeps the failed question and previous answers available for retry", () => {
    let state = setDraft(createSideState(), "parent", "First")
    const first = startQuestion(state, "parent")!
    state = finishQuestion(first.state, "parent", first.request.id, "First answer")
    state = setDraft(state, "parent", "Second")
    const second = startQuestion(state, "parent")!
    state = failQuestion(second.state, "parent", second.request.id, "Provider unavailable")

    expect(getConversation(state, "parent").turns).toEqual([{ question: "First", answer: "First answer" }])
    expect(getConversation(state, "parent").draft).toBe("Second")
    expect(getConversation(state, "parent").error).toBe("Provider unavailable")
    expect(startQuestion(state, "parent")?.request.prompt).toContain("Second")
  })

  test("keeps concurrent requests in different parent sessions independent", () => {
    let state = setDraft(createSideState(), "one", "First question")
    const first = startQuestion(state, "one")!
    state = setDraft(first.state, "two", "Second question")
    const second = startQuestion(state, "two")!
    state = finishQuestion(second.state, "one", first.request.id, "First answer")
    state = finishQuestion(state, "two", second.request.id, "Second answer")

    expect(getConversation(state, "one").turns).toEqual([{ question: "First question", answer: "First answer" }])
    expect(getConversation(state, "two").turns).toEqual([{ question: "Second question", answer: "Second answer" }])
  })

  test("preserves a new draft typed while a question is in flight", () => {
    let state = setDraft(createSideState(), "parent", "First")
    const first = startQuestion(state, "parent")!
    state = setDraft(first.state, "parent", "Next question")
    state = finishQuestion(state, "parent", first.request.id, "Answer")

    expect(getConversation(state, "parent").draft).toBe("Next question")
    expect(getConversation(state, "parent").turns).toEqual([{ question: "First", answer: "Answer" }])
  })

  test("can retry a failed question without losing a newer draft", () => {
    const initial = setDraft(createSideState(), "parent", "First")
    const first = startQuestion(initial, "parent")!
    let state = setDraft(first.state, "parent", "Next question")
    state = failQuestion(state, "parent", first.request.id, "Network error")
    const retry = startQuestion(state, "parent", getConversation(state, "parent").failedQuestion)!
    state = finishQuestion(retry.state, "parent", retry.request.id, "Answer")

    expect(getConversation(state, "parent").draft).toBe("Next question")
    expect(getConversation(state, "parent").turns).toEqual([{ question: "First", answer: "Answer" }])
  })

  test("rejects empty questions and duplicate submissions for the same session", () => {
    expect(startQuestion(createSideState(), "parent")).toBeUndefined()
    let state = setDraft(createSideState(), "parent", "  ")
    expect(startQuestion(state, "parent")).toBeUndefined()
    state = setDraft(state, "parent", "Question")
    const pending = startQuestion(state, "parent")!
    expect(startQuestion(pending.state, "parent")).toBeUndefined()
  })

  test("ignores stale completion events", () => {
    let state = setDraft(createSideState(), "parent", "Question")
    const pending = startQuestion(state, "parent")!
    state = finishQuestion(pending.state, "parent", pending.request.id + 1, "Wrong answer")
    expect(getConversation(state, "parent").turns).toEqual([])
    expect(getConversation(state, "parent").pending?.question).toBe("Question")
  })

  test("clears only the selected idle side conversation", () => {
    let state = setDraft(createSideState(), "one", "Question one")
    state = setDraft(state, "two", "Question two")
    state = clearConversation(state, "one")
    expect(getConversation(state, "one").draft).toBe("")
    expect(getConversation(state, "two").draft).toBe("Question two")

    const pending = startQuestion(state, "two")!
    expect(clearConversation(pending.state, "two")).toBe(pending.state)
  })
})
