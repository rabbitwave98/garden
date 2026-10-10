
import cms from "./_cms.ts";

const app = cms.init();

Deno.serve({ hostname: "127.0.0.1", port: 8000 }, app.fetch);
