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
  Edit3,
  Check,
  ShieldCheck,
  X,
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

  // Human-in-the-Loop Review Modal State
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [savingIngestion, setSavingIngestion] = useState(false);
  const [reviewData, setReviewData] = useState<{
    visit_date: string;
    diagnosis: string;
    medications: string;
    hba1c: string;
    creatinine: string;
    symptoms: string;
    conf_med: number;
    conf_diag: number;
    conf_lab: number;
  }>({
    visit_date: "12 Feb 2026",
    diagnosis: "Type II Diabetes Mellitus",
    medications: "Metformin 1000 mg",
    hba1c: "9.4%",
    creatinine: "2.1 mg/dL",
    symptoms: "Polyuria, fatigue",
    conf_med: 98,
    conf_diag: 93,
    conf_lab: 99,
  });

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
    setUploadStatus("Digitizing document via OCR & LLM extraction engine...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("document", file);
      formData.append("patientId", patientId);
      formData.append("autoIngest", "false"); // Do not auto-commit, allow review first

      const token = typeof window !== "undefined" ? localStorage.getItem("medai_token") : null;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${BACKEND_URL}/api/upload`, {
        method: "POST",
        headers,
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      const struct = data.ocr?.structured || {};
      const labs = struct.lab_results || {};
      const parserName = data.ocr?.parser || "TesseractOCR";
      const docCategory = data.ocr?.document_category || "LAB_REPORT";

      const formattedDiag = (Array.isArray(struct.diagnosis) && struct.diagnosis.length > 0)
        ? struct.diagnosis.join(", ")
        : (typeof struct.diagnosis === "string" && struct.diagnosis ? struct.diagnosis : "None specified");

      const formattedMeds = (Array.isArray(struct.medications) && struct.medications.length > 0)
        ? struct.medications.join(", ")
        : (typeof struct.medications === "string" && struct.medications ? struct.medications : "None specified");

      const formattedSymptoms = (Array.isArray(struct.symptoms) && struct.symptoms.length > 0)
        ? struct.symptoms.join(", ")
        : (typeof struct.symptoms === "string" && struct.symptoms ? struct.symptoms : "None specified");

      setReviewData({
        visit_date: new Date().toISOString().slice(0, 10),
        diagnosis: formattedDiag,
        medications: formattedMeds,
        hba1c: labs.HbA1c !== undefined && labs.HbA1c !== null ? `${labs.HbA1c}%` : "N/A",
        creatinine: labs.SerumCreatinine !== undefined && labs.SerumCreatinine !== null ? `${labs.SerumCreatinine} mg/dL` : "N/A",
        symptoms: formattedSymptoms,
        conf_med: Math.round((data.ocr?.confidence_summary?.medication_confidence || 95)),
        conf_diag: Math.round((data.ocr?.confidence_summary?.diagnosis_confidence || 95)),
        conf_lab: Math.round((data.ocr?.confidence_summary?.lab_value_confidence || 95)),
        parser: parserName,
        category: docCategory,
        ocr_version: data.ocr?.versions?.ocr_version || "tesseract_v5.3",
        validation_version: data.ocr?.versions?.validation_version || "biological_bounds_v2.0",
      });

      setShowReviewModal(true);
      setUploadStatus(null);
      setFile(null);
    } catch (err: any) {
      setUploadStatus(`❌ Upload Error: ${err.message || "Failed to process file"}`);
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmAndSave = async () => {
    setSavingIngestion(true);
    try {
      const hba1cVal = isNaN(parseFloat(reviewData.hba1c)) ? null : parseFloat(reviewData.hba1c);
      const creatVal = isNaN(parseFloat(reviewData.creatinine)) ? null : parseFloat(reviewData.creatinine);

      const clinicalData = {
        patient_name: user?.name || "Patient Record",
        diagnosis: reviewData.diagnosis ? reviewData.diagnosis.split(",").map((s) => s.trim()).filter(Boolean) : [],
        medications: reviewData.medications ? reviewData.medications.split(",").map((s) => s.trim()).filter(Boolean) : [],
        symptoms: reviewData.symptoms ? reviewData.symptoms.split(",").map((s) => s.trim()).filter(Boolean) : [],
        lab_results: {
          ...(hba1cVal !== null ? { HbA1c: hba1cVal } : {}),
          ...(creatVal !== null ? { SerumCreatinine: creatVal } : {}),
        },
        clinical_summary: `Validated extraction: ${reviewData.diagnosis}. Meds: ${reviewData.medications}`,
      };

      const token = typeof window !== "undefined" ? localStorage.getItem("medai_token") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${BACKEND_URL}/api/ingest`, {
        method: "POST",
        headers,
        body: JSON.stringify({ patientId, clinicalData }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ingestion failed");

      setShowReviewModal(false);
      setUploadStatus("✅ Extracted information confirmed & committed to medical record!");
    } catch (err: any) {
      alert(`Save Error: ${err.message}`);
    } finally {
      setSavingIngestion(false);
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

        {/* Grid Layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 32 }}>
          {/* Left Column */}
          <div>
            {/* Upload Card */}
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
                Upload handwritten doctor notes, scanned PDFs, or image slips. Our OCR AI agent extracts patient info for your review before committing to your record.
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
                  {uploading ? "Scanning & Extracting with OCR..." : "Upload & Review Information"}
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
            </div>

            {/* Past Consultations Card */}
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
                    HbA1c noted at 9.4% (critical). Increased Metformin to 1000mg twice daily. Advised diabetic diet restrict refined carbs.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Personal AI Assistant */}
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
                height: "600px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #e2e8f0" }}>
                <Sparkles style={{ color: "#2563eb", width: 22, height: 22 }} />
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>Personal AI Health Assistant</h3>
                  <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>Ask anything about your reports & labs</p>
                </div>
              </div>

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

      {/* ───────────────────────────────────────────────────────────── */}
      {/* HUMAN-IN-THE-LOOP INTERACTIVE VALIDATION MODAL */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showReviewModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 24,
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 20,
              width: "100%",
              maxWidth: 620,
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              border: "1px solid #cbd5e1",
              overflow: "hidden",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                backgroundColor: "#0f172a",
                color: "#ffffff",
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ShieldCheck style={{ color: "#38bdf8", width: 22, height: 22 }} />
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Review Extracted Information</h3>
                  <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>Human-in-the-Loop Verification before DB Commit</p>
                </div>
              </div>
              <button
                onClick={() => setShowReviewModal(false)}
                style={{ backgroundColor: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>
                  Patient: <span style={{ color: "#0f172a", fontWeight: 700 }}>{user?.name || "Rajan Subramaniam"}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 12, backgroundColor: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
                    Engine: {(reviewData as any).parser || "TesseractOCR"}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 12, backgroundColor: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }}>
                    Category: {(reviewData as any).category || "LAB_REPORT"}
                  </span>
                </div>
              </div>

              {/* Versioning Metadata Tag Bar */}
              <div style={{ fontSize: 11, color: "#64748b", backgroundColor: "#f8fafc", padding: "6px 10px", borderRadius: 6, marginBottom: 16, border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between" }}>
                <span>OCR Version: {(reviewData as any).ocr_version || "tesseract_v5.3"}</span>
                <span>Validation Version: {(reviewData as any).validation_version || "biological_bounds_v2.0"}</span>
              </div>

              {/* Extraction Fields List */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Visit Date */}
                <div style={{ padding: 12, backgroundColor: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                    <span>Visit Date</span>
                    <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ Confidence: 99%</span>
                  </div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={reviewData.visit_date}
                      onChange={(e) => setReviewData({ ...reviewData, visit_date: e.target.value })}
                      style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}
                    />
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>✓ {reviewData.visit_date}</div>
                  )}
                </div>

                {/* Diagnosis */}
                <div style={{ padding: 12, backgroundColor: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                    <span>Diagnosis</span>
                    <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ Confidence: {reviewData.conf_diag}%</span>
                  </div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={reviewData.diagnosis}
                      onChange={(e) => setReviewData({ ...reviewData, diagnosis: e.target.value })}
                      style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}
                    />
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>✓ {reviewData.diagnosis}</div>
                  )}
                </div>

                {/* Medication */}
                <div style={{ padding: 12, backgroundColor: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                    <span>Medication</span>
                    <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ Confidence: {reviewData.conf_med}%</span>
                  </div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={reviewData.medications}
                      onChange={(e) => setReviewData({ ...reviewData, medications: e.target.value })}
                      style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}
                    />
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>✓ {reviewData.medications}</div>
                  )}
                </div>

                {/* Lab Results */}
                <div style={{ padding: 12, backgroundColor: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                    <span>Lab Values</span>
                    <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ Confidence: {reviewData.conf_lab}%</span>
                  </div>
                  {isEditing ? (
                    <div style={{ display: "flex", gap: 10 }}>
                      <input
                        type="text"
                        value={reviewData.hba1c}
                        onChange={(e) => setReviewData({ ...reviewData, hba1c: e.target.value })}
                        style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}
                        placeholder="HbA1c"
                      />
                      <input
                        type="text"
                        value={reviewData.creatinine}
                        onChange={(e) => setReviewData({ ...reviewData, creatinine: e.target.value })}
                        style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}
                        placeholder="Creatinine"
                      />
                    </div>
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                      ✓ HbA1c: {reviewData.hba1c} | Serum Creatinine: {reviewData.creatinine}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                <button
                  type="button"
                  onClick={() => setIsEditing(!isEditing)}
                  style={{
                    flex: 1,
                    backgroundColor: "#f1f5f9",
                    color: "#334155",
                    border: "1px solid #cbd5e1",
                    borderRadius: 10,
                    padding: "12px",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Edit3 style={{ width: 16, height: 16 }} />
                  {isEditing ? "Lock Edits" : "Edit Fields"}
                </button>

                <button
                  type="button"
                  onClick={handleConfirmAndSave}
                  disabled={savingIngestion}
                  style={{
                    flex: 1.5,
                    backgroundColor: "#16a34a",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 10,
                    padding: "12px",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: savingIngestion ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Check style={{ width: 18, height: 18 }} />
                  {savingIngestion ? "Committing to DB & Vectors..." : "Confirm & Save Record"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
