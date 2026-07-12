import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const migrationName = "20260712120000_secure_claim_review_analyze_jobs.sql";
const migrationPath = join(root, "supabase", "migrations", migrationName);
const canonicalFunctionPath = join(
  root,
  "supabase",
  "migrations",
  "20260220154000_fix_claim_review_analyze_jobs.sql"
);
const directCallers = [
  "server/_shared/handlers/cron/ai/tag-reviews.ts",
  "supabase/functions/process-review-analyze/index.ts"
].sort();

const read = (path) => readFileSync(path, "utf8");
const check = (label, assertion, failures) => {
  try {
    assertion();
    console.log(`✓ ${label}`);
  } catch (error) {
    failures.push(label);
    console.error(`✗ ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const walkSourceFiles = (directory, files = []) => {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const relativePath = relative(root, path);
    if (relativePath.startsWith("server/_shared_dist")) continue;
    if (statSync(path).isDirectory()) {
      walkSourceFiles(path, files);
    } else if (/\.(?:ts|tsx|js|mjs|cjs)$/.test(entry)) {
      files.push(relativePath);
    }
  }
  return files;
};

const isIdentifierStart = (character) => /[A-Za-z_]/.test(character);
const isIdentifierPart = (character) => /[A-Za-z0-9_$]/.test(character);

const readDollarQuote = (source, index) => {
  if (source[index] !== "$") return null;
  const match = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
  return match?.[0] ?? null;
};

// Removes SQL comments while retaining quoted and dollar-quoted content verbatim.
const stripSqlComments = (source) => {
  let result = "";
  let index = 0;
  let state = "code";
  let dollarQuote = "";
  let blockDepth = 0;

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (character === "\n") {
        result += "\n";
        state = "code";
      }
      index += 1;
      continue;
    }
    if (state === "block-comment") {
      if (character === "/" && next === "*") {
        blockDepth += 1;
        index += 2;
      } else if (character === "*" && next === "/") {
        blockDepth -= 1;
        index += 2;
        if (blockDepth === 0) state = "code";
      } else {
        if (character === "\n") result += "\n";
        index += 1;
      }
      continue;
    }
    if (state === "single-quote") {
      result += character;
      if (character === "'" && next === "'") {
        result += next;
        index += 2;
      } else {
        index += 1;
        if (character === "'") state = "code";
      }
      continue;
    }
    if (state === "double-quote") {
      result += character;
      if (character === '"' && next === '"') {
        result += next;
        index += 2;
      } else {
        index += 1;
        if (character === '"') state = "code";
      }
      continue;
    }
    if (state === "dollar-quote") {
      if (source.startsWith(dollarQuote, index)) {
        result += dollarQuote;
        index += dollarQuote.length;
        state = "code";
      } else {
        result += character;
        index += 1;
      }
      continue;
    }

    if (character === "-" && next === "-") {
      result += " ";
      state = "line-comment";
      index += 2;
    } else if (character === "/" && next === "*") {
      result += " ";
      state = "block-comment";
      blockDepth = 1;
      index += 2;
    } else if (character === "'") {
      result += character;
      state = "single-quote";
      index += 1;
    } else if (character === '"') {
      result += character;
      state = "double-quote";
      index += 1;
    } else {
      const delimiter = readDollarQuote(source, index);
      if (delimiter) {
        result += delimiter;
        dollarQuote = delimiter;
        state = "dollar-quote";
        index += delimiter.length;
      } else {
        result += character;
        index += 1;
      }
    }
  }
  return result;
};

const splitSqlStatements = (source) => {
  const statements = [];
  let statement = "";
  let index = 0;
  let state = "code";
  let dollarQuote = "";

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    statement += character;

    if (state === "single-quote") {
      if (character === "'" && next === "'") {
        statement += next;
        index += 2;
      } else {
        index += 1;
        if (character === "'") state = "code";
      }
      continue;
    }
    if (state === "double-quote") {
      if (character === '"' && next === '"') {
        statement += next;
        index += 2;
      } else {
        index += 1;
        if (character === '"') state = "code";
      }
      continue;
    }
    if (state === "dollar-quote") {
      if (source.startsWith(dollarQuote, index)) {
        statement += dollarQuote.slice(1);
        index += dollarQuote.length;
        state = "code";
      } else {
        index += 1;
      }
      continue;
    }

    if (character === "'") {
      state = "single-quote";
    } else if (character === '"') {
      state = "double-quote";
    } else {
      const delimiter = readDollarQuote(source, index);
      if (delimiter) {
        statement += delimiter.slice(1);
        dollarQuote = delimiter;
        state = "dollar-quote";
        index += delimiter.length;
        continue;
      }
      if (character === ";") {
        statements.push(statement.slice(0, -1));
        statement = "";
      }
    }
    index += 1;
  }
  if (statement.trim()) statements.push(statement);
  return statements;
};

const normalizeIdentifier = (value) => {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replaceAll('""', '"').toLowerCase();
  }
  return trimmed.toLowerCase();
};

const normalizeType = (value) => {
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalized === "int" || normalized === "int4" ? "integer" : normalized;
};

const splitSqlList = (value) => {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    current += character;
    if (character === '"') {
      if (quoted && next === '"') {
        current += next;
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(current.slice(0, -1));
      current = "";
    }
  }
  if (current.trim()) values.push(current);
  return values;
};

const isTargetFunction = (value) => {
  const match = value.match(
    /^\s*("(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)\s*\.\s*("(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)\s*\(([\s\S]*)\)\s*$/
  );
  if (!match) return false;
  const [, schema, name, rawTypes] = match;
  const types = splitSqlList(rawTypes).map(normalizeType);
  return (
    normalizeIdentifier(schema) === "public" &&
    normalizeIdentifier(name) === "claim_review_analyze_jobs" &&
    types.length === 3 &&
    types[0] === "integer" &&
    types[1] === "text" &&
    types[2] === "text"
  );
};

const getUnsafeGrants = (sql) => {
  const statements = splitSqlStatements(stripSqlComments(sql));
  return statements.flatMap((statement) => {
    const match = statement.match(
      /^\s*grant\s+(execute|all(?:\s+privileges)?)\s+on\s+function\s+([\s\S]+?)\s+to\s+([\s\S]+?)\s*$/i
    );
    if (!match || !isTargetFunction(match[2])) return [];
    const recipients = splitSqlList(match[3]).map(normalizeIdentifier);
    return recipients.length === 1 && recipients[0] === "service_role" ? [] : [statement.trim()];
  });
};

// A tiny lexer prevents comments, URLs, and string contents from impersonating TypeScript code.
const tokenizeTypeScript = (source) => {
  const tokens = [];
  let index = 0;
  const readString = (quote) => {
    let value = "";
    index += 1;
    while (index < source.length) {
      const character = source[index];
      if (character === "\\") {
        value += character + (source[index + 1] ?? "");
        index += 2;
      } else if (character === quote) {
        index += 1;
        break;
      } else {
        value += character;
        index += 1;
      }
    }
    tokens.push({ type: "string", value });
  };

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (/\s/.test(character)) {
      index += 1;
    } else if (character === "/" && next === "/") {
      index = source.indexOf("\n", index + 2);
      if (index < 0) break;
    } else if (character === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end < 0 ? source.length : end + 2;
    } else if (character === "'" || character === '"' || character === "`") {
      readString(character);
    } else if (isIdentifierStart(character) || character === "$") {
      let value = character;
      index += 1;
      while (index < source.length && isIdentifierPart(source[index])) {
        value += source[index];
        index += 1;
      }
      tokens.push({ type: "identifier", value });
    } else {
      tokens.push({ type: "punctuation", value: character });
      index += 1;
    }
  }
  return tokens;
};

