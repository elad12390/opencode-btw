import { PluginContextProvider } from "@opencode/plugin/tui"
import { RGBA } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { render } from "@opentui/solid"
import plugin from "opencode-btw-sidechat/tui"
import { createStore, produce } from "solid-js/store"

const terminal = await createTestRenderer({ width: 56, height: 24, kittyKeyboard: true })
const text = RGBA.fromHex("#e0e0e0")
const muted = RGBA.fromHex("#8e8e8e")
const base = RGBA.fromHex("#141414")
const raised = RGBA.fromHex("#202020")
const field = RGBA.fromHex("#292929")
const accent = RGBA.fromHex("#87aaff")
const tokens = new Proxy({}, { get: () => text })
const feedback = { error: { base: accent }, warning: { base: accent }, info: { base: accent }, success: { base: accent } }
const theme = {
  hue: { interactive: { 200: accent }, accent: { 200: accent } },
  categorical: [{ 200: accent }, { 200: accent }],
  text: { base: text, muted, feedback, action: { primary: { focused: base } } },
  background: { base, raised: { base: raised, high: field }, action: { primary: { focused: accent } } },
  border: { base: muted },
  decrease: () => field,
  syntax: tokens,
  markdown: tokens,
  diff: { text: { added: text, removed: text, context: text }, background: { added: base, removed: base, context: base } },
}

const slots = new Map<string, (input?: any) => any>()
const layers: any[] = []
const requests: { sessionID: string; prompt: string }[] = []
const context: any = {
  renderer: terminal.renderer,
  theme,
  storage: {
    memory: (_name: string, options: { initial: object }) => {
      const [state, setState] = createStore(options.initial)
      return [state, (update: (draft: any) => void) => setState(produce(update))]
    },
  },
  client: {
    session: {
      generate: async (request: { sessionID: string; prompt: string }) => {
        requests.push(request)
        return { text: `Side answer ${requests.length}` }
      },
    },
  },
  keymap: { layer: (factory: () => any) => layers.push(factory()), dispatch: () => {}, shortcuts: () => [] },
  ui: {
    slot: ({ append, render: slot }: { append: string; render: (input?: any) => any }) => {
      slots.set(append, slot)
      return () => {}
    },
    panel: { current: () => undefined, open: () => true, close: () => {} },
    router: { current: () => ({ type: "session", sessionID: "parent" }) },
    toast: { show: () => {} },
    dialog: { confirm: async () => true },
  },
}

try {
  if (plugin.id !== "btw.sidechat" || typeof plugin.setup !== "function") throw new Error("Invalid TUI plugin export")
  const dispose = await plugin.setup(context)
  const app = slots.get("app")
  const panel = slots.get("session.panel")
  if (!app || !panel) throw new Error("The installed plugin did not register its UI slots")
  app()
  const command = layers.flatMap((layer) => layer.commands ?? []).find((item) => item.id === "session.aside")
  if (!command) throw new Error("The installed plugin did not register /btw")

  await render(() => (
    <PluginContextProvider value={context}>
      <box width="100%" height="100%" backgroundColor={raised}>
        {panel({ name: "btw.sidechat.panel", sessionID: "parent", width: 56, presentation: "panel", focused: true, focus: () => {}, close: () => {}, toggleFullscreen: () => {} })}
      </box>
    </PluginContextProvider>
  ), terminal.renderer)
  terminal.renderer.start()
  command.run("What changed?")
  await terminal.waitForFrame((frame) => frame.includes("What changed?") && frame.includes("Side answer 1"), { maxPasses: 300 })
  command.run("And next?")
  await terminal.waitForFrame((frame) => frame.includes("And next?") && frame.includes("Side answer 2"), { maxPasses: 300 })
  if (requests.length !== 2 || requests.some((request) => request.sessionID !== "parent")) throw new Error("Unexpected session requests")
  if (!requests[1].prompt.includes("What changed?") || !requests[1].prompt.includes("Side answer 1")) {
    throw new Error("The follow-up lost the side conversation")
  }
  dispose?.()
  console.log("Installed tarball rendered a two-turn side chat in OpenTUI")
} finally {
  await terminal.dispose()
}
