# Google Drive portfolio CMS

## Goal

Use the supplied Drive folder as the portfolio source of truth while keeping the current GRVNTH portfolio look intact. Management stays private to the existing owner account and works well on a phone.

## Build

- Connect the Google Drive service in Lovable and use the provided portfolio-root folder. Keep Drive credentials and file reads on the server; public pages receive only published metadata and media links.
- Reconcile the root hierarchy into the existing portfolio records: direct child folders become sections; files directly inside a section become single-file projects; child project folders become one project with recursively discovered assets. Preserve optional owner-edited metadata and cover selections across syncs.
- Safely synchronize creates, renames, moves, changed assets, and confirmed deletions using Drive file IDs and change cursors. Failed or incomplete Drive reads must never remove existing content. Add a manual Sync Now control, status, last-sync time, and actionable errors.
- Copy supported public media into the private portfolio bucket, retain Drive originals, use expiring delivery links, and request optimized image variants where supported. Render images, videos, and PDFs with the existing site's visual language and accessible fallbacks.
- Add a mobile-first Drive/status view to the existing private dashboard and root-folder selector; keep optional metadata editing there. Build dynamic public collection pages without hardcoded category names or project names.
- Verify build/type checks, homepage rendering and live portfolio data, collection pages, authentication redirects, recursive parsing, file classification, cover selection, and safe deletion behavior.

## Technical details

- Use the project's existing Lovable Cloud tables, row policies, server functions, storage bucket, auth guard, and design tokens; extend them additively with Drive IDs/change cursor and sync state as needed.
- Use the Google Drive connector for server-side Drive API access. Prefer Drive change notifications where the available account permissions and an HTTPS callback allow it; retain a safe polling/manual fallback because Drive notifications expire and require renewal. Do not claim continuous background delivery until renewal/scheduling is verified.
- No changes to the established public typography, colors, animation language, navigation, or existing project presentation beyond dynamic content and collection routes.
