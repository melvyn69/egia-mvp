import { createSafeDenyHandler } from "../_shared/safe_deny.ts";

Deno.serve(createSafeDenyHandler("google_gbp_sync_locations"));
