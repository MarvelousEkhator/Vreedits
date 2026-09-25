// Custom Next.js server, merged with the CodeRoom real-time sync server.
// Previously these ran as two separate Render services (this app, plus
// a standalone coderoom-sync-server using its own hardcoded onrender.com
// URL) — now it's one process: Next.js handles normal HTTP requests, and
// WebSocket upgrade requests on /coderoom-sync are handled by y-websocket
// on the same port. This also means the app no longer breaks when you
// move to a custom domain, since there's only one origin to worry about.

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer } = require("ws");
const { setupWSConnection } = require("y-websocket/bin/utils");

const dev = process.env.NODE_ENV !== "production";
console.log(`[boot] starting, dev=${dev}, NODE_ENV=${process.env.NODE_ENV}`);

const app = next({ dev });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    console.log("[boot] next app.prepare() finished");

    const server = createServer((req, res) => {
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    });

    const wss = new WebSocketServer({ noServer: true });

    wss.on("connection", (conn, req) => {
      setupWSConnection(conn, req);
    });

    // Only upgrade connections on the /coderoom-sync path to WebSocket;
    // anything else on an upgrade request gets rejected rather than
    // silently accepted, so this doesn't accidentally intercept other
    // future WebSocket usage on a different path.
    server.on("upgrade", (req, socket, head) => {
      const { pathname } = parse(req.url);
      if (pathname === "/coderoom-sync") {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, req);
        });
      } else {
        socket.destroy();
      }
    });

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`> Ready on port ${PORT}`);
    });
  })
  .catch((err) => {
    // Without this, a failure inside app.prepare() (Next.js's own startup
    // step) never gets logged — the process just sits there doing nothing
    // until Render's port-scan times out 15 minutes later with no clue why.
    console.error("[boot] app.prepare() failed:", err);
    process.exit(1);
  });

process.on("unhandledRejection", (err) => {
  console.error("[boot] unhandled rejection:", err);
});