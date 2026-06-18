"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";

interface ReviewEvent {
  id: number;
  title: string;
  venue: string;
  date: string;
  time: string | null;
  description: string | null;
  price: string | null;
  relevanceScore: number | null;
  url: string | null;
}
type Feedback = { sentiment: "like" | "dislike"; note: string };
type Phase = "idle" | "loading" | "live" | "done" | "error";

export default function ReviewPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [index, setIndex] = useState(-1); // -1 until the agent announces the first event
  const [feedback, setFeedback] = useState<Record<number, Feedback>>({});
  const [error, setError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [noEvents, setNoEvents] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [caption, setCaption] = useState("");

  const roomRef = useRef<Room | null>(null);
  const roomNameRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLDivElement | null>(null);
  const statePoll = useRef<ReturnType<typeof setInterval> | null>(null);
  const captionClear = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendAdvance = useCallback(async () => {
    const room = roomNameRef.current;
    if (!room) return;
    await fetch("/api/review/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room }),
    });
  }, []);

  const cleanup = useCallback(() => {
    if (statePoll.current) clearInterval(statePoll.current);
    if (captionClear.current) clearTimeout(captionClear.current);
    roomRef.current?.disconnect();
    roomRef.current = null;
    roomNameRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // Poll server-authoritative state so the card + feedback always match the agent.
  useEffect(() => {
    if (phase !== "live" || !roomNameRef.current) return;
    const tick = async () => {
      try {
        const r = await fetch(`/api/review/state?room=${encodeURIComponent(roomNameRef.current!)}`);
        if (!r.ok) return;
        const st = await r.json();
        setFeedback(st.feedback ?? {});
        if (st.finished) {
          // End of session: turn the mic off, keep state for the summary.
          roomRef.current?.localParticipant.setMicrophoneEnabled(false).catch(() => {});
          setCaption("");
          setPhase("done");
          const room = roomRef.current;
          setTimeout(() => room?.disconnect(), 1500); // let the goodbye finish
          return;
        }
        // Mirror the event the AGENT is currently narrating (not the raw cursor).
        if (typeof st.announced === "number" && st.announced >= 0) setIndex(st.announced);
      } catch {
        /* ignore */
      }
    };
    tick();
    statePoll.current = setInterval(tick, 450);
    return () => {
      if (statePoll.current) clearInterval(statePoll.current);
    };
  }, [phase]);

  const loadSamples = async () => {
    await fetch("/api/dev/sample-events", { method: "POST" });
    setNoEvents(false);
    start();
  };

  const start = useCallback(async () => {
    setPhase("loading");
    setError(null);
    setMicError(null);
    setNoEvents(false);
    setFeedback({});
    setCaption("");
    setIndex(-1);
    try {
      const res = await fetch("/api/review/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Failed to start");
      if (!data.events || data.events.length === 0) {
        setNoEvents(true);
        setPhase("idle");
        return;
      }
      setEvents(data.events as ReviewEvent[]);
      roomNameRef.current = data.room;

      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.autoplay = true;
          audioRef.current?.appendChild(el);
        }
      });
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setAgentSpeaking(speakers.some((s) => !s.isLocal));
      });
      // Live captions of what the user is saying.
      room.on(RoomEvent.TranscriptionReceived, (segs, participant) => {
        const isUser = participant?.isLocal || participant?.identity === "user";
        if (!isUser) return;
        const text = segs
          .map((s) => s.text)
          .join(" ")
          .trim();
        if (!text) return;
        setCaption(text);
        if (captionClear.current) clearTimeout(captionClear.current);
        if (segs.every((s) => s.final)) captionClear.current = setTimeout(() => setCaption(""), 2500);
      });
      room.on(RoomEvent.Disconnected, () => {
        setPhase((p) => (p === "done" ? p : "idle"));
      });

      await room.connect(data.url, data.token);
      setPhase("live");

      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        setMicError(null);
      } catch (micErr) {
        const m = micErr instanceof Error ? micErr.message : String(micErr);
        setMicError(
          /secure|getusermedia|permission|notallowed/i.test(m)
            ? "Mic blocked — open over https:// or on localhost to talk."
            : m
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, []);

  const endSession = () => {
    cleanup();
    setPhase("idle");
  };

  const current = events[index];

  return (
    <div className="flex flex-col min-h-[80vh]">
      {/* ── Instructions (top) ───────────────────────────────────── */}
      {phase !== "done" && (
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Voice Review</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Listen, react out loud, and your taste tunes future recommendations.
            </p>
            {phase !== "loading" && !noEvents && phase !== "error" && (
              <div className="flex flex-wrap gap-2 mt-4">
                <Step icon="🎧" text="Hear each event" />
                <Step icon="💬" text="Say what you like or dislike" />
                <Step icon="⏭" text="Say “next” to skip" />
              </div>
            )}
          </div>
          {phase === "live" && (
            <button
              onClick={endSession}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium text-zinc-500 bg-zinc-100 hover:bg-zinc-200 transition"
            >
              End
            </button>
          )}
        </header>
      )}

      {/* ── Middle (grows) ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-center py-6">
        {noEvents && (
          <div className="text-center space-y-3">
            <p className="text-sm text-zinc-600">No unrated events to review yet.</p>
            <button
              onClick={loadSamples}
              className="px-4 py-2 rounded-full text-sm font-medium bg-zinc-100 hover:bg-zinc-200 transition"
            >
              Load sample events
            </button>
          </div>
        )}

        {phase === "error" && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 text-center">
            ⚠ {error}
            <button onClick={start} className="ml-3 underline">
              retry
            </button>
          </div>
        )}

        {phase === "live" && current && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-zinc-400">
                Event {index + 1} of {events.length}
              </span>
              <ProgressDots total={events.length} index={index} />
            </div>
            <article
              key={current.id}
              className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm min-h-[300px] flex flex-col"
              style={{ animation: "lk-pop 0.25s ease-out" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {current.venue}
                </span>
                {current.relevanceScore != null && <ScoreBadge score={current.relevanceScore} />}
              </div>
              <h3 className="text-3xl font-bold tracking-tight leading-tight text-zinc-900 mt-3">
                {current.title}
              </h3>
              <p className="text-sm text-zinc-500 mt-2">
                {current.date}
                {current.time ? ` · ${current.time}` : ""}
                {current.price ? ` · ${current.price}` : ""}
              </p>
              {current.description && (
                <p className="text-[15px] text-zinc-700 mt-4 leading-relaxed">{current.description}</p>
              )}
              <div className="mt-auto pt-5">
                {feedback[current.id] ? (
                  <FeedbackChip fb={feedback[current.id]} />
                ) : (
                  <span className="text-xs text-zinc-400">Awaiting your take…</span>
                )}
              </div>
            </article>
          </div>
        )}

        {phase === "live" && !current && (
          <p className="text-center text-sm text-zinc-400">Connecting to the assistant…</p>
        )}

        {phase === "done" && <Summary events={events} feedback={feedback} onAgain={start} />}
      </div>

      {/* ── Voice dock (bottom) ──────────────────────────────────── */}
      {(phase === "idle" || phase === "loading") && !noEvents && (
        <div className="flex flex-col items-center gap-3 pb-2">
          <button onClick={start} disabled={phase === "loading"} className="relative group outline-none">
            {phase === "loading" && (
              <span className="absolute inset-0 rounded-full bg-indigo-500/30 blur-xl" style={{ animation: "lk-glow 2s ease-in-out infinite" }} />
            )}
            <span className="relative flex items-center justify-center w-24 h-24 rounded-full bg-zinc-900 text-white shadow-xl group-hover:scale-105 active:scale-95 transition-transform">
              {phase === "loading" ? <Spinner /> : <MicGlyph size={34} />}
            </span>
          </button>
          <p className="text-sm font-medium text-zinc-600">
            {phase === "loading" ? "Connecting…" : "Tap to start"}
          </p>
        </div>
      )}

      {phase === "live" && (
        <div className="flex flex-col items-center gap-3 pb-2">
          {micError && (
            <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 text-center">
              🎤 {micError} You can still see events and hear the assistant.
            </div>
          )}

          {/* live caption */}
          <div className="min-h-[2rem] flex items-center justify-center px-4 text-center">
            {caption ? (
              <p className="text-base font-medium text-zinc-800">“{caption}”</p>
            ) : (
              <p className="text-sm text-zinc-400">{agentSpeaking ? "Assistant speaking…" : "Listening — say what you think"}</p>
            )}
          </div>

          {/* orb */}
          <div className="relative flex items-center justify-center w-24 h-24">
            {agentSpeaking && (
              <>
                <span className="absolute w-20 h-20 rounded-full border-2 border-indigo-300" style={{ animation: "lk-ring 1.6s ease-out infinite" }} />
                <span className="absolute w-20 h-20 rounded-full border-2 border-indigo-200" style={{ animation: "lk-ring 1.6s ease-out 0.8s infinite" }} />
                <span className="absolute w-16 h-16 rounded-full bg-indigo-500/20 blur-lg" />
              </>
            )}
            <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-zinc-900 shadow-xl">
              {agentSpeaking ? <Waveform /> : <MicGlyph size={26} />}
            </div>
          </div>

          <button
            onClick={sendAdvance}
            className="px-5 py-2 rounded-full text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-700 transition active:scale-95"
          >
            Skip →
          </button>
        </div>
      )}

      <div ref={audioRef} className="hidden" />
    </div>
  );
}

