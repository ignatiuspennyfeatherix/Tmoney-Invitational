"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Team = { id: string; name: string };

export default function PreseasonPage() {
  const [seasonId, setSeasonId] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [winner, setWinner] = useState("");
  const [topFour, setTopFour] = useState<string[]>([]);
  const [relegated, setRelegated] = useState<string[]>([]);
  const [scorer, setScorer] = useState("");
  const [assists, setAssists] = useState("");
  const [message, setMessage] = useState("Loading…");
  useEffect(() => { void (async () => {
    const [{ data: season }, { data: clubRows }] = await Promise.all([
      supabase.from("seasons").select("id").eq("is_active", true).limit(1).single(),
      supabase.from("teams").select("id, name").order("name"),
    ]);
    setSeasonId(season?.id ?? ""); setTeams((clubRows ?? []) as Team[]); setMessage("");
  })(); }, []);
  const toggle = (value: string, values: string[], setter: (next: string[]) => void, limit: number) => setter(values.includes(value) ? values.filter((item) => item !== value) : values.length < limit ? [...values, value] : values);
  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMessage("Sign in before saving your pre-season prediction."); return; }
    if (!seasonId || !winner || topFour.length !== 4 || relegated.length !== 3 || !scorer || !assists) { setMessage("Complete every selection before saving."); return; }
    const { error } = await supabase.from("preseason_predictions").upsert({ season_id: seasonId, user_id: user.id, league_winner_team_id: winner, champions_league_team_ids: topFour, top_scorer: scorer, most_assists: assists, relegated_team_ids: relegated }, { onConflict: "season_id,user_id" });
    setMessage(error ? error.message : "Pre-season prediction saved.");
  };
  return <main style={{ maxWidth: 560, margin: "30px auto", padding: 24, fontFamily: "Arial, sans-serif" }}><a href="/">← Back to predictions</a><h1>Pre-season predictions</h1><p>Predict the season before the first fixture. Winner, other top-four clubs, leading scorer, most assists and three relegated clubs.</p><label>League winner<select value={winner} onChange={(event) => setWinner(event.target.value)}><option value="">Choose a club</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><h3>Other Champions League clubs ({topFour.length}/4)</h3>{teams.map((team) => <label key={`top-${team.id}`}><input type="checkbox" checked={topFour.includes(team.id)} onChange={() => toggle(team.id, topFour, setTopFour, 4)} /> {team.name}</label>)}<label>Top scorer<input value={scorer} onChange={(event) => setScorer(event.target.value)} placeholder="Player name" /></label><label>Most assists<input value={assists} onChange={(event) => setAssists(event.target.value)} placeholder="Player name" /></label><h3>Relegated clubs ({relegated.length}/3)</h3>{teams.map((team) => <label key={`rel-${team.id}`}><input type="checkbox" checked={relegated.includes(team.id)} onChange={() => toggle(team.id, relegated, setRelegated, 3)} /> {team.name}</label>)}<button onClick={save} style={{ display: "block", padding: "12px 18px", marginTop: 20, color: "white", background: "#9d2032", border: 0, borderRadius: 8, fontWeight: 700 }}>Save pre-season prediction</button><p>{message}</p><style jsx>{`label{display:block;margin:12px 0}select,input:not([type=checkbox]){display:block;width:100%;padding:10px;margin-top:5px;box-sizing:border-box}h3{margin-top:24px}`}</style></main>;
}
