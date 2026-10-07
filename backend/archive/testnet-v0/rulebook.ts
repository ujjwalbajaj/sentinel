import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRulebook, type Rulebook } from "../cre/sentinel-workflow/score.js";

const rulebookPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../cre/sentinel-workflow/rulebook.json",
);

export function loadRulebook(extraMixers: string[] = []): Rulebook {
  const parsed = parseRulebook(JSON.parse(readFileSync(rulebookPath, "utf8")));
  if (extraMixers.length === 0) return parsed;
  return {
    ...parsed,
    mixerFunding: {
      ...parsed.mixerFunding,
      addresses: [...parsed.mixerFunding.addresses, ...extraMixers],
    },
  };
}

export { rulebookPath };
