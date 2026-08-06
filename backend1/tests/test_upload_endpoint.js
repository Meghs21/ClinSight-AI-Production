const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const http = require('http');
const { signToken } = require('../middleware/authMiddleware');

async function testUploadWithAuthToken() {
  console.log('====================================================');
  console.log('🧪 TESTING POST /api/upload WITH VALID JWT TOKEN');
  console.log('====================================================\n');

  const token = signToken({ id: 'P001', name: 'Rajan Subramaniam', role: 'patient' });

  // Create dummy test file
  const testFilePath = path.join(__dirname, 'test_sample.txt');
  fs.writeFileSync(testFilePath, 'Patient: Rajan Subramaniam\nHbA1c: 9.4%\nSerum Creatinine: 2.1 mg/dL\nMetformin 1000mg');

  const form = new FormData();
  form.append('file', fs.createReadStream(testFilePath));
  form.append('patientId', 'P001');

  const headers = {
    ...form.getHeaders(),
    'Authorization': `Bearer ${token}`
  };

  console.log('📡 Sending POST request to http://localhost:4000/api/upload with Authorization token...');

  const req = http.request({
    host: 'localhost',
    port: 4000,
    path: '/api/upload',
    method: 'POST',
    headers,
  }, (res) => {
    let rawData = '';
    console.log(`📊 HTTP Status Code: ${res.statusCode} ${res.statusMessage}`);
    console.log('📋 Response Headers:', res.headers['content-type']);

    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
      console.log('\n📄 RAW SERVER RESPONSE BODY:');
      console.log(rawData.slice(0, 500));

      if (rawData.startsWith('<!DOCTYPE') || rawData.startsWith('<html')) {
        console.error('\n❌ SERVER RETURNED HTML!');
      } else {
        try {
          const parsed = JSON.parse(rawData);
          console.log('\n✅ SERVER RETURNED VALID JSON!');
          console.log(JSON.stringify(parsed, null, 2).slice(0, 500));
        } catch (e) {
          console.error('❌ JSON Parse Error:', e.message);
        }
      }
    });
  });

  req.on('error', (err) => {
    console.error('❌ HTTP Request Error:', err.message);
  });

  form.pipe(req);
}

testUploadWithAuthToken();
