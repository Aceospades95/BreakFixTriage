// Round-11 §2D — vitest shim for the `server-only` package. The
// real package is a build-time guard provided by Next.js that
// errors if a server module is imported into a client bundle. In
// the test runner there's no client/server split, so this no-op
// shim lets the lib code import `server-only` without crashing.
export {};
