/**
 * Centralized filesystem paths for the fund-data pipeline.
 * Every pipeline script imports these instead of hardcoding paths.
 *
 *   data/input/     — hand-maintained inputs
 *   data/config/    — controlled taxonomy + manual overrides
 *   data/generated/ — pipeline outputs (fund-universe.json is the website source)
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const D = (...p) => join(ROOT, "data", ...p);

export const PATHS = {
  root: ROOT,
  // input
  inputTickers:   D("input", "fund-tickers.txt"),
  // config
  taxonomy:       D("config", "fund-taxonomy.json"),
  overrides:      D("config", "fund-classification-overrides.json"),
  // generated
  referenceData:  D("generated", "fund-reference-data.json"),
  universe:       D("generated", "fund-universe.json"),
  reviewQueue:    D("generated", "fund-review-queue.json"),
  importFailures: D("generated", "fund-import-failures.json"),
};

/** For log lines: strip the repo root so paths print as data/generated/… */
export const rel = (p) => p.replace(ROOT + "/", "");
