async function testLogin() {
  console.log('📡 Testing Doctor Login...');
  try {
    const res1 = await fetch('http://localhost:4000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nandakumar@kathir.in', password: 'doctor123', role: 'doctor' })
    });
    const d1 = await res1.json();
    console.log('Doctor Login Status:', res1.status, d1);
  } catch (err) {
    console.error('Doctor Login Fetch Error:', err.message);
  }

  console.log('\n📡 Testing Patient Login...');
  try {
    const res2 = await fetch('http://localhost:4000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rajan@patient.in', password: 'patient123', role: 'patient' })
    });
    const d2 = await res2.json();
    console.log('Patient Login Status:', res2.status, d2);
  } catch (err) {
    console.error('Patient Login Fetch Error:', err.message);
  }
}

testLogin();
