import { initSentry } from "./lib/sentry.js";
initSentry();

import { createApp } from "./app.js";
import { env } from "./env.js";

const app = createApp();

const dbHost = (() => {
  try {
    return new URL(env.DATABASE_URL).host;
  } catch {
    return "INVALID_URL";
  }
})();
console.log(`[chorechampz-api] DB host: ${dbHost}`);

app.listen(env.PORT, () => {
  console.log(`[chorechampz-api] listening on :${env.PORT}`);
});
