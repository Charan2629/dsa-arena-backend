require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: [process.env.CLIENT_URL, 'http://localhost:5173'], credentials: true } });

// Register on the app so any route can access it via req.app.get('io')
app.set('io', io);

// Export io immediately so route imports can require it without circular dependency issues
module.exports = { io };

io.on('connection', (socket) => {
  socket.on('send_taunt', (data) => {
    io.emit('receive_taunt', data);
  });
});

// Global bounty flag
global.firstSolveClaimed = false;

const connectDB = require('./config/db');
const scheduleDailyReset = require('./config/cron');
const { scheduleHourlyDecay } = require('./cronScheduler');

// --- Route imports ---
const solveRoutes = require('./routes/solveRoutes');
const userRoutes  = require('./routes/userRoutes');
const authRoutes  = require('./routes/authRoutes');

const PORT = process.env.PORT || 5000;

// --- Connect to MongoDB ---
connectDB();

// --- Start scheduled jobs ---
scheduleDailyReset();
scheduleHourlyDecay();

// --- Middleware ---
app.use(cors({ origin: [process.env.CLIENT_URL, 'http://localhost:5173'], credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// --- Routes ---
app.use('/api/auth',   authRoutes);
app.use('/api/solves', solveRoutes);
app.use('/api/users',  userRoutes);

// --- Health check ---
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'DSA Sprint Arena API is running 🚀' });
});

// --- 404 handler ---
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// --- Global error handler ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// --- Start server ---
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
