# Media reliability fix

## Scope

- Audit all image and video references used by the site, including source files, public files, asset pointers, and CSS media URLs.
- Replace deployment-fragile media pointers with browser-safe local asset imports and remove any direct `.asset.json` image-source usage.
- Centralize media fallback behavior so failed images render a consistent, non-breaking placeholder without changing the portfolio layout.
- Preserve the existing visual design and interaction behavior, including carousel sizing and object-fit rules.

## Technical approach

- Copy the existing CDN-backed media into `src/assets` as browser-compatible image files where the repository currently contains only pointer metadata, then update consuming components to import those files directly.
- Keep existing local reel-cover files as imports and add explicit typed media handling for image load failures.
- Audit every route/component for media references, validate case-sensitive paths, and confirm all referenced files exist.
- Run the production build and use the running app to check network responses and rendered media on the homepage.
