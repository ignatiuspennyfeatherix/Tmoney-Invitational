"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import styles from "./page.module.css";
import { supabase } from "@/lib/supabase";

type FormResult = "W" | "D" | "L";
type Team = { id: string; name: string; short_name: string; crest_url: string | null; league_position: number | null; recent_form: string[] };
type Fixture = { id: string; kickoff_at: string; matchday: number | null; status: "scheduled" | "live" | "finished" | "postponed" | "cancelled"; home_team: Team; away_team: Team };
type Prediction = { fixture_id: string; home_score: number; away_score: number };
type LeaderboardRow = { id: string; display_name: string; points: number };
type SurvivorRound = { id: string; round_number: number; starts_at: string; ends_at: string };

function readableKickoff(kickoffAt: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(new Date(kickoffAt));
}

function ordinal(position: number | null) {
  if (!position) return "—";
  const remainder = position % 100;
  const suffix = remainder >= 11 && remainder <= 13 ? "th" : position % 10 === 1 ? "st" : position % 10 === 2 ? "nd" : position % 10 === 3 ? "rd" : "th";
  return `${position}${suffix}`;
}

function formResults(form: string[] | null) {
  return (form ?? []).filter((result): result is FormResult => result === "W" || result === "D" || result === "L").slice(-5);
}

function Form({ results }: { results: FormResult[] }) {
  return <div className={styles.form} aria-label={`Recent form: ${results.join(", ")}`}>{results.length ? results.map((result, index) => <span className={`${styles.formResult} ${styles[result]}`} key={`${result}-${index}`}>{result}</span>) : <span className={styles.noForm}>No form yet</span>}</div>;
}

function TeamCard({ team }: { team: Team }) {
  const badge = team.short_name || team.name.slice(0, 2);
  return <div className={styles.team}>{team.crest_url ? <img className={styles.crest} src={team.crest_url} alt="" /> : <span className={styles.badge}>{badge}</span>}<strong>{team.name}</strong><span className={styles.position}>{team.league_position ? `${ordinal(team.league_position)} place` : "Position pending"}</span><Form results={formResults(team.recent_form)} /></div>;
}

