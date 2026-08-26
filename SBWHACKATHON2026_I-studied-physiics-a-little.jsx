import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Play, RotateCcw, Radio, Activity, Award, Lock, Users, GraduationCap,
  Sparkles, TrendingUp, Trash2, Bot, CheckCircle2, Loader2, Gauge, Ruler, Timer,
} from "lucide-react";

/* ---------------------------------------------------------------------
   PhysioSense AI — Live Lab Dashboard (prototype)
   Design tokens
--------------------------------------------------------------------- */
const INK = "#0F1226";
const PANEL = "#181D3A";
const PANEL2 = "#212752";
const GRID_LINE = "#2B325E";
const SIGNAL = "#00D9C0";
const SIGNAL_DIM = "#0B7A6E";
const AMBER = "#FFB454";
const DANGER = "#FF6B6B";
const PAPER = "#EAF0FA";
const MUTED = "#7C89AC";

const STORAGE_KEY = "physiosense_runs_v1";

/* ---------------------------------------------------------------------
   Physics simulation (demo mode — no real hardware attached)
--------------------------------------------------------------------- */
function generateRun(runNo) {
  const v0 = +(0.7 + Math.random() * 0.6).toFixed(2);
  const aTrue = +(0.14 + Math.random() * 0.24).toFixed(3);
  const dt = 0.12;
  const points = [];
  let t = 0;
  while (true) {
    const v = v0 - aTrue * t;
    if (v <= 0.02 || t > 5) break;
    const noise = (Math.random() - 0.5) * v0 * 0.012;
    points.push({ t: +t.toFixed(2), v: +Math.max(0, v + noise).toFixed(3) });
    t += dt;
  }
  points.push({ t: +t.toFixed(2), v: 0 });

  const first = points[0];
  const last = points[points.length - 2] || points[0];
  const aMeasured =
    last.t > first.t ? +((first.v - last.v) / (last.t - first.t)).toFixed(3) : aTrue;
  const errorPct = +((Math.abs(aMeasured - aTrue) / aTrue) * 100).toFixed(2);
  const accuracy = +Math.min(99.98, Math.max(90, 100 - errorPct)).toFixed(2);
  const distance = +points
    .reduce((acc, p, i) => (i === 0 ? 0 : acc + ((points[i - 1].v + p.v) / 2) * (p.t - points[i - 1].t)), 0)
    .toFixed(3);
  const duration = points[points.length - 1].t;

  return {
    id: `run-${Date.now()}-${runNo}`,
    runNo,
    timestamp: new Date().toISOString(),
    v0, aTrue, aMeasured, errorPct, accuracy, distance, duration, points,
    aiText: "",
  };
}

/* ---------------------------------------------------------------------
   AI insight — calls Claude directly; falls back to a canned explanation
   if the network call fails (keeps the demo resilient offline).
--------------------------------------------------------------------- */
async function fetchAIInsight(run) {
  const prompt = `คุณเป็นติวเตอร์ฟิสิกส์ AI ในแดชบอร์ด "PhysioSense AI" ช่วยอธิบายผลการทดลองจลนศาสตร์นี้ให้นักเรียนมัธยมเข้าใจง่าย เป็นภาษาไทย 3-4 ประโยค กระชับ เป็นกันเอง ไม่ใช้ markdown หรือหัวข้อ:
- ความเร็วต้น v0 = ${run.v0} m/s
- ความเร่งที่วัดได้ = ${run.aMeasured} m/s^2
- ความคลาดเคลื่อนเทียบค่าทฤษฎี = ${run.errorPct}%
- ระยะทางที่เคลื่อนที่ได้ = ${run.distance} m
อธิบายว่าผลนี้แม่นยำแค่ไหน สาเหตุที่เป็นไปได้ของความคลาดเคลื่อน และให้คำแนะนำสั้น 1 ข้อสำหรับการทดลองครั้งถัดไป`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await response.json();
    const text = (data.content || [])
      .map((b) => (b && b.type === "text" ? b.text : ""))
      .join(" ")
      .trim();
    if (!text) throw new Error("empty AI response");
    return text;
  } catch (e) {
    return `ระบบวัดความเร่งได้ ${run.aMeasured} m/s² คลาดเคลื่อนจากค่าจริงประมาณ ${run.errorPct}% ซึ่งน่าจะมาจากแรงเสียดทานที่แกนล้อและสัญญาณรบกวนของเซนเซอร์ช่วงความเร็วต่ำ ลองตรวจสอบให้แผ่นสะท้อนแสงตั้งฉากกับเซนเซอร์มากขึ้น น่าจะช่วยลดความคลาดเคลื่อนในการทดลองครั้งถัดไปได้`;
  }
}

