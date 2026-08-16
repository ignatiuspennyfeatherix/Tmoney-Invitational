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

async function storeCrest(supabase: any, supabaseUrl: string, team: FplTeam) {
  const sourceUrl = `https://resources.premierleague.com/premierleague/badges/70/t${team.code}.png`;
  const response = await fetch(sourceUrl);
  if (!response.ok) return null;
  const image = await response.arrayBuffer();
  const path = `${team.id}-official.png`;
  const { error } = await supabase.storage.from("team-logos").upload(path, image, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) throw error;
  return `${supabaseUrl}/storage/v1/object/public/team-logos/${path}`;
}

function fixtureStatus(fixture: FplFixture) {
  return fixture.finished ? "finished" : fixture.started ? "live" : "scheduled";
}

function predictionPoints(prediction: { home_score: number; away_score: number }, fixture: FplFixture) {
  if (!fixture.finished || fixture.team_h_score === null || fixture.team_a_score === null) return null;
  const predictedResult = Math.sign(prediction.home_score - prediction.away_score);
  const actualResult = Math.sign(fixture.team_h_score - fixture.team_a_score);
  if (predictedResult !== actualResult) return 0;
  let points = 5;
  if (prediction.home_score - prediction.away_score === fixture.team_h_score - fixture.team_a_score) points += 7;
  if (prediction.home_score === fixture.team_h_score && prediction.away_score === fixture.team_a_score) points += 13;
  return points;
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

    const teamRows = await Promise.all(bootstrap.teams.map(async (team) => ({
        provider_id: team.id,
        name: team.name,
        short_name: team.short_name,
        crest_url: await storeCrest(supabase, supabaseUrl, team),
        league_position: team.position || null,
        recent_form: team.form?.split("").filter(Boolean) ?? [],
    })));
    const { data: storedTeams, error: teamsError } = await supabase.from("teams").upsert(
      teamRows,
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
    const survivorRounds = [...new Map(fixturesResponse.filter((fixture) => fixture.event && fixture.kickoff_time).map((fixture) => [fixture.event, fixture])).values()].map((firstFixture) => {
      const roundFixtures = fixturesResponse.filter((fixture) => fixture.event === firstFixture.event && fixture.kickoff_time);
      const startsAt = roundFixtures.map((fixture) => new Date(fixture.kickoff_time as string).getTime()).sort((first, second) => first - second)[0];
      const endsAt = roundFixtures.map((fixture) => new Date(fixture.kickoff_time as string).getTime()).sort((first, second) => second - first)[0];
      return { season_id: seasonId, round_number: firstFixture.event as number, starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt + 2 * 60 * 60 * 1000).toISOString() };
    });
    const { error: survivorRoundsError } = await supabase.from("survivor_rounds").upsert(survivorRounds, { onConflict: "season_id,round_number" });
    if (survivorRoundsError) throw survivorRoundsError;
    const { data: survivorPicks, error: survivorPicksError } = await supabase.from("survivor_picks").select("id, team_id, round_id, result, survivor_rounds(round_number), teams(provider_id)");
    if (survivorPicksError) throw survivorPicksError;
    await Promise.all((survivorPicks ?? []).map(async (pick) => {
      if (pick.result && pick.result !== "pending") return;
      const round = Array.isArray(pick.survivor_rounds) ? pick.survivor_rounds[0] : pick.survivor_rounds;
      const team = Array.isArray(pick.teams) ? pick.teams[0] : pick.teams;
      const roundFixture = fixturesResponse.find((fixture) => fixture.event === round?.round_number && fixture.finished && (fixture.team_h === team?.provider_id || fixture.team_a === team?.provider_id));
      if (!roundFixture) return;
      const teamWon = roundFixture.team_h === team.provider_id ? roundFixture.team_h_score! > roundFixture.team_a_score! : roundFixture.team_a_score! > roundFixture.team_h_score!;
      const { error } = await supabase.from("survivor_picks").update({ result: teamWon ? "survived" : "lost", processed_at: new Date().toISOString() }).eq("id", pick.id);
      if (error) throw error;
    }));
    const finishedFixtures = new Map(fixturesResponse.filter((fixture) => fixture.finished).map((fixture) => [fixture.id, fixture]));
    const { data: predictions, error: predictionsError } = await supabase.from("predictions").select("id, fixture_id, home_score, away_score");
    if (predictionsError) throw predictionsError;
    await Promise.all((predictions ?? []).map(async (prediction) => {
      const fixture = finishedFixtures.get(Number(prediction.fixture_id));
      if (!fixture) return;
      const points = predictionPoints(prediction, fixture);
      if (points === null) return;
      const { error } = await supabase.from("predictions").update({ points }).eq("id", prediction.id);
      if (error) throw error;
    }));
    console.log("Fixtures written to Supabase", { fixtures: fixtures.length });
    return Response.json({ imported: { seasons: 1, teams: bootstrap.teams.length, fixtures: fixtures.length } });
  } catch (error) {
    console.error("Fixture synchronisation failed", error);
    return new Response("Fixture synchronisation failed. Check the Netlify function logs.", { status: 500 });
  }
};

export const config: Config = { schedule: "0 */6 * * *" };
