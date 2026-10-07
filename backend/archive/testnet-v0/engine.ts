import "dotenv/config";
import { start } from "./server.js";

const mode = process.argv[2] === "live" ? "live" : "demo";
await start(mode);
