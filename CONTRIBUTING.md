# Contributing

Issues and pull requests are welcome. For a behavior change, describe the user
problem and the expected outcome; include a regression test when practical.

## Development

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bun run build
bun run check:package
```

The tests use the real OpenTUI renderer and do not require model credentials.
Run `bun run build` after source changes when loading the local plugin checkout.
The plugin targets the OpenCode V2 terminal UI. Preserve the separation between
the side conversation and the main session, and avoid hardcoded keyboard
shortcuts that conflict with OpenCode's configurable input bindings.

Do not include credentials, personal paths, private transcripts, or other
sensitive information in issues, pull requests, screenshots, or logs.

## Releases

Maintainers release stable versions from `main`. Update the version in
`package.json`, run `bun install` to update `bun.lock`, and run all the checks
above. Commit and push the changes to `main`, then push a matching tag such as
`v0.1.2`.

The release workflow verifies that the tag matches the package version and
points to a commit on `main`, repeats the checks, publishes to npm using trusted
publishing with provenance, and creates a GitHub release. No npm token is
stored in GitHub. If the GitHub release step fails after publication, rerun the
failed job rather than attempting to publish the same npm version again.
