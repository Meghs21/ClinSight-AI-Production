const { runOrchestratorAgent } = require('../agents/orchestratorAgent');
const { runAnalysisAgent } = require('../agents/analysisAgent');
const { runTriageAgent } = require('../agents/triageAgent');
const { runSecondOpinionAgent } = require('../agents/secondOpinionAgent');
const { runRagDoctorQuery } = require('../agents/ragDoctorAgent');
const { runVoiceAgent } = require('../agents/voiceAgent');
const blockchain = require('../blockchain/logger');

async function runOrchestrator(req, res) {
  try {
    const { patientId, filePath, query, fromDoctor, toSpecialty, reason, apiKey, model } = req.body || {};
    if (!patientId) {
      return res.status(400).json({ error: 'patientId is required' });
    }

    const result = await runOrchestratorAgent({
      patientId,
      filePath,
      query,
      fromDoctor,
      toSpecialty,
      reason,
      apiKey,
      model,
    });

    if (req.io) {
      blockchain.addBlock('AGENT_ORCHESTRATION', 'SYSTEM', String(patientId), `Orchestration completed: ${result.pipeline}`);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function queryAgent(req, res) {
  try {
    const { query, patientId, apiKey, model } = req.body || {};
    const pId = patientId || 'P001';
    const q = query || 'Summarize patient state';

    const result = await runAnalysisAgent(q, String(pId), apiKey, model);

    if (req.io) {
      blockchain.addBlock('AGENT_QUERY', 'DOCTOR', String(pId), `Agent query: "${q.slice(0, 50)}..."`);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function runTriage(req, res) {
  try {
    const { patientId, apiKey } = req.body || {};
    const pId = patientId || 'P001';

    const result = await runTriageAgent(String(pId), apiKey);

    if (req.io) {
      blockchain.addBlock('PATIENT_TRIAGED', 'SYSTEM', String(pId), `Priority: ${result.priority}, Urgency: ${result.estimated_urgency}`);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function runSecondOpinion(req, res) {
  try {
    const { patientId, query, apiKey, model } = req.body || {};
    const pId = patientId || 'P001';

    const result = await runSecondOpinionAgent(query || 'Assess treatment plan', String(pId), apiKey, model);

    if (req.io) {
      blockchain.addBlock('SECOND_OPINION_REQUESTED', 'DOCTOR', String(pId), `Second opinion for ${pId}`);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function runRagDoctor(req, res) {
  try {
    const { query, patientId } = req.body || {};
    const q = query || req.query.query || 'Summarize medical history';
    const pId = patientId || req.query.patientId;

    const result = await runRagDoctorQuery(q, pId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function runVoice(req, res) {
  try {
    const { query, patientId } = req.body || {};
    const result = await runVoiceAgent(query, patientId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  runOrchestrator,
  queryAgent,
  runTriage,
  runSecondOpinion,
  runRagDoctor,
  runVoice,
};

