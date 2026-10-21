# APEX: install the viewer access update

This update lets existing `owner` and `viewer` accounts sign in and use the dashboard. Viewers can browse the data and generate/download daily, monthly, and annual PDF reports. Only owners see entry/payment controls. Data-changing server actions still check for an owner on every request.

## Install in your existing VS Code project

1. Back up your current APEX folder.
2. Extract this ZIP into a temporary folder.
3. Copy the updated `app` and `lib` folders into your existing APEX project root and accept file replacements. These are the folders beside `package.json`, not a new nested project folder.
4. Optionally also copy `tests`, `package.json`, and this guide to keep the regression tests and `npm run test:access` command.
5. Keep your existing `.env.local` and existing Git repository. The ZIP does not contain environment secrets, Git history, installed dependencies, or build output.
6. In the VS Code terminal, from your APEX root, run:

   ```bash
   npm ci
   npm run test:access
   npx tsc --noEmit
   npm run build
   ```

   The test command requires copying `tests` and `package.json` in step 4. Node.js 20 or newer is needed for the tests.

7. Preview with `npm run dev`, then open http://localhost:3000 and sign in with an existing viewer account.
8. Commit and push your changes to the repository connected to your existing Vercel project. Wait for that deployment to succeed before testing the public APEX link. No new Vercel project or domain is needed.

## Database setup

No additional SQL is included or required if you already ran the APEX viewer permissions block and assigned your three accounts the `viewer` role. This update reads the role from `public.profiles`; it does not assign roles or modify the database.

Viewers can see all business data allowed by the policies you installed, including salaries and benefits. Keep those RLS policies enabled. Browser and server requests use the signed-in user's Supabase client; this project update does not introduce a service-role client.

## Verify after deployment

- Sign out of any existing session, then sign in as a viewer.
- Open Dashboard, Sales, an individual sale, Expenses, Benefits, Salaries, Incentives, and Cash Advance.
- Confirm business data loads and Add/Save/Payment forms are absent.
- On Dashboard, generate daily, monthly, and annual reports, then download and open their PDFs.
- Sign in as an owner and confirm existing entry and payment workflows still work.
- Unknown accounts and roles other than `owner`/`viewer` remain blocked from the dashboard.

## Validation performed

- Production build: passed.
- TypeScript check: passed.
- Access regression suite: 15 tests passed using simulated Supabase sessions. Tests execute the actual login/report actions and directly invoke all exported data-changing actions as a viewer to verify rejection before writes.
- ESLint on changed application files and the new test: passed.
- Full-project ESLint: existing errors remain in unchanged `app/dashboard/records/entry-forms.tsx` (state updates in an effect) and `test-concurrent-payment.cjs` (CommonJS imports).
- Live Supabase sessions and browser PDF downloads were not tested here; complete the checks above on your deployment.

## Updated application files

- `lib/permissions.ts` (new)
- `app/login/actions.ts`
- `app/dashboard/page.tsx`
- `app/dashboard/report-actions.ts`
- `app/dashboard/daily-report.tsx` (authorization comment only)
- `app/dashboard/records/[tab]/page.tsx`
- `app/expenses/page.tsx`
- `app/sales/page.tsx`
- `app/sales/[id]/page.tsx`

Tests are in `tests/viewer-access.test.mjs`; `package.json` adds `test:access`. Dependencies are unchanged.
