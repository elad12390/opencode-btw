import type { TextareaRenderable } from "@opentui/core"

export interface DraftControls {
  readonly setDraft: (sessionID: string, value: string) => void
  readonly submit: (sessionID: string) => void
}

/** Read the editor directly: a final input event may not have reached state yet. */
export function submitDraft(sessionID: string, input: Pick<TextareaRenderable, "plainText">, controls: DraftControls): void {
  controls.setDraft(sessionID, input.plainText)
  controls.submit(sessionID)
}
