// Imported first by api/index.js. The `env` block in vercel.json stopped
// reaching the function at runtime (a redeploy on 2026-10-01 crashed creating
// folders in the read-only bundle), so the Vercel entry applies its runtime
// defaults itself, before any app module reads them. NODE_ENV cannot be a
// project variable instead: it would also apply to the build, where `npm ci`
// would then skip the frontend's build tools.
if (process.env.VERCEL === '1') {
  process.env.NODE_ENV ||= 'production';
  process.env.RAG_READ_ONLY ||= '1';
}
