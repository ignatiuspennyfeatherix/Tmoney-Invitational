"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminPage() {
  const [allowed, setAllowed] = useState(false);
  const [message, setMessage] = useState("Checking commissioner access…");
  useEffect(() => { void (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMessage("Sign in to access commissioner controls."); return; }
    const { data } = await supabase.from("profiles").select("is_commissioner").eq("id", user.id).single();
    setAllowed(Boolean(data?.is_commissioner));
    setMessage(data?.is_commissioner ? "Commissioner controls" : "Your account is not marked as commissioner.");
  })(); }, []);
  const resetSurvivor = async () => {
    setMessage("Resetting Survivor…");
    const { error } = await supabase.rpc("reset_survivor_game");
    setMessage(error ? error.message : "Survivor picks and lives have been reset.");
  };
  return <main style={{ maxWidth: 560, margin: "40px auto", padding: 24, fontFamily: "Arial, sans-serif" }}><a href="/">← Back to predictions</a><h1>T-Money Invitational Admin</h1><p>{message}</p>{allowed && <button onClick={resetSurvivor} style={{ padding: "12px 16px", color: "white", background: "#9d2032", border: 0, borderRadius: 8, fontWeight: 700 }}>Reset Survivor game</button>}</main>;
}
