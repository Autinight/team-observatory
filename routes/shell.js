// Shell — HTML shell rendering for dashboard and widget pages.
export function renderShell(c, ctx, surface) {
  const theme = c.req.query("hana-theme") || "inherit";
  const hanaCss = c.req.query("hana-css") || "";
  const title = surface === "widget" ? "Subagents" : "Subagent Observatory";
  const cssHref = assetUrl(c, ctx, "/assets/styles.css");
  const jsSrc = assetUrl(c, ctx, "/assets/app.js");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  ${hanaCss ? `<link rel="stylesheet" href="${escapeAttr(hanaCss)}">` : ""}
  <link rel="stylesheet" href="${escapeAttr(cssHref)}">
</head>
<body data-surface="${escapeAttr(surface)}" data-hana-theme="${escapeAttr(theme)}">
  <div id="app" data-plugin-id="${escapeAttr(ctx.pluginId)}" data-surface="${escapeAttr(surface)}"></div>
  <script type="module" src="${escapeAttr(jsSrc)}"></script>
</body>
</html>`;
}

export function assetUrl(c, ctx, subPath) {
  const url = new URL(`/api/plugins/${ctx.pluginId}${subPath}`, new URL(c.req.url).origin);
  for (const key of ["token", "agentId", "hana-theme"]) {
    const value = c.req.query(key);
    if (value) url.searchParams.set(key, value);
  }
  return url.pathname + (url.search ? url.search : "");
}

export function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
