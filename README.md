# T-Money Invitational

A private Premier League prediction league for friends and colleagues.

## First milestone

The home page contains the mobile-first prediction entry design, including:

- Home and away score steppers
- League positions and last-five form
- Super Pick treatment
- Clear and save-predictions controls

The displayed fixtures are temporary mock data. The next build stage connects these to Supabase and API-Football.

## Rules agreed so far

| Prediction | Points |
| --- | ---: |
| Correct outcome | 5 |
| Correct winning margin | +7 |
| Exact score | +13 |
| Maximum | 25 |

For draws, an exact draw score earns the full 25 points; another draw prediction earns 5 points.

## Local setup

From this folder, install dependencies and start the app:

```powershell
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Environment variables

Copy `.env.example` to `.env.local` for local development. In Netlify, add `API_FOOTBALL_KEY` and `SUPABASE_SECRET_KEY` in the site's environment-variable settings. Do not expose either to browser code or commit them to Git.

## Supabase setup

1. Create a project in Supabase, choosing the closest available region.
2. In **Project Settings > API**, copy the Project URL and publishable key into `.env.local` using the `NEXT_PUBLIC_SUPABASE_*` names in `.env.example`.
3. Open the **SQL Editor**, create a new query, paste in `supabase/schema.sql`, and run it once.
4. Under **Authentication > Providers**, leave email/password enabled for the first release. Set the site URL and redirect URL after the Netlify deployment exists.

The publishable key is safe for browser use because the database policies in `supabase/schema.sql` limit access. The API-Football token and Supabase secret key are different: keep them private in Netlify and access them only from a server-side scheduled function.

## Fixture sync

`netlify/functions/sync-fixtures.ts` imports Premier League fixtures, completed scores, club crests and current table/form data from API-Football every six hours. Run `supabase/migrations/20260816_add_fixture_sync_fields.sql` once in the Supabase SQL editor before deploying. Then add `API_FOOTBALL_KEY` and `SUPABASE_SECRET_KEY` to Netlify; the function will run on its schedule after deployment.

## Supabase tables

- `profiles`: display name, role and avatar preference
- `seasons`: scoring rules and current status
- `fixtures`: provider IDs, clubs, kickoff, result and form snapshot
- `predictions`: predicted scores and Super Pick, private to the owner until kickoff
- `survivor_rounds` and `survivor_picks`: lives, selections and round outcomes

Each participant should be permitted to edit only their own prediction, and only before that fixture's kickoff. The trusted server-side sync will import results and calculate scores.
