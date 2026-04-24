import React, { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { Users, Zap, Link2, Copy, Check, Plus, Trash2, AlertCircle, Trophy, Clock, X } from "lucide-react";

// ============================================================
// Supabase client — reads keys from environment variables
// ============================================================
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const DEFAULT_TEAM_SIZE = 4;

// ---------- tiny helpers ----------
const uid = () => Math.random().toString(36).slice(2, 9);
const cls = (...xs) => xs.filter(Boolean).join(" ");

function getSessionIdFromHash() {
  const h = window.location.hash || "";
  const m = h.match(/session=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}
function getPresenterIdFromHash() {
  const h = window.location.hash || "";
  const m = h.match(/presenter=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}
function setHash(session, presenter) {
  let h = `#session=${session}`;
  if (presenter) h += `&presenter=${presenter}`;
  window.location.hash = h;
}

// ---------- Supabase data layer ----------
async function loadSession(sessionId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("sessions")
    .select("data")
    .eq("id", sessionId)
    .single();
  if (error || !data) return null;
  return data.data;
}

async function saveSession(sessionId, data) {
  if (!supabase) return false;
  const { error } = await supabase
    .from("sessions")
    .upsert({ id: sessionId, data, updated_at: new Date().toISOString() });
  return !error;
}

// Atomic claim: only insert if no one has claimed this voter yet for this session.
// Returns { success: bool, reason?: string }
async function attemptClaimAtomic(sessionId, voterId, pitchId) {
  if (!supabase) return { success: false, reason: "No connection" };
  const { error } = await supabase
    .from("claims")
    .insert({ session_id: sessionId, voter_id: voterId, pitch_id: pitchId });
  if (error) {
    // Unique constraint violation means someone else got there first
    if (error.code === "23505") return { success: false, reason: "taken" };
    return { success: false, reason: error.message };
  }
  return { success: true };
}

async function unclaimAtomic(sessionId, voterId, pitchId) {
  if (!supabase) return false;
  const { error } = await supabase
    .from("claims")
    .delete()
    .eq("session_id", sessionId)
    .eq("voter_id", voterId)
    .eq("pitch_id", pitchId);
  return !error;
}

async function loadClaims(sessionId) {
  if (!supabase) return {};
  const { data, error } = await supabase
    .from("claims")
    .select("voter_id, pitch_id, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error || !data) return { claims: {}, claimOrder: [] };
  const claims = {};
  const claimOrder = [];
  data.forEach((row) => {
    claims[row.voter_id] = row.pitch_id;
    claimOrder.push({ voterId: row.voter_id, pitchId: row.pitch_id, ts: row.created_at });
  });
  return { claims, claimOrder };
}

async function resetClaims(sessionId) {
  if (!supabase) return false;
  const { error } = await supabase.from("claims").delete().eq("session_id", sessionId);
  return !error;
}

// ============================================================
// SETUP SCREEN
// ============================================================
function SetupScreen({ onCreated }) {
  const [pitchesRaw, setPitchesRaw] = useState(
    "Alice — Topical Authority Maps\nBob — AI Snippet Generator\nCarla — Internal Link Optimizer\nDavid — SERP Volatility Tracker"
  );
  const [votesRaw, setVotesRaw] = useState(
    "Priya: Alice, Carla\nRahul: Bob, David, Alice\nSneha: Carla\nArjun: Alice, Bob\nMeera: David, Carla\nKiran: Bob\nDivya: Alice, David\nVikram: Carla, Bob"
  );
  const [teamSize, setTeamSize] = useState(DEFAULT_TEAM_SIZE);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const parse = () => {
    const pitchLines = pitchesRaw.split("\n").map((l) => l.trim()).filter(Boolean);
    const pitches = pitchLines.map((line) => {
      const sep = line.match(/\s[—\-:]\s/);
      if (sep) {
        const idx = line.indexOf(sep[0]);
        return {
          id: uid(),
          presenter: line.slice(0, idx).trim(),
          title: line.slice(idx + sep[0].length).trim(),
          teamSize: teamSize,
        };
      }
      return { id: uid(), presenter: line, title: line, teamSize: teamSize };
    });

    if (pitches.length === 0) throw new Error("Add at least one pitch.");

    const byPresenter = new Map();
    const byTitle = new Map();
    pitches.forEach((p) => {
      byPresenter.set(p.presenter.toLowerCase(), p.id);
      byTitle.set(p.title.toLowerCase(), p.id);
    });

    const voteLines = votesRaw.split("\n").map((l) => l.trim()).filter(Boolean);
    const voters = [];
    const unknown = new Set();
    voteLines.forEach((line) => {
      const sep = line.match(/[:\-—]/);
      if (!sep) return;
      const idx = line.indexOf(sep[0]);
      const name = line.slice(0, idx).trim();
      const rest = line.slice(idx + 1).trim();
      if (!name) return;
      const picks = rest.split(/[,|;]/).map((s) => s.trim()).filter(Boolean);
      const pitchIds = [];
      picks.forEach((p) => {
        const key = p.toLowerCase();
        if (byPresenter.has(key)) pitchIds.push(byPresenter.get(key));
        else if (byTitle.has(key)) pitchIds.push(byTitle.get(key));
        else unknown.add(p);
      });
      if (pitchIds.length > 0) voters.push({ id: uid(), name, pitchIds: [...new Set(pitchIds)] });
    });

    if (voters.length === 0)
      throw new Error("No valid voters parsed. Check that voter picks match a presenter name or pitch title.");

    return { pitches, voters, unknown: [...unknown] };
  };

  const handleCreate = async () => {
    setError("");
    setCreating(true);
    try {
      if (!supabase) throw new Error("Database not configured. Check your environment variables.");
      const { pitches, voters, unknown } = parse();
      if (unknown.length > 0) {
        setError(`Some picks didn't match any pitch and were skipped: ${unknown.join(", ")}`);
      }
      const sessionId = uid() + uid();
      const data = { pitches, voters, createdAt: Date.now() };
      const ok = await saveSession(sessionId, data);
      if (!ok) throw new Error("Could not save session. Check your database connection.");
      onCreated(sessionId);
    } catch (e) {
      setError(e.message || "Could not create session.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-12">
          <div className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase text-orange-600 font-bold mb-3">
            <Zap className="w-3.5 h-3.5" /> Hackathon Draft
          </div>
          <h1 className="font-serif text-6xl md:text-7xl leading-[0.95] tracking-tight mb-4">
            Let's set up the <span className="italic text-orange-600">team</span>.
          </h1>
          <p className="text-stone-600 text-lg max-w-2xl">
            Paste your pitches and the people who voted for each. You'll get a link to share with every presenter — they race to claim their team of {teamSize}.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs tracking-[0.2em] uppercase font-bold text-stone-500 mb-2">
              1 · Pitches
            </label>
            <p className="text-sm text-stone-600 mb-3">
              One per line. Format: <code className="bg-stone-200 px-1.5 py-0.5 rounded text-xs">Presenter — Pitch title</code>
            </p>
            <textarea
              value={pitchesRaw}
              onChange={(e) => setPitchesRaw(e.target.value)}
              className="w-full h-56 p-4 bg-white border-2 border-stone-300 focus:border-orange-500 outline-none font-mono text-sm rounded-sm transition-colors"
              placeholder="Alice — Topical Authority Maps&#10;Bob — AI Snippet Generator"
            />
          </div>
          <div>
            <label className="block text-xs tracking-[0.2em] uppercase font-bold text-stone-500 mb-2">
              2 · Voters
            </label>
            <p className="text-sm text-stone-600 mb-3">
              One per line. Format: <code className="bg-stone-200 px-1.5 py-0.5 rounded text-xs">Name: presenter1, presenter2</code>
            </p>
            <textarea
              value={votesRaw}
              onChange={(e) => setVotesRaw(e.target.value)}
              className="w-full h-56 p-4 bg-white border-2 border-stone-300 focus:border-orange-500 outline-none font-mono text-sm rounded-sm transition-colors"
              placeholder="Priya: Alice, Carla&#10;Rahul: Bob, David"
            />
          </div>
        </div>

        <div className="mt-8 flex items-center gap-4 flex-wrap">
          <label className="text-sm font-bold tracking-wide uppercase text-stone-600">Team size</label>
          <div className="flex">
            {[2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => setTeamSize(n)}
                className={cls(
                  "w-10 h-10 border-2 font-bold transition-all",
                  teamSize === n
                    ? "bg-stone-900 text-white border-stone-900 scale-110 z-10"
                    : "bg-white text-stone-700 border-stone-300 hover:border-stone-500 -ml-0.5"
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <span className="text-sm text-stone-500">including the presenter</span>
        </div>

        {error && (
          <div className="mt-6 p-4 bg-amber-50 border-l-4 border-amber-500 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <span className="text-sm text-amber-900">{error}</span>
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={creating}
          className="mt-8 px-8 py-4 bg-orange-600 hover:bg-orange-700 disabled:bg-stone-400 text-white font-bold tracking-wide uppercase text-sm transition-all hover:translate-x-1 hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#1c1917] relative"
        >
          {creating ? "Starting…" : "Start building the teams →"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function Dashboard({ sessionId, data, claims, reload }) {
  const [copiedPresenter, setCopiedPresenter] = useState(null);
  const organizerUrl = `${window.location.origin}${window.location.pathname}#session=${sessionId}`;
  const presenterUrl = (pid) => `${organizerUrl}&presenter=${pid}`;

  const copyPresenter = (pid) => {
    navigator.clipboard.writeText(presenterUrl(pid));
    setCopiedPresenter(pid);
    setTimeout(() => setCopiedPresenter(null), 1500);
  };

  const resetDraft = async () => {
    if (!window.confirm("Reset all claims? This wipes every team picked so far.")) return;
    await resetClaims(sessionId);
    reload();
  };

  const claimsByPitch = {};
  data.pitches.forEach((p) => (claimsByPitch[p.id] = []));
  Object.entries(claims).forEach(([voterId, pitchId]) => {
    if (claimsByPitch[pitchId]) claimsByPitch[pitchId].push(voterId);
  });
  const voterById = Object.fromEntries(data.voters.map((v) => [v.id, v]));

  const totalClaimed = Object.keys(claims).length;
  const totalVoters = data.voters.length;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-10 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase text-orange-600 font-bold mb-2">
              <Trophy className="w-3.5 h-3.5" /> Organizer Dashboard
            </div>
            <h1 className="font-serif text-5xl leading-none tracking-tight">Live draft status</h1>
          </div>
          <div className="flex gap-3">
            <button
              onClick={resetDraft}
              className="px-4 py-2 border-2 border-red-300 hover:border-red-500 text-red-700 text-sm font-bold tracking-wide uppercase transition-colors"
            >
              Reset claims
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 mb-10 border-2 border-stone-900 bg-white">
          <div className="p-5 border-r-2 border-stone-900">
            <div className="text-[10px] tracking-[0.2em] uppercase text-stone-500 font-bold mb-1">Pitches</div>
            <div className="font-serif text-4xl">{data.pitches.length}</div>
          </div>
          <div className="p-5 border-r-2 border-stone-900">
            <div className="text-[10px] tracking-[0.2em] uppercase text-stone-500 font-bold mb-1">Voters</div>
            <div className="font-serif text-4xl">{totalVoters}</div>
          </div>
          <div className="p-5 border-r-2 border-stone-900">
            <div className="text-[10px] tracking-[0.2em] uppercase text-stone-500 font-bold mb-1">Claimed</div>
            <div className="font-serif text-4xl text-orange-600">{totalClaimed}</div>
          </div>
          <div className="p-5">
            <div className="text-[10px] tracking-[0.2em] uppercase text-stone-500 font-bold mb-1">Available</div>
            <div className="font-serif text-4xl">{totalVoters - totalClaimed}</div>
          </div>
        </div>

        <div className="mb-10 p-6 bg-stone-900 text-stone-50">
          <div className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase font-bold mb-4">
            <Link2 className="w-3.5 h-3.5" /> Share with presenters
          </div>
          <p className="text-stone-400 text-sm mb-5 max-w-2xl">
            Send each presenter their personal link below. They'll only see the people who voted for their pitch, and can claim up to {data.pitches[0]?.teamSize - 1 || 3} team members.
          </p>
          <div className="space-y-2">
            {data.pitches.map((p) => (
              <div key={p.id} className="flex items-center gap-3 bg-stone-800 p-3 rounded-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">
                    {p.presenter} <span className="text-stone-500 font-normal">— {p.title}</span>
                  </div>
                  <div className="text-xs text-stone-500 font-mono truncate">{presenterUrl(p.id)}</div>
                </div>
                <button
                  onClick={() => copyPresenter(p.id)}
                  className="px-3 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold tracking-wide uppercase flex items-center gap-1.5 transition-colors flex-shrink-0"
                >
                  {copiedPresenter === p.id ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        <h2 className="font-serif text-3xl mb-6">Teams forming…</h2>
        <div className="grid md:grid-cols-2 gap-5">
          {data.pitches.map((p) => {
            const claimedVoterIds = claimsByPitch[p.id] || [];
            const interested = data.voters.filter((v) => v.pitchIds.includes(p.id));
            const available = interested.filter((v) => !claims[v.id]);
            const capacity = p.teamSize - 1;
            const slotsFilled = claimedVoterIds.length;
            return (
              <div key={p.id} className="bg-white border-2 border-stone-900 p-5">
                <div className="flex items-start justify-between mb-3 gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] tracking-[0.2em] uppercase text-stone-500 font-bold mb-1">{p.presenter}</div>
                    <div className="font-serif text-xl leading-tight">{p.title}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-serif text-3xl leading-none">
                      {slotsFilled}
                      <span className="text-stone-400">/{capacity}</span>
                    </div>
                    <div className="text-[10px] tracking-[0.2em] uppercase text-stone-500 font-bold mt-1">claimed</div>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="text-[10px] tracking-[0.2em] uppercase text-stone-500 font-bold mb-2">Team</div>
                  {claimedVoterIds.length === 0 ? (
                    <div className="text-sm text-stone-400 italic">No one yet.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {claimedVoterIds.map((vid) => (
                        <span key={vid} className="px-2.5 py-1 bg-orange-600 text-white text-sm font-bold">
                          {voterById[vid]?.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="pt-3 border-t border-stone-200">
                  <div className="text-[10px] tracking-[0.2em] uppercase text-stone-500 font-bold mb-2">
                    Still available ({available.length})
                  </div>
                  {available.length === 0 ? (
                    <div className="text-sm text-stone-400 italic">None.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {available.map((v) => (
                        <span key={v.id} className="px-2 py-0.5 bg-stone-100 text-stone-700 text-xs">
                          {v.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PRESENTER SCREEN
// ============================================================
function PresenterScreen({ sessionId, presenterId, data, claims, reload }) {
  const pitch = data.pitches.find((p) => p.id === presenterId);
  const [claiming, setClaiming] = useState(null);
  const [flash, setFlash] = useState(null);
  const flashTimer = useRef(null);

  if (!pitch) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="font-serif text-3xl mb-2">Pitch not found</h2>
          <p className="text-stone-600">This presenter link doesn't match any pitch in the session. Ask the organizer for a fresh link.</p>
        </div>
      </div>
    );
  }

  const voterById = Object.fromEntries(data.voters.map((v) => [v.id, v]));
  const interested = data.voters.filter((v) => v.pitchIds.includes(pitch.id));
  const myClaims = Object.entries(claims).filter(([, pid]) => pid === pitch.id).map(([vid]) => vid);
  const myClaimSet = new Set(myClaims);
  const capacity = pitch.teamSize - 1;
  const slotsLeft = capacity - myClaims.length;

  const available = interested.filter((v) => !claims[v.id]);
  const takenByOthers = interested.filter((v) => claims[v.id] && !myClaimSet.has(v.id));

  const showFlash = (type, msg) => {
    setFlash({ type, msg });
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2200);
  };

  const attemptClaim = async (voter) => {
    if (slotsLeft <= 0) {
      showFlash("taken", "Your team is already full.");
      return;
    }
    setClaiming(voter.id);
    const result = await attemptClaimAtomic(sessionId, voter.id, pitch.id);
    setClaiming(null);
    if (!result.success) {
      if (result.reason === "taken") {
        showFlash("taken", `Too slow — ${voter.name} was just claimed by another team.`);
      } else {
        showFlash("taken", `Couldn't claim: ${result.reason}`);
      }
      reload();
      return;
    }
    showFlash("success", `${voter.name} is on your team.`);
    reload();
  };

  const unclaim = async (voter) => {
    await unclaimAtomic(sessionId, voter.id, pitch.id);
    reload();
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 relative">
      {flash && (
        <div
          className={cls(
            "fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 font-bold text-sm tracking-wide shadow-lg",
            flash.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          )}
        >
          {flash.msg}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-10">
          <div className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase text-orange-600 font-bold mb-2">
            <Zap className="w-3.5 h-3.5" /> Your Pitch
          </div>
          <h1 className="font-serif text-5xl md:text-6xl leading-[0.95] tracking-tight mb-2">{pitch.title}</h1>
          <div className="text-stone-500 text-lg">
            Presented by <span className="text-stone-900 font-bold">{pitch.presenter}</span>
          </div>
        </div>

        <div className="mb-8 flex items-center gap-6 flex-wrap">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-6xl leading-none">{myClaims.length}</span>
            <span className="font-serif text-3xl text-stone-400 leading-none">/ {capacity}</span>
          </div>
          <div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-stone-500 font-bold">Team members claimed</div>
            <div className="text-sm text-stone-700">
              {slotsLeft > 0 ? `${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} left — move fast.` : "Team is full. 🎉"}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold tracking-wide uppercase text-emerald-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live
          </div>
        </div>

        {myClaims.length > 0 && (
          <div className="mb-10">
            <h2 className="text-xs tracking-[0.2em] uppercase font-bold text-stone-500 mb-3">Your team</h2>
            <div className="flex flex-wrap gap-2">
              {myClaims.map((vid) => (
                <div key={vid} className="group flex items-center gap-2 bg-stone-900 text-white pl-4 pr-1.5 py-1.5">
                  <span className="font-bold text-sm">{voterById[vid]?.name}</span>
                  <button
                    onClick={() => unclaim(voterById[vid])}
                    className="p-1 hover:bg-red-600 transition-colors"
                    title="Remove from team"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-10">
          <h2 className="text-xs tracking-[0.2em] uppercase font-bold text-stone-500 mb-3">
            Available — voted for your pitch ({available.length})
          </h2>
          {available.length === 0 ? (
            <div className="p-8 text-center text-stone-400 border-2 border-dashed border-stone-300">
              {interested.length === 0 ? "No one voted for your pitch." : "Everyone who voted for you has been claimed."}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {available.map((v) => {
                const alsoVotedFor = v.pitchIds.filter((pid) => pid !== pitch.id).length;
                return (
                  <button
                    key={v.id}
                    onClick={() => attemptClaim(v)}
                    disabled={claiming === v.id || slotsLeft <= 0}
                    className={cls(
                      "group relative text-left p-4 border-2 transition-all",
                      slotsLeft <= 0
                        ? "border-stone-200 bg-stone-100 text-stone-400 cursor-not-allowed"
                        : "border-stone-900 bg-white hover:bg-orange-600 hover:text-white hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#1c1917]"
                    )}
                  >
                    <div className="font-bold text-lg leading-tight mb-1">{v.name}</div>
                    <div className="text-xs opacity-70">
                      {alsoVotedFor === 0 ? "Only voted for you" : `Also voted for ${alsoVotedFor} other pitch${alsoVotedFor === 1 ? "" : "es"}`}
                    </div>
                    <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-stone-100 group-hover:bg-white flex items-center justify-center transition-colors">
                      <Plus className="w-4 h-4 text-stone-900" />
                    </div>
                    {claiming === v.id && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center text-sm font-bold">Claiming…</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {takenByOthers.length > 0 && (
          <div className="mb-10">
            <h2 className="text-xs tracking-[0.2em] uppercase font-bold text-stone-500 mb-3">
              Already taken ({takenByOthers.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {takenByOthers.map((v) => {
                const takerPitch = data.pitches.find((p) => p.id === claims[v.id]);
                return (
                  <div key={v.id} className="px-3 py-1.5 bg-stone-200 text-stone-500 text-sm line-through">
                    {v.name}{" "}
                    <span className="text-xs no-underline not-italic">→ {takerPitch?.presenter}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-12 pt-6 border-t border-stone-200 text-xs text-stone-400 tracking-wide">
          Updates in real-time. If someone else claims a voter before you, they'll vanish from your list.
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ROOT
// ============================================================
export default function App() {
  const [sessionId, setSessionId] = useState(() => getSessionIdFromHash());
  const [presenterId, setPresenterId] = useState(() => getPresenterIdFromHash());
  const [data, setData] = useState(null);
  const [claims, setClaims] = useState({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    const d = await loadSession(sessionId);
    if (!d) {
      setNotFound(true);
      setData(null);
    } else {
      setNotFound(false);
      setData(d);
      const { claims } = await loadClaims(sessionId);
      setClaims(claims);
    }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Real-time subscription to claims changes
  useEffect(() => {
    if (!sessionId || !supabase) return;
    const channel = supabase
      .channel(`claims:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "claims", filter: `session_id=eq.${sessionId}` },
        () => {
          loadClaims(sessionId).then(({ claims }) => setClaims(claims));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  useEffect(() => {
    const onHash = () => {
      setSessionId(getSessionIdFromHash());
      setPresenterId(getPresenterIdFromHash());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const link = document.createElement("link");
    link.href =
      "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,700;1,9..144,400&family=Inter:wght@400;500;600;700;800&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent = `
      body { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; margin: 0; }
      .font-serif { font-family: 'Fraunces', ui-serif, Georgia, serif; font-feature-settings: "ss01"; }
      code, pre { font-family: 'JetBrains Mono', ui-monospace, monospace; }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(link);
      document.head.removeChild(style);
    };
  }, []);

  const handleCreated = (id) => {
    setSessionId(id);
    setHash(id, null);
  };

  if (!supabase) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="font-serif text-3xl mb-2">Database not connected</h2>
          <p className="text-stone-600">
            Environment variables <code className="bg-stone-200 px-1.5 py-0.5 rounded text-xs">VITE_SUPABASE_URL</code> and{" "}
            <code className="bg-stone-200 px-1.5 py-0.5 rounded text-xs">VITE_SUPABASE_ANON_KEY</code> are missing. Add them in Vercel → Settings → Environment Variables.
          </p>
        </div>
      </div>
    );
  }

  if (!sessionId) return <SetupScreen onCreated={handleCreated} />;
  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-stone-500 tracking-[0.2em] uppercase text-xs font-bold animate-pulse">Loading draft…</div>
      </div>
    );
  }
  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="font-serif text-3xl mb-2">Session not found</h2>
          <p className="text-stone-600 mb-6">This draft link is invalid or has expired.</p>
          <button
            onClick={() => {
              window.location.hash = "";
              setSessionId(null);
              setPresenterId(null);
              setNotFound(false);
            }}
            className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold tracking-wide uppercase text-sm"
          >
            Start a new draft
          </button>
        </div>
      </div>
    );
  }

  if (presenterId)
    return <PresenterScreen sessionId={sessionId} presenterId={presenterId} data={data} claims={claims} reload={refresh} />;
  return <Dashboard sessionId={sessionId} data={data} claims={claims} reload={refresh} />;
}