// ── presentational ───────────────────────────────────────────────

function Step({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-full px-3.5 py-1.5 shadow-sm">
      <span>{icon}</span>
      {text}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 85
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : score >= 65
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-zinc-100 text-zinc-500 border-zinc-200";
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${cls}`}>{score} match</span>;
}

function FeedbackChip({ fb }: { fb: Feedback }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border ${
        fb.sentiment === "like"
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-rose-50 text-rose-700 border-rose-200"
      }`}
      style={{ animation: "lk-pop 0.2s ease-out" }}
    >
      {fb.sentiment === "like" ? "👍" : "👎"} “{fb.note}”
    </div>
  );
}

function ProgressDots({ total, index }: { total: number; index: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i === index ? "w-5 bg-zinc-900" : i < index ? "w-1.5 bg-zinc-400" : "w-1.5 bg-zinc-200"
          }`}
        />
      ))}
    </div>
  );
}

function Summary({
  events,
  feedback,
  onAgain,
}: {
  events: ReviewEvent[];
  feedback: Record<number, Feedback>;
  onAgain: () => void;
}) {
  const liked = events.filter((e) => feedback[e.id]?.sentiment === "like").length;
  const disliked = events.filter((e) => feedback[e.id]?.sentiment === "dislike").length;
  const skipped = events.length - liked - disliked;
  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="text-3xl">✅</div>
        <h2 className="text-2xl font-bold tracking-tight mt-1">Review complete</h2>
        <p className="text-sm text-zinc-500 mt-1">
          {liked} liked · {disliked} passed · {skipped} skipped
        </p>
      </div>
      <div className="space-y-2">
        {events.map((e) => {
          const fb = feedback[e.id];
          return (
            <div key={e.id} className="rounded-2xl border border-zinc-200 bg-white p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="font-semibold text-zinc-900 truncate">{e.title}</h4>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {e.venue} · {e.date}
                </p>
                {fb?.note && <p className="text-sm text-zinc-700 mt-1.5 italic">“{fb.note}”</p>}
              </div>
              <span
                className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                  !fb
                    ? "bg-zinc-100 text-zinc-500 border-zinc-200"
                    : fb.sentiment === "like"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-rose-50 text-rose-700 border-rose-200"
                }`}
              >
                {!fb ? "Skipped" : fb.sentiment === "like" ? "👍 Liked" : "👎 Passed"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="text-center pt-1">
        <button
          onClick={onAgain}
          className="px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-700 transition active:scale-95"
        >
          Review again
        </button>
      </div>
    </div>
  );
}

function Waveform() {
  const bars = [0, 1, 2, 3, 4, 5, 6];
  return (
    <div className="flex items-center justify-center gap-[3px] h-8">
      {bars.map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-white"
          style={{
            height: "100%",
            transformOrigin: "center",
            animation: `lk-wave ${0.7 + (i % 3) * 0.18}s ease-in-out ${i * 0.09}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function MicGlyph({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" fill="white" stroke="none" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8.5" y1="21" x2="15.5" y2="21" />
    </svg>
  );
}

function Spinner() {
  return <span className="w-9 h-9 rounded-full border-[3px] border-white/30 border-t-white animate-spin" />;
}
