const patientRepo = require('../repositories/patientRepository');
const tools = require('../tools/patientTools');

async function getPatients(req, res) {
  try {
    const list = await patientRepo.getAllPatients();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getPatientById(req, res) {
  try {
    const id = req.params.id;
    const p = await patientRepo.getPatientById(id);
    if (!p) {
      // Fall back to patientTools
      const toolsPatient = tools.get_patient_case_sheet(id);
      if (toolsPatient && !toolsPatient.error) {
        return res.json(toolsPatient);
      }
      return res.status(404).json({ error: `Patient ${id} not found` });
    }
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getPatientLabs(req, res) {
  try {
    const id = req.params.id;
    const p = await patientRepo.getPatientById(id);
    if (!p) {
      return res.status(404).json({ error: `Patient ${id} not found` });
    }
    res.json({ patient_id: id, labs: p.labs || p.labResults || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function searchPatientHistory(req, res) {
  try {
    const { id, q, query } = req.query;
    const patientId = id || req.params.id || 'P001';
    const searchTerm = q || query || '';
    const result = tools.search_patient_history(patientId, searchTerm);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getConsultationBrief(req, res) {
  try {
    const id = req.params.id || req.query.id || 'P001';
    const brief = tools.generate_consultation_brief(id);
    res.json(brief);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getLabTrends(req, res) {
  try {
    const id = req.params.id || req.query.id || 'P001';
    const testName = req.params.testName || req.query.test || 'HbA1c';
    const trend = tools.extract_lab_trends(id, testName);
    res.json(trend);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function checkDrugInteractions(req, res) {
  try {
    const meds = req.body?.medications || req.body?.drugs || [];
    const result = tools.check_drug_interactions(meds);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getPatients,
  getPatientById,
  getPatientLabs,
  searchPatientHistory,
  getConsultationBrief,
  getLabTrends,
  checkDrugInteractions,
};
