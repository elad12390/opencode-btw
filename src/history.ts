import type { Conversation } from "./state"

export interface HistoryNavigation {
  readonly questions: readonly string[]
  readonly position: number
  readonly draft: string
}

export function previousQuestion(conversation: Conversation, currentDraft: string, navigation?: HistoryNavigation) {
  const questions = navigation?.questions ?? [
    ...conversation.turns.map((turn) => turn.question),
    ...(conversation.pending ? [conversation.pending.question] : []),
    ...(conversation.failedQuestion ? [conversation.failedQuestion] : []),
  ]
  if (questions.length === 0) return undefined
  const position = Math.max(0, (navigation?.position ?? questions.length) - 1)
  const next = { questions, position, draft: navigation?.draft ?? currentDraft }
  return { navigation: next, text: questions[position] }
}

export function nextQuestion(navigation?: HistoryNavigation) {
  if (!navigation) return undefined
  const position = navigation.position + 1
  if (position >= navigation.questions.length) return { navigation: undefined, text: navigation.draft }
  return { navigation: { ...navigation, position }, text: navigation.questions[position] }
}