export default function Home() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [scores, setScores] = useState<Record<string, [number, number]>>({});
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [fixtureMessage, setFixtureMessage] = useState("Loading fixtures…");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [survivorRound, setSurvivorRound] = useState<SurvivorRound | null>(null);
  const [survivorTeams, setSurvivorTeams] = useState<Team[]>([]);
  const [survivorPick, setSurvivorPick] = useState("");
  const [survivorUsed, setSurvivorUsed] = useState<string[]>([]);
  const [survivorMessage, setSurvivorMessage] = useState("");

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
    };
    void loadSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const loadFixtures = async () => {
      const { data, error } = await supabase
        .from("fixtures")
        .select("id, kickoff_at, matchday, status, home_team:teams!fixtures_home_team_id_fkey(id, name, short_name, crest_url, league_position, recent_form), away_team:teams!fixtures_away_team_id_fkey(id, name, short_name, crest_url, league_position, recent_form)")
        .in("status", ["scheduled", "live"])
        .gte("kickoff_at", new Date().toISOString())
        .order("kickoff_at", { ascending: true });

      if (error) {
        setFixtureMessage("Fixtures are temporarily unavailable. Please try again shortly.");
        return;
      }

      const availableFixtures: Fixture[] = (data ?? []).flatMap((fixture) => {
        const homeTeam = Array.isArray(fixture.home_team) ? fixture.home_team[0] : fixture.home_team;
        const awayTeam = Array.isArray(fixture.away_team) ? fixture.away_team[0] : fixture.away_team;
        return homeTeam && awayTeam ? [{ ...fixture, home_team: homeTeam as Team, away_team: awayTeam as Team } as Fixture] : [];
      });
      const nextMatchday = availableFixtures.find((fixture) => fixture.matchday !== null)?.matchday;
      const currentFixtures = nextMatchday === undefined ? availableFixtures.slice(0, 10) : availableFixtures.filter((fixture) => fixture.matchday === nextMatchday);
      setFixtures(currentFixtures);
      setFixtureMessage(currentFixtures.length ? "" : "No upcoming Premier League fixtures are available yet.");
    };
    void loadFixtures();
  }, []);

  useEffect(() => {
    const loadPredictions = async () => {
      if (!session || fixtures.length === 0) return;
      const { data, error } = await supabase.from("predictions").select("fixture_id, home_score, away_score").eq("user_id", session.user.id).in("fixture_id", fixtures.map((fixture) => fixture.id));
      if (!error) setScores(Object.fromEntries((data as Prediction[]).map((prediction) => [prediction.fixture_id, [prediction.home_score, prediction.away_score]])));
    };
    void loadPredictions();
  }, [fixtures, session]);

  useEffect(() => {
    const loadLeaderboard = async () => {
      if (!session) return;
      const [{ data: profiles }, { data: predictions }] = await Promise.all([
        supabase.from("profiles").select("id, display_name"),
        supabase.from("predictions").select("user_id, points").not("points", "is", null),
      ]);
      const totals = new Map<string, number>();
      (predictions ?? []).forEach((prediction) => totals.set(prediction.user_id, (totals.get(prediction.user_id) ?? 0) + (prediction.points ?? 0)));
      setLeaderboard((profiles ?? []).map((profile) => ({ id: profile.id, display_name: profile.display_name, points: totals.get(profile.id) ?? 0 })).sort((first, second) => second.points - first.points));
    };
    void loadLeaderboard();
  }, [session, saveMessage]);

  useEffect(() => {
    const loadSurvivor = async () => {
      if (!session) return;
      const [{ data: rounds }, { data: teams }, { data: picks }] = await Promise.all([
        supabase.from("survivor_rounds").select("id, round_number, starts_at, ends_at").gt("ends_at", new Date().toISOString()).order("round_number", { ascending: true }).limit(1),
        supabase.from("teams").select("id, name, short_name, crest_url, league_position, recent_form").order("name"),
        supabase.from("survivor_picks").select("team_id, round_id, result").eq("user_id", session.user.id),
      ]);
      const nextRound = rounds?.[0] as SurvivorRound | undefined;
      setSurvivorRound(nextRound ?? null);
      setSurvivorTeams((teams ?? []) as Team[]);
      setSurvivorUsed((picks ?? []).map((pick) => pick.team_id));
      const existingPick = (picks ?? []).find((pick) => pick.round_id === nextRound?.id);
      setSurvivorPick(existingPick?.team_id ?? "");
    };
    void loadSurvivor();
  }, [session]);

  const createProfile = async (currentSession: Session) => {
    const displayName = currentSession.user.email?.split("@")[0] ?? "Player";
    await supabase.from("profiles").upsert({ id: currentSession.user.id, display_name: displayName }, { onConflict: "id" });
  };

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthMessage("");
    setIsSubmitting(true);
    const result = isCreatingAccount ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } }) : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setAuthMessage(result.error.message);
    else if (result.data.session) { await createProfile(result.data.session); setAuthMessage("You are signed in."); }
    else setAuthMessage("Check your email to confirm your account, then sign in.");
    setIsSubmitting(false);
  };

  const changeScore = (fixtureId: string, side: 0 | 1, change: number) => setScores((current) => {
    const currentScore = current[fixtureId] ?? [0, 0];
    return { ...current, [fixtureId]: currentScore.map((score, index) => index === side ? Math.max(0, score + change) : score) as [number, number] };
  });

  const clearPredictions = () => { setScores({}); setSaveMessage("Unsaved score changes cleared."); };

  const savePredictions = async () => {
    if (!session) { setSaveMessage("Sign in first to save predictions."); return; }
    const rows = Object.entries(scores).map(([fixtureId, [homeScore, awayScore]]) => ({ fixture_id: fixtureId, user_id: session.user.id, home_score: homeScore, away_score: awayScore }));
    if (rows.length === 0) { setSaveMessage("Choose a score before saving."); return; }
    setIsSubmitting(true);
    const { error } = await supabase.from("predictions").upsert(rows, { onConflict: "fixture_id,user_id" });
    setSaveMessage(error ? error.message : `${rows.length} prediction${rows.length === 1 ? "" : "s"} saved.`);
    setIsSubmitting(false);
  };

  const saveSurvivorPick = async () => {
    if (!session || !survivorRound || !survivorPick) return;
    setIsSubmitting(true);
    const { error } = await supabase.from("survivor_picks").upsert({ round_id: survivorRound.id, user_id: session.user.id, team_id: survivorPick }, { onConflict: "round_id,user_id" });
    setSurvivorMessage(error ? error.message : "Survivor pick saved.");
    if (!error && !survivorUsed.includes(survivorPick)) setSurvivorUsed((current) => [...current, survivorPick]);
    setIsSubmitting(false);
  };

  const signOut = async () => { await supabase.auth.signOut(); setScores({}); setSaveMessage(""); };
  const matchday = fixtures[0]?.matchday;
  const completedPredictions = Object.keys(scores).length;

  return <main className={styles.page}><section className={styles.app}><header className={styles.header}><div className={styles.headerRow}><div><span>Premier League prediction league</span><h1>T-Money Invitational</h1><p>{matchday ? `Gameweek ${matchday}` : "Upcoming fixtures"} · Predictions lock at kick-off</p></div>{session && <button className={styles.signOut} onClick={signOut}>Sign out</button>}</div></header><nav className={styles.nav}><a className={styles.active} href="#predictions">Predictions</a><a href="#table">League table</a><a href="#survivor">Survivor</a></nav><section className={styles.content} id="predictions">{!session && <form className={styles.auth} onSubmit={submitAuth}><strong>{isCreatingAccount ? "Join the Invitational" : "Sign in to make picks"}</strong><div className={styles.authFields}><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Email address" required /><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={6} placeholder="Password" required /><button disabled={isSubmitting}>{isSubmitting ? "Please wait" : isCreatingAccount ? "Create account" : "Sign in"}</button></div>{authMessage && <p>{authMessage}</p>}<button className={styles.authToggle} type="button" onClick={() => { setIsCreatingAccount((current) => !current); setAuthMessage(""); }}>{isCreatingAccount ? "Already have an account? Sign in" : "New here? Create an account"}</button></form>}{session && <p className={styles.welcome}>Signed in as <strong>{session.user.email}</strong></p>}<div className={styles.sectionHeader}><h2>Pick every score</h2><span>{completedPredictions} of {fixtures.length} complete</span></div>{fixtureMessage && <p className={styles.saveMessage}>{fixtureMessage}</p>}{fixtures.map((fixture) => { const [homeScore, awayScore] = scores[fixture.id] ?? [0, 0]; return <article className={styles.fixture} key={fixture.id}><div className={styles.fixtureHeader}><span>{readableKickoff(fixture.kickoff_at)}</span><span>{ordinal(fixture.home_team.league_position)} vs {ordinal(fixture.away_team.league_position)}</span></div><div className={styles.fixtureGrid}><TeamCard team={fixture.home_team} /><div className={styles.scoreArea}><div className={styles.scoreLine}><div className={styles.scoreControl}><button onClick={() => changeScore(fixture.id, 0, 1)} aria-label={`Increase ${fixture.home_team.name} score`}>+</button><output>{homeScore}</output><button onClick={() => changeScore(fixture.id, 0, -1)} aria-label={`Decrease ${fixture.home_team.name} score`}>−</button></div><span>−</span><div className={styles.scoreControl}><button onClick={() => changeScore(fixture.id, 1, 1)} aria-label={`Increase ${fixture.away_team.name} score`}>+</button><output>{awayScore}</output><button onClick={() => changeScore(fixture.id, 1, -1)} aria-label={`Decrease ${fixture.away_team.name} score`}>−</button></div></div></div><TeamCard team={fixture.away_team} /></div></article>; })}{fixtures.length > 0 && <div className={styles.actions}><button className={styles.clear} onClick={clearPredictions}>Clear</button><button className={styles.save} disabled={isSubmitting} onClick={savePredictions}>{isSubmitting ? "Saving…" : "Save predictions"}</button></div>}{saveMessage && <p className={styles.saveMessage}>{saveMessage}</p>}</section><section className={styles.content} id="table"><div className={styles.sectionHeader}><h2>League table</h2><span>All-time points</span></div>{!session ? <p className={styles.saveMessage}>Sign in to view the league table.</p> : leaderboard.length ? <div className={styles.leaderboard}>{leaderboard.map((player, index) => <div className={styles.leaderboardRow} key={player.id}><strong>{index + 1}</strong><span>{player.display_name}</span><b>{player.points} pts</b></div>)}</div> : <p className={styles.saveMessage}>No scored predictions yet.</p>}</section><section className={styles.content} id="survivor"><div className={styles.sectionHeader}><h2>Survivor</h2><span>3 lives</span></div>{!session ? <p className={styles.saveMessage}>Sign in to enter Survivor.</p> : !survivorRound ? <p className={styles.saveMessage}>The next Survivor round will appear when fixtures are released.</p> : <><p className={styles.saveMessage}>Round {survivorRound.round_number} · Pick one club. Clubs can only be used once.</p><select className={styles.survivorSelect} value={survivorPick} onChange={(event) => setSurvivorPick(event.target.value)}><option value="">Choose a club</option>{survivorTeams.map((team) => <option key={team.id} value={team.id} disabled={survivorUsed.includes(team.id) && survivorPick !== team.id}>{team.name}{survivorUsed.includes(team.id) && survivorPick !== team.id ? " · used" : ""}</option>)}</select><button className={styles.save} disabled={!survivorPick || isSubmitting} onClick={saveSurvivorPick}>Save Survivor pick</button>{survivorMessage && <p className={styles.saveMessage}>{survivorMessage}</p>}</>}</section></section></main>;
}
