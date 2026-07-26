import type { Config } from "jest";

/**
 * MANUAL live Tiingo smoke config — NEVER used by `npm test` (which uses
 * jest.config.ts and only matches src/__tests__/**\/*.test.ts).
 *
 * Run explicitly:  npx jest --config jest.smoke.config.ts
 * Requires TIINGO_API_KEY in .env.local. Makes bounded live Tiingo requests.
 */
const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  testMatch: ["<rootDir>/scripts/tiingo-smoke.ts"],
  testTimeout: 30000,
};

export default config;
