# React + TypeScript + Vite

## MVP setup (local)
1) `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `APP_BASE_URL`.
2) Supabase Auth redirect: `http://localhost:5173/auth/callback`.
3) Google OAuth redirect: `http://localhost:3000/api/google/oauth/callback` (Vercel dev) ou l'URL Vercel en prod.
4) Scopes Google: `https://www.googleapis.com/auth/business.manage`.
5) `npm install`
6) `npm run dev` (frontend Vite) + `vercel dev` (API routes).
7) Login Google (Supabase), puis "Connecter Google Business Profile".
8) Synchroniser les lieux Google Business Profile.

## MVP setup (prod)
1) Vercel env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `APP_BASE_URL`.
2) Google OAuth redirect: `${APP_BASE_URL}/api/google/oauth/callback`.
3) Déployer sur Vercel, puis tester la connexion Google depuis `/connect`.

## Google OAuth setup
1) Google Cloud Console -> OAuth consent -> ajouter le scope `https://www.googleapis.com/auth/business.manage`.
2) Credentials -> OAuth Client -> Authorized redirect URI: `${APP_BASE_URL}/api/google/oauth/callback`.
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
