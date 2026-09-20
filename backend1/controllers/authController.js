'use strict';

const fs   = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { signToken } = require('../middleware/authMiddleware');

const USERS_FILE   = path.join(__dirname, '../data/users.json');
const BCRYPT_ROUNDS = 12;

// ─── Postgres (optional) ──────────────────────────────────────────────────────

let pgPool = null;
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
  } catch {
    pgPool = null;
  }
}

// ─── Local JSON user store ────────────────────────────────────────────────────

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return { doctors: [], patients: [] };
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
    console.error('Failed to save users.json:', err.message);
  }
}

async function saveUserToPostgres(userObj, passwordHash) {
  if (!pgPool) return;
  try {
    await pgPool.query(
      `INSERT INTO users (id, name, email, password_hash, role, department, patient_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO UPDATE SET
         name          = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash,
         role          = EXCLUDED.role,
         department    = EXCLUDED.department`,
      [
        userObj.id || `U${Date.now()}`,
        userObj.name,
        userObj.email,
        passwordHash,
        userObj.role || 'doctor',
        userObj.department || 'General Medicine',
        userObj.patient_id || userObj.id || null,
      ]
    );
  } catch (err) {
    console.warn('Postgres save user warning:', err.message);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeUser(user) {
  // Never return password hash or raw password to the client
  const { password, password_hash, ...safe } = user;
  return safe;
}

// ─── Login ────────────────────────────────────────────────────────────────────

async function login(req, res) {
  try {
    const { email, password, role } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail   = String(email).trim().toLowerCase();
    const assignedRole = role || 'doctor';

    // 1. PostgreSQL lookup (if configured)
    if (pgPool) {
      try {
        const result = await pgPool.query('SELECT * FROM users WHERE LOWER(email) = $1', [cleanEmail]);
        if (result.rows[0]) {
          const u = result.rows[0];
          // Support both bcrypt hashes and legacy plain-text passwords (migration path)
          const passwordValid = u.password_hash.startsWith('$2')
            ? await bcrypt.compare(password, u.password_hash)
            : password === u.password_hash;

          if (passwordValid) {
            const userObj = { id: u.id, name: u.name, email: u.email, role: u.role || assignedRole, department: u.department };
            return res.json({ token: signToken(userObj), user: userObj, role: userObj.role });
          }
          // Wrong password — fail immediately (don't fall through to JSON store)
          return res.status(401).json({ error: 'Invalid email or password' });
        }
      } catch (err) {
        console.warn('Postgres auth warning, falling back to JSON store:', err.message);
      }
    }

    // 2. Environment-variable doctor account (seeded demo credentials)
    const envEmail    = process.env.DOCTOR_EMAIL    || 'nandakumar@kathir.in';
    const envPassword = process.env.DOCTOR_PASSWORD || 'doctor123';
    if (cleanEmail === envEmail.toLowerCase() && password === envPassword) {
      const userObj = { id: 'D001', name: 'Dr. Nandakumar', email: envEmail, role: 'doctor', department: 'General Medicine & Diabetology' };
      const token   = signToken(userObj);
      await saveUserToPostgres(userObj, await bcrypt.hash(password, BCRYPT_ROUNDS));
      return res.json({ token, user: userObj, role: 'doctor' });
    }

    // 3. Local JSON store
    const data = loadUsers();

    const allUsers = [
      ...(data.doctors  || []).map((u) => ({ ...u, role: 'doctor'  })),
      ...(data.patients || []).map((u) => ({ ...u, role: 'patient' })),
    ];

    const match = allUsers.find((u) => u.email.toLowerCase() === cleanEmail && u.role === assignedRole);

    if (match) {
      // Support bcrypt hashes and legacy plain-text passwords side-by-side
      const passwordValid = match.password?.startsWith('$2')
        ? await bcrypt.compare(password, match.password)
        : password === match.password;

      if (!passwordValid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const userObj = sanitizeUser({ ...match });
      const token   = signToken(userObj);
      await saveUserToPostgres(userObj, await bcrypt.hash(password, BCRYPT_ROUNDS));
      return res.json({ token, user: userObj, role: userObj.role });
    }

    // 4. Frictionless login — auto-create account (dev / demo convenience)
    //    Disabled in production unless ALLOW_AUTO_CREATE=true
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_AUTO_CREATE !== 'true') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const newId      = assignedRole === 'doctor' ? `D${Date.now().toString().slice(-4)}` : `P${Date.now().toString().slice(-4)}`;
    const userName   = cleanEmail.split('@')[0].replace(/[._]/g, ' ');
    const formatted  = userName.charAt(0).toUpperCase() + userName.slice(1);
    const hashed     = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const newUser = {
      id:         newId,
      name:       assignedRole === 'doctor' ? `Dr. ${formatted}` : formatted,
      email:      cleanEmail,
      password:   hashed,
      role:       assignedRole,
      department: assignedRole === 'doctor' ? 'General Medicine' : undefined,
      patient_id: assignedRole === 'patient' ? 'P001' : newId,
    };

    if (assignedRole === 'doctor') {
      data.doctors = data.doctors || [];
      data.doctors.push(newUser);
    } else {
      data.patients = data.patients || [];
      data.patients.push(newUser);
    }
    saveUsers(data);

    const userObj = sanitizeUser(newUser);
    const token   = signToken(userObj);
    await saveUserToPostgres(userObj, hashed);
    return res.json({ token, user: userObj, role: assignedRole });

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Authentication service error' });
  }
}

// ─── Register ─────────────────────────────────────────────────────────────────

async function register(req, res) {
  try {
    const { name, email, password, role, department } = req.body || {};
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }

    const assignedRole = role || 'doctor';
    const cleanEmail   = String(email).trim().toLowerCase();
    const data         = loadUsers();

    const allUsers = [
      ...(data.doctors  || []),
      ...(data.patients || []),
    ];
    if (allUsers.some((u) => u.email.toLowerCase() === cleanEmail)) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = assignedRole === 'doctor'
      ? `D${Date.now().toString().slice(-4)}`
      : `P${Date.now().toString().slice(-4)}`;

    const newUser = {
      id:          userId,
      name:        String(name).trim(),
      email:       cleanEmail,
      password:    hashed,
      department:  assignedRole === 'doctor' ? (department || 'General Medicine') : undefined,
      patient_id:  assignedRole === 'patient' ? 'P001' : userId,
    };

    if (assignedRole === 'doctor') {
      data.doctors = data.doctors || [];
      data.doctors.push(newUser);
    } else {
      data.patients = data.patients || [];
      data.patients.push(newUser);
    }
    saveUsers(data);

    const userObj = sanitizeUser({ ...newUser, role: assignedRole });
    const token   = signToken(userObj);
    await saveUserToPostgres(userObj, hashed);

    return res.status(201).json({ success: true, token, user: userObj, role: assignedRole });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration service error' });
  }
}

module.exports = { login, register };
