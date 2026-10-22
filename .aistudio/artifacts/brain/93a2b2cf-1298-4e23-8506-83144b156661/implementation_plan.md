# Revert Recent UI Changes & Fix Admin Dashboard Lag and Auto-Restore/Delete Bugs

This plan reverts all UI changes introduced in the previous turn back to the original design while fixing the underlying storage synchronization bugs (which caused items to randomly delete or restore themselves) and eliminating rendering lag in the Admin Dashboard.

### User Review & Critical Decisions

> [!IMPORTANT]
> All three preferences confirmed in the clarification step are locked into this plan:

- **Confirmed Decision 1 — Deletion & Restoration**: Remove all automatic recovery and migration scripts (`recoverAccidentalDeletionIfNeeded` and legacy `v2` storage migration) so deleted or cleared items stay deleted permanently and are only restored when you explicitly click **Restore Defaults** or **Undo**.
- **Confirmed Decision 2 — Stop Dashboard Lag**: Keep the interactive **Live Canvas Preview** inside the Admin Dashboard collapsed by default (`showLiveCanvasPreview = false`) so the browser does not simultaneously decode and render all 26+ videos and photos twice on initial load.
- **Confirmed Decision 3 — Full UI Revert**: Revert the sign-in screen (`/auth`), footer (`Footer`), showcase toolbar (`Showcase`), and admin dashboard (`PortfolioAdmin`) back to their original layout and controls.

---

### 1. Overview & Core Concept

- **What It Does**: Restores the exact original Studio CMS interface while fixing the state corruption and performance bottlenecks under the hood.
- **Target Audience / Persona**: Studio owner managing portfolio photos and videos on the infinite canvas.
- **Key Value**: Predictable, permanent edits (no phantom deletions or unwanted item resurrections) and smooth 60fps scrolling and interaction inside the Admin Dashboard.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Sign-In (`/auth`)**: Original clean email and password form without extra owner/Google buttons.
  2. **Admin Dashboard (`/dashboard`)**: Opens directly into the fast, responsive item management grid without mounting a second duplicate infinite canvas at the same time. Clicking **Show Canvas Preview** or **Locate** on any card opens the live preview on demand.
  3. **Permanent Deletions & Edits**: Deleting an item, removing attached media, or clicking **Clear All** permanently updates both local storage and the server store (`data/canvas-cms.json`) and removes orphaned blobs from IndexedDB. Nothing auto-restores on refresh.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Original dark liquid-glass monochrome aesthetic (`bg-background`, `bg-neutral-950/90`, subtle `border-white/12` hairlines).
  - *Color Palette & Mood*: Deep obsidian canvas (`#050505`), crisp white foreground typography, muted neutral metadata, and semantic emerald/crimson accents strictly for undo/delete actions.
  - *Typography & Hierarchy*: Display headlines in `Fraunces` (`font-display`), clean UI controls in sans-serif, and tabular coordinates/dimensions in monospace (`font-mono tabular-nums`).
  - *Component Styling & Layout*: 3-column responsive media grid (`sm:grid-cols-2 lg:grid-cols-3`) with natural aspect-ratio previews.
- **Interactive Feedback & Motion**: Instant optimistic updates with non-blocking background server persistence and a single-step session Undo toast when deleting items.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Eradicating Auto-Restore & Phantom Deletions**
  - *Chosen Approach*: Disable `recoverAccidentalDeletionIfNeeded()`, remove the legacy `V2_STORAGE_KEY` fallback that stamped `new Date().toISOString()` on empty/fresh storage reads, and delete orphaned media blobs from IndexedDB whenever an item is deleted.
  - *Why*: Previously, whenever `localStorage` was restricted or cleared in an iframe, `readLocalCmsStore()` generated a fresh `updatedAt` timestamp newer than the server's `data/canvas-cms.json` and overwrote the server, while `recoverAccidentalDeletionIfNeeded()` cleared `deletedIds = []` and resurrected deleted files from IndexedDB.
  - *Alternatives Considered*: Keeping a one-time recovery flag in `localStorage` was unreliable across iframe sessions and caused repeated unwanted restorations.
- **Decision 2: Eliminating Triple Media Decoding & Layout Thrashing**
  - *Chosen Approach*: Default `showLiveCanvasPreview` to `false` in `PortfolioAdmin`, memoize `expandCanvasProjects(items)` and `buildResolvedCanvasItemsFromStore()`, and prevent self-dispatched `canvas-cms-updated` events from triggering redundant re-renders in `PortfolioAdmin`.
  - *Why*: Mounting `<Showcase embeddedPreview />` by default alongside the Admin Grid forced the browser to render 78+ media elements (26 canvas cards + 26 admin cards + 26 thumbnails) and run multiple video decoders and collision loops concurrently.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Studio CMS Data Lifecycle                         │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
        ┌────────────────────────────┴────────────────────────────┐
        ▼                                                         ▼
┌───────────────────────────────┐                 ┌───────────────────────────────┐
│   Admin Dashboard (/dashboard)│                 │   Public Showcase Canvas (/)  │
│  - Original clean header/grid │                 │  - Infinite pan/zoom stage    │
│  - Live preview collapsed     │                 │  - Reads resolved items       │
│    by default (on-demand)     │                 │  - Syncs without overwriting  │
└───────────────┬───────────────┘                 └───────────────▲───────────────┘
                │                                                 │
                │ Explicit User Mutations Only                    │ Cached Resolution
                │ (Add / Edit / Delete / Clear / Restore)         │ (Memoized O(1) hit)
                ▼                                                 │
┌─────────────────────────────────────────────────────────────────┴───────┐
│                     CMS Storage Engine (cms-storage.ts)                 │
│  - No auto-recovery / no V2 timestamp spoofing                          │
│  - Cleans up IndexedDB blobs on item deletion                           │
│  - Monotonic mutationVersion prevents stale poll overwrites             │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│               Server Persistence (/api/drive-media?cmsState=1)          │
│  - Persists authoritative state to data/canvas-cms.json                 │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - `CanvasCmsStoreData`: `{ addedItems, deletedIds, overrides, updatedAt, lastFocusedId }`.
  - Uninitialized client store uses epoch `new Date(0).toISOString()` so it always yields to the server store on initial load and never overwrites server state until the user explicitly mutates an item.
- **Interactive Component & State Mapping**:
  - **Delete Item / Delete Media / Clear All**: Updates `deletedIds` and `addedItems`, deletes corresponding binary keys from IndexedDB (`grvnth_cms_media_idb`), increments `mutationVersion`, and pushes to `/api/drive-media?cmsState=1`.
  - **Restore Defaults / Undo Delete**: Explicitly triggered only when the user clicks the **Restore Defaults** or **Undo** button.
  - **Show / Hide Canvas Preview**: Lazily mounts `<Showcase embeddedPreview />` only when toggled on or when **Locate** is clicked.
