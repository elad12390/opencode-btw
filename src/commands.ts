export const SIDE_COMMANDS = [
  { name: "help", description: "Show side-chat commands" },
  { name: "clear", description: "Clear this side chat" },
  { name: "copy", description: "Copy the latest answer" },
  { name: "latest", description: "Jump to the latest message" },
  { name: "expand", description: "Toggle fullscreen" },
  { name: "retry", description: "Retry the failed question" },
  { name: "close", description: "Close the side chat" },
] as const

export type SideCommand = (typeof SIDE_COMMANDS)[number]
export type SideCommandName = SideCommand["name"]

export function sideCommand(text: string): SideCommand | undefined {
  const value = text.trim().toLowerCase()
  return SIDE_COMMANDS.find((command) => `/${command.name}` === value)
}

export function sideCommandSuggestions(text: string): readonly SideCommand[] {
  if (!/^\/[a-z]*$/i.test(text)) return []
  const prefix = text.slice(1).toLowerCase()
  return SIDE_COMMANDS.filter((command) => command.name.startsWith(prefix))
}
