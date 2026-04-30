// Fork-only branding config. Reading from env keeps customization out of
// upstream files so login/signup/layout edits stay one-line and merge-safe.
//
// Vars (set in client/.env or docker-compose):
//   NEXT_PUBLIC_BRAND_NAME   — visible product name. Default "Rybbit".
//   NEXT_PUBLIC_SHOW_FOOTER  — "true" | "false". Default "true" (upstream behaviour).
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || "Rybbit";
export const SHOW_FOOTER = process.env.NEXT_PUBLIC_SHOW_FOOTER !== "false";
