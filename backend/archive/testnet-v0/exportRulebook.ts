import { loadRulebook } from "./rulebook.js";

const document = JSON.stringify(loadRulebook());
process.stdout.write(`${JSON.stringify(document)}\n`);
