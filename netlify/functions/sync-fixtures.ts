import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

type FplTeam = {
  id: number;
  name: string;
  short_name: string;
  code: number;
  position: number;
  form: string | null;
};
type FplFixture = {
  id: number;
  kickoff_time: string | null;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  finished: boolean;
  started: boolean;
  event: number | null;
};
type FplBootstrap = { teams: FplTeam[] };

const fplBaseUrl = "https://fantasy.premierleague.com/api";

async function fpl<T>(path: string): Promise<T> {
  const response = await fetch(`${fplBaseUrl}${path}`);
  if (!response.ok) throw new Error(`Fantasy Premier League feed returned ${response.status} for ${path}`);
  return response.json() as Promise<T>;
}

function fixtureStatus(fixture: FplFixture) {
  return fixture.finished ? "finished" : fixture.started ? "live" : "scheduled";
}

export default async () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecretKey) {
    return new Response("Missing fixture sync environment variables.", { status: 500 });
  }

  try {
    const [bootstrap, fixturesResponse] = await Promise.all([
      fpl<FplBootstrap>("/bootstrap-static/"),
      fpl<FplFixture[]>("/fixtures/"),
    ]);
    console.log("FPL payload received", { teams: bootstrap.teams.length, fixtures: fixturesResponse.length });
    const season = new Date().getUTCFullYear();
    const supabase = createClient(supabaseUrl, supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const teamDetails = new Map(bootstrap.teams.map((team) => [team.id, team]));

    const { data: storedSeasons, error: seasonsError } = await supabase.from("seasons").upsert([{
      provider_id: season,
      name: `Premier League ${season}/${String(season + 1).slice(2)}`,
      starts_on: `${season}-08-01`,
      ends_on: `${season + 1}-05-31`,
      is_active: true,
    }], { onConflict: "provider_id" }).select("id, provider_id");
    if (seasonsError) throw seasonsError;

    const { data: storedTeams, error: teamsError } = await supabase.from("teams").upsert(
      bootstrap.teams.map((team) => ({
        provider_id: team.id,
        name: team.name,
        short_name: team.short_name,
        crest_url: `https://resources.premierleague.com/premierleague/badges/70x70/t${team.code}.png`,
        league_position: team.position || null,
        recent_form: team.form?.split("").filter(Boolean) ?? [],
      })),
      { onConflict: "provider_id" },
    ).select("id, provider_id");
    if (teamsError) throw teamsError;

    const seasonId = storedSeasons[0]?.id;
    if (!seasonId) throw new Error("Could not store the current Premier League season.");
    const teamIds = new Map(storedTeams.map((team) => [team.provider_id, team.id]));
    const fixtures = fixturesResponse
      .filter((fixture) => fixture.kickoff_time)
      .map((fixture) => {
        const homeTeam = teamDetails.get(fixture.team_h);
        const awayTeam = teamDetails.get(fixture.team_a);
        const homeTeamId = teamIds.get(fixture.team_h);
        const awayTeamId = teamIds.get(fixture.team_a);
        if (!homeTeam || !awayTeam || !homeTeamId || !awayTeamId) {
          throw new Error(`Could not match imported teams for fixture ${fixture.id}.`);
        }
        return {
          provider_id: fixture.id,
          season_id: seasonId,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          kickoff_at: fixture.kickoff_time,
          status: fixtureStatus(fixture),
          home_score: fixture.team_h_score,
          away_score: fixture.team_a_score,
          matchday: fixture.event,
        };
      });
    const { error: fixturesError } = await supabase.from("fixtures").upsert(fixtures, { onConflict: "provider_id" });
    if (fixturesError) throw fixturesError;
    console.log("Fixtures written to Supabase", { fixtures: fixtures.length });
    return Response.json({ imported: { seasons: 1, teams: bootstrap.teams.length, fixtures: fixtures.length } });
  } catch (error) {
    console.error("Fixture synchronisation failed", error);
    return new Response("Fixture synchronisation failed. Check the Netlify function logs.", { status: 500 });
  }
};

export const config: Config = { schedule: "0 */6 * * *" };
