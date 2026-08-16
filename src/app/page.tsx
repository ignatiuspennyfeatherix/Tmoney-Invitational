"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import styles from "./page.module.css";
import { supabase } from "@/lib/supabase";

type FormResult = "W" | "D" | "L";

type Fixture = {
  id: string;
  kickoff: string;
  home: { name: string; position: number; badge: string; form: FormResult[] };
  away: { name: string; position: number; badge: string; form: FormResult[] };
  superPick?: boolean;
};

const fixtures: Fixture[] = [
  { id: "arsenal-united", kickoff: "Saturday · 12:30", home: { name: "Arsenal", position: 1, badge: "A", form: ["W", "W", "D", "W", "W"] }, away: { name: "Man United", position: 5, badge: "MU", form: ["W", "L", "W", "W", "D"] }, superPick: true },
  { id: "brentford-everton", kickoff: "Saturday · 15:00", home: { name: "Brentford", position: 14, badge: "B", form: ["L", "D", "W", "L", "D"] }, away: { name: "Everton", position: 11, badge: "E", form: ["W", "D", "L", "W", "L"] } },
];

function Form({ results }: { results: FormResult[] }) {
  return <div className={styles.form} aria-label={`Recent form: ${results.join(", ")}`}>{results.map((result, index) => <span className={`${styles.formResult} ${styles[result]}`} key={`${result}-${index}`}>{result}</span>)}</div>;
}

function Team({ team }: { team: Fixture["home"] }) {
  return <div className={styles.team}><span className={styles.badge}>{team.badge}</span><strong>{team.name}</strong><span className={styles.position}>{team.position}{team.position === 1 ? "st" : team.position === 2 ? "nd" : team.position === 3 ? "rd" : "th"} place</span><Form results={team.form} /></div>;
}

export default function Home() {
  const [scores, setScores] = useState<Record<string, [number, number]>>({ "arsenal-united": [2, 1], "brentford-everton": [0, 0] });
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
    };

    void loadSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  const createProfile = async (currentSession: Session) => {
    const displayName = currentSession.user.email?.split("@")[0] ?? "Player";
    await supabase.from("profiles").upsert({ id: currentSession.user.id, display_name: displayName }, { onConflict: "id" });
  };

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthMessage("");
    setIsSubmitting(true);
    const result = isCreatingAccount
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setAuthMessage(result.error.message);
    } else if (result.data.session) {
      await createProfile(result.data.session);
      setAuthMessage("You are signed in.");
    } else {
      setAuthMessage("Check your email to confirm your account, then sign in.");
    }
    setIsSubmitting(false);
  };

  const changeScore = (fixtureId: string, side: 0 | 1, change: number) => setScores((current) => ({ ...current, [fixtureId]: current[fixtureId].map((score, index) => index === side ? Math.max(0, score + change) : score) as [number, number] }));
  const clearPredictions = () => setScores(Object.fromEntries(fixtures.map((fixture) => [fixture.id, [0, 0]])));
  const savePredictions = () => setSaveMessage(session ? "Fixture sync is the next step. Your score selections are ready to save." : "Sign in first to save predictions.");
  const signOut = async () => { await supabase.auth.signOut(); setSaveMessage(""); };

  return <main className={styles.page}><section className={styles.app}><header className={styles.header}><div className={styles.headerRow}><div><span>Premier League prediction league</span><h1>T-Money Invitational</h1><p>Gameweek 3 · Predictions lock Saturday at 12:30</p></div>{session && <button className={styles.signOut} onClick={signOut}>Sign out</button>}</div></header><nav className={styles.nav}><a className={styles.active} href="#predictions">Predictions</a><a href="#table">League table</a><a href="#survivor">Survivor</a></nav><section className={styles.content} id="predictions">{!session && <form className={styles.auth} onSubmit={submitAuth}><strong>{isCreatingAccount ? "Join the Invitational" : "Sign in to make picks"}</strong><div className={styles.authFields}><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Email address" required /><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Password" minLength={6} required /><button disabled={isSubmitting}>{isSubmitting ? "Please wait" : isCreatingAccount ? "Create account" : "Sign in"}</button></div>{authMessage && <p>{authMessage}</p>}<button className={styles.authToggle} type="button" onClick={() => { setIsCreatingAccount((current) => !current); setAuthMessage(""); }}>{isCreatingAccount ? "Already have an account? Sign in" : "New here? Create an account"}</button></form>}{session && <p className={styles.welcome}>Signed in as <strong>{session.user.email}</strong></p>}<div className={styles.sectionHeader}><h2>Pick every score</h2><span>3 of 10 complete</span></div>{fixtures.map((fixture) => { const [homeScore, awayScore] = scores[fixture.id]; return <article className={styles.fixture} key={fixture.id}><div className={styles.fixtureHeader}><span>{fixture.kickoff}</span><span>{fixture.home.position}th vs {fixture.away.position}th</span></div><div className={styles.fixtureGrid}><Team team={fixture.home} /><div className={styles.scoreArea}><div className={styles.scoreLine}><div className={styles.scoreControl}><button onClick={() => changeScore(fixture.id, 0, 1)} aria-label={`Increase ${fixture.home.name} score`}>+</button><output>{homeScore}</output><button onClick={() => changeScore(fixture.id, 0, -1)} aria-label={`Decrease ${fixture.home.name} score`}>−</button></div><span>−</span><div className={styles.scoreControl}><button onClick={() => changeScore(fixture.id, 1, 1)} aria-label={`Increase ${fixture.away.name} score`}>+</button><output>{awayScore}</output><button onClick={() => changeScore(fixture.id, 1, -1)} aria-label={`Decrease ${fixture.away.name} score`}>−</button></div></div><span className={fixture.superPick ? styles.superPick : styles.spacer}>{fixture.superPick ? "Super Pick · double points" : " "}</span></div><Team team={fixture.away} /></div></article>; })}<div className={styles.actions}><button className={styles.clear} onClick={clearPredictions}>Clear</button><button className={styles.save} onClick={savePredictions}>Save predictions</button></div>{saveMessage && <p className={styles.saveMessage}>{saveMessage}</p>}</section></section></main>;
}
