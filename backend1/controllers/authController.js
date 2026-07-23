const fs = require('fs');
const path = require('path');
const { signToken } = require('../middleware/authMiddleware');

const USERS_FILE = path.join(__dirname, '../data/users.json');

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

async function login(req, res) {
  try {
    const { email, password, role } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check environment doctor credentials override if present
    const envDoctorEmail = process.env.DOCTOR_EMAIL || 'nandakumar@kathir.in';
    const envDoctorPassword = process.env.DOCTOR_PASSWORD;

    if (
      email === envDoctorEmail &&
      envDoctorPassword &&
      password === envDoctorPassword
    ) {
      const userObj = { id: 'D001', name: 'Dr. Nandakumar', email, role: 'doctor' };
      const token = signToken(userObj);
      return res.json({ token, user: userObj, role: 'doctor' });
    }

    const data = loadUsers();
    
    // Check doctor match
    const doctorMatch = (data.doctors || []).find(
      (d) => d.email.toLowerCase() === String(email).toLowerCase() && d.password === password
    );

    if (doctorMatch && (!role || role === 'doctor')) {
      const userObj = {
        id: doctorMatch.id,
        name: doctorMatch.name,
        email: doctorMatch.email,
        department: doctorMatch.department,
        role: 'doctor',
      };
      const token = signToken(userObj);
      return res.json({ token, user: userObj, role: 'doctor' });
    }

    // Check patient match
    const patientMatch = (data.patients || []).find(
      (p) => p.email.toLowerCase() === String(email).toLowerCase() && p.password === password
    );

    if (patientMatch && (!role || role === 'patient')) {
      const userObj = {
        id: patientMatch.id,
        name: patientMatch.name,
        email: patientMatch.email,
        role: 'patient',
      };
      const token = signToken(userObj);
      return res.json({ token, user: userObj, role: 'patient' });
    }

    return res.status(401).json({ error: 'Invalid email or password' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function register(req, res) {
  try {
    const { name, email, password, role } = req.body || {};
    if (!email || !name) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const assignedRole = role || 'doctor';
    const userObj = {
      id: `U${Date.now().toString().slice(-4)}`,
      name,
      email,
      role: assignedRole,
    };
    const token = signToken(userObj);

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
