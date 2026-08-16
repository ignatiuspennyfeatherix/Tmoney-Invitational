import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

type ProviderTeam = {
  id: number;
  name: string;
  shortName: string;
  crest: string | null;
};

type ProviderMatch = {
  id: number;
  utcDate: string;
  status: string;
  matchday: number | null;
  season: { id: number; startDate: string; endDate: string };
  homeTeam: ProviderTeam;
  awayTeam: ProviderTeam;
  score: { fullTime: { home: number | null; away: number | null } };
};

type ProviderStanding = {
  position: number;
  form: string | null;
  team: ProviderTeam;
};

const footballDataBaseUrl = "https://api.football-data.org/v4/competitions/PL";

async function footballData<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${footballDataBaseUrl}${path}`, {
    headers: { "X-Auth-Token": token },
  });

  if (!response.ok) {
    throw new Error(`football-data.org returned ${response.status} for ${path}`);
  }

  return response.json() as Promise<T>;
}

function fixtureStatus(status: string) {
  return status === "FINISHED" ? "finished" : status === "IN_PLAY" ? "live" : "scheduled";
}

export default async () => {
  const footballDataToken = process.env.FOOTBALL_DATA_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!footballDataToken || !supabaseUrl || !supabaseSecretKey) {
    return new Response("Missing fixture sync environment variables.", { status: 500 });
  }

  try {
    const [matchesResponse, standingsResponse] = await Promise.all([
      footballData<{ matches: ProviderMatch[] }>("/matches", footballDataToken),
      footballData<{ standings: Array<{ type: string; table: ProviderStanding[] }> }>("/standings", footballDataToken),
    ]);

    const supabase = createClient(supabaseUrl, supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const leagueTable = standingsResponse.standings.find((standing) => standing.type === "TOTAL")?.table ?? [];
    const teamDetails = new Map<number, { team: ProviderTeam; position: number | null; form: string | null }>();

    for (const standing of leagueTable) {
      teamDetails.set(standing.team.id, {
        team: standing.team,
        position: standing.position,
        form: standing.form,
      });
    }

    for (const match of matchesResponse.matches) {
      for (const team of [match.homeTeam, match.awayTeam]) {
        if (!teamDetails.has(team.id)) {
          teamDetails.set(team.id, { team, position: null, form: null });
        }
      }
    }

    const seasons = [...new Map(matchesResponse.matches.map((match) => [match.season.id, match.season])).values()];
    const { data: storedSeasons, error: seasonsError } = await supabase
      .from("seasons")
      .upsert(
        seasons.map((season) => ({
          provider_id: season.id,
          name: `Premier League ${season.startDate.slice(0, 4)}/${season.endDate.slice(2, 4)}`,
          starts_on: season.startDate,
          ends_on: season.endDate,
          is_active: true,
        })),
        { onConflict: "provider_id" },
      )
      .select("id, provider_id");

    if (seasonsError) throw seasonsError;

    const { data: storedTeams, error: teamsError } = await supabase
      .from("teams")
      .upsert(
        [...teamDetails.entries()].map(([providerId, detail]) => ({
          provider_id: providerId,
          name: detail.team.name,
          short_name: detail.team.shortName,
          crest_url: detail.team.crest,
          league_position: detail.position,
          recent_form: detail.form?.split(",").filter(Boolean) ?? [],
        })),
        { onConflict: "provider_id" },
      )
      .select("id, provider_id");

    if (teamsError) throw teamsError;

    const seasonIds = new Map(storedSeasons.map((season) => [season.provider_id, season.id]));
    const teamIds = new Map(storedTeams.map((team) => [team.provider_id, team.id]));
    const fixtures = matchesResponse.matches.map((match) => {
      const seasonId = seasonIds.get(match.season.id);
      const homeTeamId = teamIds.get(match.homeTeam.id);
      const awayTeamId = teamIds.get(match.awayTeam.id);

      if (!seasonId || !homeTeamId || !awayTeamId) {
        throw new Error(`Could not match imported IDs for fixture ${match.id}.`);
      }

      return {
        provider_id: match.id,
        season_id: seasonId,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        kickoff_at: match.utcDate,
        status: fixtureStatus(match.status),
        home_score: match.score.fullTime.home,
        away_score: match.score.fullTime.away,
        matchday: match.matchday,
      };
    });

    const { error: fixturesError } = await supabase.from("fixtures").upsert(fixtures, { onConflict: "provider_id" });
    if (fixturesError) throw fixturesError;

    return Response.json({
      imported: { seasons: seasons.length, teams: teamDetails.size, fixtures: fixtures.length },
    });
  } catch (error) {
    console.error("Fixture synchronisation failed", error);
    return new Response("Fixture synchronisation failed. Check the Netlify function logs.", { status: 500 });
  }
};

export const config: Config = { schedule: "0 */6 * * *" };
