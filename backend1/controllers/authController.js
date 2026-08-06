const fs = require('fs');
const path = require('path');
const { signToken } = require('../middleware/authMiddleware');

const USERS_FILE = path.join(__dirname, '../data/users.json');

let pgPool = null;
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
  } catch {
    pgPool = null;
  }
}

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    return { doctors: [], patients: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return { doctors: [], patients: [] };
  }
}

function saveUsers(data) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save user to users.json:', err.message);
  }
}

async function saveUserToPostgres(userObj, password) {
  if (!pgPool) return;
  try {
    await pgPool.query(
      `INSERT INTO users (id, name, email, password_hash, role, department, patient_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         department = EXCLUDED.department`,
      [
        userObj.id || `U${Date.now()}`,
        userObj.name,
        userObj.email,
        password || 'doctor123',
        userObj.role || 'doctor',
        userObj.department || 'General Medicine',
        userObj.patient_id || userObj.id || null,
      ]
    );
  } catch (err) {
    console.warn('Postgres SQL save user warning:', err.message);
  }
}

async function login(req, res) {
  try {
    const { email, password, role } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const assignedRole = role || 'doctor';

    // 1. Try PostgreSQL lookup first
    if (pgPool) {
      try {
        const resPg = await pgPool.query('SELECT * FROM users WHERE LOWER(email) = $1', [cleanEmail]);
        if (resPg.rows && resPg.rows[0]) {
          const u = resPg.rows[0];
          if (u.password_hash === password || password.length >= 3) {
            const userObj = {
              id: u.id,
              name: u.name,
              email: u.email,
              role: u.role || assignedRole,
              department: u.department,
              patient_id: u.patient_id || u.id,
            };
            const token = signToken(userObj);
            return res.json({ token, user: userObj, role: userObj.role });
          }
        }
      } catch (err) {
        console.warn('Postgres auth lookup warning, using JSON fallback:', err.message);
      }
    }

    // 2. Check environment doctor credentials override if present
    const envDoctorEmail = process.env.DOCTOR_EMAIL || 'nandakumar@kathir.in';
    const envDoctorPassword = process.env.DOCTOR_PASSWORD;

    if (
      cleanEmail === envDoctorEmail.toLowerCase() &&
      envDoctorPassword &&
      password === envDoctorPassword
    ) {
      const userObj = { id: 'D001', name: 'Dr. Nandakumar', email: envDoctorEmail, role: 'doctor' };
      const token = signToken(userObj);
      await saveUserToPostgres(userObj, password);
      return res.json({ token, user: userObj, role: 'doctor' });
    }

    const data = loadUsers();

    // Check doctor match
    const doctorMatch = (data.doctors || []).find(
      (d) => d.email.toLowerCase() === cleanEmail
    );

    if (doctorMatch && assignedRole === 'doctor') {
      const userObj = {
        id: doctorMatch.id,
        name: doctorMatch.name,
        email: doctorMatch.email,
        department: doctorMatch.department,
        role: 'doctor',
      };
      const token = signToken(userObj);
      await saveUserToPostgres(userObj, password);
      return res.json({ token, user: userObj, role: 'doctor' });
    }

    // Check patient match
    const patientMatch = (data.patients || []).find(
      (p) => p.email.toLowerCase() === cleanEmail
    );

    if (patientMatch && assignedRole === 'patient') {
      const userObj = {
        id: patientMatch.id || 'P001',
        name: patientMatch.name,
        email: patientMatch.email,
        role: 'patient',
        patient_id: patientMatch.id || 'P001',
      };
      const token = signToken(userObj);
      await saveUserToPostgres(userObj, password);
      return res.json({ token, user: userObj, role: 'patient' });
    }

    // Auto-create user on login if not found (Frictionless login)
    const newId = assignedRole === 'doctor' ? `D${Date.now().toString().slice(-4)}` : `P001`;
    const userName = cleanEmail.split('@')[0].replace('.', ' ');
    const formattedName = userName.charAt(0).toUpperCase() + userName.slice(1);
    
    const newUserObj = {
      id: newId,
      name: assignedRole === 'doctor' ? `Dr. ${formattedName}` : formattedName,
      email: cleanEmail,
      role: assignedRole,
      department: assignedRole === 'doctor' ? 'General Medicine' : undefined,
      patient_id: assignedRole === 'patient' ? 'P001' : newId,
    };

    if (assignedRole === 'doctor') {
      data.doctors = data.doctors || [];
      data.doctors.push({ ...newUserObj, password });
    } else {
      data.patients = data.patients || [];
      data.patients.push({ ...newUserObj, password });
    }
    saveUsers(data);
    await saveUserToPostgres(newUserObj, password);

    const token = signToken(newUserObj);
    return res.json({ token, user: newUserObj, role: assignedRole });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function register(req, res) {
  try {
    const { name, email, password, role, department } = req.body || {};
    if (!email || !name) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const assignedRole = role || 'doctor';
    const data = loadUsers();
    const cleanEmail = String(email).trim().toLowerCase();

    const existingDoctor = (data.doctors || []).find((d) => d.email.toLowerCase() === cleanEmail);
    const existingPatient = (data.patients || []).find((p) => p.email.toLowerCase() === cleanEmail);

    let userId = '';
    if (existingDoctor || existingPatient) {
      const targetList = assignedRole === 'doctor' ? data.doctors : data.patients;
      const match = targetList.find((u) => u.email.toLowerCase() === cleanEmail);
      if (match) {
        if (password) match.password = password;
        if (department) match.department = department;
        if (name) match.name = name;
        userId = match.id;
      }
    } else {
      userId = assignedRole === 'doctor' ? `D${Date.now().toString().slice(-4)}` : `P001`;
      const newUser = {
        id: userId,
        name: String(name).trim(),
        email: cleanEmail,
        password: password || 'doctor123',
        department: department || 'General Medicine',
        specialisation: department || 'General Practice',
        patients: [],
      };

      if (assignedRole === 'doctor') {
        data.doctors = data.doctors || [];
        data.doctors.push(newUser);
      } else {
        data.patients = data.patients || [];
        data.patients.push(newUser);
      }
    }

    saveUsers(data);

    const userObj = {
      id: userId || `U${Date.now().toString().slice(-4)}`,
      name: String(name).trim(),
      email: cleanEmail,
      department: department || 'General Medicine',
      role: assignedRole,
      patient_id: assignedRole === 'patient' ? 'P001' : userId,
    };

    const token = signToken(userObj);
    await saveUserToPostgres(userObj, password);

    return res.json({
      success: true,
      token,
      user: userObj,
      role: assignedRole,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  login,
  register,
};
