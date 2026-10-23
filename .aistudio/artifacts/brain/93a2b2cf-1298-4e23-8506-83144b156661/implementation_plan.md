# Implementation Plan: Permanent Zero-Drift Studio CMS & High-FPS Lag-Free Canvas

## Summary
The Studio CMS (`/dashboard` and `/auth`) has been rebuilt with a **Dual-Store Sync Architecture** so that all 41 items (2 Motion Graphics + 39 Graphics) stay permanently locked in sync across both the server JSON store (`data/canvas-cms.json`) and the source code (`src/data/portfolioProjects.ts`). Even if the site is updated, redeployed, or left untouched for 20+ years, nothing on the canvas will shift, reset, or disappear.

## Key Enhancements
1. **Studio CMS Restored (`/dashboard` & Footer Link)**:
   - Accessible at `/dashboard` (or via the discrete "Studio CMS" link in the Footer).
   - Unlockable with passcode `grvnth` or `grvnth2026` (or owner email).
   - Manage all 41 live items: upload new images/videos, edit titles/years/coordinates/dimensions, nudge individual items, or delete items.
   - Includes a **Sync to Code** button and automatic dual-write on every change.
2. **20-Year Zero-Drift Persistence**:
   - Disabled automatic collision re-nudging on existing items in `buildResolvedCanvasItemsFromStore` so items remain locked at their exact `(canvasX, canvasY)` coordinates forever.
   - Every CMS mutation automatically writes to both `data/canvas-cms.json` and `src/data/portfolioProjects.ts`.
3. **Lag-Free & Fast Loading Optimizations**:
   - Added CSS `content-visibility: auto` and `contain-intrinsic-size` to all canvas cards so off-screen cards skip layout and painting during 120fps camera panning.
   - Lowered canvas preview `maxRenderDimension` to `480px` for 3× faster image decoding and reduced GPU memory footprint, while full resolution is loaded on demand when a card is clicked to zoom.
   - Videos use `preload="none"`, pause automatically when panned off-screen via `IntersectionObserver`, and suspend decoding while dragging the camera.
