# Team Observatory

A full-access Hana plugin that adds a visual observatory for agent teams.

It shows:

- agent status cards
- recent sessions
- background tasks
- subagent runs
- 24h token pressure
- health scores and alerts
- dispatch prompts for subagent review

## Surfaces

- Page: `/dashboard`
- Widget: `/widget`

## Tools

After installation Hana exposes:

- `team-observatory_diagnose_agent`
- `team-observatory_dispatch_review`

The plugin does not directly create subagents. It builds a dispatch prompt or sends that prompt into the current session, so the active Agent can decide whether to call Hana's built-in `subagent` tool.

## Architecture

```text
iframe page/widget
  -> /api/plugins/team-observatory/api/snapshot
  -> plugin route
  -> ctx.bus.request(agent:list/session:list/task:list/usage:list)
```

The iframe fetch helper preserves `token` and `agentId` query parameters from the host URL to avoid losing authentication in local or remote contexts.

## Development

Recommended source path:

```text
D:/Hanako/Shiraha/Hana-Plugins/team-observatory
```

Install through Hana plugin dev loop with full-access enabled.
