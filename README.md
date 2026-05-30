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

This plugin is UI-only. It observes existing subagent runs and does not expose Agent-callable tools.

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
