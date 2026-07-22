/**
 * Portfolio → Model handoff — read-once snapshot semantics.
 * The handoff carries tickers + weights only; Model never mutates the saved
 * portfolio through it (write-back requires explicit Save/Update actions).
 */
import { setModelHandoff, takeModelHandoff, type ModelHandoff } from "@/lib/handoff";

// Minimal sessionStorage + window stubs for the node test environment.
function installBrowserStubs() {
  const store = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;
  g.sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  g.window = { dispatchEvent: () => true };
  g.Event = class { constructor(public type: string) {} };
  return store;
}

const SINGLE: ModelHandoff = {
  source: "portfolio", clientId: "c1", horizonYears: 15,
  primary: { name: "Proposed — Smith", holdings: [{ ticker: "VTI", weight: 60 }, { ticker: "AGG", weight: 40 }] },
};

const DUAL: ModelHandoff = {
  ...SINGLE,
  second: { name: "Current — Smith", holdings: [{ ticker: "SPY", weight: 100 }] },
};

describe("portfolio → model handoff", () => {
  beforeEach(() => { installBrowserStubs(); });

  test("single handoff round-trips and is consumed exactly once", () => {
    setModelHandoff(SINGLE);
    const got = takeModelHandoff();
    expect(got).toEqual(SINGLE);
    // read-once: a second take returns nothing
    expect(takeModelHandoff()).toBeNull();
  });

  test("dual (current vs proposed) handoff preserves both portfolios", () => {
    setModelHandoff(DUAL);
    const got = takeModelHandoff()!;
    expect(got.second?.name).toBe("Current — Smith");
    expect(got.primary.holdings).toHaveLength(2);
    expect(got.second?.holdings).toEqual([{ ticker: "SPY", weight: 100 }]);
  });

  test("consuming the handoff does not mutate the original payload object", () => {
    const original = JSON.parse(JSON.stringify(DUAL)) as ModelHandoff;
    setModelHandoff(DUAL);
    takeModelHandoff();
    expect(DUAL).toEqual(original); // source object untouched — snapshot semantics
  });

  test("handoff without holdings is rejected", () => {
    setModelHandoff({ ...SINGLE, primary: { name: "Empty", holdings: [] } });
    expect(takeModelHandoff()).toBeNull();
  });

  test("no handoff → null (empty storage)", () => {
    expect(takeModelHandoff()).toBeNull();
  });
});
