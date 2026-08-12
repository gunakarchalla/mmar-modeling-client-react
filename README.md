# mmar-modeling-client-react

A React port of the MMAR **modeling** client (`mmar-modeling-client`, originally
Aurelia 2 + webpack), re-implemented for full functional parity on **React 18 +
TypeScript 5 + Vite 5 + MUI (Material UI) 5 + Zustand**, with **three.js** for the
3D/2D/AR world and **yjs** for real-time collaboration.

The migration is **complete**: every view, dialog, engine class and service of the
original has been ported, consciously replaced with an MUI-native equivalent, or
documented as intentionally inert (see [Parity](#parity)).

## What the app is

A 3D/2D/AR **model editor**. You log in, a tree of SceneTypes → SceneInstances
loads on the left; opening a SceneInstance creates a **tab** with its own
`THREE.Scene`. The tab's classes/relationclasses appear as palette buttons; you draw
class instances onto the canvas, connect them with relationclass lines (with
bendpoints), edit attribute values on the right, and everything auto-saves to the
REST API every 5 s. Scenes shared with ≥2 users become **collaborative**: a yjs
document syncs edits live through the sync server, with remote cursors, selections
and a user legend. Extras: model/metamodel import-export, file/gltf/image uploads,
expression-driven visual representations (`vizRep(gc)` code strings evaluated against
a `GraphicContext`), hybrid algorithms (robotics/URDF, statechange, objectspace), a
robot-joint simulation window, procedures ("Algorithms" dialog), and WebXR (AR/VR).

Interaction is a 5-state machine (`globalStateObject`): `0 Selection (drag)`,
`1 View`, `2 Drawing (insert)`, `3 DrawingRelationClass (line)`, `4 Simulation`.

Every change to the open scene is undoable (`Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z` or `Ctrl/⌘+Y`,
and the toolbar buttons) — see [Undo/redo](#undoredo).

## Tech stack

| Concern        | Choice                                              |
| -------------- | --------------------------------------------------- |
| Framework      | React 18 (single-page, **no router**)               |
| UI components  | MUI 5 + Emotion                                     |
| State          | Zustand                                             |
| Build / dev    | Vite 5                                              |
| Language       | TypeScript 5 (strict)                               |
| Tests          | Vitest + Testing Library + jsdom                    |
| 3D / AR        | three.js + troika-three-text + WebXR (`XRButton`)   |
| Collaboration  | `yjs` + `y-websocket` + `y-protocols`               |
| Robotics       | `urdf-loader`; `unzipit` for zipped URDF/model import |
| DTOs           | shared `mmar-global-data-structure` (gds), via `@gds` |
| Resizable UI   | `react-resizable-panels`                            |

MUI-native replacements chosen over the original's dependencies (locked decisions):
notiflix → `logStore` + MUI `Snackbar` (`AppSnackbar`); `@uppy/*` → MUI file inputs;
`mousetrap` → a plain `keydown` hook (`useKeyboardShortcuts`). Monaco/js-beautify are
present to mirror the sibling stack but currently unused (no code editor in this app).

## Architecture

```
src/
  main.tsx                    # React entry: reflect-metadata (first import), MUI theme, CssBaseline
  App.tsx                     # renders AppLayout
  config.ts                   # API_URL / SYNC_URL / dev autofill, from import.meta.env
  constants.ts                # hardcoded meta-object uuids (robotic-system, statechange, ...)
  engine/                     # three.js world — plain-TS module singletons, NO React imports
    global-definition.ts      # the engine "god object": renderer, cameras, controls, tabContext[], flags
    index.ts                  # composition root + `engine.mount/unmount/whenReady/createXRButton` facade
    graphic-context.ts        # the `gc` API every stored vizRep code string is evaluated against
    interaction-handler.ts    # the 733-line 5-mode interaction state machine
    hybrid-algorithms/        # robotics/URDF + statechange + objectspace + the hybrid service
    ...                       # animator, initiator, coordinates-updater, deletion/creation handlers, ...
  resources/
    services/                 # framework-agnostic TS: api, backend-service, *-utility, event-bus, logger
      history-service.ts      # undo/redo: record a step, replay it, broadcast it (see below)
      scene-diff.ts           # the snapshot/diff rules history-service applies
    store/                    # Zustand stores (see below)
    collaboration/            # yjs shared-doc, y-mapping, awareness/cursor/selection renderers
    util/                     # small helpers (describe-error, platform)
  views/                      # React components (MUI), one folder per region
    layout/                   # AppLayout (page skeleton) + TabBar + tabActions
    top-nav-bar/ toolbar/ left-nav/ right-nav/ state-window/ log-window/ footer/
    three-canvas/             # ThreeCanvas (engine.mount host) + XrButton overlay
    scenegroup/ palette/ attribute-window/ simulation-window/ user-legend/
    dialogs/                  # every modal (create/save-as/copy/delete/import/share/algorithm/upload/...)
    auth/ common/ hooks/
  stubs/jsonwebtoken.ts       # browser stub for the Node-only jsonwebtoken (gds User imports it)
```

### Established idioms (the migration's conventions)

- **DI → module singletons.** Every Aurelia `@singleton()` class becomes a class
  whose single instance is exported at the bottom of its own file
  (`export const interactionHandler = new InteractionHandler()`) and imported where
  needed. Cross-singleton wiring that would create circular imports is composed in
  `src/engine/index.ts` — import engine singletons from `@/engine`, not their leaf
  files, so `index.ts` controls construction order. (Exception: the hybrid-algorithms
  singletons are imported by path, having no ordering/side-effect dependency.)
- **EventAggregator → `src/resources/services/event-bus.ts`.** A typed
  `.subscribe(...).dispose()` / `.publish(...)` bus. Handlers are never `async` — wrap
  as `() => void doThing().catch(err => logger.log(...))` (the bus never awaits).
- **HttpClient → `api.ts` + `backend-service.ts`.** `apiFetch` sets JSON headers (none
  for FormData); `backend-service.ts` holds one method per used REST endpoint, attaches
  `authorization: Bearer <token>`, and **revives** responses into gds classes.
- **Revive with gds `fromJS`, never the app's `plainToInstance`.** The app and gds each
  ship their own `class-transformer` copy; gds `@Type` metadata lives only in gds's
  copy, so the app's `plainToInstance` shallow-revives and breaks `instanceof`. Always
  use the gds static `SceneInstance.fromJS(...)` etc. — the modeling client relies on
  `instanceof ClassInstance` checks throughout (`expression-utility`).
- **Aurelia `attached()` → `useEffect(() => {...; return cleanup}, [])`.** `@bindable`
  → props; value converters → plain functions in JSX (`services/format.ts`);
  `repeat.for` → `.map()` with `key={uuid}`.
- **Engine mount facade.** `ThreeCanvas.tsx` calls `engine.mount(container)`; a
  memoized init-promise + monotonic mount-token make StrictMode double-mount and
  per-tab remounts safe. The single page-lifetime `WebGLRenderer` is re-attached,
  never recreated (browsers cap live WebGL contexts at ~16).
- **Zustand two forms.** Hook form (`useXStore(s => s.slice)`) only inside component
  bodies; `useXStore.getState()` everywhere else (engine, services, callbacks).
- **In-place gds mutation → bump a `revision`.** gds objects are mutated in place; after
  a mutation React must observe, bump a store `revision` counter (`selectionStore`).

### Stores

| Store            | Role |
| ---------------- | ---- |
| `authStore`      | token + decoded JWT user; login/logout; restores from `localStorage["jwtToken"]` |
| `logStore`       | log entries + Snackbar state (replaces notiflix; `logger.ts` delegates here) |
| `uiStore`        | open/close state for every dialog + `loading` + `autoSave` mirror |
| `tabsStore`      | reactive tab list + selection; the single mutation path also maintains `globalObject.tabContext` |
| `stateStore`     | display-only mirror of the engine interaction state |
| `selectionStore` | selected instance/type + `revision` bump; drives the AttributeWindow |
| `collabStore`    | per-tab collaboration status/access/banner/users |
| `historyStore`   | per-scene undo/redo stacks (snapshot + touched uuids); drives the toolbar buttons |

## Undo/redo

Scoped to the ACTIVE tab's SceneInstance, one stack per open scene
(`historyStore`), driven by `resources/services/history-service.ts`.

Recording is generic: mutation sites only announce that something happened — engine
modules publish `historyRecord` on the bus (they must not import the service, which
reaches back into the engine), views call `historyService.record()` directly — and the
service snapshots the scene and derives the changed UUIDs by diffing against the
previous entry. That is why coverage is total: creation, deletion, transforms, attribute
and table-attribute values, the scene name, a URDF import, an algorithm run — anything
that lands in the SceneInstance is picked up by the same code, with no per-action
inverse to maintain.

Applying a step is NOT a snapshot restore. Only the instances the recorded action
touched are moved back, so a collaborator's concurrent edits to other objects survive an
undo (`resources/services/scene-diff.ts`). The result is then pushed out through the
channels a normal edit already uses: gds objects are mutated in place and re-drawn via
`persistencyHandler`/`deletionHandler`, peers receive the equivalent
`applyLocalChangeToYDoc` deltas, and the scene is flagged dirty so auto-save PATCHes it.
Instances a peer changed are reported by SharedDocService over
`remoteSceneInstanceChanged` and excluded when a step is recorded, so the stack holds
local edits only.

Chords match the metamodeling client (shared `resources/util/platform.ts`), with one
difference: they stand down inside a text field, so `Ctrl+Z` in an attribute input undoes
the typing rather than the model.

## Shared DTOs (`@gds`)

The shared TypeScript DTOs in `../mmar-global-data-structure` are consumed
**unchanged** via the `@gds` path alias (configured in `vite.config.ts`,
`vitest.config.ts`, `tsconfig.json`); never imported with relative paths. They are
(de)serialized with `class-transformer` exactly as the original does, and
`reflect-metadata` is imported as the **first line** of `src/main.tsx` and
`src/test-setup.ts` (gds decorators depend on it).

## Configuration

Config comes from `import.meta.env.VITE_*`, surfaced only through `src/config.ts`
(never read `import.meta.env` elsewhere):

| Var             | Default                 | Meaning |
| --------------- | ----------------------- | ------- |
| `VITE_API_URL`  | `http://localhost:8000` | Base URL of `mmar-server` (REST) |
| `VITE_SYNC_URL` | `ws://localhost:8060`   | `mmar-sync-server` (yjs WebSocket) |
| `VITE_USERNAME` | *(unset)*               | optional dev-only sign-in autofill |
| `VITE_PASSWORD` | *(unset)*               | optional dev-only sign-in autofill |

Set them in `.env` / `.env.development`. The **browser** runs on the host, so keep
`localhost` there even inside Docker. Inside the container, `mmar-server:8000` /
`mmar-sync-server:8060` are the reachable hostnames (used only for server-side curl
and the live integration tests — `localhost:8000` does not resolve in-container).

## Run / build

```bash
npm install
npm run dev        # Vite dev server on http://localhost:8085
npm run build      # tsc --noEmit && vite build
npm run start:prod # production build + `vite preview --host`
npm run typecheck  # tsc --noEmit
npm run test       # vitest run
npm run lint       # eslint src --ext .ts,.tsx
```

> Do not rename the `start` / `start:prod` scripts — Docker's
> `start-node-modeling-client-react.sh` calls them.

Log in with the dev credentials `admin` / `admin`. The app needs `mmar-server`
(REST, `:8000`) and, for collaboration, `mmar-sync-server` (yjs, `:8060`) reachable.

### Testing notes

Tests are Vitest (node env by default; opt into jsdom per file with
`// @vitest-environment jsdom`). three.js and the collaboration modules need real
browser APIs, so unit tests mock `@/engine/global-definition` (importing it for real
builds a `WebGLRenderer` at module scope). Anything that transitively imports that
leaf must be mocked too. Live-server tests live in `**/*.integration.test.ts`, hit
`mmar-server` / `mmar-sync-server` directly, and **skip gracefully**
(`describe.skipIf`) when the servers are unreachable. There is no browser automation
in this container, so in-browser WebGL rendering is covered indirectly (jsdom
component tests + engine unit tests + the production build), not by a live render.

## Parity

Every file of the original `mmar-modeling-client` is ported, MUI-replaced, or
documented as intentionally inert. The `fetchHelper` (7,889 generated lines) is
subset to the ~25 endpoints actually called, in `backend-service.ts`. A handful of
faithfully-ported quirks and upstream-dead features are catalogued in the migration
log at `../state.json` (`known_issues`, `deferred_items`, and `phases.P13`) — read
that before "fixing" anything that looks odd; several oddities are deliberate
behaviour-parity with the Aurelia source and are pinned by tests.
