const { indexPatient, semanticSearch } = require('../rag/vectorStore');
const patientRepository = require('../repositories/patientRepository');

async function testRetrievalQuality() {
  console.log('====================================================');
  console.log('🔍 SEMANTIC SEARCH RETRIEVAL QUALITY TEST');
  console.log('====================================================\n');

  // Load Patient P001 from Repository
  const patient = await patientRepository.getPatientById('P001');
  if (!patient) {
    console.error('❌ Patient P001 not found');
    return;
  }

  // Ensure Patient P001 is indexed
  console.log('Indexing Patient P001 into Vector Store...');
  await indexPatient(patient);
  console.log('✅ Indexing Complete!\n');

  const query = 'worsening kidney function';
  console.log(`🔎 Executing Semantic Search Query: "${query}" for Patient P001...\n`);

  const results = await semanticSearch(query, 'P001', 3);

  console.log('====================================================');
  console.log('🎯 TOP RETRIEVED RESULTS & ENGINE METADATA:');
  console.log('====================================================');
  console.log(JSON.stringify(results, null, 2));

  if (results.length > 0) {
    const top = results[0];
    console.log('\n====================================================');
    console.log('📊 RETRIEVAL QUALITY EVALUATION:');
    console.log('====================================================');
    console.log(`🟢 Active Search Engine: ${top.engine || 'tfidf_inmem_fallback'}`);
    console.log(`🟢 Top Matched Visit Date: ${top.date || 'N/A'}`);
    console.log(`🟢 Relevance Score: ${top.score}`);
    console.log(`🟢 Clinical Match Snippet: "${top.text.slice(0, 150)}..."`);
  }
}

testRetrievalQuality();
