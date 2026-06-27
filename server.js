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
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

async function initializeDatabase() {
  try {
    console.log('🔄 Initializing database...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        hotel_name VARCHAR(255) NOT NULL,
        hotel_address VARCHAR(255),
        rooms_count INTEGER DEFAULT 10,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON reservations(user_id);
      CREATE INDEX IF NOT EXISTS idx_reservations_check_in ON reservations(check_in);
    `);

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    process.exit(1);
  }
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, hotelName, hotelAddress, roomsCount } = req.body;

    if (!email || !password || !hotelName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (email, password, hotel_name, hotel_address, rooms_count) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, hotel_name, hotel_address, rooms_count',
      [email, hashedPassword, hotelName, hotelAddress || '', roomsCount || 10]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret-key', { expiresIn: '30d' });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        hotelName: user.hotel_name,
        hotelAddress: user.hotel_address,
        roomsCount: user.rooms_count,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const validPassword = await bcryptjs.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret-key', { expiresIn: '30d' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        hotelName: user.hotel_name,
        hotelAddress: user.hotel_address,
        roomsCount: user.rooms_count,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.get('/api/user/profile', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, hotel_name, hotel_address, rooms_count, created_at FROM users WHERE id = $1', [req.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      hotelName: user.hotel_name,
      hotelAddress: user.hotel_address,
      roomsCount: user.rooms_count,
      createdAt: user.created_at,
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.get('/api/reservations', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM reservations WHERE user_id = $1 ORDER BY check_in DESC`,
      [req.userId]
    );

    const reservations = result.rows.map((r) => ({
      id: r.id,
      room: r.room,
      checkIn: r.check_in,
      checkOut: r.check_out,
      guestName: r.guest_name,
      guestEmail: r.guest_email,
      guestPhone: r.guest_phone,
      source: r.source,
      amount: r.amount,
      status: r.status,
      notes: r.notes,
      createdAt: r.created_at,
    }));

    res.json(reservations);
  } catch (error) {
    console.error('Get reservations error:', error);
    res.status(500).json({ error: 'Failed to fetch reservations' });
  }
});

app.post('/api/reservations', authMiddleware, async (req, res) => {
  try {
    const { room, checkIn, checkOut, guestName, guestEmail, guestPhone, source, amount, status, notes } = req.body;

    if (!room || !checkIn || !checkOut || !guestName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(
      `INSERT INTO reservations (user_id, room, check_in, check_out, guest_name, guest_email, guest_phone, source, amount, status, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [req.userId, room, checkIn, checkOut, guestName, guestEmail || '', guestPhone || '', source || 'manual', amount || 0, status || 'confirmed', notes || '']
    );

    const r = result.rows[0];
    res.status(201).json({
      id: r.id,
      room: r.room,
      checkIn: r.check_in,
      checkOut: r.check_out,
      guestName: r.guest_name,
      guestEmail: r.guest_email,
      guestPhone: r.guest_phone,
      source: r.source,
      amount: r.amount,
      status: r.status,
      notes: r.notes,
      createdAt: r.created_at,
    });
  } catch (error) {
    console.error('Add reservation error:', error);
    res.status(500).json({ error: 'Failed to add reservation' });
  }
});

app.put('/api/reservations/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { room, checkIn, checkOut, guestName, guestEmail, guestPhone, source, amount, status, notes } = req.body;

    const checkOwnership = await pool.query(
      'SELECT user_id FROM reservations WHERE id = $1',
      [id]
    );

    if (checkOwnership.rows.length === 0 || checkOwnership.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const result = await pool.query(
      `UPDATE reservations SET room = $1, check_in = $2, check_out = $3, guest_name = $4, guest_email = $5, guest_phone = $6, source = $7, amount = $8, status = $9, notes = $10, updated_at = CURRENT_TIMESTAMP WHERE id = $11 RETURNING *`,
      [room, checkIn, checkOut, guestName, guestEmail || '', guestPhone || '', source, amount || 0, status, notes || '', id]
    );

    const r = result.rows[0];
    res.json({
      id: r.id,
      room: r.room,
      checkIn: r.check_in,
      checkOut: r.check_out,
      guestName: r.guest_name,
      guestEmail: r.guest_email,
      guestPhone: r.guest_phone,
      source: r.source,
      amount: r.amount,
      status: r.status,
      notes: r.notes,
      updatedAt: r.updated_at,
    });
  } catch (error) {
    console.error('Update reservation error:', error);
    res.status(500).json({ error: 'Failed to update reservation' });
  }
});

app.delete('/api/reservations/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const checkOwnership = await pool.query(
      'SELECT user_id FROM reservations WHERE id = $1',
      [id]
    );

    if (checkOwnership.rows.length === 0 || checkOwnership.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await pool.query('DELETE FROM reservations WHERE id = $1', [id]);
    res.json({ message: 'Reservation deleted' });
  } catch (error) {
    console.error('Delete reservation error:', error);
    res.status(500).json({ error: 'Failed to delete reservation' });
  }
});

app.get('/api/stats', authMiddleware, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await pool.query(
      `SELECT * FROM reservations WHERE user_id = $1 AND check_in >= $2`,
      [req.userId, thirtyDaysAgo.toISOString().split('T')[0]]
    );

    const reservations = result.rows;
    const totalRevenue = reservations.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const reservationCount = reservations.length;

    res.json({
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      reservationCount,
      averageNightly: reservationCount > 0 ? Math.round((totalRevenue / reservationCount) * 100) / 100 : 0,
      period: '30 days',
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'ReserveFlow backend is running' });
});

app.use(express.static(path.join(__dirname, 'build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`🚀 ReserveFlow Backend running on port ${PORT}`);
  await initializeDatabase();
});

export default app;
