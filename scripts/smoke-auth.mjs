import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^"(.*)"$/, "$1");
    env[key] = value;
  }
  return env;
};

const cwd = process.cwd();
const envFiles = [path.join(cwd, ".env"), path.join(cwd, ".env.local")];
const fileEnv = envFiles.reduce(
  (acc, filePath) => ({ ...acc, ...loadEnvFile(filePath) }),
  {}
);

const env = { ...fileEnv, ...process.env };
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const testEmail = env.SUPABASE_TEST_EMAIL;
const testPassword = env.SUPABASE_TEST_PASSWORD;
const accessTokenOverride = env.SUPABASE_ACCESS_TOKEN;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const authUser = async (accessToken) => {
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!userRes.ok) {
    const body = await userRes.text();
    throw new Error(`User fetch failed (${userRes.status}): ${body}`);
  }

  const user = await userRes.json();
  return user;
};

const run = async () => {
  try {
    if (accessTokenOverride) {
      await authUser(accessTokenOverride);
      console.log("AUTH OK");
      return;
    }

    if (!testEmail || !testPassword) {
      throw new Error(
        "Missing SUPABASE_TEST_EMAIL/SUPABASE_TEST_PASSWORD or SUPABASE_ACCESS_TOKEN."
      );
    }

    const tokenRes = await fetch(
      `${supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          email: testEmail,
          password: testPassword
        })
      }
    );

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      throw new Error(`Token fetch failed (${tokenRes.status}): ${body}`);
    }

    const tokenPayload = await tokenRes.json();
    const accessToken = tokenPayload.access_token;
    if (!accessToken) {
      throw new Error("No access_token returned from Supabase.");
    }

    await authUser(accessToken);
    console.log("AUTH OK");
  } catch (error) {
    console.error("AUTH ERROR:", error.message ?? error);
    process.exit(1);
  }
};

await run();
