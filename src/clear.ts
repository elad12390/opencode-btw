import { clearConversation, getConversation, type SideState } from "./state"

export async function clearSideConversation(sessionID: string, controls: {
  readonly state: () => SideState
  readonly update: (state: SideState) => void
  readonly confirm: () => Promise<boolean | undefined>
  readonly notifyPending: () => void
}): Promise<void> {
  if (getConversation(controls.state(), sessionID).pending) {
    controls.notifyPending()
    return
  }
  if (!await controls.confirm()) return
  if (getConversation(controls.state(), sessionID).pending) {
    controls.notifyPending()
    return
  }
  controls.update(clearConversation(controls.state(), sessionID))
}
