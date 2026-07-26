/**
 * Minhas Academy ERP — Backend API (PostgreSQL / Supabase edition)
 *
 * Real multi-tenant auth + a REAL, PERMANENT database (Postgres via Supabase's
 * free tier). Unlike a local JSON file, this data survives redeploys, server
 * restarts, and scales to many schools safely.
 *
 * Every school that signs up gets its own isolated data (scoped by school_id).
 * Passwords are hashed with bcrypt. Sessions use JWT tokens.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-before-going-live';
const PORT = process.env.PORT || 4000;

if(!process.env.DATABASE_URL){
  console.error('\n❌ Missing DATABASE_URL environment variable.');
  console.error('   Set it to your Supabase Postgres connection string before starting the server.');
  console.error('   See README.md for step-by-step instructions.\n');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // required by Supabase's pooled connection
});

const app = express();
app.use(cors());
app.use(express.json());

/* ---------------- helpers ---------------- */
function sign(user){
  return jwt.sign({ id: user.id, schoolId: user.schoolId, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
}
function auth(req, res, next){
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if(!token) return res.status(401).json({ error: 'Missing token' });
  try{
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  }catch(e){
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
function requireRole(...roles){
  return (req, res, next) => {
    if(!roles.includes(req.user.role)) return res.status(403).json({ error: 'Not authorized for this action' });
    next();
  };
}
function mapSchool(row){
  if(!row) return null;
  return {
    id: row.id, name: row.name, tagline: row.tagline,
    primaryColor: row.primary_color, goldColor: row.gold_color, logoLetter: row.logo_letter,
    contact: row.contact, address: row.address
  };
}

/* ================= AUTH ================= */

// Register a brand-new school + its first Admin account
app.post('/api/auth/signup', async (req, res) => {
  const { schoolName, adminName, username, password } = req.body || {};
  if(!schoolName || !adminName || !username || !password){
    return res.status(400).json({ error: 'schoolName, adminName, username and password are all required' });
  }
  const client = await pool.connect();
  try{
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM users WHERE username=$1', [username]);
    if(existing.rows.length){
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'That username is already taken' });
    }
    const schoolResult = await client.query(
      `INSERT INTO schools (name, tagline, logo_letter) VALUES ($1,$2,$3) RETURNING *`,
      [schoolName, 'School & Academy Management', schoolName.charAt(0).toUpperCase()]
    );
    const school = schoolResult.rows[0];
    const passwordHash = bcrypt.hashSync(password, 10);
    const userResult = await client.query(
      `INSERT INTO users (school_id, name, username, password_hash, role) VALUES ($1,$2,$3,$4,'Admin') RETURNING *`,
      [school.id, adminName, username, passwordHash]
    );
    await client.query('COMMIT');
    const user = userResult.rows[0];
    const token = sign({ id: user.id, schoolId: school.id, role: 'Admin', name: adminName });
    res.json({ token, user: { id: user.id, name: adminName, role: 'Admin', schoolId: school.id }, school: mapSchool(school) });
  }catch(e){
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Signup failed: ' + e.message });
  }finally{
    client.release();
  }
});

// Admin creates additional staff/parent/teacher logins for their own school
app.post('/api/auth/create-user', auth, requireRole('Admin'), async (req, res) => {
  const { name, username, password, role } = req.body || {};
  if(!name || !username || !password || !role) return res.status(400).json({ error: 'name, username, password, role required' });
  try{
    const existing = await pool.query('SELECT id FROM users WHERE username=$1', [username]);
    if(existing.rows.length) return res.status(409).json({ error: 'Username already taken' });
    const result = await pool.query(
      `INSERT INTO users (school_id, name, username, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, role`,
      [req.user.schoolId, name, username, bcrypt.hashSync(password, 10), role]
    );
    res.json(result.rows[0]);
  }catch(e){
    res.status(500).json({ error: 'Could not create user: ' + e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  try{
    const result = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    const user = result.rows[0];
    if(!user || !bcrypt.compareSync(password || '', user.password_hash)){
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const schoolResult = await pool.query('SELECT * FROM schools WHERE id=$1', [user.school_id]);
    const token = sign({ id: user.id, schoolId: user.school_id, role: user.role, name: user.name });
    res.json({
      token,
      user: { id: user.id, name: user.name, role: user.role, schoolId: user.school_id },
      school: mapSchool(schoolResult.rows[0])
    });
  }catch(e){
    res.status(500).json({ error: 'Login failed: ' + e.message });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try{
    const schoolResult = await pool.query('SELECT * FROM schools WHERE id=$1', [req.user.schoolId]);
    res.json({ user: req.user, school: mapSchool(schoolResult.rows[0]) });
  }catch(e){
    res.status(500).json({ error: e.message });
  }
});

/* ================= SCHOOL / BRANDING ================= */
app.get('/api/school', auth, async (req, res) => {
  try{
    const result = await pool.query('SELECT * FROM schools WHERE id=$1', [req.user.schoolId]);
    res.json(mapSchool(result.rows[0]));
  }catch(e){ res.status(500).json({ error: e.message }); }
});

app.put('/api/school', auth, requireRole('Admin'), async (req, res) => {
  const { name, tagline, primaryColor, goldColor, logoLetter, contact, address } = req.body || {};
  try{
    const result = await pool.query(
      `UPDATE schools SET
        name = COALESCE($1, name), tagline = COALESCE($2, tagline),
        primary_color = COALESCE($3, primary_color), gold_color = COALESCE($4, gold_color),
        logo_letter = COALESCE($5, logo_letter), contact = COALESCE($6, contact), address = COALESCE($7, address)
       WHERE id=$8 RETURNING *`,
      [name, tagline, primaryColor, goldColor, logoLetter, contact, address, req.user.schoolId]
    );
    res.json(mapSchool(result.rows[0]));
  }catch(e){ res.status(500).json({ error: e.message }); }
});

/* ================= GENERIC CRUD (scoped to caller's school, stored as JSON rows) ================= */
function crud(collectionName, allowedRoles = { write: null }){
  const router = express.Router();

  router.get('/', auth, async (req, res) => {
    try{
      const result = await pool.query(
        'SELECT id, data FROM records WHERE school_id=$1 AND collection=$2 ORDER BY created_at ASC',
        [req.user.schoolId, collectionName]
      );
      res.json(result.rows.map(r => ({ id: r.id, ...r.data })));
    }catch(e){ res.status(500).json({ error: e.message }); }
  });

  router.post('/', auth, async (req, res) => {
    if(allowedRoles.write && !allowedRoles.write.includes(req.user.role)) return res.status(403).json({ error: 'Not authorized' });
    try{
      const result = await pool.query(
        'INSERT INTO records (school_id, collection, data) VALUES ($1,$2,$3) RETURNING id, data',
        [req.user.schoolId, collectionName, JSON.stringify(req.body || {})]
      );
      res.json({ id: result.rows[0].id, ...result.rows[0].data });
    }catch(e){ res.status(500).json({ error: e.message }); }
  });

  router.put('/:id', auth, async (req, res) => {
    if(allowedRoles.write && !allowedRoles.write.includes(req.user.role)) return res.status(403).json({ error: 'Not authorized' });
    try{
      const result = await pool.query(
        `UPDATE records SET data = data || $1::jsonb WHERE id=$2 AND school_id=$3 AND collection=$4 RETURNING id, data`,
        [JSON.stringify(req.body || {}), req.params.id, req.user.schoolId, collectionName]
      );
      if(!result.rows.length) return res.status(404).json({ error: 'Not found' });
      res.json({ id: result.rows[0].id, ...result.rows[0].data });
    }catch(e){ res.status(500).json({ error: e.message }); }
  });

  router.delete('/:id', auth, async (req, res) => {
    if(allowedRoles.write && !allowedRoles.write.includes(req.user.role)) return res.status(403).json({ error: 'Not authorized' });
    try{
      await pool.query('DELETE FROM records WHERE id=$1 AND school_id=$2 AND collection=$3', [req.params.id, req.user.schoolId, collectionName]);
      res.json({ ok: true });
    }catch(e){ res.status(500).json({ error: e.message }); }
  });

  return router;
}

app.use('/api/students', crud('students', { write: ['Admin','Teacher'] }));
app.use('/api/staff', crud('staff', { write: ['Admin','Accountant'] }));
app.use('/api/fees', crud('fees', { write: ['Admin','Accountant'] }));
app.use('/api/expenses', crud('expenses', { write: ['Admin','Accountant'] }));
app.use('/api/attendance', crud('attendance', { write: ['Admin','Teacher'] }));
app.use('/api/homework', crud('homework', { write: ['Admin','Teacher'] }));
app.use('/api/notices', crud('notices', { write: ['Admin','Teacher'] }));
app.use('/api/events', crud('events', { write: ['Admin','Teacher'] }));
app.use('/api/complaints', crud('complaints', { write: null }));
app.use('/api/admissions', crud('admissions', { write: ['Admin'] }));
app.use('/api/library', crud('library', { write: ['Admin','Teacher'] }));
app.use('/api/transport', crud('transport', { write: ['Admin'] }));
app.use('/api/exams', crud('exams', { write: ['Admin','Teacher'] }));

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Minhas Academy ERP API is running (Postgres edition).' });
});

app.get('/api/health', async (req, res) => {
  try{
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  }catch(e){
    res.status(500).json({ status: 'error', database: 'unreachable', error: e.message });
  }
});

app.listen(PORT, () => console.log(`Minhas ERP backend (Postgres) running on port ${PORT}`));
