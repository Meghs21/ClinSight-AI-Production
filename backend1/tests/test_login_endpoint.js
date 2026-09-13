async function testLogin() {
  console.log('📡 Testing Doctor Login on port 5001...');
  try {
    const res1 = await fetch('http://localhost:5001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nandakumar@kathir.in', password: 'doctor123', role: 'doctor' })
    });
    const d1 = await res1.json();
    console.log('Doctor Login Status:', res1.status, d1);
  } catch (err) {
    console.error('Doctor Login Fetch Error:', err.message);
  }

  console.log('\n📡 Testing Patient Login on port 5001...');
  try {
    const res2 = await fetch('http://localhost:5001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rajan@patient.in', password: 'patient123', role: 'patient' })
    });
    const d2 = await res2.json();
    console.log('Patient Login Status:', res2.status, d2);
  } catch (err) {
    console.error('Patient Login Fetch Error:', err.message);
  }

  console.log('\n📡 Testing Doctor Registration on port 5001...');
  try {
    const res3 = await fetch('http://localhost:5001/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dr. Test Doctor', email: 'testdoctor@kathir.in', password: 'password123', role: 'doctor', department: 'Cardiology' })
    });
    const d3 = await res3.json();
    console.log('Doctor Registration Status:', res3.status, d3);
  } catch (err) {
    console.error('Doctor Registration Fetch Error:', err.message);
  }

  console.log('\n📡 Testing Patient Registration (No Department) on port 5001...');
  try {
    const res4 = await fetch('http://localhost:5001/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Meghna Patient', email: 'meghna@patient.in', password: 'password123', role: 'patient' })
    });
    const d4 = await res4.json();
    console.log('Patient Registration Status:', res4.status, d4);
  } catch (err) {
    console.error('Patient Registration Fetch Error:', err.message);
  }
}

testLogin();
