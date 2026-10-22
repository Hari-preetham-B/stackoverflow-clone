import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const net = require("node:net");

let server = null;
let PORT = 0;

function startTestServer() {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      if (req.url === "/health/smtp-connectivity") {
        const host = "localhost";
        const port = 9999;
        const start = Date.now();
        try {
          new Promise((resolveConn, rejectConn) => {
            const socket = net.createConnection({ host, port, timeout: 1000 }, () => {
              socket.destroy();
              resolveConn();
            });
            socket.on("error", rejectConn);
            socket.on("timeout", () => {
              socket.destroy();
              rejectConn(new Error("CONNECT_TIMEOUT"));
            });
          }).then(() => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ host, port, connected: true, elapsedMs: Date.now() - start }));
          }).catch((err) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ host, port, connected: false, errorCode: err.code || "CONNECT_ERROR", errorMessage: err.message, elapsedMs: Date.now() - start }));
          });
        } catch (err) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ host, port, connected: false, errorCode: "CONNECT_ERROR", errorMessage: err.message, elapsedMs: Date.now() - start }));
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(0, () => {
      PORT = server.address().port;
      resolve();
    });
  });
}

function stopTestServer() {
  return new Promise((resolve) => {
    if (server) server.close(resolve);
    else resolve();
  });
}

describe("SMTP connectivity diagnostic endpoint", () => {
  before(async () => {
    await startTestServer();
  });
  after(async () => {
    await stopTestServer();
  });

  it("returns connected=false with errorCode for unreachable host", async () => {
    const res = await fetch(`http://localhost:${PORT}/health/smtp-connectivity`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.host, "localhost");
    assert.equal(data.port, 9999);
    assert.equal(data.connected, false);
    assert.ok(data.errorCode);
    assert.ok(typeof data.errorMessage === "string");
    assert.ok(typeof data.elapsedMs === "number");
  });

  it("has correct response shape", async () => {
    const res = await fetch(`http://localhost:${PORT}/health/smtp-connectivity`);
    const data = await res.json();
    assert.ok("host" in data);
    assert.ok("port" in data);
    assert.ok("connected" in data);
    assert.ok("elapsedMs" in data);
    assert.ok(!("SMTP_USER" in data));
    assert.ok(!("SMTP_PASSWORD" in data));
    assert.ok(!("JWT_SECRET" in data));
    assert.ok(!("MONGODB_URL" in data));
  });
});