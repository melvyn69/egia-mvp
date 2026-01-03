# React + TypeScript + Vite

## MVP setup
1) `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_TEST_EMAIL`, `SUPABASE_TEST_PASSWORD`, `APP_BASE_URL`.
2) Supabase secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_BASE_URL`.
3) Supabase Auth redirect: `http://localhost:5173/auth/callback`.
4) Google OAuth redirect: `http://localhost:5173/google_oauth_callback`.
5) Scopes Google: `https://www.googleapis.com/auth/business.manage`.
6) `npm install`
7) `npm run dev`
8) Login Google (Supabase), puis "Connecter Google Business Profile".
9) "Sync All" -> comptes/lieux/avis.
10) Smoke test: `npm run smoke:auth` (ou `SUPABASE_ACCESS_TOKEN` depuis Debug en dev).
11) Curl: `curl -i -X POST "$SUPABASE_URL/functions/v1/google_gbp_sync_all" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "apikey: $SUPABASE_ANON_KEY"` -> JSON avec `accounts`.

## Google OAuth setup
1) Google Cloud Console -> OAuth consent -> ajouter le scope `https://www.googleapis.com/auth/business.manage`.
2) Credentials -> OAuth Client -> Authorized redirect URI: `http://localhost:5173/google_oauth_callback`.
3) Ajouter l'utilisateur test si l'app est en mode test.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Supabase Functions

### 403 scope insufficient ?
1) Google Cloud → OAuth consent → ajouter le scope `https://www.googleapis.com/auth/business.manage`
2) Ajouter ton compte dans "Test users" si l'app est en mode test
3) Revoquer l'acces a l'app dans Google Account (Securite → Acces tiers)
4) Relancer "Connecter Google Business Profile"
