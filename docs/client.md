# Client (`web/client`)

Vue 3 + TypeScript SPA (Vite, `<script setup>`), TailwindCSS + some SCSS, Pinia, vue-router, and `@vue-flow/core` for the map canvas. Imports the `shared` workspace package (aliased to source: `shared` → `../shared/src/index.ts` in both `vite.config.ts` and `tsconfig.json`; `@` → `src/`).

## Structure

- **Entry:** `src/main.ts` → `src/App.vue` (RouterView + Vercel Analytics in prod). `App.vue` also starts `useVersionWatch()` (`src/composables/useVersionWatch.ts`) app-wide: it snapshots `GET /api/version` on load and polls every 3 min (+ on tab focus). If the token changes it flips `updateAvailable` and **stops polling** — it never reloads on its own. `App.vue` renders `UpdateAvailableToast.vue` off that state: a persistent prompt ("A new version has been released, please reload") with a Reload button, so nobody is interrupted mid-edit. It sits at the mega toast's vertical position (`top-20 md:top-24`, `Z_INDEX.TOAST`) and is click-through except for the pill itself. **To preview it without touching the DB:** `localStorage.setItem('show_reload', 'true')` and reload — the prompt appears and polling is skipped entirely; clear with `localStorage.removeItem('show_reload')`. This is the only update path that reaches users **not** in a room; in-room users can additionally be reloaded *unconditionally* via the WS `force_reload` message (`useRoomStore`), which is the hard-reload escape hatch.
- **Routes** (`src/router/index.ts`):
  - `/` → `src/views/LandingPage.vue` — marketing/tutorial page with chaptered demo video. The video is a YouTube embed (`YOUTUBE_VIDEO_ID`), behind a click-to-play poster: no YouTube script, cookie or iframe is fetched until the poster is clicked. Once playing, the chapter rail drives `seekTo` through the IFrame Player API and reads `getCurrentTime()` at 4Hz for the progress bars, so the chapter list keeps working exactly as it did with the old `<video>`. The poster walks `maxresdefault → sddefault → hqdefault`, detecting a missing size by its 120x90 placeholder (a missing thumbnail 404s but still decodes, so `error` never fires). Chapter timings live in `chapters[]` and must be kept in step with the chapter markers in the video's YouTube description.
  - `/create` → `src/views/CreateRoomView.vue` — room creation
  - `/rooms/:id/auth` → `src/views/RoomAuthView.vue` — password gate
  - `/rooms/:id` → `src/views/RoomView.vue` — **the map** (~1,700 lines; hosts the canvas and owns all connection-creation logic, toasts, toolbars)

## Pinia stores (`src/stores/`)

### `useRoomStore.ts` (id `room`) — the core store, owns the WebSocket

