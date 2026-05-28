# Subagent Observatory

A full-access Hana plugin that monitors subagent runs across currently managed Hana sessions.

It shows:

- subagent lifecycle status
- parent session ownership
- running, completed, stalled, and failed subagent runs
- result previews with expandable details
- a sidebar widget filtered to the current session

## Surfaces

- Page: `/dashboard`
- Widget: `/widget`

## Tools

The plugin id remains `team-observatory` for compatibility with existing installations, so Hana exposes:

- `team-observatory_diagnose_agent`
- `team-observatory_dispatch_review`

The plugin does not directly create or control subagents. It observes existing subagent runs and may build a dispatch prompt when the optional diagnostic tool is used.

## Architecture

```text
iframe page/widget
  -> /api/plugins/team-observatory/api/snapshot
  -> plugin route
  -> ctx.bus.request(agent:list/session:list/task:list/usage:list)
  -> subagent-runs.json history
```

The iframe fetch helper preserves `token` and `agentId` query parameters from the host URL to avoid losing authentication in local or remote contexts.

## Development

Recommended source path:

```text
D:/Hanako/Shiraha/Hana-Plugins/team-observatory
```

Install through Hana plugin dev loop with full-access enabled.
