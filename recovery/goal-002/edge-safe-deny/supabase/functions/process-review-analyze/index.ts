import { createSafeDenyHandler } from "../_shared/safe_deny.ts";

Deno.serve(createSafeDenyHandler("process-review-analyze"));
