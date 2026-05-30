// Assets — static file serving with allowlist.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.dirname(__dirname);
const ASSETS_DIR = path.join(PLUGIN_ROOT, "assets");

export const ASSET_ALLOWLIST = new Map([
  ["app.js", "text/javascript; charset=utf-8"],
  ["api.js", "text/javascript; charset=utf-8"],
  ["i18n.js", "text/javascript; charset=utf-8"],
  ["status.js", "text/javascript; charset=utf-8"],
  ["state.js", "text/javascript; charset=utf-8"],
  ["avatar.js", "text/javascript; charset=utf-8"],
  ["render-dashboard.js", "text/javascript; charset=utf-8"],
  ["render-widget.js", "text/javascript; charset=utf-8"],
  ["render-chat.js", "text/javascript; charset=utf-8"],
  ["scroll.js", "text/javascript; charset=utf-8"],
  ["actions.js", "text/javascript; charset=utf-8"],
  ["platform.js", "text/javascript; charset=utf-8"],
  ["utils.js", "text/javascript; charset=utf-8"],
  ["styles.css", "text/css; charset=utf-8"],
]);

export function serveAsset(c, fileName, contentType) {
  if (!ASSET_ALLOWLIST.has(fileName)) return c.text("not found", 404);
  const filePath = path.resolve(ASSETS_DIR, fileName);
  const assetRoot = path.resolve(ASSETS_DIR);
  if (filePath !== assetRoot && !filePath.startsWith(assetRoot + path.sep)) return c.text("not found", 404);
  if (!fs.existsSync(filePath)) return c.text("not found", 404);
  c.header("Content-Type", contentType);
  c.header("Cache-Control", "no-store");
  return c.body(fs.readFileSync(filePath));
}