const hasTokenSequence = (tokens, values) =>
  tokens.some((_, start) => values.every((value, offset) => tokens[start + offset]?.value === value));

const countTokenSequences = (tokens, values) =>
  tokens.filter((_, start) => values.every((value, offset) => tokens[start + offset]?.value === value))
    .length;

const hasRpcCall = (tokens, client) =>
  hasTokenSequence(tokens, [client, ".", "rpc", "(", "claim_review_analyze_jobs"]);

const hasAnyClaimRpcCall = (tokens) =>
  tokens.some(
    (_, index) =>
      tokens[index]?.type === "identifier" &&
      tokens[index + 1]?.value === "." &&
      tokens[index + 2]?.value === "rpc" &&
      tokens[index + 3]?.value === "(" &&
      tokens[index + 4]?.value === "claim_review_analyze_jobs"
  );

const failures = [];

check("le parseur SQL assimile int à signature integer", () => {
  assert.equal(
    getUnsafeGrants(
      "grant execute on function public.claim_review_analyze_jobs(int, text, text) to anon;"
    ).length,
    1
  );
}, failures);
check("le parseur SQL assimile int4 à signature integer", () => {
  assert.equal(
    getUnsafeGrants(
      "grant execute on function public.claim_review_analyze_jobs(int4, text, text) to authenticated;"
    ).length,
    1
  );
}, failures);
check("le parseur SQL conserve une frontière lexicale pour un commentaire inter-token", () => {
  const sql = "grant/*comment*/execute on function public.claim_review_analyze_jobs(integer, text, text) to anon;";
  assert.match(stripSqlComments(sql), /grant\s+execute/i);
  assert.equal(getUnsafeGrants(sql).length, 1);
}, failures);
check("le parseur SQL refuse la combinaison commentaire inter-token et int4", () => {
  assert.equal(
    getUnsafeGrants(
      "grant/*x*/execute on function public.claim_review_analyze_jobs(int4, text, text) to anon;"
    ).length,
    1
  );
}, failures);
check("le parseur SQL détecte le grant interdit parmi plusieurs statements", () => {
  assert.equal(
    getUnsafeGrants(
      "grant execute on function public.claim_review_analyze_jobs(integer, text, text) to service_role;\ngrant/*x*/execute on function public.claim_review_analyze_jobs(int4, text, text) to anon;"
    ).length,
    1
  );
}, failures);
check("le parseur SQL ignore un faux grant dans un bloc dollar-quoted", () => {
  assert.equal(
    getUnsafeGrants(
      "do $body$ begin perform 'grant execute on function public.claim_review_analyze_jobs(int4, text, text) to anon'; end $body$;"
    ).length,
    0
  );
}, failures);
check("le parseur SQL refuse GRANT ALL", () => {
  assert.equal(
    getUnsafeGrants(
      "grant all on function public.claim_review_analyze_jobs(integer, text, text) to anon;"
    ).length,
    1
  );
}, failures);
check("le parseur SQL refuse GRANT ALL PRIVILEGES", () => {
  assert.equal(
    getUnsafeGrants(
      "grant all privileges on function public.claim_review_analyze_jobs(integer, text, text) to anon;"
    ).length,
    1
  );
}, failures);
check("le parseur SQL refuse plusieurs rôles", () => {
  assert.equal(
    getUnsafeGrants(
      "grant all on function public.claim_review_analyze_jobs(integer, text, text) to service_role, anon;"
    ).length,
    1
  );
}, failures);
check("le parseur SQL reconnaît les identifiants cités", () => {
  assert.equal(
    getUnsafeGrants(
      'grant execute on function "public"."claim_review_analyze_jobs"(integer, text, text) to "authenticated";'
    ).length,
    1
  );
}, failures);
check("le parseur SQL refuse tout rôle non approuvé", () => {
  assert.equal(
    getUnsafeGrants(
      "grant execute on function public.claim_review_analyze_jobs(integer,text,text) to another_role;"
    ).length,
    1
  );
}, failures);
check("le parseur SQL ignore un grant commenté", () => {
  assert.equal(
    getUnsafeGrants(
      "-- grant execute on function public.claim_review_analyze_jobs(integer, text, text) to anon;"
    ).length,
    0
  );
}, failures);
check("le parseur SQL préserve -- et /* */ dans les chaînes", () => {
  const stripped = stripSqlComments("select '-- intact /* intact */'; /* supprimé */ select '/* intact */';");
  assert.match(stripped, /'-- intact \/\* intact \*\/'/);
  assert.match(stripped, /'\/\* intact \*\/'/);
  assert.equal(splitSqlStatements(stripped).length, 2);
}, failures);
check("le parseur SQL accepte le grant exclusif service_role", () => {
  assert.equal(
    getUnsafeGrants(
      'grant execute on function "public"."claim_review_analyze_jobs"(int, text, text) to "service_role";'
    ).length,
    0
  );
}, failures);
check("le parseur SQL accepte le grant exclusif service_role avec int4", () => {
  assert.equal(
    getUnsafeGrants(
      "grant execute on function public.claim_review_analyze_jobs(int4, text, text) to service_role;"
    ).length,
    0
  );
}, failures);
check("le lexer TypeScript ignore commentaires et chaînes leurres", () => {
  const tokens = tokenizeTypeScript(
    'const lure = "dynamicSupabase.rpc(\\"claim_review_analyze_jobs\\")"; // dynamicSupabase.rpc("claim_review_analyze_jobs")\ndynamicSupabase.rpc("claim_review_analyze_jobs");'
  );
  assert.equal(
    countTokenSequences(tokens, ["dynamicSupabase", ".", "rpc", "(", "claim_review_analyze_jobs"]),
    1
  );
}, failures);

