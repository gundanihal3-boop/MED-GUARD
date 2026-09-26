const express = require('express');
const cors = require('cors');
const path = require('path');
const { seedIfEmpty } = require('./seed');
const { processSmsFallbackAndExpiry } = require('./services/sms');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const encounterRoutes = require('./routes/encounters');
const attendanceRoutes = require('./routes/attendance');
const prescriptionRoutes = require('./routes/prescriptions');
const confirmationRoutes = require('./routes/confirmations');
const smsRoutes = require('./routes/sms');
const adminRoutes = require('./routes/admin');

seedIfEmpty();

const app = express();

const defaultDevOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = configuredOrigins.length > 0
  ? configuredOrigins
  : (process.env.NODE_ENV === 'production' ? [] : defaultDevOrigins);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS origin not allowed'));
  },
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'med-guard', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/encounters', encounterRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/confirmations', confirmationRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/admin', adminRoutes);

// Serve static frontend in production or when frontend/dist is built
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
const fs = require('fs');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Periodic SMS grace / expiry processing
setInterval(async () => {
  try {
    await processSmsFallbackAndExpiry();
  } catch (err) {
    console.error('SMS job error', err);
  }
}, 60 * 1000);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`MED-GUARD API listening on http://localhost:${PORT}`);
  console.log(`SQLite DB: ${path.join(__dirname, '..', 'data', 'medguard.sqlite')}`);
  console.log('Seed logins: reception / doctor1 / doctor2 / kiosk / admin — PIN 1234');
});
