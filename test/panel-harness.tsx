import { PluginContextProvider } from "@opencode/plugin/tui"
import type { Context, KeymapLayer, PanelInput } from "@opencode/plugin/tui/context"
import { RGBA, TextareaRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { registerManagedTextareaLayer } from "@opentui/keymap/addons/opentui"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { render } from "@opentui/solid"
import { createEffect, createSignal, onCleanup } from "solid-js"
import { clearSideConversation } from "../src/clear"
import type { SideCommandName } from "../src/commands"
import { SidePanel } from "../src/panel"
import { createSideState, finishQuestion, setDraft, startQuestion, type SideState } from "../src/state"

function testTheme(): Context["theme"] {
  const text = RGBA.fromHex("#e0e0e0")
  const muted = RGBA.fromHex("#8e8e8e")
  const base = RGBA.fromHex("#141414")
  const raised = RGBA.fromHex("#202020")
  const field = RGBA.fromHex("#292929")
  const accent = RGBA.fromHex("#87aaff")
  const tokens = new Proxy({}, { get: () => text })
  const feedback = { error: { base: RGBA.fromHex("#ff7777") }, warning: { base: accent }, info: { base: accent }, success: { base: accent } }
  return {
    hue: { interactive: { 200: accent }, accent: { 200: accent } },
    categorical: [{ 200: accent }, { 200: accent }],
    text: { base: text, muted, feedback, action: { primary: { focused: base } } },
    background: { base, raised: { base: raised, high: field }, action: { primary: { focused: accent } } },
    border: { base: muted },
    decrease: () => field,
    syntax: tokens,
    markdown: tokens,
    diff: { text: { added: text, removed: text, context: text }, background: { added: base, removed: base, context: base } },
  } as unknown as Context["theme"]
}

const defaultBindings: Record<string, string> = {
  "prompt.clear": "ctrl+c",
  "prompt.history.previous": "up",
  "prompt.history.next": "down",
  "prompt.autocomplete.prev": "up",
  "prompt.autocomplete.next": "down",
  "prompt.autocomplete.hide": "escape",
  "prompt.autocomplete.select": "return",
  "prompt.autocomplete.complete": "tab",
  "session.page.up": "pageup",
  "session.page.down": "pagedown",
  "session.line.up": "ctrl+alt+y",
  "session.line.down": "ctrl+alt+e",
  "session.half.page.up": "ctrl+alt+u",
  "session.half.page.down": "ctrl+alt+d",
}

export async function renderPanel(options: {
  width?: number
  height?: number
  state?: SideState
  editorBindings?: { key: string; cmd: string }[]
  navigationBindings?: Record<string, string>
  confirmClear?: () => Promise<boolean | undefined>
  helpSelection?: SideCommandName | (() => Promise<SideCommandName | undefined>)
  suppressDraftUpdate?: () => boolean
} = {}) {
  const terminal = await createTestRenderer({ width: options.width ?? 56, height: options.height ?? 24, kittyKeyboard: true })
  const keymap = createDefaultOpenTuiKeymap(terminal.renderer)
  const disposeEditor = registerManagedTextareaLayer(keymap, terminal.renderer, {
    enabled: () => terminal.renderer.currentFocusedEditor instanceof TextareaRenderable,
    bindings: options.editorBindings ?? [
      { key: "return", cmd: "input.submit" },
      { key: "shift+return", cmd: "input.newline" },
      { key: "ctrl+return", cmd: "input.newline" },
      { key: "alt+return", cmd: "input.newline" },
      { key: "ctrl+j", cmd: "input.newline" },
      { key: "alt+f", cmd: "input.word.forward" },
    ],
  })
  const [state, setState] = createSignal(options.state ?? createSideState())
  const [sessionID, setSessionID] = createSignal("parent")
  const [focused, setFocused] = createSignal(true)
  const [presentation, setPresentation] = createSignal<"panel" | "fullscreen">("panel")
  let closed = 0
  let submitted: string[] = []
  let expanded = 0
  let confirmations = 0
  let helpOptions: string[] = []
  const toasts: string[] = []
  const panel: PanelInput = {
    name: "btw.sidechat",
    get sessionID() { return sessionID() },
    get width() { return terminal.renderer.width },
    get presentation() { return presentation() },
    get focused() { return focused() },
    focus: () => {},
    close: () => { closed++ },
    toggleFullscreen: () => { expanded++; setPresentation(presentation() === "panel" ? "fullscreen" : "panel") },
  }
  const controls = {
    state,
    setDraft: (sessionID: string, value: string) => {
      if (!options.suppressDraftUpdate?.()) setState(setDraft(state(), sessionID, value))
    },
    submit: (sessionID: string, question?: string) => {
      const started = startQuestion(state(), sessionID, question)
      if (!started) return
      submitted.push(started.request.prompt)
      setState(started.state)
    },
    clear: (sessionID: string) => clearSideConversation(sessionID, {
      state,
      update: setState,
      confirm: async () => {
        confirmations++
        return options.confirmClear ? options.confirmClear() : true
      },
      notifyPending: () => { toasts.push("Wait for the side question to finish before clearing.") },
    }),
    close: () => { closed++ },
  }

  // Mirror the host's documented keymap registration while using the real
  // OpenTUI managed textarea and renderer, not a stubbed text component.
  const layer = (factory: () => KeymapLayer) => {
    createEffect(() => {
      const current = factory()
      const target = current.target?.()
      if (current.target && !target) return
      const named = (current.commands ?? []).filter((command) => command.id)
      const inline = (current.commands ?? []).filter((command) => !command.id && typeof command.bind === "string")
      const dispose = keymap.registerLayer({
        target: target ?? undefined,
        priority: current.priority,
        enabled: current.enabled,
        commands: named.map((command) => ({
          name: command.id!,
          enabled: command.enabled,
          run: () => command.run(),
        })),
        bindings: [
          ...named.flatMap((command) => {
            const key = options.navigationBindings?.[command.id!] ?? defaultBindings[command.id!] ?? (typeof command.bind === "string" ? command.bind : undefined)
            return key ? [{ key, cmd: command.id! }] : []
          }),
          ...inline.map((command) => ({
            key: command.bind as string,
            cmd: () => {
              if (command.enabled === false || (typeof command.enabled === "function" && !command.enabled())) return false
              return command.run()
            },
          })),
        ],
      })
      onCleanup(dispose)
    })
  }
  const context = {
    renderer: terminal.renderer,
    theme: testTheme(),
    keymap: {
      layer,
      dispatch: (command: string) => keymap.dispatchCommand(command),
      shortcuts: (command: string) => {
        const names: Record<string, string> = {
          "input.submit": "enter", "input.newline": "shift+enter",
          "prompt.autocomplete.prev": "up", "prompt.autocomplete.next": "down",
          "prompt.autocomplete.select": "enter", "prompt.autocomplete.hide": "esc",
        }
        return names[command] ? [names[command]] : []
      },
    },
    ui: {
      toast: { show: ({ message }: { message: string }) => { toasts.push(message) } },
      dialog: { select: async ({ options: choices }: { options: { title: string }[] }) => {
        helpOptions = choices.map((choice) => choice.title)
        return typeof options.helpSelection === "function" ? options.helpSelection() : options.helpSelection
      } },
    },
  } as unknown as Context

  await render(() => (
    <PluginContextProvider value={context}>
      <box width="100%" height="100%" backgroundColor={context.theme.background.raised.base}>
        <SidePanel panel={panel} controls={controls} />
      </box>
    </PluginContextProvider>
  ), terminal.renderer)
  await terminal.renderOnce()
  await terminal.flush()

  return {
    ...terminal,
    state,
    setState,
    setSessionID,
    setPanelFocused: setFocused,
    submitted: () => submitted,
    closed: () => closed,
    expanded: () => expanded,
    confirmations: () => confirmations,
    helpOptions: () => helpOptions,
    toasts: () => toasts,
    finish: (answer: string) => {
      const pending = state().conversations.parent?.pending
      if (pending) setState(finishQuestion(state(), "parent", pending.id, answer))
    },
    input: () => terminal.renderer.root.findDescendantById("btw-input") as TextareaRenderable,
    async cleanup() {
      disposeEditor()
      await terminal.dispose()
    },
  }
}
