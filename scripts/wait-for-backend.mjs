import net from "node:net";

const host = process.env.RADIO_BACKEND_HOST || "127.0.0.1";
const port = Number(process.env.RADIO_BACKEND_PORT || 4002);
const timeoutMs = Number(process.env.RADIO_BACKEND_WAIT_MS || 60000);
const intervalMs = 250;
const started = Date.now();

function tryConnect() {
  const socket = net.connect({ host, port }, () => {
    socket.end();
    console.log(`Backend ready at ${host}:${port}`);
    process.exit(0);
  });

  socket.on("error", () => {
    socket.destroy();
    if (Date.now() - started > timeoutMs) {
      console.error(`Timed out waiting for backend at ${host}:${port}`);
      process.exit(1);
    }
    setTimeout(tryConnect, intervalMs);
  });
}

console.log(`Waiting for backend at ${host}:${port}...`);
tryConnect();
