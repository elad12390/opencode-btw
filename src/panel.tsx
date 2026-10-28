import { usePlugin } from "@opencode/plugin/tui"
import type { PanelInput } from "@opencode/plugin/tui/context"
import { generateSyntax } from "@opencode/theme/tui"
import type { ScrollBoxRenderable, TextareaRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js"
import { SIDE_COMMANDS, sideCommand, sideCommandSuggestions, type SideCommand, type SideCommandName } from "./commands"
import { submitDraft } from "./compose"
import { nextQuestion, previousQuestion, type HistoryNavigation } from "./history"
import { getConversation, type SideState } from "./state"

export interface PanelControls {
  readonly state: () => SideState
  readonly setDraft: (sessionID: string, value: string) => void
  readonly submit: (sessionID: string, question?: string) => void
  readonly clear: (sessionID: string) => Promise<void>
  readonly close: (sessionID: string) => void
}

const splitBorder = {
  topLeft: "", bottomLeft: "", topRight: "", bottomRight: "",
  horizontal: " ", vertical: "┃", bottomT: "", topT: "", cross: "", leftT: "", rightT: "",
}

export function SidePanel(props: { panel: PanelInput; controls: PanelControls }) {
  const context = usePlugin()
  const dimensions = useTerminalDimensions()
  const conversation = createMemo(() => getConversation(props.controls.state(), props.panel.sessionID))
  const syntax = createMemo(() => {
    const style = generateSyntax(context.theme, context.renderer.nativeScene)
    onCleanup(() => { void context.renderer.idle().then(() => style.destroy()).catch(() => {}) })
    return style
  })
  const [textarea, setTextarea] = createSignal<TextareaRenderable>()
  const [history, setHistory] = createSignal<HistoryNavigation>()
  const [dismissedDraft, setDismissedDraft] = createSignal<string>()
  const [selected, setSelected] = createSignal(0)
  const suggestions = createMemo(() => sideCommandSuggestions(conversation().draft))
  const menuOpen = createMemo(() => props.panel.focused && suggestions().length > 0 && dismissedDraft() !== conversation().draft)
  const visibleSuggestions = createMemo(() => {
    const options = suggestions()
    const limit = Math.max(1, Math.min(5, dimensions().height - 11))
    const start = Math.max(0, Math.min(selected() - limit + 1, options.length - limit))
    return options.slice(start, start + limit)
  })
  let scroll: ScrollBoxRenderable | undefined
  let active = true

  const submit = () => {
    const input = textarea()
    if (!input || input.isDestroyed) return
    const options = sideCommandSuggestions(input.plainText)
    const command = sideCommand(input.plainText) ?? (menuOpen() ? options[Math.min(selected(), options.length - 1)] : undefined)
    if (command) return chooseCommand(command)
    setHistory(undefined)
    submitDraft(props.panel.sessionID, input, props.controls)
  }

  const focus = () => {
    props.panel.focus()
    queueMicrotask(() => {
      const input = textarea()
      if (input && !input.isDestroyed && props.panel.focused) input.focus()
    })
  }

  const close = () => {
    if (menuOpen()) {
      setDismissedDraft(conversation().draft)
      return
    }
    const selection = context.renderer.getSelection()
    if (selection?.getSelectedText()) {
      context.renderer.clearSelection()
      return
    }
    if (selection) context.renderer.clearSelection()
    props.controls.close(props.panel.sessionID)
  }

  const moveHistory = (direction: "previous" | "next") => {
    const input = textarea()
    if (!input || input.isDestroyed) return false
    if (direction === "previous" && input.cursorOffset !== 0) {
      if (input.scrollY + input.visualCursor.visualRow === 0) input.cursorOffset = 0
      else input.moveCursorUp()
      return
    }
    if (direction === "next" && input.cursorOffset !== input.plainText.length) {
      if (input.scrollY + input.visualCursor.visualRow === Math.max(0, input.editorView.getTotalVirtualLineCount() - 1)) {
        input.cursorOffset = input.plainText.length
      } else input.moveCursorDown()
      return
    }
    const result = direction === "previous"
      ? previousQuestion(conversation(), input.plainText, history())
      : nextQuestion(history())
    if (!result) return false
    input.setText(result.text)
    input.cursorOffset = direction === "previous" ? 0 : input.plainText.length
    props.controls.setDraft(props.panel.sessionID, result.text)
    setHistory(result.navigation)
  }

  const copyLastAnswer = () => {
    const answer = conversation().turns.at(-1)?.answer
    if (!answer) {
      context.ui.toast.show({ message: "There is no side answer to copy yet.", variant: "info" })
      return
    }
    const sent = context.renderer.copyToClipboardOSC52(answer)
    context.ui.toast.show({
      message: sent ? "Answer sent to the terminal clipboard." : "Clipboard unavailable; select the answer to copy it.",
      variant: sent ? "info" : "warning",
    })
  }

  const runCommand = (name: SideCommandName) => {
    const sessionID = props.panel.sessionID
    switch (name) {
      case "help":
        void context.ui.dialog.select({
          title: "BTW side-chat commands",
          options: SIDE_COMMANDS.map((command) => ({ title: `/${command.name}`, description: command.description, value: command.name })),
        }).then((choice) => {
          if (active && props.panel.sessionID === sessionID && choice) runCommand(choice)
        })
        return
      case "clear":
        void props.controls.clear(sessionID)
        return
      case "copy":
        copyLastAnswer()
        return
      case "latest":
        scroll?.scrollTo(scroll.scrollHeight)
        return
      case "expand":
        if (dimensions().width > 80) props.panel.toggleFullscreen()
        else context.ui.toast.show({ message: "The terminal is too narrow for a split panel.", variant: "info" })
        return
      case "retry":
        if (conversation().pending) {
          context.ui.toast.show({ message: "A side question is still running.", variant: "info" })
          return
        }
        if (!conversation().failedQuestion) {
          context.ui.toast.show({ message: "There is no failed side question to retry.", variant: "info" })
          return
        }
        props.controls.submit(sessionID, conversation().failedQuestion)
        return
      case "close":
        props.controls.close(sessionID)
    }
  }

  const chooseCommand = (command: SideCommand) => {
    const input = textarea()
    if (!input || input.isDestroyed) return
    input.setText("")
    props.controls.setDraft(props.panel.sessionID, "")
    setHistory(undefined)
    setDismissedDraft(undefined)
    runCommand(command.name)
  }

  const chooseSelected = () => {
    const input = textarea()
    if (!input || input.isDestroyed) return false
    const text = input.plainText
    const options = sideCommandSuggestions(text)
    if (!options.length) {
      props.controls.setDraft(props.panel.sessionID, text)
      return false
    }
    const position = text === conversation().draft ? Math.min(selected(), options.length - 1) : 0
    chooseCommand(sideCommand(text) ?? options[position])
  }

  const moveSelection = (offset: number) => {
    const count = suggestions().length
    if (count) setSelected((current) => (current + offset + count) % count)
  }

  const hints = () => {
    if (menuOpen()) {
      const previous = context.keymap.shortcuts("prompt.autocomplete.prev")[0]
      const next = context.keymap.shortcuts("prompt.autocomplete.next")[0]
      const select = context.keymap.shortcuts("prompt.autocomplete.select")[0]
      const hide = context.keymap.shortcuts("prompt.autocomplete.hide")[0]
      if (props.panel.width < 38) {
        return [
          ...(previous && next ? [`${previous}/${next} choose`] : []),
          ...(select ? [select] : []),
        ].join(" · ") || "Click a command"
      }
      return [
        ...(previous && next ? [`${previous}/${next} choose`] : []),
        ...(select ? [`${select} select`] : []),
        ...(hide ? [`${hide} dismiss`] : []),
      ].join(" · ") || "Click a command"
    }
    const send = context.keymap.shortcuts("input.submit")[0]
    const newline = context.keymap.shortcuts("input.newline")[0]
    return ["/ commands", send ? `${send} send` : "click send", ...(newline ? [`${newline} newline`] : [])].join(" · ")
  }

  onMount(focus)
  onCleanup(() => { active = false })
  createEffect(() => {
    if (props.panel.focused) focus()
  })
  createEffect(() => {
    const input = textarea()
    const draft = conversation().draft
    if (input && !input.isDestroyed && input.plainText !== draft) input.setText(draft)
  })
  createEffect(on(() => props.panel.sessionID, () => setHistory(undefined), { defer: true }))
  createEffect(on(() => conversation().draft, () => setSelected(0)))
  createEffect(() => {
    const current = conversation()
    if (!current.turns.length && !current.pending && !current.failedQuestion) setHistory(undefined)
  })

  context.keymap.layer(() => ({
    target: textarea,
    enabled: () => menuOpen(),
    priority: 200,
    commands: [
      { id: "prompt.autocomplete.prev", title: "Previous side command", run: () => moveSelection(-1) },
      { id: "prompt.autocomplete.next", title: "Next side command", run: () => moveSelection(1) },
      { id: "prompt.autocomplete.hide", title: "Hide side commands", run: () => setDismissedDraft(conversation().draft) },
      { id: "prompt.autocomplete.select", title: "Run side command", run: chooseSelected },
      { id: "prompt.autocomplete.complete", title: "Run side command", run: chooseSelected },
    ],
  }))

  context.keymap.layer(() => ({
    target: textarea,
    priority: 100,
    commands: [
      {
        id: "prompt.clear",
        title: "Clear side prompt",
        run: () => {
          textarea()?.setText("")
          props.controls.setDraft(props.panel.sessionID, "")
          setHistory(undefined)
        },
      },
      { id: "prompt.history.previous", title: "Previous side question", run: () => moveHistory("previous") },
      { id: "prompt.history.next", title: "Next side question", run: () => moveHistory("next") },
    ],
  }))

  context.keymap.layer(() => ({
    enabled: () => props.panel.focused,
    priority: 100,
    commands: [
      { title: "Close side chat", bind: "escape", run: close },
      { id: "session.page.up", title: "Page up in side chat", run: () => scroll?.scrollBy(-Math.max(1, (scroll?.height ?? 2) / 2)) },
      { id: "session.page.down", title: "Page down in side chat", run: () => scroll?.scrollBy(Math.max(1, (scroll?.height ?? 2) / 2)) },
      { id: "session.line.up", title: "Scroll side chat up", run: () => scroll?.scrollBy(-1) },
      { id: "session.line.down", title: "Scroll side chat down", run: () => scroll?.scrollBy(1) },
      { id: "session.half.page.up", title: "Scroll side chat up half a page", run: () => scroll?.scrollBy(-Math.max(1, (scroll?.height ?? 4) / 4)) },
      { id: "session.half.page.down", title: "Scroll side chat down half a page", run: () => scroll?.scrollBy(Math.max(1, (scroll?.height ?? 4) / 4)) },
      { id: "btw.sidechat.fullscreen", title: "Toggle BTW side chat fullscreen", group: "Session", palette: true, run: props.panel.toggleFullscreen },
      { id: "btw.sidechat.copy", title: "Copy latest BTW answer", group: "Session", palette: true, enabled: () => conversation().turns.length > 0, run: copyLastAnswer },
      {
        title: "Retry side question",
        bind: "ctrl+r",
        enabled: () => Boolean(conversation().failedQuestion && !conversation().pending),
        run: () => props.controls.submit(props.panel.sessionID, conversation().failedQuestion),
      },
      { title: "Clear side chat", bind: "ctrl+l", run: () => { void props.controls.clear(props.panel.sessionID) } },
    ],
  }))

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} paddingLeft={1} paddingRight={1}>
      <box flexDirection="row" justifyContent="space-between" gap={1} paddingTop={1} paddingBottom={1} flexShrink={0}>
        <text fg={context.theme.text.base} wrapMode="none" truncate><b>/btw</b><span style={{ fg: context.theme.text.muted }}> side chat</span></text>
        <box flexDirection="row" gap={2} flexShrink={0}>
          <Show when={props.panel.width >= 45 && conversation().turns.length > 0}>
            <text id="btw-copy" fg={context.theme.text.muted} onMouseUp={copyLastAnswer}>copy last</text>
          </Show>
          <Show when={props.panel.width >= 30 && (props.panel.presentation !== "fullscreen" || dimensions().width > 80)}>
            <text id="btw-expand" fg={context.theme.text.muted} onMouseUp={props.panel.toggleFullscreen}>
              {props.panel.presentation === "fullscreen" ? "split" : "expand"}
            </text>
          </Show>
          <text id="btw-close" fg={context.theme.text.muted} onMouseUp={() => props.controls.close(props.panel.sessionID)}>esc</text>
        </box>
      </box>
      <scrollbox
        id="btw-transcript"
        ref={(value) => { scroll = value }}
        flexGrow={1}
        flexShrink={1}
        minHeight={1}
        stickyScroll
        stickyStart="bottom"
        scrollbarOptions={{ visible: false }}
        contentOptions={{ flexDirection: "column", gap: 1 }}
      >
        <Show when={conversation().turns.length === 0 && !conversation().pending && !conversation().error}>
          <text fg={context.theme.text.muted} wrapMode="word">
            Ask about this session without interrupting the main conversation.
          </text>
        </Show>
        <For each={conversation().turns}>
          {(turn) => (
            <box flexDirection="column" gap={1} flexShrink={0}>
              <box border={["left"]} borderColor={context.theme.hue.interactive[200]} customBorderChars={splitBorder}>
                <box paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1} backgroundColor={context.theme.decrease(context.theme.background.raised.base)}>
                  <text fg={context.theme.text.base} wrapMode="word">{turn.question}</text>
                </box>
              </box>
              <box paddingLeft={2}>
                <markdown
                  content={turn.answer}
                  syntaxStyle={syntax()}
                  conceal
                  internalBlockMode="top-level"
                  tableOptions={{ style: "grid", cellPaddingX: 1 }}
                  fg={context.theme.markdown.text}
                />
              </box>
            </box>
          )}
        </For>
        <Show when={conversation().pending}>
          {(pending) => (
            <box flexDirection="column" gap={1} flexShrink={0}>
              <box border={["left"]} borderColor={context.theme.hue.interactive[200]} customBorderChars={splitBorder}>
                <box paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1} backgroundColor={context.theme.decrease(context.theme.background.raised.base)}>
                  <text fg={context.theme.text.base} wrapMode="word">{pending().question}</text>
                </box>
              </box>
              <text fg={context.theme.text.muted}>  Thinking…</text>
            </box>
          )}
        </Show>
        <Show when={conversation().error}>
          {(error) => (
            <box flexDirection="column" gap={1} paddingLeft={1}>
              <text fg={context.theme.text.feedback.error.base} wrapMode="word">{error()}</text>
              <text fg={context.theme.text.muted} onMouseUp={() => props.controls.submit(props.panel.sessionID, conversation().failedQuestion)}>Ctrl+R retry</text>
            </box>
          )}
        </Show>
      </scrollbox>
      <Show when={menuOpen()}>
        <box id="btw-command-menu" flexDirection="column" flexShrink={0} backgroundColor={context.theme.background.raised.high}>
          <For each={visibleSuggestions()}>
            {(command) => {
              const index = () => suggestions().indexOf(command)
              return (
                <box
                  id={`btw-command-${command.name}`}
                  flexDirection="row"
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={index() === selected() ? context.theme.background.action.primary.focused : context.theme.background.raised.high}
                  onMouseMove={() => setSelected(index())}
                  onMouseUp={() => chooseCommand(command)}
                >
                  <text fg={index() === selected() ? context.theme.text.action.primary.focused : context.theme.text.base} wrapMode="none" width={9} flexShrink={0}>
                    {`/${command.name}`}
                  </text>
                  <text fg={index() === selected() ? context.theme.text.action.primary.focused : context.theme.text.muted} wrapMode="none" truncate flexShrink={1} minWidth={0}>
                    {command.description}
                  </text>
                </box>
              )
            }}
          </For>
        </box>
      </Show>
      <box border={["left"]} borderColor={props.panel.focused ? context.theme.hue.interactive[200] : context.theme.border.base} customBorderChars={splitBorder} marginTop={menuOpen() ? 0 : 1} flexShrink={0}>
        <box paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1} backgroundColor={context.theme.decrease(context.theme.background.raised.base)}>
          <textarea
            id="btw-input"
            ref={setTextarea}
            width="100%"
            minHeight={1}
            maxHeight={Math.max(2, Math.floor(dimensions().height / 3))}
            initialValue={conversation().draft}
            focused={props.panel.focused}
            wrapMode="word"
            backgroundColor="transparent"
            focusedBackgroundColor="transparent"
            textColor={context.theme.text.base}
            focusedTextColor={context.theme.text.base}
            placeholderColor={context.theme.text.muted}
            cursorColor={context.theme.text.base}
            placeholder={conversation().turns.length ? "Ask a follow-up…" : "Ask anything…"}
            onContentChange={() => {
              const value = textarea()?.plainText ?? ""
              if (value !== conversation().draft) props.controls.setDraft(props.panel.sessionID, value)
            }}
            onSubmit={submit}
          />
          <box flexDirection="row" justifyContent="space-between" gap={1}>
            <text fg={context.theme.text.muted} wrapMode="none" truncate flexShrink={1} minWidth={0}>Side chat · separate from session</text>
            <text id="btw-send" fg={conversation().draft.trim() && (!conversation().pending || sideCommand(conversation().draft) || menuOpen()) ? context.theme.hue.interactive[200] : context.theme.text.muted} wrapMode="none" flexShrink={0} onMouseUp={submit}>send</text>
          </box>
        </box>
      </box>
      <text fg={context.theme.text.muted} wrapMode="none" truncate flexShrink={0}>
        {hints()}
      </text>
    </box>
  )
}
