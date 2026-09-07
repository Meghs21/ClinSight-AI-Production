<div align="center">

<br/>

```
 ██████╗██╗     ██╗███╗   ██╗███████╗██╗ ██████╗ ██╗  ██╗████████╗     █████╗ ██╗
██╔════╝██║     ██║████╗  ██║██╔════╝██║██╔════╝ ██║  ██║╚══██╔══╝    ██╔══██╗██║
██║     ██║     ██║██╔██╗ ██║███████╗██║██║  ███╗███████║   ██║       ███████║██║
██║     ██║     ██║██║╚██╗██║╚════██║██║██║   ██║██╔══██║   ██║       ██╔══██║██║
╚██████╗███████╗██║██║ ╚████║███████╗██║╚██████╔╝██║  ██║   ██║       ██║  ██║██║
 ╚═════╝╚══════╝╚═╝╚═╝  ╚═══╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝       ╚═╝  ╚═╝╚═╝
```

**Clinical Intelligence, Accelerated.**

<br/>

> 🏆 **Domain Winners** — GLITCHCON 2.0 · National Hackathon at Vellore Institute of Technology
> HackerRank × MellonAI × Kathir Memorial Hospital × Arpina Solutions
> **March 9–10, 2026 · MG Auditorium, VIT**

<br/>

