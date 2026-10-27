# Real Search Property Portal

Public website: https://real-search-property-portal.realsearchbh.chatgpt.site

## October 20 revision

The first page is a public dashboard showing building/project, advisor, actual submission date, workflow stage and Marketing approval. Everyone with the link can see this limited progress view. Original listing details, documents, photos, artwork and review history remain restricted to authorized staff.

Routes: Dashboard, Add Listing, Listing Review, Designing, Design Approval and Admin Settings. Public progress uses Supabase Realtime with a 30-second fallback and refresh on reconnect. Search and stage filters support mobile card layouts.

Accounts:
- `admin`: reviews listings, prepares artwork, administers the workflow.
- `zain`: Zain Shamsi, property listing review.
- `marketing`: Design Approval, with Dalal — Marketing Head / Shahad — Coordinator dropdown. Selected approver, actual account ID, comments and timestamp are recorded independently.

No email verification is needed for the confirmed portal accounts. Existing admin and Zain passwords were preserved. Marketing credentials were handed off privately outside this repository. The temporary Marketing setup endpoint is disabled.

Workflow: Sent for Review → Approved → Under Designing → Design Completed → Design Under Review → Design Approved — Completed. Changes Requested returns a design to the design queue. Revision numbers prevent stale approvals.

Both Feed (1080×1350) and Story (1080×1920) PNG/JPG files are required before completion. One large preview is shown at a time with Feed / Story controls in Designing and Design Approval. Private signed URLs expire. The current editor's artwork layout is intentionally unchanged; refining it is deferred as requested. A finished pair can be uploaded from the existing editor or another design tool.

## Verification

- Eight existing client tests passed: `node --test tests/portal.test.cjs`.
- Six DOM integration tests passed using LinkeDOM 0.18.12. Install the test-only dependency with `npm ci --prefix tests`, then run `node --test tests/workflow-dom.test.cjs`. These are DOM tests, not visual browser tests.
- `tests/workflow-transaction.sql` passed against the live database in a rolled-back transaction: complete lifecycle, roles, both artifacts, duplicate artifacts, stale/null revisions, comments, approver selection, audit identity and public projection. No transaction fixtures persisted.
- Live HTTP checks passed for Marketing password login and role, public projection field limits, anonymous private-data denial, and Marketing denial of listing-review authority.
- Security advisors: no database-policy warnings; optional leaked-password protection remains disabled. Reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Browser visual QA and actual canvas exports remain unverified because the permitted browser tooling is unavailable.

## Known cleanup item

Two older records named `PORTAL QA — disposable test` remain. Narrowly scoped deletion again failed with the connector error `Invalid or expired requestState`; no original listing was deleted. Their test images were removed previously. Do not delete other listings during cleanup.

## Phone notifications (20 October 2026)
Free standards-based Web Push is deployed through the existing Supabase Edge runtime, without Firebase, SMS or WhatsApp subscriptions. Existing hosting/storage/function free-tier quotas still apply. Staff sign in and open **Phone notifications · Free web push** in any staff page. Enable once on each phone; iPhone requires iOS 16.4+ and Add to Home Screen. Notifications continue after sign-out until disabled on that device. Marketing is a shared account: any device explicitly subscribing under that account receives marketing review alerts (including Shahad's device).

Routing: pending → head; approved → admin; design_review → marketing; changes_requested/design_approved → admin. No historic listings are backfilled. Per-device encrypted subscriptions are readable/deletable only by their signed-in owner. VAPID private key and dispatch credential are server-only. The Edge function performs its own staff/token authentication; dispatch requires a private random bearer credential. Push endpoints are allowlisted and redirects forbidden. The service worker does not cache pages or private data. Tapping a notification opens the relevant queue. A device-display test button is included; it is explicitly not an end-to-end delivery test.

Database trigger queues each transition per subscribed device. pg_net wakes dispatch after commit, with a cron fallback every minute only when work is pending. Claims use SKIP LOCKED and a five-minute lease; transient failures retry at most five times. Expired subscriptions are removed. Delivery is best effort; OS permission, network, Focus settings and hosting availability can delay/suppress it. The public dashboard remains the authoritative workflow status.

Validation: existing 14 app/DOM checks and three worker behavior tests pass. Transaction tests verify all recipient routing, same-stage deduplication and private RPC/table grants; fixtures and HTTP requests roll back. Live Edge initialization returned HTTP 200. Real phone permission prompts and actual push delivery require device enrollment and remain unverified. No test messages were sent to staff.

Security advisor: pg_net was installed using the documented default extension installation. It is non-relocatable and the advisor flags its public extension registration; optional destructive reinstall was rejected by automatic safety review and was not performed. See https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public . Existing leaked-password protection warning also remains as previously documented.
