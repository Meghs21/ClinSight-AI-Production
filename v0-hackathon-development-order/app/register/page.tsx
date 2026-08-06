"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BriefcaseMedical, Lock, Mail, Phone, Stethoscope, User, UserCog } from "lucide-react";
import { DM_Sans, Syne } from "next/font/google";

const dmSans = DM_Sans({ subsets: ["latin"] });
const syne = Syne({ subsets: ["latin"], weight: ["600", "700"] });

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") || "http://localhost:4000";

type Role = "doctor" | "patient" | "admin";

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("doctor");
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const roleParam = urlParams.get("role") as Role;
    if (roleParam && ["doctor", "patient", "admin"].includes(roleParam)) {
      setRole(roleParam);
    }
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setShake(true);
      setTimeout(() => setShake(false), 350);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          name,
          email,
          password,
          specialty,
          department: specialty,
          phone,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Registration failed");
      }

      localStorage.setItem("medai_user", JSON.stringify(data.user));
      localStorage.setItem("medai_role", role);
      document.cookie = "medai_auth=1; path=/; max-age=2592000; samesite=lax";
      
      if (role === "patient") {
        router.push("/patient-portal");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setShake(true);
      setTimeout(() => setShake(false), 350);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`${dmSans.className} min-h-screen overflow-hidden`} style={{ background: "#040d1a" }}>
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <div className="absolute inset-0 [background:radial-gradient(circle_at_35%_18%,rgba(0,180,216,0.2),transparent_38%),radial-gradient(circle_at_78%_8%,rgba(0,119,182,0.18),transparent_30%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(226,232,240,0.08)_1px,transparent_1px)] [background-size:20px_20px]" />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8 sm:px-8">
        <div
          className={`w-full max-w-5xl rounded-3xl border p-6 shadow-2xl backdrop-blur-2xl transition-all sm:p-8 ${shake ? "translate-x-1" : ""}`}
          style={{ background: "rgba(10,22,40,0.85)", borderColor: "rgba(0,180,216,0.2)", boxShadow: "0 0 40px rgba(0,180,216,0.12)" }}
        >
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className={`${syne.className} text-3xl`} style={{ color: "#e2e8f0" }}>
                Create Your Account
              </p>
              <p className="mt-1 text-sm" style={{ color: "#4a6fa5" }}>
                MedAI Pro access for secure clinical workflows.
              </p>
            </div>
            <div className="inline-flex items-center gap-3 rounded-2xl border px-4 py-2" style={{ borderColor: "#1a2d4a", background: "rgba(6,16,32,0.8)" }}>
              <div className="rounded-xl p-2" style={{ background: "linear-gradient(135deg,#00b4d8,#0077b6)" }}>
                <Stethoscope className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className={`${syne.className} text-base`} style={{ color: "#e2e8f0" }}>MedAI Pro</p>
                <p className="text-xs" style={{ color: "#4a6fa5" }}>Register</p>
              </div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-3 gap-2 rounded-xl p-1" style={{ background: "#061020", border: "1px solid #1a2d4a" }}>
            {(["doctor", "patient", "admin"] as Role[]).map((r) => {
              const selected = role === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className="rounded-lg px-3 py-2 text-sm font-medium capitalize transition-all"
                  style={selected ? { background: "linear-gradient(135deg,#00b4d8,#0077b6)", color: "#e2e8f0", boxShadow: "0 0 16px rgba(0,180,216,0.35)" } : { color: "#4a6fa5" }}
                >
                  {r === "doctor" ? "👨‍⚕️ Doctor" : r === "patient" ? "👤 Patient" : "⚙️ Admin"}
                </button>
              );
            })}
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="Full Name"
                icon={<User className="h-4 w-4" style={{ color: "#4a6fa5" }} />}
                value={name}
                onChange={setName}
                placeholder="Dr. Nandakumar"
                required
              />
              <Field
                label="Specialty / Department"
                icon={<BriefcaseMedical className="h-4 w-4" style={{ color: "#4a6fa5" }} />}
                value={specialty}
                onChange={setSpecialty}
                placeholder="Diabetology"
                required={role === "doctor"}
              />
              <Field
                label="Email"
                icon={<Mail className="h-4 w-4" style={{ color: "#4a6fa5" }} />}
                value={email}
                onChange={setEmail}
                placeholder="doctor@medai.com"
                type="email"
                required
              />
              <Field
                label="Phone"
                icon={<Phone className="h-4 w-4" style={{ color: "#4a6fa5" }} />}
                value={phone}
                onChange={setPhone}
                placeholder="+91-9000000000"
              />
              <Field
                label="Password"
                icon={<Lock className="h-4 w-4" style={{ color: "#4a6fa5" }} />}
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                type="password"
                required
              />
              <Field
                label="Confirm Password"
                icon={<UserCog className="h-4 w-4" style={{ color: "#4a6fa5" }} />}
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="••••••••"
                type="password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl px-4 py-3 text-sm font-semibold text-[#e2e8f0] transition hover:-translate-y-0.5 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#00b4d8,#0077b6)", boxShadow: "0 0 22px rgba(0,180,216,0.35)" }}
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>

            {error && <p className="text-center text-sm text-[#ef4444]">{error}</p>}
          </form>

          <p className="mt-5 text-center text-sm" style={{ color: "#4a6fa5" }}>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-[#00b4d8] hover:underline">
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

type FieldProps = {
  label: string;
  icon: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
};

function Field({
  label,
  icon,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs" style={{ color: "#4a6fa5" }}>{label}</span>
      <div className="flex items-center gap-2 rounded-xl border px-3 py-3" style={{ borderColor: "#1a2d4a", background: "#061020" }}>
        {icon}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={type}
          required={required}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-[#e2e8f0] outline-none placeholder:text-[#4a6fa5]"
        />
      </div>
    </label>
  );
}
