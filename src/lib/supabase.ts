import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing required Supabase client configuration");
  throw new Error("Missing Supabase env vars");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

export { supabaseUrl, supabaseAnonKey };
