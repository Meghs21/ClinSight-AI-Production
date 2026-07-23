"use client";

import { useState, useEffect, FormEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Upload,
  FileText,
  Pill,
  AlertTriangle,
  Send,
  LogOut,
  UserCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  TrendingUp,
} from "lucide-react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") || "http://localhost:4000";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  patient_id?: string;
}

export default function PatientPortalPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [patientId, setPatientId] = useState("P001");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadData, setUploadData] = useState<any>(null);

  // AI Assistant Chat state
  const [chatQuery, setChatQuery] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{ role: string; text: string }>>([
    {
      role: "assistant",
      text: "Hello Rajan! I am your ClinSight Personal Health Assistant. You can ask me questions about your lab results, prescriptions, or past visits.",
    },
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedUserStr = localStorage.getItem("medai_user");
    if (storedUserStr) {
      try {
        const u = JSON.parse(storedUserStr);
        setUser(u);
        if (u.patient_id) setPatientId(u.patient_id);
      } catch {
        setUser({ id: "P001", name: "Rajan Subramaniam", email: "rajan@patient.in", role: "patient", patient_id: "P001" });
      }
    } else {
      setUser({ id: "P001", name: "Rajan Subramaniam", email: "rajan@patient.in", role: "patient", patient_id: "P001" });
    }
  }, []);

  const handleLogout = () => {
    document.cookie = "medai_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    localStorage.removeItem("medai_user");
    localStorage.removeItem("medai_role");
    router.replace("/auth/login");
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUploadStatus(null);
    }
  };

  const handleUploadSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setUploadStatus("Please select a document or lab report image to upload.");
      return;
    }

    setUploading(true);
    setUploadStatus("Scanning and digitizing report via OCR Agent...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("patientId", patientId);

      const res = await fetch(`${BACKEND_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setUploadData(data);
      setUploadStatus("✅ Document successfully digitized and added to your health record!");
      setFile(null);
    } catch (err: any) {
      setUploadStatus(`❌ Upload Error: ${err.message || "Failed to process file"}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSendChat = async (e: FormEvent) => {
    e.preventDefault();
    if (!chatQuery.trim()) return;

    const q = chatQuery;
    setChatQuery("");
    setChatHistory((prev) => [...prev, { role: "user", text: q }]);
    setChatLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/agent/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, patientId }),
      });

      const data = await res.json();
      const ans = data.response || data.answer || "Recorded in your health record.";
      const text = typeof ans === "string" ? ans : Array.isArray(ans) ? ans.join("\n") : JSON.stringify(ans);

      setChatHistory((prev) => [...prev, { role: "assistant", text }]);
    } catch (err: any) {
      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", text: "Unable to process query at the moment. Your lab data remains safe." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f8fafc", fontFamily: "'Inter', sans-serif" }}>
      {/* Header Bar */}
      <header
        style={{
          backgroundColor: "#0f172a",
          color: "#ffffff",
          padding: "16px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Activity style={{ color: "#ffffff", width: 22, height: 22 }} />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: "-0.5px" }}>ClinSight Patient Portal</h1>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>Kathir Memorial Hospital Personal Health Vault</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{user?.name || "Rajan Subramaniam"}</div>
            <div style={{ fontSize: 11, color: "#38bdf8" }}>Patient ID: {patientId}</div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              backgroundColor: "#1e293b",
              color: "#94a3b8",
              border: "1px solid #334155",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
            }}
          >
            <LogOut style={{ width: 14, height: 14 }} /> Sign Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: 1200, margin: "32px auto", padding: "0 24px" }}>
        {/* Patient Health Overview Stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 20,
            marginBottom: 32,
          }}
        >
          <div style={{ backgroundColor: "#ffffff", padding: 20, borderRadius: 14, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>Active Medications</span>
              <Pill style={{ color: "#2563eb", width: 20, height: 20 }} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: "#0f172a" }}>3 Drugs</div>
            <div style={{ fontSize: 12, color: "#16a34a", marginTop: 4 }}>Metformin, Amlodipine, Simvastatin</div>
          </div>

          <div style={{ backgroundColor: "#ffffff", padding: 20, borderRadius: 14, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>Latest HbA1c Status</span>
              <TrendingUp style={{ color: "#dc2626", width: 20, height: 20 }} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: "#dc2626" }}>9.4%</div>
            <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>WORSENING — Physician Review Needed</div>
          </div>

          <div style={{ backgroundColor: "#ffffff", padding: 20, borderRadius: 14, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>Documented Allergies</span>
              <AlertTriangle style={{ color: "#d97706", width: 20, height: 20 }} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: "#d97706" }}>1 Listed</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Amoxicillin (Skin Rash)</div>
          </div>

          <div style={{ backgroundColor: "#ffffff", padding: 20, borderRadius: 14, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>Primary Doctor</span>
              <UserCheck style={{ color: "#059669", width: 20, height: 20 }} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8, color: "#0f172a" }}>Dr. Nandakumar</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>General Medicine & Diabetology</div>
          </div>
        </div>

        {/* Grid Layout: Left Column Upload & Records | Right Column AI Assistant */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 32 }}>
          {/* Left Column */}
          <div>
            {/* Upload Medical Document Card */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 16,
                padding: 28,
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                marginBottom: 32,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <Upload style={{ color: "#2563eb", width: 22, height: 22 }} />
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: 0 }}>
                  Upload Paper Prescription or Lab Report
                </h2>
              </div>
              <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20, lineHeight: "1.5" }}>
                Upload handwritten doctor notes, scanned PDFs, or image slips. Our OCR AI agent automatically extracts your lab
                numbers and updates your health record.
              </p>

              <form onSubmit={handleUploadSubmit}>
                <div
                  style={{
                    border: "2px dashed #cbd5e1",
                    borderRadius: 12,
                    padding: 32,
                    textAlign: "center",
                    backgroundColor: "#f8fafc",
                    cursor: "pointer",
                    marginBottom: 20,
                  }}
                >
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.txt"
                    onChange={handleFileChange}
                    style={{ display: "none" }}
                    id="file-upload-input"
                  />
                  <label htmlFor="file-upload-input" style={{ cursor: "pointer" }}>
                    <FileText style={{ width: 36, height: 36, color: "#94a3b8", marginBottom: 8 }} />
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>
                      {file ? file.name : "Click to select or drag medical document here"}
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                      Supports PDF, PNG, JPG, JPEG (Max 10MB)
                    </div>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={uploading || !file}
                  style={{
                    width: "100%",
                    backgroundColor: uploading || !file ? "#94a3b8" : "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 10,
                    padding: "14px",
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: uploading || !file ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  {uploading ? "Scanning & Digitsing with OCR..." : "Upload & Analyze Report"}
                </button>
              </form>

              {uploadStatus && (
                <div
                  style={{
                    marginTop: 16,
                    padding: 14,
                    borderRadius: 10,
                    fontSize: 13,
                    backgroundColor: uploadStatus.includes("✅") ? "#f0fdf4" : "#fef2f2",
                    color: uploadStatus.includes("✅") ? "#15803d" : "#b91c1c",
                    border: `1px solid ${uploadStatus.includes("✅") ? "#bbf7d0" : "#fecaca"}`,
                  }}
                >
                  {uploadStatus}
                </div>
              )}

              {uploadData && uploadData.ocr?.structured && (
                <div
                  style={{
                    marginTop: 20,
                    padding: 16,
                    backgroundColor: "#f1f5f9",
                    borderRadius: 12,
                    fontSize: 13,
                    border: "1px solid #cbd5e1",
                  }}
                >
                  <h4 style={{ fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>Extracted OCR Insights:</h4>
                  <p style={{ margin: "4px 0" }}>
                    <strong>Extracted Symptoms:</strong> {(uploadData.ocr.structured.symptoms || []).join(", ") || "None"}
                  </p>
                  <p style={{ margin: "4px 0" }}>
                    <strong>Extracted Meds:</strong> {(uploadData.ocr.structured.medications || []).join(", ") || "None"}
                  </p>
                  <p style={{ margin: "4px 0" }}>
                    <strong>OCR Confidence:</strong> {Math.round((uploadData.ocr.confidence || 0.95) * 100)}%
                  </p>
                </div>
              )}
            </div>

            {/* Past Visit Summaries Card */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 16,
                padding: 28,
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>
                Recent Hospital Consultations
              </h3>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ padding: 16, border: "1px solid #e2e8f0", borderRadius: 12, backgroundColor: "#fafafa" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                    <span>Dr. Jenson Isaac (General Medicine)</span>
                    <span style={{ color: "#64748b" }}>08 Feb 2026</span>
                  </div>
                  <p style={{ fontSize: 13, color: "#475569", marginTop: 8, margin: 0 }}>
                    HbA1c noted at 9.4% (critical). Increased Metformin to 1000mg twice daily. Advised diabetic diet restrict
                    refined carbs.
                  </p>
                </div>

                <div style={{ padding: 16, border: "1px solid #e2e8f0", borderRadius: 12, backgroundColor: "#fafafa" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                    <span>Dr. Nandakumar (Diabetology)</span>
                    <span style={{ color: "#64748b" }}>10 Feb 2025</span>
                  </div>
                  <p style={{ fontSize: 13, color: "#475569", marginTop: 8, margin: 0 }}>
                    Initial evaluation for polyuria and fatigue. Started Metformin 500mg and Amlodipine 5mg for BP monitoring.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Personal AI Health Assistant */}
          <div>
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 16,
                padding: 24,
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                display: "flex",
                flexDirection: "column",
                height: "640px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #e2e8f0" }}>
                <Sparkles style={{ color: "#2563eb", width: 22, height: 22 }} />
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>Personal AI Health Assistant</h3>
                  <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>Ask anything about your reports & labs</p>
                </div>
              </div>

              {/* Chat Messages Stream */}
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingRight: 4 }}>
                {chatHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "85%",
                      backgroundColor: msg.role === "user" ? "#2563eb" : "#f1f5f9",
                      color: msg.role === "user" ? "#ffffff" : "#1e293b",
                      padding: "12px 16px",
                      borderRadius: 14,
                      fontSize: 13,
                      lineHeight: "1.5",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {msg.text}
                  </div>
                ))}
                {chatLoading && (
                  <div style={{ alignSelf: "flex-start", backgroundColor: "#f1f5f9", padding: "10px 14px", borderRadius: 12, fontSize: 12, color: "#64748b" }}>
                    Analyzing lab records...
                  </div>
                )}
              </div>

              {/* Chat Input Bar */}
              <form onSubmit={handleSendChat} style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <input
                  type="text"
                  placeholder="Ask about your lab trends or drugs..."
                  value={chatQuery}
                  onChange={(e) => setChatQuery(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: "1px solid #cbd5e1",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  disabled={chatLoading}
                  style={{
                    backgroundColor: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 10,
                    padding: "0 16px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Send style={{ width: 16, height: 16 }} />
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
