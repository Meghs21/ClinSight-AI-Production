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

function saveUsers(data) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save user to users.json:', err.message);
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

    // Check if user already exists
    const existingDoctor = (data.doctors || []).find((d) => d.email.toLowerCase() === cleanEmail);
    const existingPatient = (data.patients || []).find((p) => p.email.toLowerCase() === cleanEmail);

    if (existingDoctor || existingPatient) {
      // User already exists, allow re-registration or update password
      const targetList = assignedRole === 'doctor' ? data.doctors : data.patients;
      const match = targetList.find((u) => u.email.toLowerCase() === cleanEmail);
      if (match) {
        if (password) match.password = password;
        if (department) match.department = department;
        if (name) match.name = name;
      }
    } else {
      // Create new user entry
      const newId = assignedRole === 'doctor' ? `D${Date.now().toString().slice(-4)}` : `P${Date.now().toString().slice(-4)}`;
      const newUser = {
        id: newId,
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
      id: `U${Date.now().toString().slice(-4)}`,
      name,
      email: cleanEmail,
      department: department || 'General Medicine',
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