check("la migration corrective existe", () => {
  assert.ok(existsSync(migrationPath), migrationName);
}, failures);

const migration = existsSync(migrationPath) ? read(migrationPath) : "";
const canonicalFunction = existsSync(canonicalFunctionPath) ? read(canonicalFunctionPath) : "";

check("la migration cible la signature exacte", () => {
  assert.equal(
    getUnsafeGrants(
      "grant execute on function public.claim_review_analyze_jobs(integer, text, text) to anon;"
    ).length,
    1
  );
  assert.equal(getUnsafeGrants(migration).length, 0);
}, failures);
check("la migration réserve l’accès au worker service_role", () => {
  assert.match(migration, /reserved to server workers using service_role/i);
}, failures);
check("PUBLIC, anon et authenticated sont explicitement révoqués", () => {
  for (const role of ["public", "anon", "authenticated"]) {
    assert.match(
      stripSqlComments(migration),
      new RegExp(
        String.raw`revoke\s+execute\s+on\s+function\s+public\.claim_review_analyze_jobs\s*\(\s*integer\s*,\s*text\s*,\s*text\s*\)\s+from\s+${role}\s*;`,
        "i"
      )
    );
  }
}, failures);
check("tout grant de la migration corrective est exclusif à service_role", () => {
  assert.deepEqual(getUnsafeGrants(migration), []);
}, failures);
check("la définition canonique reste SECURITY DEFINER", () => {
  assert.match(stripSqlComments(canonicalFunction), /security\s+definer/i);
}, failures);
check("la définition canonique fixe search_path à public", () => {
  assert.match(stripSqlComments(canonicalFunction), /set\s+search_path\s*=\s*public/i);
}, failures);
check("l’Edge Function construit le client RPC avec SERVICE_ROLE_KEY", () => {
  const tokens = tokenizeTypeScript(read(join(root, "supabase/functions/process-review-analyze/index.ts")));
  assert.ok(hasTokenSequence(tokens, ["Deno", ".", "env", ".", "get", "(", "SERVICE_ROLE_KEY", ")"]));
  assert.ok(hasTokenSequence(tokens, ["createClient", "(", "supabaseUrl", ",", "serviceRoleKey"]));
  assert.ok(hasRpcCall(tokens, "supabaseAdmin"));
}, failures);
check("le cron exécute la RPC via le singleton service_role", () => {
  const tokens = tokenizeTypeScript(read(join(root, "server/_shared/handlers/cron/ai/tag-reviews.ts")));
  assert.ok(hasTokenSequence(tokens, ["getEnv", "(", "[", "SUPABASE_SERVICE_ROLE_KEY", "]", ")"]));
  assert.ok(hasTokenSequence(tokens, ["supabaseAdmin", "=", "createClient", "<", "Database", ">", "(", "supabaseUrl", ",", "serviceRoleKey"]));
  assert.ok(hasTokenSequence(tokens, ["dynamicSupabase", "=", "supabaseAdmin", "as", "unknown", "as", "DynamicSupabaseClient"]));
  assert.ok(hasRpcCall(tokens, "dynamicSupabase"));
  assert.equal(hasRpcCall(tokens, "dynamicUserClient"), false);
  assert.equal(hasRpcCall(tokens, "userClient"), false);
}, failures);
check("le dispatcher cron conserve le chemin ai/tag-reviews", () => {
  const tokens = tokenizeTypeScript(read(join(root, "api/cron/[...slug].ts")));
  assert.ok(hasTokenSequence(tokens, ["ai/tag-reviews", ":", "handleAiTagReviews"]));
}, failures);
check("aucun autre appel local canonique de la RPC n’existe", () => {
  const files = [
    ...walkSourceFiles(join(root, "src")),
    ...walkSourceFiles(join(root, "api")),
    ...walkSourceFiles(join(root, "server")),
    ...walkSourceFiles(join(root, "supabase", "functions"))
  ];
  const callers = files
    .filter((file) => {
      const tokens = tokenizeTypeScript(read(join(root, file)));
      return hasAnyClaimRpcCall(tokens);
    })
    .sort();
  assert.deepEqual(callers, directCallers);
}, failures);
check("aucune migration égale ou postérieure ne réintroduit un grant interdit", () => {
  const migrations = readdirSync(join(root, "supabase", "migrations"))
    .filter((file) => file >= migrationName && file.endsWith(".sql"))
    .sort();
  for (const file of migrations) {
    assert.deepEqual(getUnsafeGrants(read(join(root, "supabase", "migrations", file))), [], file);
  }
}, failures);

if (failures.length > 0) {
  console.error(`\n${failures.length} contrôle(s) en échec.`);
  process.exit(1);
}

console.log("\nTous les contrôles locaux de sécurité de claim_review_analyze_jobs ont réussi.");
