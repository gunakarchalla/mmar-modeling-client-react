# mmar-modeling-client-react

React + MUI + Zustand replica of the [MMAR modeling client](../mmar-modeling-client)
(originally Aurelia + webpack). This project is the migration target; it currently
holds only the **scaffold** — the app shell renders a placeholder and views are
migrated over incrementally.

## Tech stack

Mirrors [`mmar-metamodeling-client-react`](../mmar-metamodeling-client-react):

| Concern        | Choice                                    |
| -------------- | ----------------------------------------- |
| Framework      | React 18                                  |
| UI components  | MUI (Material UI) 5 + Emotion             |
| State          | Zustand                                   |
| Build / dev    | Vite 5                                    |
| Language       | TypeScript 5                              |
| Tests          | Vitest (+ Testing Library, jsdom)         |
| 3D             | three.js + troika-three-text              |
| Code editor    | Monaco (`@monaco-editor/react`)           |
| DTOs           | shared `mmar-global-data-structure` (gds) |

## Getting started

```bash
npm install
npm run dev        # http://localhost:8085
```

Other scripts: `npm run build` (typecheck + Vite build), `npm run typecheck`,
`npm run lint`, `npm test`.

## Configuration

Runtime config is read from `import.meta.env` in [`src/config.ts`](src/config.ts):

| Var             | `.env` (docker)                | `.env.development` (local) |
| --------------- | ------------------------------ | -------------------------- |
| `VITE_API_URL`  | `http://mmar-server:8000`      | `http://localhost:8000`    |
| `VITE_SYNC_URL` | `ws://mmar-sync-server:8060`   | `ws://localhost:8060`      |

`VITE_SYNC_URL` points at [`mmar-sync-server`](../mmar-sync-server) and drives the
yjs-based real-time collaboration that is unique to the modeling client.

## Path aliases

Configured in `vite.config.ts`, `vitest.config.ts`, and `tsconfig.json`:

- `@/*` → `src/*`
- `@gds` / `@gds/*` → the sibling `mmar-global-data-structure` package
- `jsonwebtoken` → [`src/stubs/jsonwebtoken.ts`](src/stubs/jsonwebtoken.ts)
  (the gds `User` DTO imports the Node-only `jsonwebtoken`; the browser only
  decodes tokens, so signing/verifying is stubbed to throw)

## Layout

```
src/
  main.tsx                  # React entry: MUI ThemeProvider + CssBaseline
  App.tsx                   # app shell (placeholder for now)
  config.ts                 # API_URL / SYNC_URL
  stubs/jsonwebtoken.ts     # browser stub for the Node-only jsonwebtoken
  resources/
    services/               # (to migrate) backend/api, utilities
    store/                  # (to migrate) Zustand stores
    collaboration/          # (to migrate) yjs shared-doc, awareness, cursors
  views/                    # (to migrate) UI: toolbars, canvas, dialogs, ...
```

## Deferred dependencies

To keep the scaffold aligned with the metamodeling-client stack, feature-specific
libraries from the original modeling client are **not** installed yet. Add each as
its feature is migrated:

| Package(s)                          | Feature in the original client                     |
| ----------------------------------- | -------------------------------------------------- |
| `yjs`, `y-websocket`, `y-protocols` | Real-time collaboration (`resources/collaboration`) |
| `@uppy/core` + `@uppy/*`            | File-upload dialogs (file / gltf / image)          |
| `unzipit`                           | Model / metamodel import (zip)                     |
| `urdf-loader`                       | URDF robot-model loading                           |
| `mousetrap`                         | Keyboard shortcuts                                 |
| `notiflix`                          | Toast / loading notifications (→ MUI Snackbar?)    |

Notifications may instead be handled with MUI components (as the metamodeling
client does with its `AppSnackbar`); decide per-feature during migration.
