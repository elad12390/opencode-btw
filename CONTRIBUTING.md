# Contributing

Issues and pull requests are welcome. For a behavior change, describe the user
problem and the expected outcome; include a regression test when practical.

## Development

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
```

The tests use the real OpenTUI renderer and do not require model credentials.
The plugin targets the OpenCode V2 terminal UI. Preserve the separation between
the side conversation and the main session, and avoid hardcoded keyboard
shortcuts that conflict with OpenCode's configurable input bindings.

Do not include credentials, personal paths, private transcripts, or other
sensitive information in issues, pull requests, screenshots, or logs.