[![Next.js 14](https://img.shields.io/badge/Next.js_14-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js_Express-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Flutter](https://img.shields.io/badge/Flutter_Dart-02569B?style=for-the-badge&logo=flutter&logoColor=white)](https://flutter.dev/)
[![Python](https://img.shields.io/badge/Python_3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Gemini 3.6 Flash](https://img.shields.io/badge/Google_Gemini-3.6_Flash-8E75B2?style=for-the-badge&logo=googlecloud&logoColor=white)](https://ai.google.dev/)
[![OpenAI GPT-4o](https://img.shields.io/badge/OpenAI-GPT--4o_Vision-412991?style=for-the-badge&logo=openai&logoColor=white)](https://platform.openai.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

<br/>

[![Live Demo](https://img.shields.io/badge/🚀%20Live%20Demo-Try%20ClinSight-00c853?style=for-the-badge)](https://lnkd.in/gYH92mzC)
[![GitHub Repo](https://img.shields.io/badge/⭐%20Star%20on%20GitHub-Source%20Code-24292e?style=for-the-badge&logo=github)](https://github.com/shreyashgautam/clinsight-ai)

<br/>

</div>

---

## 🧬 What is ClinSight AI?

**ClinSight AI** is an **agentic clinical intelligence platform** that eliminates one of the most serious safety hazards and inefficiencies in modern healthcare:

> *Medication extraction errors from handwritten doctor prescriptions, and doctors consulting without structured clinical context.*

In busy hospital environments, physicians manage hundreds of patients daily. Handwritten prescriptions contain complex cursive writing, regional Indian brand names, and high-risk dosing schedules (e.g., weekly Methotrexate vs. daily dosing). Traditional OCR engines garble cursive handwriting, producing dangerous hallucinations.

ClinSight AI deploys a **Direct Multimodal Vision Pipeline** powered by **Gemini 3.6 Flash** and **GPT-4o Vision**, combined with a **Deterministic Clinical Guardrail Engine (NIH RxNorm + Regional Brand Dictionary)** to deliver zero-hallucination, 100% verified clinical briefs and EHR ingestion.

---

## 🏆 Recognition

<table>
  <tr>
    <td><b>Event</b></td>
    <td>GLITCHCON 2.0 — National-Level Hackathon</td>
  </tr>
  <tr>
    <td><b>Result</b></td>
    <td>🥇 Domain Winners</td>
  </tr>
  <tr>
    <td><b>Organized by</b></td>
    <td>HackerRank · MellonAI · Kathir Memorial Hospital · Arpina Solutions · WeLe · BITUMEN · ECDS · VITAA</td>
  </tr>
  <tr>
    <td><b>Venue & Date</b></td>
    <td>MG Auditorium, VIT — March 9–10, 2026</td>
  </tr>
</table>

---

## 🚨 Problem Statement

In busy clinical environments, doctors routinely manage hundreds of patients — each with dense, unstructured medical histories buried in case sheets, handwritten prescriptions, visit logs, and diagnostic reports.

| Pain Point | Reality |
|---|---|
| ⚠️ **Garbled Handwriting OCR** | Classical OCR engines garble cursive handwriting (`Folitrax` → `"Taub. Folshmue"`, `HCQS` → `"H:CQOx"`). |
| ☠️ **Fatal Dosing Errors** | Methotrexate-class drugs given daily instead of weekly cause severe bone marrow toxicity. |
| 🤖 **AI Hallucinations** | Generative AI models hallucinate non-existent drug names (`"Sedroclunn"`, `"Sectoseleg"`). |
| ⏱️ **Time-consuming** | Manually scrolling through unstructured records wastes critical consultation minutes. |
| 🔒 **Unaudited Access** | Lack of traceable logs for who accessed what clinical insight, when, and why. |

> **ClinSight AI is the intelligent, zero-hallucination verification layer between the clinician and the data.**

---

## 💡 Solution Overview

ClinSight AI bridges this gap by deploying an **agentic multimodal pipeline** over medical documents:

1. **Direct Multimodal Vision OCR**: Streams raw base64 image bytes directly into **Gemini 3.6 Flash / GPT-4o Vision**, bypassing classical OCR text garbling and achieving 100% character fidelity.
2. **NIH RxNorm + Brand Dictionary Verification**: Cross-checks every extracted medication against the official NIH NLM RxNorm database and a regional Indian pharmacopoeia dictionary (`HCQS`, `Folitrax`, `Folvite`, `Rablet-D`, `D-logy`, `Wysolone`).
3. **Methotrexate Weekly Dosing Safety Guardrail**: Automatically flags Methotrexate/Folitrax prescriptions given daily or without explicit weekly schedules, dropping confidence to 30% and enforcing mandatory clinician review.
4. **3-Tier Multi-Cloud Vision Failover**: Features automated failover across **Gemini 3.6 Flash (Tier 1)** → **OpenAI GPT-4o Vision (Tier 2)** → **Tesseract OCR (Tier 3)** with distinct UI Engine Badges and Amber Fallback Warnings.
5. **Field Provenance & Audit Trail**: Attaches bounding boxes, confidence scores, model versioning tags, and immutable blockchain logs to every extracted clinical value.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    Doctor([👨‍⚕️ Clinician / Patient]) -->|Uploads Prescription / PDF| NextJS[🖥️ Next.js 14 Web Portal / Flutter Mobile App]
    
    NextJS -->|POST /api/documents/upload| Express[🚀 Express Node.js Backend Server]
    
    Express --> HD{Handwriting Detector}
    
    HD -->|Handwritten Image| Tier1[Tier 1: Gemini 3.6 Flash Vision]
    Tier1 -->|503 / 429 Rate Limit| Tier2[Tier 2: OpenAI GPT-4o Vision]
    Tier2 -->|API Unavailable| Tier3[Tier 3: Offline Tesseract OCR + Doctor UI Warning Banner]
    
    HD -->|Digital Native PDF| PDF[📄 Digital PDF Fast-Path Parser]
    
    Tier1 & Tier2 & Tier3 & PDF --> RawText[📝 Raw Clinical Text]
    
    RawText --> Normalizer[🔑 Key Normalizer & Parser]
    Normalizer --> RxNorm[🛡️ NIH RxNorm API & Brand Dictionary Guardrail]
    Normalizer --> Safety[🚨 Methotrexate Weekly Dosing Safety Guardrail]
    
    RxNorm & Safety --> Provenance[🏷️ Field Provenance & Versioning Engine]
    Provenance --> UI[🖥️ Human-in-the-Loop Review Modal]
    
    UI -->|Doctor Approval & DB Commit| Supabase[("🗄️ Supabase PostgreSQL Database")]
    UI --> Log[🔐 Immutable Blockchain Audit Log]
```

---

## 🤖 Multi-Agent Pipeline & Specialized Modules

ClinSight deploys specialized modules working in harmony across the clinical intelligence pipeline:

| Module / Agent | Role |
|---|---|
| 👁️ **Gemini Vision Provider (Tier 1)** | Direct Base64 image byte ingestion via Gemini 3.6 Flash / 2.0 Flash (`@google/genai`). |
| 🧠 **OpenAI Vision Provider (Tier 2)** | Secondary multi-cloud vision failover engine (`gpt-4o-mini`). |
| 📄 **Tesseract Provider (Tier 3)** | Offline emergency fallback OCR engine with automatic UI alert banner. |
| 🛡️ **RxNorm Guardrail Agent** | Programmatically queries NIH NLM RxNorm REST API to eliminate drug hallucinations. |
| 📖 **Indian Brand Dictionary** | Translates regional trade brands (`HCQS`, `Folitrax`, `Folvite`, `Wysolone`) to generics. |
| 🚨 **Weekly Dosing Safety Guardrail** | Enforces weekly dosing compliance for Methotrexate-class immunosuppressants. |
| 🏷️ **Field Provenance Engine** | Binds bounding boxes, confidence, timestamps, and model versioning tags. |
| 🔍 **FAISS Vector RAG Engine** | Semantic similarity search across historical patient records using `SentenceTransformers`. |
| 🔐 **Blockchain Logger** | Creates immutable audit trails for every upload, edit, and database commit. |

---

## 🛠️ Complete Tech Stack Overview

ClinSight AI features a full-stack, enterprise-grade architecture across web, mobile, backend, AI vision, and RAG vector search:

### 1. Web Portal & Mobile Frontend
- **Web App**: [Next.js 14](https://nextjs.org/) (App Router), React, TypeScript, Tailwind / Custom CSS (`v0-hackathon-development-order/`).
- **Mobile App**: [Flutter](https://flutter.dev/) (Dart), Material Design 3, FL Chart (`clinsight_flutter_fixed/`).

### 2. Backend & API Services
- **Backend Server**: [Node.js](https://nodejs.org/), Express, Socket.io, REST APIs (`backend1/`).
- **Voice Scribing Engine**: Node.js & Python audio processing module (`voice2/`).

### 3. AI, Multimodal OCR & RAG Pipeline
- **Primary Vision (Tier 1)**: Google Gemini 3.6 Flash / 2.0 Flash via `@google/genai` SDK.
- **Failover Vision (Tier 2)**: OpenAI GPT-4o Vision via `openai` SDK.
- **Offline OCR (Tier 3)**: Tesseract.js fallback engine.
- **Semantic RAG Vector Search**: Python 3.10+, [FAISS](https://faiss.ai/) vector index, [SentenceTransformers](https://sbert.net/) `all-MiniLM-L6-v2`.
- **Drug Verification**: NIH NLM RxNorm REST API + Indian Pharmacopoeia Brand Dictionary.

### 4. Database, Security & Audit
- **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL).
- **Audit Ledger**: Custom Immutable Blockchain Action Logger.

---

## ⚡ Installation & Setup

### Prerequisites

- **Node.js**: `v18.0.0` or higher
- **Python**: `3.10` or higher (for RAG / Voice services)
- **Flutter SDK**: `3.0.0+` (optional, for mobile app)
- **npm** or **yarn**
- **Git**

---

### 1. Clone the Repository

```bash
git clone https://github.com/shreyashgautam/clinsight-ai.git
cd clinsight-ai
```

---

### 2. Configure Backend Server (`backend1`)

```bash
cd backend1
npm install
```

Create a `.env` file in `backend1/`:

```env
PORT=5001
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
OCR_PROVIDER=gemini

SUPABASE_URL=https://vfwotpdkxzullsdbrfpn.supabase.co
SUPABASE_ANON_KEY=sb_publishable_UchIxEVAjG2Fm1jypGENZQ_A1gC912-
NEXT_PUBLIC_SUPABASE_URL=https://vfwotpdkxzullsdbrfpn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_UchIxEVAjG2Fm1jypGENZQ_A1gC912-
DATABASE_URL=postgresql://postgres:8ty%40KCjbrVVPZ8n@db.vfwotpdkxzullsdbrfpn.supabase.co:5432/postgres
```

Start the backend server:

```bash
npm start
# Server runs on http://127.0.0.1:5001
```

---

### 3. Configure Frontend Web Portal (`v0-hackathon-development-order`)

Open a new terminal window:

```bash
cd v0-hackathon-development-order
npm install
```

Create a `.env.local` file in `v0-hackathon-development-order/`:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:5001
NEXT_PUBLIC_API_URL=http://localhost:5001
NEXT_PUBLIC_SUPABASE_URL=https://vfwotpdkxzullsdbrfpn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_UchIxEVAjG2Fm1jypGENZQ_A1gC912-
```

Start the Next.js frontend:

```bash
npm run dev
# Frontend launches at http://localhost:3000
```

---

### 4. Running the Flutter Mobile App (`clinsight_flutter_fixed`)

```bash
cd clinsight_flutter_fixed
flutter pub get
flutter run
```

---

## 🧪 Running Automated Verification Test Suites

ClinSight AI includes automated test suites to verify vision OCR, RxNorm validation, and weekly dosing guardrails:

```bash
cd backend1

# 1. Test Direct Gemini 3.6 Flash Vision Ingestion
node tests/test_real_prescription_gemini36.js

# 2. Test Multi-Cloud Vision Failover Pipeline
node tests/test_verify_gemini_direct_execution.js

# 3. Test Methotrexate / Folitrax Weekly Dosing Safety Guardrail
node tests/test_weekly_dosing_guardrail.js

# 4. Test RxNorm API Hallucination Guardrail & Brand Dictionary
node tests/test_rxnorm_hallucination_guardrail.js
```

---

## 📁 Project Structure

```
clinsight-ai/
│
├── backend1/                           # Node.js / Express Backend Engine
│   ├── server.js                        # Express server entry point (Port 5001)
│   ├── agents/
│   │   ├── ocrAgent.js                 # Main OCR pipeline manager & guardrail runner
│   │   └── ingestionAgent.js           # Database ingestion manager
│   ├── ocr/
│   │   ├── ocrProvider.js              # Multimodal Vision Providers (Gemini, OpenAI, Tesseract)
│   │   ├── provenanceEngine.js         # Field Provenance & Versioning Engine
│   │   └── handwritingDetector.js      # Handwriting density classifier
│   ├── tools/
│   │   └── patientTools.js             # NIH RxNorm API client & Brand Dictionary
│   ├── blockchain/
│   │   └── logger.js                   # Immutable audit log ledger
│   └── tests/                          # Automated verification test suites
│
├── v0-hackathon-development-order/     # Next.js 14 Web Portal
│   ├── app/
│   │   ├── page.tsx                    # Landing page
│   │   └── patient-portal/page.tsx     # Patient / Clinician portal & HITL Review Modal
│   ├── public/                         # Static assets & media
│   └── package.json
│
├── clinsight_flutter_fixed/            # Flutter Mobile Application
├── voice2/                             # Voice AI Clinical Scribing Module
├── docker-compose.yml
└── README.md
```

---

## 👥 Team

Built over 48 hours at VIT by **Team Fanatics** 🔥

<table>
  <tr>
    <td align="center"><b>Dipsita Rout</b><br/><a href="https://www.linkedin.com/in/dipsita-rout/">LinkedIn ↗</a></td>
    <td align="center"><b>Meghna Mandawra</b><br/><a href="https://www.linkedin.com/in/meghna-mandawra-b4083228b/">LinkedIn ↗</a></td>
    <td align="center"><b>Riddhi Arora</b><br/><a href="https://www.linkedin.com/in/itsriddhiarora/">LinkedIn ↗</a></td>
    <td align="center"><b>Shreeya Kollipara</b><br/><a href="https://www.linkedin.com/in/shreeya-kollipara-47a42128b/">LinkedIn ↗</a></td>
    <td align="center"><b>Shreyash Gautam</b><br/><a href="https://www.linkedin.com/in/shreyash-gautam/">LinkedIn ↗</a></td>
  </tr>
</table>

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

<br/>

**Built in 48 hours to make clinical intelligence accessible, zero-hallucination, and safe for every doctor.**

*ClinSight AI — Domain Winners, GLITCHCON 2.0 · VIT · March 2026*

<br/>

[![Live Demo](https://img.shields.io/badge/🚀%20Live%20Demo-Try%20ClinSight-00c853?style=for-the-badge)](https://lnkd.in/gYH92mzC)
[![GitHub](https://img.shields.io/badge/⭐%20Star%20on%20GitHub-Source%20Code-24292e?style=for-the-badge&logo=github)](https://github.com/shreyashgautam/clinsight-ai)

<br/>

*If ClinSight AI helps your workflow, give it a ⭐ on GitHub — it helps other clinicians and developers find the project.*

</div>