/* ---------------------------------------------------------------------
   Achievements
--------------------------------------------------------------------- */
const BADGES = [
  { id: "first_run", label: "ก้าวแรกนักวิทย์", desc: "ทำการทดลองครั้งแรก", test: (h) => h.length >= 1 },
  { id: "accurate", label: "มือแม่นยำ", desc: "ความแม่นยำ ≥ 99% ในการทดลองใดก็ได้", test: (h) => h.some((r) => r.accuracy >= 99) },
  { id: "five_runs", label: "นักทดลองตัวยง", desc: "ทดลองครบ 5 ครั้ง", test: (h) => h.length >= 5 },
  { id: "perfectionist", label: "สมบูรณ์แบบ", desc: "ความแม่นยำ ≥ 99.9%", test: (h) => h.some((r) => r.accuracy >= 99.9) },
];

function accuracyColor(acc) {
  if (acc >= 99) return SIGNAL;
  if (acc >= 96) return AMBER;
  return DANGER;
}

/* ---------------------------------------------------------------------
   Small building blocks
--------------------------------------------------------------------- */
function StatBox({ icon: Icon, label, value, unit, accent }) {
  return (
    <div className="rounded-xl p-3 flex flex-col gap-1" style={{ background: PANEL2, border: `1px solid ${GRID_LINE}` }}>
      <div className="flex items-center gap-1.5">
        <Icon size={13} color={accent || MUTED} />
        <span className="text-xs" style={{ color: MUTED }}>{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-mono font-bold text-2xl" style={{ color: PAPER }}>{value}</span>
        <span className="text-xs font-mono" style={{ color: MUTED }}>{unit}</span>
      </div>
    </div>
  );
}

function Badge({ badge, unlocked, justUnlocked }) {
  return (
    <div
      className="flex flex-col items-center gap-1.5 rounded-xl p-3 w-28 transition-transform duration-500"
      style={{
        background: unlocked ? "rgba(0,217,192,0.08)" : PANEL2,
        border: `1px solid ${unlocked ? SIGNAL : GRID_LINE}`,
        transform: justUnlocked ? "scale(1.08)" : "scale(1)",
        boxShadow: justUnlocked ? `0 0 24px ${SIGNAL}` : "none",
      }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: unlocked ? SIGNAL : "transparent", border: `1.5px solid ${unlocked ? SIGNAL : MUTED}` }}
      >
        {unlocked ? <Award size={18} color={INK} /> : <Lock size={15} color={MUTED} />}
      </div>
      <div className="text-center leading-tight">
        <div className="text-[11px] font-semibold" style={{ color: unlocked ? PAPER : MUTED }}>{badge.label}</div>
        <div className="text-[9.5px] mt-0.5" style={{ color: MUTED }}>{badge.desc}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   Main component
--------------------------------------------------------------------- */
export default function PhysioSenseDashboard() {
  const [view, setView] = useState("student"); // 'student' | 'teacher'
  const [status, setStatus] = useState("idle"); // idle | running | analyzing | done
  const [livePoints, setLivePoints] = useState([]);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [activeRun, setActiveRun] = useState(null);
  const [aiDisplay, setAiDisplay] = useState("");
  const [justUnlocked, setJustUnlocked] = useState(null);
  const runTimer = useRef(null);
  const typeTimer = useRef(null);
  const prevBadgesRef = useRef(new Set());

  // ---- load persisted history on mount ----
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        const parsed = res && res.value ? JSON.parse(res.value) : [];
        setHistory(Array.isArray(parsed) ? parsed : []);
        prevBadgesRef.current = new Set(BADGES.filter((b) => b.test(parsed || [])).map((b) => b.id));
      } catch (e) {
        setHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, []);

  const unlockedBadges = useMemo(
    () => new Set(BADGES.filter((b) => b.test(history)).map((b) => b.id)),
    [history]
  );

  const persistHistory = useCallback(async (next) => {
    setHistory(next);
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(next.slice(0, 25)), false);
    } catch (e) {
      /* non-fatal in demo mode */
    }
  }, []);

  const startRun = () => {
    if (status === "running" || status === "analyzing") return;
    const run = generateRun(history.length + 1);
    setActiveRun(run);
    setLivePoints([]);
    setAiDisplay("");
    setStatus("running");

    let i = 0;
    runTimer.current = setInterval(() => {
      i += 1;
      setLivePoints(run.points.slice(0, i));
      if (i >= run.points.length) {
        clearInterval(runTimer.current);
        finishRun(run);
      }
    }, 90);
  };

  const finishRun = async (run) => {
    setStatus("analyzing");
    const aiText = await fetchAIInsight(run);
    const completed = { ...run, aiText };
    setStatus("done");

    // typewriter reveal
    let idx = 0;
    clearInterval(typeTimer.current);
    typeTimer.current = setInterval(() => {
      idx += 2;
      setAiDisplay(aiText.slice(0, idx));
      if (idx >= aiText.length) clearInterval(typeTimer.current);
    }, 18);

    const next = [completed, ...history];
    const before = prevBadgesRef.current;
    const after = new Set(BADGES.filter((b) => b.test(next)).map((b) => b.id));
    const newlyUnlocked = [...after].find((id) => !before.has(id));
    prevBadgesRef.current = after;
    if (newlyUnlocked) {
      setJustUnlocked(newlyUnlocked);
      setTimeout(() => setJustUnlocked(null), 2600);
    }
    persistHistory(next);
  };

  const resetAll = async () => {
    clearInterval(runTimer.current);
    clearInterval(typeTimer.current);
    setStatus("idle");
    setLivePoints([]);
    setActiveRun(null);
    setAiDisplay("");
    try {
      await window.storage.delete(STORAGE_KEY, false);
    } catch (e) {}
    setHistory([]);
    prevBadgesRef.current = new Set();
  };

  const loadPastRun = (run) => {
    clearInterval(runTimer.current);
    clearInterval(typeTimer.current);
    setActiveRun(run);
    setLivePoints(run.points);
    setAiDisplay(run.aiText || "");
    setStatus("done");
  };

  // ---- mock classroom data for teacher view ----
  const classmates = useMemo(() => {
    const names = ["พลอย", "กันต์", "มายด์", "ปูน", "ฟ้าใส", "เจได", "อาย", "โฟกัส"];
    return names.map((name, i) => ({
      name,
      runs: 1 + Math.floor(Math.random() * 7),
      best: +(93 + Math.random() * 6.8).toFixed(2),
      seed: i,
    }));
  }, []);
  const myBest = history.length ? Math.max(...history.map((r) => r.accuracy)) : null;
  const leaderboard = useMemo(() => {
    const rows = [...classmates];
    if (myBest) rows.push({ name: "คุณ", runs: history.length, best: myBest, isMe: true });
    return rows.sort((a, b) => b.best - a.best);
  }, [classmates, myBest, history.length]);
  const classAvg = leaderboard.length
    ? (leaderboard.reduce((a, r) => a + r.best, 0) / leaderboard.length).toFixed(2)
    : "-";

  const statusMeta = {
    idle: { color: MUTED, label: "พร้อมทดลอง", pulse: false },
    running: { color: DANGER, label: "กำลังบันทึกข้อมูล...", pulse: true },
    analyzing: { color: AMBER, label: "AI กำลังวิเคราะห์ผล...", pulse: true },
    done: { color: SIGNAL, label: "วิเคราะห์เสร็จสิ้น", pulse: false },
  }[status];

  const liveVelocity = livePoints.length ? livePoints[livePoints.length - 1].v : 0;
  const liveElapsed = livePoints.length ? livePoints[livePoints.length - 1].t : 0;
  const liveDistance = livePoints.length
    ? +livePoints.reduce((acc, p, i) => (i === 0 ? 0 : acc + ((livePoints[i - 1].v + p.v) / 2) * (p.t - livePoints[i - 1].t)), 0).toFixed(3)
    : 0;

  return (
    <div className="w-full min-h-screen" style={{ background: INK, fontFamily: "Calibri, Arial, sans-serif" }}>
      <div className="max-w-6xl mx-auto px-5 py-6">

        {/* ---------------- Top bar ---------------- */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: SIGNAL }}>
              <Activity size={18} color={INK} />
            </div>
            <div>
              <div className="font-bold text-lg tracking-tight" style={{ color: PAPER, fontFamily: "Cambria, Georgia, serif" }}>
                PhysioSense AI
              </div>
              <div className="text-[11px]" style={{ color: MUTED }}>
                โหมดสาธิต (Demo Mode) — จำลองข้อมูลจากเซนเซอร์เพื่อสาธิตการทำงานของแดชบอร์ด
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full p-1" style={{ background: PANEL2 }}>
            <button
              onClick={() => setView("student")}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors"
              style={{ background: view === "student" ? SIGNAL : "transparent", color: view === "student" ? INK : MUTED }}
            >
              <GraduationCap size={14} /> มุมมองนักเรียน
            </button>
            <button
              onClick={() => setView("teacher")}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors"
              style={{ background: view === "teacher" ? SIGNAL : "transparent", color: view === "teacher" ? INK : MUTED }}
            >
              <Users size={14} /> มุมมองครู
            </button>
          </div>
        </div>

        {view === "student" ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* ---------------- Main scope panel ---------------- */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${GRID_LINE}` }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: statusMeta.color, boxShadow: statusMeta.pulse ? `0 0 0 4px ${statusMeta.color}33` : "none" }}
                    />
                    <span className="text-xs font-semibold" style={{ color: statusMeta.color }}>{statusMeta.label}</span>
                  </div>
                  <span className="text-[11px] font-mono" style={{ color: MUTED }}>Velocity–Time Trace</span>
                </div>

                <div style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={livePoints} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke={GRID_LINE} strokeDasharray="3 5" />
                      <XAxis dataKey="t" stroke={MUTED} tick={{ fontSize: 10, fill: MUTED }} label={{ value: "t (s)", position: "insideBottomRight", offset: -2, fill: MUTED, fontSize: 10 }} />
                      <YAxis stroke={MUTED} tick={{ fontSize: 10, fill: MUTED }} label={{ value: "v (m/s)", angle: -90, position: "insideLeft", fill: MUTED, fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ background: PANEL2, border: `1px solid ${GRID_LINE}`, borderRadius: 8, fontSize: 11 }}
                        labelStyle={{ color: PAPER }}
                        itemStyle={{ color: SIGNAL }}
                      />
                      <Line type="monotone" dataKey="v" stroke={SIGNAL} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-4 gap-2.5 mt-3">
                  <StatBox icon={Gauge} label="ความเร็ว" value={liveVelocity.toFixed(2)} unit="m/s" accent={SIGNAL} />
                  <StatBox icon={Timer} label="เวลา" value={liveElapsed.toFixed(2)} unit="s" />
                  <StatBox icon={Ruler} label="ระยะทาง" value={liveDistance.toFixed(2)} unit="m" />
                  <StatBox
                    icon={TrendingUp}
                    label="ความแม่นยำ"
                    value={activeRun && status === "done" ? activeRun.accuracy : "--"}
                    unit="%"
                    accent={activeRun && status === "done" ? accuracyColor(activeRun.accuracy) : MUTED}
                  />
                </div>

                <div className="flex items-center gap-2.5 mt-4">
                  <button
                    onClick={startRun}
                    disabled={status === "running" || status === "analyzing"}
                    className="flex-1 rounded-xl py-3 flex items-center justify-center gap-2 font-bold text-sm transition-opacity disabled:opacity-40"
                    style={{ background: SIGNAL, color: INK }}
                  >
                    <Play size={16} fill={INK} /> เริ่มการทดลอง
                  </button>
                  <button
                    onClick={resetAll}
                    className="rounded-xl py-3 px-4 flex items-center justify-center gap-1.5 text-xs font-semibold"
                    style={{ background: PANEL2, color: MUTED, border: `1px solid ${GRID_LINE}` }}
                  >
                    <Trash2 size={14} /> ล้างข้อมูล
                  </button>
                </div>
              </div>

              {/* ---------------- AI console ---------------- */}
              <div className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${GRID_LINE}` }}>
                <div className="flex items-center gap-2 mb-3">
                  <Bot size={16} color={AMBER} />
                  <span className="text-xs font-semibold" style={{ color: PAPER }}>AI Physics Insight</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full ml-1" style={{ background: "rgba(255,180,84,0.12)", color: AMBER }}>LLM API</span>
                </div>
                <div className="rounded-xl p-3.5 min-h-24 font-mono text-xs leading-relaxed" style={{ background: "#0A0D1F", color: SIGNAL, border: `1px solid ${GRID_LINE}` }}>
                  {status === "analyzing" && (
                    <div className="flex items-center gap-2" style={{ color: AMBER }}>
                      <Loader2 size={14} className="animate-spin" /> กำลังส่งข้อมูลไปตีความผลการทดลอง...
                    </div>
                  )}
                  {status === "idle" && <span style={{ color: MUTED }}>&gt; รอผลการทดลอง... กด "เริ่มการทดลอง" เพื่อดู AI วิเคราะห์ผลแบบเรียลไทม์</span>}
                  {status === "running" && <span style={{ color: MUTED }}>&gt; กำลังเก็บข้อมูลจากเซนเซอร์...</span>}
                  {(status === "done") && <span>&gt; {aiDisplay}<span className="animate-pulse">{aiDisplay.length < (activeRun?.aiText.length || 0) ? "▌" : ""}</span></span>}
                </div>
              </div>
            </div>

            {/* ---------------- Sidebar: notebook + badges ---------------- */}
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${GRID_LINE}` }}>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={15} color={SIGNAL} />
                  <span className="text-xs font-semibold" style={{ color: PAPER }}>ความสำเร็จ</span>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {BADGES.map((b) => (
                    <Badge key={b.id} badge={b} unlocked={unlockedBadges.has(b.id)} justUnlocked={justUnlocked === b.id} />
                  ))}
                </div>
              </div>

              <div className="rounded-2xl p-4 flex-1" style={{ background: PANEL, border: `1px solid ${GRID_LINE}` }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Radio size={14} color={MUTED} />
                    <span className="text-xs font-semibold" style={{ color: PAPER }}>สมุดบันทึกแล็บ</span>
                  </div>
                  <span className="text-[10px] font-mono" style={{ color: MUTED }}>{history.length} ครั้ง</span>
                </div>

                <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                  {loadingHistory && <div className="text-xs" style={{ color: MUTED }}>กำลังโหลดข้อมูล...</div>}
                  {!loadingHistory && history.length === 0 && (
                    <div className="text-xs py-6 text-center" style={{ color: MUTED }}>
                      ยังไม่มีข้อมูลการทดลอง<br />กด "เริ่มการทดลอง" เพื่อบันทึกครั้งแรก
                    </div>
                  )}
                  {history.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => loadPastRun(r)}
                      className="text-left rounded-lg p-2.5 transition-colors"
                      style={{
                        background: activeRun?.id === r.id ? "rgba(0,217,192,0.08)" : PANEL2,
                        border: `1px solid ${activeRun?.id === r.id ? SIGNAL : GRID_LINE}`,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold" style={{ color: PAPER }}>การทดลอง #{r.runNo}</span>
                        <span className="text-[11px] font-mono font-bold" style={{ color: accuracyColor(r.accuracy) }}>{r.accuracy}%</span>
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                        v₀ {r.v0} m/s · a {r.aMeasured} m/s² · {r.distance} m
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ---------------- Teacher view ---------------- */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-2xl p-4 flex flex-col justify-between" style={{ background: PANEL, border: `1px solid ${GRID_LINE}` }}>
              <div className="flex items-center gap-2 mb-2">
                <Users size={15} color={SIGNAL} />
                <span className="text-xs font-semibold" style={{ color: PAPER }}>ค่าเฉลี่ยห้องเรียน</span>
              </div>
              <div className="font-mono font-bold text-4xl" style={{ color: SIGNAL }}>{classAvg}%</div>
              <div className="text-[11px] mt-1" style={{ color: MUTED }}>ความแม่นยำเฉลี่ยของนักเรียนทั้งหมด</div>
            </div>
            <div className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${GRID_LINE}` }}>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={15} color={AMBER} />
                <span className="text-xs font-semibold" style={{ color: PAPER }}>จำนวนการทดลองวันนี้</span>
              </div>
              <div className="font-mono font-bold text-4xl" style={{ color: AMBER }}>
                {leaderboard.reduce((a, r) => a + r.runs, 0)}
              </div>
              <div className="text-[11px] mt-1" style={{ color: MUTED }}>รวมทุกคนในห้อง</div>
            </div>
            <div className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${GRID_LINE}` }}>
              <div className="flex items-center gap-2 mb-2">
                <Award size={15} color={SIGNAL} />
                <span className="text-xs font-semibold" style={{ color: PAPER }}>ผู้นำอันดับ 1</span>
              </div>
              <div className="font-bold text-2xl" style={{ color: PAPER }}>{leaderboard[0]?.name || "-"}</div>
              <div className="text-[11px] mt-1" style={{ color: MUTED }}>{leaderboard[0]?.best}% ความแม่นยำสูงสุด</div>
            </div>

            <div className="lg:col-span-3 rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${GRID_LINE}` }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold" style={{ color: PAPER }}>อันดับความแม่นยำของนักเรียน</span>
                <span className="text-[10px]" style={{ color: MUTED }}>ตัวอย่างข้อมูลจำลอง เพื่อสาธิตมุมมองครู</span>
              </div>
              <div className="flex flex-col gap-2">
                {leaderboard.map((r, i) => (
                  <div
                    key={r.name}
                    className="flex items-center gap-3 rounded-lg p-2.5"
                    style={{ background: r.isMe ? "rgba(0,217,192,0.08)" : PANEL2, border: `1px solid ${r.isMe ? SIGNAL : GRID_LINE}` }}
                  >
                    <span className="w-5 text-center font-mono text-xs font-bold" style={{ color: MUTED }}>{i + 1}</span>
                    <span className="text-sm font-semibold flex-1" style={{ color: PAPER }}>{r.name}{r.isMe ? " (คุณ)" : ""}</span>
                    <span className="text-[11px] font-mono" style={{ color: MUTED }}>{r.runs} ครั้ง</span>
                    <div className="w-40 h-2 rounded-full overflow-hidden" style={{ background: "#0A0D1F" }}>
                      <div className="h-full rounded-full" style={{ width: `${r.best}%`, background: accuracyColor(r.best) }} />
                    </div>
                    <span className="w-14 text-right font-mono text-xs font-bold" style={{ color: accuracyColor(r.best) }}>{r.best}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="text-center text-[10.5px] mt-6" style={{ color: MUTED }}>
          PhysioSense AI · SBW HACKATHON 2026 · ข้อมูลในโหมดสาธิตนี้จำลองขึ้นเพื่อสาธิต UX — ยังไม่เชื่อมต่อฮาร์ดแวร์จริง
        </div>
      </div>
    </div>
  );
}
