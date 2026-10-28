import type { CliRenderer, Renderable } from "@opentui/core"

/** Restore the original editor after panel disposal, without stealing new focus. */
export function restorePreviousFocus(
  renderer: CliRenderer,
  previous: Renderable | undefined,
  stillInSession: () => boolean,
): void {
  queueMicrotask(() => {
    if (!stillInSession() || !previous || previous.isDestroyed) return
    const current = renderer.currentFocusedRenderable
    if (current && !current.isDestroyed && current !== previous) return
    previous.focus()
  })
}
