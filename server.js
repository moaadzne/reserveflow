import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pkg from 'pg';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        hotel_name VARCHAR(255) NOT NULL,
        hotel_address VARCHAR(255),
        rooms_count INTEGER DEFAULT 10,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        room VARCHAR(50) NOT NULL,
        check_in DATE NOT NULL,
        check_out DATE NOT NULL,
        guest_name VARCHAR(255) NOT NULL,
        guest_email VARCHAR(255),
        guest_phone VARCHAR(20),
        source VARCHAR(50),
        amount DECIMAL(10, 2),
        status VARCHAR(50) DEFAULT 'confirmed',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Database initialized');
  } catch (error) {
    console.error('Database error:', error);
  }
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, hotelName, hotelAddress, roomsCount } = req.body;
    if (!email || !password || !hotelName) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    const hashedPassword = await bcryptjs.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password, hotel_name, hotel_address, rooms_count) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, hotel_name',
      [email, hashedPassword, hotelName, hotelAddress || '', roomsCount || 10]
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, hotelName: user.hotel_name } });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Email exists' });
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const valid = await bcryptjs.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, hotelName: user.hotel_name } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.get('/api/reservations', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reservations WHERE user_id = $1 ORDER BY check_in DESC', [req.userId]);
    res.json(result.rows.map(r => ({ id: r.id, room: r.room, checkIn: r.check_in, checkOut: r.check_out, guestName: r.guest_name, guestEmail: r.guest_email, guestPhone: r.guest_phone, source: r.source, amount: r.amount, status: r.status, notes: r.notes })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reservations', authMiddleware, async (req, res) => {
  try {
    const { room, checkIn, checkOut, guestName, guestEmail, guestPhone, source, amount, status, notes } = req.body;
    const result = await pool.query('INSERT INTO reservations (user_id, room, check_in, check_out, guest_name, guest_email, guest_phone, source, amount, status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *', [req.userId, room, checkIn, checkOut, guestName, guestEmail || '', guestPhone || '', source || 'manual', amount || 0, status || 'confirmed', notes || '']);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/reservations/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { room, checkIn, checkOut, guestName, guestEmail, guestPhone, source, amount, status, notes } = req.body;
    const check = await pool.query('SELECT user_id FROM reservations WHERE id = $1', [id]);
    if (check.rows.length === 0 || check.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Not authorized' });
    const result = await pool.query('UPDATE reservations SET room = $1, check_in = $2, check_out = $3, guest_name = $4, guest_email = $5, guest_phone = $6, source = $7, amount = $8, status = $9, notes = $10 WHERE id = $11 RETURNING *', [room, checkIn, checkOut, guestName, guestEmail || '', guestPhone || '', source, amount || 0, status, notes || '', id]);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/reservations/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const check = await pool.query('SELECT user_id FROM reservations WHERE id = $1', [id]);
    if (check.rows.length === 0 || check.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Not authorized' });
    await pool.query('DELETE FROM reservations WHERE id = $1', [id]);
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reservations WHERE user_id = $1', [req.userId]);
    const totalRevenue = result.rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    res.json({ totalRevenue: totalRevenue.toFixed(2), reservationCount: result.rows.length, averageNightly: result.rows.length > 0 ? (totalRevenue / result.rows.length).toFixed(2) : 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on ${PORT}`);
  await initializeDatabase();
});

export default app;
