import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

type ApiFootballTeam = { id: number; name: string; logo: string | null };
type ApiFootballFixture = {
  fixture: { id: number; date: string; status: { short: string }; round: string | null };
  league: { season: number };
  teams: { home: ApiFootballTeam; away: ApiFootballTeam };
  goals: { home: number | null; away: number | null };
};
type ApiFootballStanding = { rank: number; team: ApiFootballTeam; form: string | null };

const apiFootballBaseUrl = "https://v3.football.api-sports.io";
const premierLeagueId = 39;

async function apiFootball<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${apiFootballBaseUrl}${path}`, {
    headers: { "x-apisports-key": token },
  });
  if (!response.ok) throw new Error(`API-Football returned ${response.status} for ${path}`);
  const body = (await response.json()) as { response: T; errors?: Record<string, string> };
  if (body.errors && Object.keys(body.errors).length > 0) {
    throw new Error(`API-Football error for ${path}: ${JSON.stringify(body.errors)}`);
  }
  return body.response;
}

function fixtureStatus(status: string) {
  return ["FT", "AET", "PEN"].includes(status)
    ? "finished"
    : ["1H", "HT", "2H", "ET", "P", "LIVE"].includes(status)
      ? "live"
      : "scheduled";
}

function matchday(round: string | null) {
  const value = round?.match(/Regular Season - (\d+)/)?.[1];
  return value ? Number(value) : null;
}

export default async () => {
  const apiFootballToken = process.env.API_FOOTBALL_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!apiFootballToken || !supabaseUrl || !supabaseSecretKey) {
    return new Response("Missing fixture sync environment variables.", { status: 500 });
  }

  try {
    const season = new Date().getUTCFullYear();
    const [fixturesResponse, standingsResponse] = await Promise.all([
      apiFootball<ApiFootballFixture[]>(`/fixtures?league=${premierLeagueId}&season=${season}`, apiFootballToken),
      apiFootball<Array<{ league: { standings: ApiFootballStanding[][] } }>>(
        `/standings?league=${premierLeagueId}&season=${season}`,
        apiFootballToken,
      ),
    ]);
    const supabase = createClient(supabaseUrl, supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const standings = standingsResponse[0]?.league.standings[0] ?? [];
    const teamDetails = new Map<number, { team: ApiFootballTeam; position: number | null; form: string | null }>();
    for (const standing of standings) {
      teamDetails.set(standing.team.id, { team: standing.team, position: standing.rank, form: standing.form });
    }
    for (const fixture of fixturesResponse) {
      for (const team of [fixture.teams.home, fixture.teams.away]) {
        if (!teamDetails.has(team.id)) teamDetails.set(team.id, { team, position: null, form: null });
      }
    }

    const { data: storedSeasons, error: seasonsError } = await supabase.from("seasons").upsert([{
      provider_id: season,
      name: `Premier League ${season}/${String(season + 1).slice(2)}`,
      starts_on: `${season}-08-01`,
      ends_on: `${season + 1}-05-31`,
      is_active: true,
    }], { onConflict: "provider_id" }).select("id, provider_id");
    if (seasonsError) throw seasonsError;

    const { data: storedTeams, error: teamsError } = await supabase.from("teams").upsert(
      [...teamDetails.entries()].map(([providerId, detail]) => ({
        provider_id: providerId,
        name: detail.team.name,
        short_name: detail.team.name,
        crest_url: detail.team.logo,
        league_position: detail.position,
        recent_form: detail.form?.split("").filter(Boolean) ?? [],
      })),
      { onConflict: "provider_id" },
    ).select("id, provider_id");
    if (teamsError) throw teamsError;

    const seasonId = storedSeasons[0]?.id;
    if (!seasonId) throw new Error("Could not store the current Premier League season.");
    const teamIds = new Map(storedTeams.map((team) => [team.provider_id, team.id]));
    const fixtures = fixturesResponse.map((fixture) => {
      const homeTeamId = teamIds.get(fixture.teams.home.id);
      const awayTeamId = teamIds.get(fixture.teams.away.id);
      if (!homeTeamId || !awayTeamId) throw new Error(`Could not match imported teams for fixture ${fixture.fixture.id}.`);
      return {
        provider_id: fixture.fixture.id,
        season_id: seasonId,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        kickoff_at: fixture.fixture.date,
        status: fixtureStatus(fixture.fixture.status.short),
        home_score: fixture.goals.home,
        away_score: fixture.goals.away,
        matchday: matchday(fixture.fixture.round),
      };
    });
    const { error: fixturesError } = await supabase.from("fixtures").upsert(fixtures, { onConflict: "provider_id" });
    if (fixturesError) throw fixturesError;
    return Response.json({ imported: { seasons: 1, teams: teamDetails.size, fixtures: fixtures.length } });
  } catch (error) {
    console.error("Fixture synchronisation failed", error);
    return new Response("Fixture synchronisation failed. Check the Netlify function logs.", { status: 500 });
  }
};

export const config: Config = { schedule: "0 */6 * * *" };
