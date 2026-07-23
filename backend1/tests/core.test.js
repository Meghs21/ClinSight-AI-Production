const test = require('node:test');
const assert = require('node:assert/strict');

const tools = require('../tools/patientTools');
const router = require('../routes/index');

test('patient case sheet should load for P001', () => {
  const patient = tools.get_patient_case_sheet('P001');
  assert.equal(patient.id, 'P001');
  assert.ok(Array.isArray(patient.medications));
});

test('consultation brief should include patient id and medications', () => {
  const brief = tools.generate_consultation_brief('P001');
  assert.equal(brief.patientId, 'P001');
  assert.ok(Array.isArray(brief.currentMedications));
});

test('lab trend extraction should work for HbA1c', () => {
  const trend = tools.extract_lab_trends('P001', 'HbA1c');
  assert.equal(trend.test_name, 'HbA1c');
  assert.ok(Array.isArray(trend.data));
  assert.ok(['WORSENING', 'IMPROVING', 'STABLE', 'INSUFFICIENT_DATA'].includes(trend.trend));
});

test('drug interaction checker should return structured response', () => {
  const result = tools.check_drug_interactions(['Warfarin', 'Aspirin']);
  assert.ok(Array.isArray(result.interactions));
  assert.equal(typeof result.count, 'number');
});

test('history search should return result shape', () => {
  const result = tools.search_patient_history('P001', 'fatigue');
  assert.equal(result.query, 'fatigue');
  assert.ok(Array.isArray(result.results));
  assert.equal(typeof result.found, 'boolean');
});

test('routes should include records compatibility endpoints', () => {
  const routePaths = router.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);

  assert.ok(routePaths.includes('/records/:id'));
  assert.ok(routePaths.includes('/records/:id/labs'));
  assert.ok(routePaths.includes('/records/search'));
  assert.ok(routePaths.includes('/agent/query'));
  assert.ok(routePaths.includes('/auth/login'));
  assert.ok(routePaths.includes('/voice'));
  assert.ok(routePaths.includes('/patient/:id/brief'));
});

test('PipelineContext should track stages and format response cleanly', () => {
  const { PipelineContext } = require('../agents/pipelineContext');
  const ctx = new PipelineContext({ patientId: 'P001', filePath: 'test.txt' });
  ctx.setOCR({ success: true, confidence: 0.95 });
  ctx.setIngestion({ success: true });
  const response = ctx.toResponse();

  assert.equal(response.patient_id, 'P001');
  assert.equal(response.success, true);
  assert.equal(response.human_review_required, false);
});

test('LLMGateway should provide fallback text and json generation', async () => {
  const llmGateway = require('../services/llmGateway');
  const res = await llmGateway.generateText({ prompt: 'Hello clinical assistant' });
  assert.ok(typeof res.text === 'string');
  assert.ok(res.provider);
});

test('vectorStore should produce 1536-dimensional normalized embeddings', async () => {
  const { getEmbedding } = require('../rag/vectorStore');
  const vec = await getEmbedding('HbA1c level 8.2 percent worsening diabetic trajectory');
  assert.equal(vec.length, 1536);
  const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  assert.ok(Math.abs(mag - 1.0) < 0.01);
});