- **State:** `connections`, `homeZoneId`, `chains`, `nodePositions`, `roomTitle`, `roomId`, `wsStatus` (`disconnected|connecting|connected|auth_failed`), `lastUpdate`, `lastPing`, `watchingCount`, `totalConnected`, `disconnectReason`, UI flags for in-progress connecting/chain placement, and localStorage-persisted prefs (`shapeBackgroundOpacity`, `animationsEnabled`, `bluePromptsEnabled`, `recentlyViewedRooms`).
- **Room server:** `roomServer` (`'eu' | 'us' | 'asia' | null`, from `sync.server` + `room_server_updated`), `needsServerAssignment` (`connected && roomServer === null && canEdit`) and `setRoomServer(server, adminPassword?)` (PATCH `/api/rooms/:id/server`). `RoomView` mounts `RoomServerModal.vue` in **blocking** mode while `needsServerAssignment` — no cancel, no backdrop dismiss — so rooms predating the column get labelled; the gate deliberately excludes locked read-only sessions, which the server would 403 anyway. `TitleSegment.vue` renders the assigned server as a small pill **nested inside the title pill**, right of the title (a plain `<span>` when `!canEdit`); clicking it (`.stop`, so it doesn't trigger the surrounding rename target) reopens the same modal in change mode, which asks for the admin password. It only appears alongside a title — untitled rooms show no server pill. The picker itself is `components/common/ServerPicker.vue`, shared with `CreateRoomView` (where a server is required to enable Create).
- **Room lock / admin mode:** `locked` (from `sync.locked` + `room_lock_changed`), `isAdmin` (display-only decode of the stored JWT's `role` claim — the server independently enforces), `canEdit = !locked || isAdmin`. `adminAuthenticate(adminPassword)` exchanges the admin password at `/auth/admin` for an admin token and **replaces** the stored room token; callers must then `reconnect()` the WS so the live session gains the role — but only **after** any `setRoomLock(locked)` PATCH, because the fresh socket's `sync` re-reads the DB and would otherwise race the UPDATE and clobber `locked` (this ordering lives in `LockRoomModal.submit`). When `canEdit` is false the client is hard read-only: `send()` drops mutating WS messages, every optimistic store mutator and chain/import REST action no-ops or throws `Room is locked`, per-node `draggable` and the Vue Flow interaction props go false (per-node flags override the globals, so both are bound), and RoomView's drag/connect/edge-update/popover handlers show a "Room is locked — read-only" toast. The server rejects everything independently.
- **WS lifecycle:** `connect()` opens `${API_BASE_URL}/ws/rooms/:id` (http→ws protocol rewrite), sends `{type:'auth', token}` on open. Reconnects with exponential backoff (1 s → 30 s) on any close **except code 4401** (auth failure → redirect to auth page). `getToken()` always reads `localStorage['token:${roomId}']` live, never caches.
- **`applyMessage(msg: ServerMessage)`** is the inbound reducer — one case per server message type (see [websocket-protocol.md](websocket-protocol.md)). Replies `polo` to `marco` automatically.
- **Outbound writes:**
  - WS `send()`: `update_node_positions`, `rotate_zone`, `create_connection`, `update_plot_route`, `ping`, `polo`.
  - REST (Bearer token): import (PUT `/import`), chain CRUD (`addChain`, `updateChainColor`, `relocateChain`, `removeChain`), connection CRUD from the edge popover.
- **Domain logic:** isolation analysis (`isNodeIsolated`/`isEdgeIsolated` via `src/utils/treeQuery.ts` ancestor chains), chain friendly-id/color resolution, and `validateNodeRotations()` — cross-checks stored rotation vs inferred handle layout and auto-sends `rotate_zone` to self-heal desyncs.

### `useRoomMemoryStore.ts` (id `roomMemory`)

Thin `Map<zoneId, RoomMemoryEntry>` over room memory ("map history"), driven by the memory cases in `useRoomStore.applyMessage`.

### `usePlotRouteStore.ts` (id `plotRoute`)

Route-plotting state machine (`idle → selectingFrom → selectingTo`). Runs a local **BFS** over connections (bidirectional) to find the path between two same-chain zones; highlights plotted/reversed edges and ghost previews; broadcasts via `update_plot_route`; reacts to node/connection removal.

## The Vue Flow canvas (`RoomView.vue`)

- `<VueFlow>` with `nodeTypes = { zone: ZoneNode, 'non-roads': NonRoadsNode }`, `edgeTypes = { connection: ConnectionEdge }`, a custom `ConnectionLine` (`src/components/flow/ConnectionLine.vue`), `ConnectionMode.Loose`, min-zoom 0.1.
- **State → flow translation:** a deep watcher on `[homeZoneId, nodePositions, connections]` rebuilds `flowNodes`/`flowEdges`. Node type is `zone` for roads/roadsHideout, `non-roads` otherwise; `data` carries tier, name, `mapShape`, `customHandles`, `rotation`, `features`, `explored`, chain info, isolation. Reconciles via VueFlow `updateNode`, calling `updateNodeInternals` when handle sets change.
- **Positions are server-owned.** Dragging a node fires `onNodeDragStop` → store sends `update_node_positions`. The client never persists inferred positions itself (comments in RoomView explain the historical DELETE+reinsert footgun).
- **Nodes:** `ZoneNode.vue` draws a diamond with an optional rotated map-shape PNG (`/images/shapes/{mapShape}.png`), feature editors (cores/reds/chests/resources), ping/memory buttons, and the handle editor (`ZoneHandleEditor`). Handles are rendered by `ZoneNodeHandles.vue` from `getDefaultHandles(type, mapShape)` (shared) merged with saved `customHandles`, plus a synthetic `center` and a `center-overlay` snap target while connecting.
- **Edges:** `ConnectionEdge.vue` uses a custom bezier from `src/utils/connectionPath.ts` (handle facing directions → exit/entry angles). Animated SVG chevrons (scale with distance; static when animations disabled), countdown pill, slots badge (7/20), and an edit/delete popover. Colour from `src/utils/connectionStyle.ts`: green >60 m, orange <60 m, red <30 m, grey expired; plotted-route edges override to blue.
- **Countdowns:** one 1 s `setInterval` updates a provided `globalNow` ref that all edges/timers consume.
- **Summaries:** RoomView derives active cores/crystals/Brecilien portals/dungeons/chests/resources from node features, feeding `TopLeftToolbar`/`TopRightToolbar`/`MobileRoomSummary`.

## Connection creation

VueFlow `@connect-start` / `@connect` / `@connect-end` → `handleConnect()` in RoomView:

- Drop on a node/handle → create/update the connection directly (WS `create_connection`).
- Drop on empty canvas → spawn a **ghost node + ghost edge** and open `ReportForm.vue` to pick the destination zone and portal time.
- New chains use ghost-on-cursor placement (`beginPlacingChain` / `onPendingChainClick`) → `store.addChain(zoneId, {x, y})`.

## Auth, room join & client-side validation

- **Create:** POST `/api/rooms`, then immediately POST `/auth` for a JWT → `localStorage['token:${id}']`. Vanity slug availability debounce-checked via `/api/slugs/check/:slug`; auto-generated from title or `unique-names-generator`.
- **Join:** `RoomAuthView` resolves the room (`/api/rooms/resolve/:id`), skips straight in if a token exists, else POSTs the password. Reason banners come from `?reason=password_rotated|room_deleted|session_expired`.
- **In-room:** `RoomView.initializeRoom` sets credentials and connects; `wsStatus === 'auth_failed'` clears the token and redirects to auth with the reason.
- **Room lock UI:** the cog menu (`RoomSettings.vue`) has a Lock/Unlock entry (below Change password) opening `LockRoomModal.vue`, which always prompts for the admin password, upgrades the session via `adminAuthenticate` and toggles the lock, then confirms "you are now in admin mode". While locked, `LockedRoomFrame.vue` draws a yellow rounded frame around the map (desktop ≥ md) with a bottom-centre "🔒 Locked" badge above the connection status bar, plus an orange "⚠️ Admin mode" badge for admin sessions; on mobile a 🔒 chip appears next to the title (`TitleSegment.vue`).
- **Version announcements:** v1.3 (room locking) is announced via a low-key "New!" CTA on the settings cog plus a "New" pill next to the Lock room entry (`RoomSettings.vue`), seen-tracked by `localStorage['cta:v13:roomLock:dismissed']` — opening the cog dismisses it for future sessions (the pill persists for the current session until the lock modal is opened). The v1.2 splash modal (`version-announcements/V1dot2SplashModal.vue`, keys `splash:v12:seen` / `cta:chainManagement:dismissed`) is retired: its mounts in `LandingPage.vue` and `RoomView.vue` are commented out, kept as the pattern for future slideshow-style announcements. The landing-page banner describes the current version.
- **Donation prompt** (`DonationPromptModal.vue`, mounted in `RoomView.vue`): counts distinct visits in localStorage (`donate:visitCount` / `donate:lastVisitAt`; a visit counts when the last *counted* visit was >6 h ago — the timestamp is only rewritten on a counted visit so frequent visitors still accrue) and shows a "Please consider donating" modal with a Ko-fi `TipButton` at 3 visits. Dismissing sets `donate:dismissed` (never shown again); users with `tippedNavigator` set are never prompted. `TipButton` takes a `source` prop (`planner` default / `modal`) that picks the analytics click event and disables the toolbar jiggle inside the modal; clicking emits `clicked` (the modal swaps to a thank-you state with a Close button rather than dismissing, since Ko-fi opens in a new tab). Clicking the planner's toolbar TipButton also opens the modal straight in the thank-you state: `BottomLeftToolbar` re-emits `tipped` and `RoomView` calls the modal's exposed `showThanks()`, which bypasses the visit-count gating. Analytics go through `utils/events.ts` `sendEvent(type)` → fire-and-forget POST `/api/events`; events: `donation_modal_shown`, `donation_modal_clicked`, `donation_planner_clicked`.
- **Client-side validations** (UX layer — the server re-validates everything): same-zone, cross-chain, disabled handles, one-connection-per-portal; occupied-target confirmation modal; reverse-duplicate normalization; roads↔non-roads rules; `wouldCreateLongerLoop` (shared) warnings; Royal-vs-Outlands compatibility filtering in `ReportForm`; permanent-connection derivation for non-roads↔non-roads.

## Build & dev

- Scripts: `dev` (vite, port 5173), `build` (`vue-tsc --noEmit && vite build`), `preview`, `test` (`vitest run`), `lint`.
- **Dev proxy** (`vite.config.ts`): `/api` → `http://localhost:3001`, `/ws` → `ws://localhost:3001` (upgrade). In non-dev, `src/utils/api.ts` picks the base URL: Vercel `preview` env → `https://api-testing.albionroads.live`, else `VITE_API_URL` or `http://localhost:3001`.
- Injected globals: `__APP_VERSION__` (root package.json), `__APP_COMMIT_SHA__`, `__VERCEL_ENV__`.
- **Emoji font:** `public/fonts/noto-color-emoji-subset.woff2` is a self-hosted COLRv1 (vector) subset of Noto Color Emoji, declared in `src/style.css` under the same family name so it shadows the OS bitmap font on Linux/Android (Chromium fails to re-raster bitmap emoji under the map's zoom transform, leaving icons at a stale size). When adding a new emoji to the client, re-subset the font and extend the `unicode-range` — see the comment above the `@font-face`.
- Deployed on Vercel (client) against the Dockerised API.
