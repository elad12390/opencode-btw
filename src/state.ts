export interface SideTurn {
  readonly question: string
  readonly answer: string
}

export interface PendingQuestion {
  readonly id: number
  readonly question: string
}

export interface Conversation {
  readonly turns: readonly SideTurn[]
  readonly draft: string
  readonly pending?: PendingQuestion
  readonly error?: string
  readonly failedQuestion?: string
}

export interface SideState {
  readonly nextID: number
  readonly conversations: Readonly<Record<string, Conversation>>
}

export interface SideRequest {
  readonly id: number
  readonly sessionID: string
  readonly prompt: string
}

const EMPTY_CONVERSATION: Conversation = { turns: [], draft: "" }

export function createSideState(): SideState {
  return { nextID: 1, conversations: {} }
}

export function getConversation(state: SideState, sessionID: string): Conversation {
  return state.conversations[sessionID] ?? EMPTY_CONVERSATION
}

function updateConversation(state: SideState, sessionID: string, conversation: Conversation): SideState {
  return { ...state, conversations: { ...state.conversations, [sessionID]: conversation } }
}

export function setDraft(state: SideState, sessionID: string, draft: string): SideState {
  return updateConversation(state, sessionID, { ...getConversation(state, sessionID), draft })
}

export function clearConversation(state: SideState, sessionID: string): SideState {
  if (getConversation(state, sessionID).pending) return state
  const conversations = { ...state.conversations }
  delete conversations[sessionID]
  return { ...state, conversations }
}

function buildPrompt(turns: readonly SideTurn[], question: string): string {
  const instructions = [
    "The user is asking a quick side question about the conversation so far.",
    "Answer directly and concisely in markdown from what you already know.",
    "Do not call tools and do not take any actions.",
    "The side conversation is separate from the main task; do not continue or change that task.",
  ].join(" ")
  const history = turns.length ? `Earlier side questions and answers, as JSON:\n${JSON.stringify(turns)}\n\n` : ""
  return `${instructions}\n\n${history}Current side question:\n${question}`
}

export function startQuestion(
  state: SideState,
  sessionID: string,
  retryQuestion?: string,
): { state: SideState; request: SideRequest } | undefined {
  const conversation = getConversation(state, sessionID)
  const question = (retryQuestion ?? conversation.draft).trim()
  if (!question || conversation.pending) return undefined

  const id = state.nextID
  const next = updateConversation(state, sessionID, {
    ...conversation,
    draft: conversation.draft.trim() === question ? "" : conversation.draft,
    pending: { id, question },
    error: undefined,
    failedQuestion: undefined,
  })
  return {
    state: { ...next, nextID: id + 1 },
    request: { id, sessionID, prompt: buildPrompt(conversation.turns, question) },
  }
}

export function finishQuestion(state: SideState, sessionID: string, id: number, answer: string): SideState {
  const conversation = getConversation(state, sessionID)
  if (conversation.pending?.id !== id) return state

  const question = conversation.pending.question
  return updateConversation(state, sessionID, {
    ...conversation,
    turns: [...conversation.turns, { question, answer }],
    pending: undefined,
    error: undefined,
    failedQuestion: undefined,
  })
}

export function failQuestion(state: SideState, sessionID: string, id: number, error: string): SideState {
  const conversation = getConversation(state, sessionID)
  if (conversation.pending?.id !== id) return state

  return updateConversation(state, sessionID, {
    ...conversation,
    draft: conversation.draft || conversation.pending.question,
    pending: undefined,
    error,
    failedQuestion: conversation.pending.question,
  })
}
