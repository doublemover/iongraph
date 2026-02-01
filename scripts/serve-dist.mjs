import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const options = {
  dir: "dist-www",
  port: 4173,
  fixtures: "tests/fixtures",
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--dir" && args[i + 1]) {
    options.dir = args[i + 1];
    i++;
  } else if (arg === "--port" && args[i + 1]) {
    options.port = Number.parseInt(args[i + 1], 10);
    i++;
  } else if (arg === "--fixtures" && args[i + 1]) {
    options.fixtures = args[i + 1];
    i++;
  }
}

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
]);

const rootDir = resolve(options.dir);
const fixturesDir = resolve(options.fixtures);

function isSafePath(root, target) {
  const rel = relative(root, target);
  return rel && !rel.startsWith("..") && !rel.startsWith("/") && !rel.startsWith("\\");
}

async function serveFile(req, res, pathname) {
  let baseDir = rootDir;
  let relPath = pathname;

  if (relPath.startsWith("/fixtures/")) {
    baseDir = fixturesDir;
    relPath = relPath.slice("/fixtures".length);
  }

  if (relPath === "/" || relPath === "") {
    relPath = "/index.html";
  }

  const targetPath = resolve(baseDir, `.${relPath}`);
  if (!isSafePath(baseDir, targetPath)) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  try {
    const stats = await stat(targetPath);
    if (stats.isDirectory()) {
      await serveFile(req, res, `${pathname.replace(/\/+$/, "")}/index.html`);
      return;
    }
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = extname(targetPath);
  const contentType = contentTypes.get(ext) ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  createReadStream(targetPath).pipe(res);
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  void serveFile(req, res, pathname);
});

server.listen(options.port, () => {
  console.log(`Serving ${rootDir} on http://localhost:${options.port}`);
});
