"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Mail, Stethoscope, ArrowRight } from "lucide-react";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") || "http://localhost:4000";

export default function DoctorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"doctor" | "patient">("doctor");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (document.cookie.includes("medai_auth=1")) {
      const storedRole = localStorage.getItem("medai_role");
      router.replace(storedRole === "patient" ? "/patient-portal" : "/dashboard");
    }
  }, [router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Login failed");
      const assignedRole = data.role || data.user?.role || role;
      localStorage.setItem("medai_user", JSON.stringify(data.user));
      localStorage.setItem("medai_role", assignedRole);
      document.cookie = "medai_auth=1; path=/; max-age=2592000; samesite=lax";
      
      if (assignedRole === "patient") {
        router.push("/patient-portal");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Serif:ital,wght@0,400;0,500;1,400&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .lr {
          font-family: 'IBM Plex Sans', sans-serif;
          min-height: 100vh;
          background: #f8fafc;
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          overflow: hidden;
        }

        @media (max-width: 860px) {
          .lr { grid-template-columns: 1fr; }
          .lr-left { display: none; }
        }

        /* ═══ LEFT PANEL — soft dark ═════════════════════════════ */
        .lr-left {
          background: #0f172a;
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 44px 52px 48px;
          overflow: hidden;
        }
        /* fine grid */
        .lr-left::before {
          content: '';
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 44px 44px;
          pointer-events: none;
        }
        .glow1 {
          position: absolute; top: -140px; left: -100px;
          width: 520px; height: 520px; border-radius: 50%;
          background: radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 65%);
          pointer-events: none;
        }
        .glow2 {
          position: absolute; bottom: -80px; right: -60px;
          width: 300px; height: 300px; border-radius: 50%;
          background: radial-gradient(circle, rgba(20,184,166,0.07) 0%, transparent 65%);
          pointer-events: none;
        }

        .lr-logo {
          display: inline-flex; align-items: center; gap: 11px;
          position: relative; z-index: 2;
        }
        .lr-logo-box {
          width: 42px; height: 42px; border-radius: 11px;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.1);
          display: flex; align-items: center; justify-content: center;
        }

        .lr-copy { position: relative; z-index: 2; }

        /* ── Heartbeat ── */
        .hb-wrap { position: relative; margin-bottom: 46px; }
        .hb-svg { width: 100%; height: 68px; overflow: visible; display: block; }

        .hb-track {
          fill: none; stroke: rgba(255,255,255,0.05); stroke-width: 1.5;
        }
        .hb-glow-path {
          fill: none; stroke-width: 8; stroke-linecap: round; stroke-linejoin: round;
          stroke-dasharray: 900; stroke-dashoffset: 900;
          opacity: 0;
          animation: hbDraw 2.6s cubic-bezier(0.4,0,0.2,1) forwards 0.3s,
                     hbGlowLoop 3.6s ease-in-out infinite 2.9s;
          filter: blur(3px);
        }
        .hb-main-path {
          fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
          stroke-dasharray: 900; stroke-dashoffset: 900;
          animation: hbDraw 2.6s cubic-bezier(0.4,0,0.2,1) forwards 0.3s,
                     hbLoop  3.6s ease-in-out infinite 2.9s;
        }
        .hb-rider {
          opacity: 0;
          filter: drop-shadow(0 0 5px rgba(226,232,240,0.9));
          animation: riderShow 0.2s ease forwards 2.8s,
                     riderBeat 3.6s ease-in-out infinite 2.9s;
        }
        .hb-ml { position: absolute; top: 0; left: 0; width: 60px; height: 100%; background: linear-gradient(90deg,#0f172a 30%,transparent); pointer-events: none; z-index: 3; }
        .hb-mr { position: absolute; top: 0; right: 0; width: 60px; height: 100%; background: linear-gradient(-90deg,#0f172a 30%,transparent); pointer-events: none; z-index: 3; }

        .hb-live { display: flex; align-items: center; gap: 7px; margin-top: 10px; }
        .hb-live-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #4ade80; box-shadow: 0 0 8px rgba(74,222,128,0.7);
          animation: livePulse 2s ease-in-out infinite;
        }

        @keyframes hbDraw    { to { stroke-dashoffset: 0; } }
        @keyframes hbLoop    { 0%,100%{stroke:rgba(148,163,184,0.7)} 50%{stroke:rgba(226,232,240,0.95)} }
        @keyframes hbGlowLoop{ 0%,100%{opacity:0.1} 50%{opacity:0.22} }
        @keyframes riderShow { to { opacity: 1; } }
        @keyframes riderBeat { 0%,100%{r:3.5;opacity:0.8} 50%{r:5.5;opacity:1} }
        @keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:0.25} }

        /* ═══ RIGHT PANEL — bright white ════════════════════════ */
        .lr-right {
          background: #ffffff;
          display: flex; align-items: center; justify-content: center;
          padding: 48px 40px;
          position: relative;
          border-left: 1px solid #e2e8f0;
        }

        /* Decorative corner accent */
        .lr-right::after {
          content: '';
          position: absolute; top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, transparent 0%, #e2e8f0 40%, #cbd5e1 60%, transparent 100%);
        }

        .lr-form-wrap {
          width: 100%; max-width: 380px;
          animation: fadeUp 0.5s ease forwards;
        }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }

        /* System badge */
        .lr-badge {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 5px 13px; border-radius: 20px;
          background: #f8fafc; border: 1px solid #e2e8f0;
          font-size: 11.5px; font-weight: 600; color: #64748b;
          margin-bottom: 28px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .lr-badge-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #10b981; box-shadow: 0 0 6px rgba(16,185,129,0.5);
          animation: livePulse 2s ease-in-out infinite;
        }

        /* Title */
        .lr-title {
          font-family: 'IBM Plex Serif', serif;
          font-size: 33px; font-weight: 500;
          color: #0f172a;
          letter-spacing: -0.025em; line-height: 1.18;
          margin-bottom: 8px;
        }
        .lr-sub { font-size: 14px; color: #94a3b8; margin-bottom: 36px; line-height: 1.65; }

        /* Field */
        .lr-field { margin-bottom: 15px; }
        .lr-field-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .lr-label { font-size: 11.5px; font-weight: 600; color: #64748b; letter-spacing: 0.05em; text-transform: uppercase; }

        .lr-input-wrap {
          display: flex; align-items: center; gap: 10px;
          padding: 11px 14px; border-radius: 10px;
          border: 1.5px solid #e2e8f0;
          background: #f8fafc;
          transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
        }
        .lr-input-wrap.focus {
          border-color: #94a3b8;
          background: #ffffff;
          box-shadow: 0 0 0 4px rgba(148,163,184,0.1);
        }
        .lr-icon { color: #cbd5e1; flex-shrink: 0; transition: color 0.18s; }
        .lr-input-wrap.focus .lr-icon { color: #94a3b8; }
        .lr-input {
          flex: 1; border: none; outline: none; background: transparent;
          font-size: 14px; color: #0f172a;
          font-family: 'IBM Plex Sans', sans-serif;
        }
        .lr-input::placeholder { color: #cbd5e1; }

        /* Submit */
        .lr-submit {
          width: 100%; padding: 13px 20px; margin-top: 26px;
          border-radius: 10px; border: none;
          background: #0f172a; color: #f8fafc;
          font-size: 14px; font-weight: 600;
          font-family: 'IBM Plex Sans', sans-serif;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: all 0.2s; letter-spacing: 0.01em;
          box-shadow: 0 2px 12px rgba(15,23,42,0.18);
        }
        .lr-submit:hover:not(:disabled) {
          background: #1e293b;
          box-shadow: 0 6px 20px rgba(15,23,42,0.25);
          transform: translateY(-1px);
        }
        .lr-submit:active:not(:disabled) { transform: translateY(0); }
        .lr-submit:disabled { opacity: 0.45; cursor: not-allowed; }

        /* Loading dots */
        .ld { width: 5px; height: 5px; border-radius: 50%; background: #64748b; display: inline-block; animation: ldB 1.2s ease-in-out infinite; }
        .ld:nth-child(2){animation-delay:0.18s} .ld:nth-child(3){animation-delay:0.36s}
        @keyframes ldB { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }

        /* Error */
        .lr-error { font-size: 13px; color: #dc2626; margin-top: 14px; padding: 10px 14px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca; }

        /* Divider + register */
        .lr-sep { display: flex; align-items: center; gap: 12px; margin: 28px 0 14px; }
        .lr-sep::before,.lr-sep::after { content:''; flex:1; height:1px; background:#f1f5f9; }
        .lr-sep span { font-size: 12px; color: #cbd5e1; white-space: nowrap; }

        .lr-reg {
          display: block; text-align: center; padding: 11px;
          border-radius: 10px; border: 1.5px solid #e2e8f0;
          background: transparent;
          font-size: 13.5px; font-weight: 500; color: #475569;
          text-decoration: none; transition: all 0.15s;
        }
        .lr-reg:hover { border-color: #cbd5e1; background: #f8fafc; color: #0f172a; }

        /* Footer */
        .lr-footer { margin-top: 32px; padding-top: 22px; border-top: 1px solid #f1f5f9; display: flex; align-items: center; gap: 8px; }
      `}</style>

      <div className="lr">

        {/* ══ LEFT — dark branding ══════════════════════════════════ */}
        <div className="lr-left">
          <div className="glow1" /><div className="glow2" />

          {/* Logo */}
          <div className="lr-logo">
<div className="lr-logo-box flex items-center justify-center">
  <img
    src="/app_logo.png"
    alt="MedAI Logo"
    className="w-[48px] h-[48px] object-contain"
  />
</div>
            <div>
              <p style={{ fontFamily: "'IBM Plex Serif',serif", fontSize: 15, color: "#e2e8f0", fontWeight: 500 }}>ClinSight AI Pro</p>
              <p style={{ fontSize: 11, color: "#334155", marginTop: 1 }}>Doctor Console</p>
            </div>
          </div>

          {/* Copy */}
          <div className="lr-copy">
            <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#334155", marginBottom: 18 }}>
              Intelligent Clinical AI
            </p>
            <h2 style={{ fontFamily: "'IBM Plex Serif',serif", fontSize: 36, fontWeight: 500, color: "#f1f5f9", lineHeight: 1.22, marginBottom: 16, letterSpacing: "-0.02em", maxWidth: 360 }}>
              Smarter decisions,<br />better patient care.
            </h2>
            <p style={{ fontSize: 14, color: "#334155", lineHeight: 1.78, maxWidth: 360, marginBottom: 50 }}>
              RAG-powered insights, real-time alerts, and AI-assisted clinical briefs — all in one secure console.
            </p>

            {/* ── Heartbeat ── */}
            <div className="hb-wrap">
              <div style={{ position: "relative" }}>
                <div className="hb-ml" /><div className="hb-mr" />
                <svg className="hb-svg" viewBox="0 0 560 68" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <linearGradient id="hbG" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%"   stopColor="rgba(148,163,184,0)" />
                      <stop offset="12%"  stopColor="rgba(148,163,184,0.85)" />
                      <stop offset="88%"  stopColor="rgba(148,163,184,0.85)" />
                      <stop offset="100%" stopColor="rgba(148,163,184,0)" />
                    </linearGradient>
                    <linearGradient id="hbGG" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%"   stopColor="rgba(226,232,240,0)" />
                      <stop offset="12%"  stopColor="rgba(226,232,240,1)" />
                      <stop offset="88%"  stopColor="rgba(226,232,240,1)" />
                      <stop offset="100%" stopColor="rgba(226,232,240,0)" />
                    </linearGradient>
                  </defs>

                  {/* static baseline */}
                  <line x1="0" y1="34" x2="560" y2="34" className="hb-track" />

                  {/* ECG path — 3 beats */}
                  {/* glow layer */}
                  <path className="hb-glow-path" stroke="url(#hbGG)"
                    d="M0,34 L85,34 L100,34 L110,6 L118,62 L126,12 L134,54 L142,34 L210,34
                       L225,34 L235,6 L243,62 L251,12 L259,54 L267,34 L340,34
                       L355,34 L365,6 L373,62 L381,12 L389,54 L397,34 L560,34" />

                  {/* main line */}
                  <path className="hb-main-path" stroke="url(#hbG)"
                    d="M0,34 L85,34 L100,34 L110,6 L118,62 L126,12 L134,54 L142,34 L210,34
                       L225,34 L235,6 L243,62 L251,12 L259,54 L267,34 L340,34
                       L355,34 L365,6 L373,62 L381,12 L389,54 L397,34 L560,34" />

                  {/* rider dot at last peak */}
                  <circle className="hb-rider" cx="397" cy="34" r="4" fill="white" />
                </svg>
              </div>

              <div className="hb-live">
                <div className="hb-live-dot" />
                <span style={{ fontSize: 11.5, color: "#334155", fontWeight: 500 }}>Live vitals monitoring active</span>
              </div>
            </div>

            {/* Feature chips */}
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {["AI Clinical Briefs", "Drug Interaction AI", "RAG Summaries", "Live Alerts"].map((f) => (
                <span key={f} style={{ fontSize: 11.5, fontWeight: 500, padding: "5px 12px", borderRadius: 20, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", color: "#475569" }}>{f}</span>
              ))}
            </div>
          </div>
        </div>

        {/* ══ RIGHT — bright white form ═════════════════════════════ */}
        <div className="lr-right">
          <div className="lr-form-wrap">

            <div className="lr-badge">
              <div className="lr-badge-dot" />
              All systems operational
            </div>

            <h1 className="lr-title">Welcome back,<br />{role === "doctor" ? "Doctor." : "Patient."}</h1>
            <p className="lr-sub">
              {role === "doctor"
                ? "Sign in to access your patient dashboard and clinical insights."
                : "Sign in to access your health portal, lab reports, and AI assistant."}
            </p>

            <form onSubmit={onSubmit}>
              {/* Role Selector Toggle */}
              <div style={{ display: "flex", gap: 10, marginBottom: 20, padding: 4, backgroundColor: "#f1f5f9", borderRadius: 10 }}>
                <button
                  type="button"
                  onClick={() => setRole("doctor")}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    backgroundColor: role === "doctor" ? "#ffffff" : "transparent",
                    color: role === "doctor" ? "#0f172a" : "#64748b",
                    boxShadow: role === "doctor" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  👨‍⚕️ Doctor Login
                </button>
                <button
                  type="button"
                  onClick={() => setRole("patient")}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    backgroundColor: role === "patient" ? "#ffffff" : "transparent",
                    color: role === "patient" ? "#0f172a" : "#64748b",
                    boxShadow: role === "patient" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  👤 Patient Login
                </button>
              </div>

              {/* Email */}
              <div className="lr-field">
                <div className="lr-field-top">
                  <span className="lr-label">Email address</span>
                </div>
                <div className={`lr-input-wrap ${focused === "email" ? "focus" : ""}`}>
                  <Mail className="lr-icon" style={{ width: 15, height: 15 }} />
                  <input className="lr-input" type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocused("email")}
                    onBlur={() => setFocused(null)}
                    placeholder={role === "doctor" ? "nandakumar@kathir.in" : "rajan@patient.in"} />
                </div>
              </div>

              {/* Password */}
              <div className="lr-field">
                <div className="lr-field-top">
                  <span className="lr-label">Password</span>
                  <Link href="/auth/forgot-password" style={{ fontSize: 12, color: "#94a3b8", textDecoration: "none", fontWeight: 500 }}>
                    Forgot password?
                  </Link>
                </div>
                <div className={`lr-input-wrap ${focused === "password" ? "focus" : ""}`}>
                  <Lock className="lr-icon" style={{ width: 15, height: 15 }} />
                  <input className="lr-input" type="password" required value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocused("password")}
                    onBlur={() => setFocused(null)}
                    placeholder="••••••••" />
                </div>
              </div>

              <button className="lr-submit" type="submit" disabled={loading}>
                {loading
                  ? <><span className="ld" /><span className="ld" /><span className="ld" /></>
                  : <>Sign In <ArrowRight style={{ width: 15, height: 15 }} /></>
                }
              </button>

              {error && <div className="lr-error">{error}</div>}
            </form>

            <div className="lr-sep"><span>New to MedAI Pro?</span></div>
            <Link href={`/register?role=${role}`} className="lr-reg">Create a {role} account</Link>

            <div className="lr-footer">
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#e2e8f0", display: "inline-block", flexShrink: 0 }} />
              <p style={{ fontSize: 11.5, color: "#cbd5e1" }}>Kathir Memorial Hospital · Vengavasal, Tamil Nadu</p>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}