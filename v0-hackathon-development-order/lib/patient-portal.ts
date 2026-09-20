import { fetchApi } from "@/lib/backend-api";

export const DEFAULT_PATIENT_ID = "P001";

export interface RagHit {
  section: string;
  date: string;
  score: number;
  baseScore?: number;
  rerankBoost?: number;
  text: string;
  temporalNote?: string;
  data_quality_warning?: string;
}

export interface AgentQueryResult {
  answer: string;
  rag_hits?: RagHit[];
  source?: string;
  error?: string;
}

export async function agentQueryDetailed(
  prompt: string,
  patientId = DEFAULT_PATIENT_ID,
  options?: { allPatients?: boolean }
): Promise<AgentQueryResult> {
  const isAllPatients = options?.allPatients === true;
  const body: Record<string, unknown> = {
    prompt,
    allPatients: isAllPatients,
  };
  if (!isAllPatients && patientId) {
    body.patientId = patientId;
  }

  try {
    const api = await fetchApi<{
      answer?: string;
      response?: string;
      error?: string;
      rag_hits?: RagHit[];
      source?: string;
    }>("/api/agent/query", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const ans =
      api.answer ||
      api.response ||
      (api.error ? `Backend error: ${api.error}` : "No response returned from backend.");

    return {
      answer: ans,
      rag_hits: api.rag_hits || [],
      source: api.source,
      error: api.error,
    };
  } catch (e) {
    return {
      answer: e instanceof Error ? e.message : "Backend unavailable",
      error: e instanceof Error ? e.message : "Backend unavailable",
      rag_hits: [],
    };
  }
}

export async function agentQuery(
  prompt: string,
  patientId = DEFAULT_PATIENT_ID,
  options?: { allPatients?: boolean }
) {
  const res = await agentQueryDetailed(prompt, patientId, options);
  return res.answer;
}

