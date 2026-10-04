// Local relay: accepts unauthenticated proxy requests on 127.0.0.1:8899
// and forwards them to the real egress proxy with auth headers added.
//
// Needed because Playwright's Chromium does not reliably use an
// authenticated proxy from environment variables in some sandboxes.
// Plain HTTP clients (curl, Node fetch) use HTTPS_PROXY directly and
// don't need this.
//
// Usage:
//   HTTPS_PROXY=http://user:pass@proxy-host:3128 node proxy-relay.mjs &
//   TP_PROXY_URL=http://127.0.0.1:8899 node tp-login.mjs   (patched client)
import http from "node:http";
import net from "node:net";

const RAW = process.env.HTTPS_PROXY || process.env.https_proxy;
if (!RAW) {
  console.error("Set HTTPS_PROXY first");
  process.exit(1);
}
const U = new URL(RAW);
const UPSTREAM_HOST = U.hostname;
const UPSTREAM_PORT = Number(U.port) || 3128;
const AUTH =
  "Basic " +
  Buffer.from(
    decodeURIComponent(U.username) + ":" + decodeURIComponent(U.password)
  ).toString("base64");

const server = http.createServer();

// Plain HTTP requests
server.on("request", (req, res) => {
  const proxyReq = http.request(
    {
      host: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, "Proxy-Authorization": AUTH },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on("error", (e) => {
    res.writeHead(502);
    res.end("relay err: " + e.message);
  });
  req.pipe(proxyReq);
});

// CONNECT tunnels (HTTPS)
server.on("connect", (req, clientSocket, head) => {
  const [host, port] = req.url.split(":");
  const srvSocket = net.connect(UPSTREAM_PORT, UPSTREAM_HOST, () => {
    srvSocket.write(
      `CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n` +
        `Proxy-Authorization: ${AUTH}\r\n\r\n`
    );
  });
  let connected = false;
  let buf = Buffer.alloc(0);
  srvSocket.on("data", (chunk) => {
    if (connected) return;
    buf = Buffer.concat([buf, chunk]);
    const idx = buf.indexOf("\r\n\r\n");
    if (idx === -1) return;
    const header = buf.subarray(0, idx).toString();
    if (/^HTTP\/1\.[01] 200/.test(header)) {
      connected = true;
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      const rest = buf.subarray(idx + 4);
      if (head && head.length) srvSocket.write(head);
      if (rest.length) clientSocket.write(rest);
      srvSocket.pipe(clientSocket);
      clientSocket.pipe(srvSocket);
    } else {
      clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      clientSocket.destroy();
      srvSocket.destroy();
    }
  });
  srvSocket.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => srvSocket.destroy());
});

server.listen(8899, "127.0.0.1", () => console.log("relay on 127.0.0.1:8899"));
