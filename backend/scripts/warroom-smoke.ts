import { io } from "socket.io-client";

const url = process.env.WARROOM_URL || "http://127.0.0.1:8787";
const started = Date.now();
const socket = io(`${url}/live`, { transports: ["websocket"] });

function stamp(): string {
  return `+${((Date.now() - started) / 1000).toFixed(1)}s`;
}

socket.on("connect", () => {
  console.log(`${stamp()} connected ${url}/live`);
});

socket.on("warroom:stage", (stage: { stage?: string; incidentId?: string; data?: unknown }) => {
  console.log(`${stamp()} ${stage.stage} ${stage.incidentId ?? ""}`);
  console.log(JSON.stringify(stage.data ?? {}, null, 2));
  if (stage.stage === "strike_reverted" || stage.stage === "cre_timeout") {
    socket.close();
    process.exit(0);
  }
});

socket.on("connect_error", (error: Error) => {
  console.error(`${stamp()} connect_error ${error.message}`);
  process.exit(1);
});

setTimeout(() => {
  console.error(`${stamp()} no strike_reverted or cre_timeout`);
  process.exit(1);
}, 8 * 60 * 1000);
