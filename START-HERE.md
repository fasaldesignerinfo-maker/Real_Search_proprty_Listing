# Real Search Portal v19 — separate GitHub project

This package keeps the approved charcoal-and-gold interface and original Real Search logo. The existing live website has not been updated.

## Upload as a second website

1. Unzip `Real-Search-Portal-v19-GitHub.zip` on your computer.
2. In GitHub, create a **new public repository**, for example `Real-Search-Listing-Portal-New`. Keep your existing repository.
3. Open the extracted folder and upload its **contents** into the new repository. `index.html` and the `assets` folder must be at the top level; do not upload the ZIP itself.
4. Open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, then `main` and `/ (root)`, and save.
5. Wait for GitHub Pages to finish deploying. GitHub will display your new website address on the Pages settings page.
6. Add that address as a link in your existing portal if desired. Do not replace the old repository's files.

## Complete backend setup before using removal

The website files alone cannot add secure server-side deletion.

1. In the existing Supabase project, open **SQL Editor**, paste `SETUP-V19.sql`, and run it once. It adds date validation, allows properly archived photo references to become empty, and installs service-only record cleanup. It does not delete existing listings.
2. Deploy the included Edge Function named **`manage-listing`** from `supabase/functions/manage-listing/index.ts`. The function validates the signed-in user itself. If the gateway rejects the project's current token format, deploy with gateway JWT verification disabled and retain the function's `auth.getUser` and admin-role checks.
3. For the new function, set `ALLOWED_ORIGINS` to the comma-separated website origins you use. The default already includes `https://fasaldesignerinfo-maker.github.io` and the existing ChatGPT-hosted portal. An origin is the `https://...` hostname, without the repository path.
4. The function uses the standard Supabase server environment variables. Keep the service-role key on the server; never put it in `config.js` or GitHub.
5. Test with a disposable listing: sign in as Administrator, open **Administration**, remove original photos, refresh, and confirm the thumbnails are gone. Then delete that listing and confirm it disappears from the Dashboard and all review/design queues.

### Data shared with your current portal

`config.js` retains your existing public Supabase configuration, so both websites show and modify the **same listings and files**. Deleting a listing in the new portal also removes it from the old portal. The websites and designs are separate; the data is shared. For independent test data, create a separate Supabase project, configure its schema/accounts/functions, and change `config.js` before use. The included historical SQL files are source references, not a single fresh-project installer.

The existing notification and advisor Gate Card services also need their origin settings to allow the new GitHub Pages origin. Notification links created by those existing services can still point to your old portal until those backend settings are updated. Browser-local design drafts do not transfer between website origins.

## Changes included

- Listing Date allows today or later, using Bahrain time. Past dates are rejected before photo uploads. Existing historical listings stay readable; editing an old listing starts with today's date. Once `SETUP-V19.sql` is installed, the server also rejects newly submitted or changed past dates.
- Administration lists **every stage**, with search, stage filter, select-all-shown, per-listing deletion and selected-listing deletion. No bulk deletion runs automatically. Each removal requires confirmation.
- Original-photo removal clears both files and photo references. Approved artwork stays unless the whole listing is deleted.
- Full deletion removes original photos, documents, all artwork in the listing folder, review history, workflow, Gate Cards and Dashboard entries. If a storage operation fails, the function reports the failure rather than claiming success. If only part of a multi-listing batch succeeds, the result shows the completed count; refresh and retry the remaining listings.
- The header sheen runs without a play/pause button; the current Bahrain date remains visible. System reduced-motion preferences are respected.
- Refresh and Sign Out sit together in the staff workspace.
- Both design methods remain available. Create Design from the review list opens the same method chooser. Automatic design prefills project, location, headline, price, bedrooms, bathrooms, other areas, views, kitchen, inclusive details, advisor, phone, original photos and matching available logos/icons. The designer's existing layout remains a preview template, not guaranteed reproduction of an uploaded artwork reference.
- Existing relative logo, manifest and notification icon paths are retained for GitHub repository subpaths.

## Validation

40 automated tests pass: date boundaries, login/role checks, uploads, review/design navigation, method selection, admin management, refresh after deletion, storage-error handling, server authorization, notifications and header controls. JavaScript syntax checks pass. Backend requests were tested with mocked services; the SQL and Edge Function have **not** been installed or tested against your live database. No real listing or photo was deleted during preparation. No visual browser or signed-in production test was performed for this package.

## Files

- `index.html`, scripts, styles, `assets/`, manifest and service worker: website files ready for GitHub Pages.
- `SETUP-V19.sql`: required incremental backend changes.
- `supabase/functions/manage-listing/index.ts`: new admin-only management endpoint.
- `source/`: historical schema/setup references and automated tests.
