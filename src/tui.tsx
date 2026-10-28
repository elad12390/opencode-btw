import { Plugin } from "@opencode/plugin/tui"
import type { Renderable } from "@opentui/core"
import { Show } from "solid-js"
import { clearSideConversation } from "./clear"
import { restorePreviousFocus } from "./focus"
import { ASIDE_COMMAND_ID, COMMAND_PRIORITY, PANEL_NAME, PLUGIN_ID } from "./identifiers"
import { SidePanel } from "./panel"
import {
  createSideState,
  failQuestion,
  finishQuestion,
  getConversation,
  setDraft,
  startQuestion,
  type SideState,
} from "./state"

export default Plugin.define({
  id: PLUGIN_ID,
  setup(context) {
    const previousFocus = new Map<string, Renderable>()
    const [memory, updateMemory] = context.storage.memory<{ state: SideState }>("conversations", {
      initial: { state: createSideState() },
    })

    const update = (state: SideState) => updateMemory((draft) => { draft.state = state })
    const updateDraft = (sessionID: string, value: string) => update(setDraft(memory.state, sessionID, value))
    const clear = (sessionID: string) => clearSideConversation(sessionID, {
      state: () => memory.state,
      update,
      confirm: () => context.ui.dialog.confirm({
        title: "Clear side chat?",
        message: "This discards the side conversation and draft, not the main session.",
        label: { confirm: "Clear side chat", cancel: "Cancel" },
      }),
      notifyPending: () => context.ui.toast.show({ message: "Wait for the side question to finish before clearing.", variant: "info" }),
    })

    const submit = async (sessionID: string, question?: string) => {
      const started = startQuestion(memory.state, sessionID, question)
      if (!started) {
        if (getConversation(memory.state, sessionID).pending) {
          context.ui.toast.show({ message: "A side question is still running.", variant: "info" })
        }
        return
      }
      update(started.state)
      try {
        const result = await context.client.session.generate({
          sessionID: started.request.sessionID,
          prompt: started.request.prompt,
        })
        if (!result.text.trim()) throw new Error("No text was returned. Side questions cannot use tools; try rephrasing.")
        update(finishQuestion(memory.state, sessionID, started.request.id, result.text))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        update(failQuestion(memory.state, sessionID, started.request.id, message))
      }
    }

    const controls = {
      state: () => memory.state,
      setDraft: updateDraft,
      submit: (sessionID: string, question?: string) => { void submit(sessionID, question) },
      clear,
      close: (sessionID: string) => {
        const previous = previousFocus.get(sessionID)
        context.keymap.dispatch("pane.focus.left")
        context.ui.panel.close()
        restorePreviousFocus(context.renderer, previous, () => {
          const route = context.ui.router.current()
          return route.type === "session" && route.sessionID === sessionID
        })
      },
    }

    const removePanel = context.ui.slot({
      append: "session.panel",
      render: (panel) => (
        <Show when={panel.name === PANEL_NAME}>
          <SidePanel panel={panel} controls={controls} />
        </Show>
      ),
    })

    const removeCommands = context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
          mode: "global",
          priority: COMMAND_PRIORITY,
          commands: [
            {
              id: ASIDE_COMMAND_ID,
              title: "Open BTW side chat",
              description: "Ask follow-up questions without changing the main session",
              group: "Session",
              palette: true,
              slash: { name: "btw", arguments: true },
              run: (input) => {
                const route = context.ui.router.current()
                if (route.type !== "session") {
                  context.ui.toast.show({ message: "Open a session first.", variant: "warning" })
                  return
                }
                if (!context.ui.panel.current()) {
                  const focused = context.renderer.currentFocusedRenderable
                  if (focused && !focused.isDestroyed) previousFocus.set(route.sessionID, focused)
                }
                if (!context.ui.panel.open(PANEL_NAME)) {
                  context.ui.toast.show({ message: "Could not open the side panel.", variant: "warning" })
                  return
                }
                const question = input?.trim()
                if (!question) return
                const current = getConversation(memory.state, route.sessionID)
                if (current.pending) {
                  updateDraft(route.sessionID, current.draft ? `${current.draft}\n\n${question}` : question)
                  context.ui.toast.show({ message: "The new question is saved in the side-chat draft.", variant: "info" })
                  return
                }
                void submit(route.sessionID, question)
              },
            },
            {
              id: "btw.sidechat.clear",
              title: "Clear BTW side chat",
              description: "Discard this session's side conversation and draft",
              group: "Session",
              palette: true,
              slash: { name: "btw-clear" },
              run: async () => {
                const route = context.ui.router.current()
                if (route.type !== "session") return
                await clear(route.sessionID)
              },
            },
          ],
        }))
        return null
      },
    })

    return () => {
      removeCommands()
      removePanel()
    }
  },
})
