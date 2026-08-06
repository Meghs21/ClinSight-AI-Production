async function testRxNorm(drugName) {
  console.log(`🔎 Querying Official NIH National Library of Medicine (NLM) RxNorm API for: "${drugName}"...`);
  try {
    const url = `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(drugName)}`;
    const res = await fetch(url);
    const data = await res.json();
    const rxcui = data.idGroup?.rxnormId?.[0];
    if (rxcui) {
      console.log(`✅ OFFICIAL NIH RXNORM MATCH FOUND! Drug: "${drugName}" | RxCUI Code: ${rxcui}`);
      return { verified: true, rxcui, source: 'NIH_NLM_RxNorm_API' };
    } else {
      console.log(`⚠️ No official RxCUI match found for: "${drugName}"`);
      return { verified: false, source: 'NIH_NLM_RxNorm_API' };
    }
  } catch (err) {
    console.error('API Error:', err.message);
    return { verified: false, error: err.message };
  }
}

testRxNorm('Metformin');
testRxNorm('Amlodipine');
