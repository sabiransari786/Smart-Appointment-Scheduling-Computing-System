import 'express-async-errors';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';

dotenv.config();
const app = express();
app.use(cors({ origin: process.env.CLIENT_URL?.split(',') || true }));
app.use(express.json());
app.use(morgan('dev'));

const schema = (definition) => new mongoose.Schema(definition, { timestamps: true });
const User = mongoose.model('User', schema({
  name: { type: String, required: true, trim: true }, email: { type: String, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true }, role: { type: String, enum: ['admin', 'patient'], default: 'patient' }, active: { type: Boolean, default: true }
}));
const Department = mongoose.model('Department', schema({
  name: { type: String, required: true, unique: true, trim: true }, description: String, duration: { type: Number, min: 5, default: 30 }, active: { type: Boolean, default: true }
}));
const Provider = mongoose.model('Provider', schema({
  name: { type: String, required: true, trim: true }, email: { type: String, required: true, unique: true, lowercase: true }, phone: String,
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true }, active: { type: Boolean, default: true },
  workingDays: { type: [Number], default: [1, 2, 3, 4, 5] }, startTime: { type: String, default: '09:00' }, endTime: { type: String, default: '17:00' },
  slotDuration: { type: Number, min: 5, default: 30 }
}));
const Patient = mongoose.model('Patient', schema({
  name: { type: String, required: true, trim: true }, email: { type: String, required: true, unique: true, lowercase: true }, phone: String,
  dateOfBirth: Date, active: { type: Boolean, default: true }, notes: String
}));
const Appointment = mongoose.model('Appointment', schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true }, provider: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true }, start: { type: Date, required: true }, end: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'confirmed', 'cancelled', 'completed'], default: 'pending' }, reason: String, notes: String
}));
const Notification = mongoose.model('Notification', schema({ title: String, message: String, type: { type: String, default: 'info' }, read: { type: Boolean, default: false } }));
const AuditLog = mongoose.model('AuditLog', schema({ action: String, actor: String, entity: String, entityId: String, metadata: mongoose.Schema.Types.Mixed }));

const auth = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Authentication required.' });
  try { req.admin = jwt.verify(token, process.env.JWT_SECRET); next(); } catch { return res.status(401).json({ message: 'Session expired. Please sign in again.' }); }
};
const validate = (req, res, next) => { const errors = validationResult(req); if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() }); next(); };
const log = (action, entity, entityId, req) => AuditLog.create({ action, entity, entityId, actor: req.admin.email, metadata: { ip: req.ip } });
const id = (value) => mongoose.Types.ObjectId.isValid(value);

app.get('/api/health', (_, res) => res.json({ ok: true }));

const mockNow = new Date();
const mockDate = (days, hour) => {
  const date = new Date(mockNow);
  date.setDate(date.getDate() + days);
  date.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return date.toISOString();
};
const mockDb = {
  patients: [
    { _id: 'patient-1', name: 'Aarav Sharma', email: 'aarav@example.com', phone: '+91 98765 43210', active: true },
    { _id: 'patient-2', name: 'Maya Patel', email: 'maya@example.com', phone: '+91 98765 43211', active: true },
    { _id: 'patient-3', name: 'Daniel Wilson', email: 'daniel@example.com', phone: '+1 555 010 2200', active: true }
  ],
  departments: [
    { _id: 'department-1', name: 'Cardiology', description: 'Heart and cardiovascular care', duration: 30, active: true },
    { _id: 'department-2', name: 'General Medicine', description: 'Primary care consultations', duration: 30, active: true },
    { _id: 'department-3', name: 'Dermatology', description: 'Skin health and treatment', duration: 45, active: true }
  ],
  providers: [
    { _id: 'provider-1', name: 'Dr. Priya Mehta', email: 'priya@example.com', phone: '+91 98765 10001', department: 'department-1', active: true, workingDays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '17:00', slotDuration: 30 },
    { _id: 'provider-2', name: 'Dr. James Carter', email: 'james@example.com', phone: '+1 555 010 1002', department: 'department-2', active: true, workingDays: [1, 2, 3, 4, 5], startTime: '10:00', endTime: '18:00', slotDuration: 30 }
  ],
  appointments: [
    { _id: 'appointment-1', patient: 'patient-1', provider: 'provider-1', department: 'department-1', start: mockDate(0, 10), end: mockDate(0, 10.5), status: 'confirmed', reason: 'Follow-up consultation' },
    { _id: 'appointment-2', patient: 'patient-2', provider: 'provider-2', department: 'department-2', start: mockDate(1, 11), end: mockDate(1, 11.5), status: 'pending', reason: 'Routine check-up' },
    { _id: 'appointment-3', patient: 'patient-3', provider: 'provider-1', department: 'department-1', start: mockDate(-1, 14), end: mockDate(-1, 14.5), status: 'completed', reason: 'Cardiology review' }
  ],
  notifications: [
    { _id: 'notification-1', title: 'Welcome to the admin dashboard', message: 'Dummy data mode is enabled. You can safely explore every screen.', type: 'info', read: false, createdAt: mockDate(0, 8) },
    { _id: 'notification-2', title: 'Appointment pending confirmation', message: 'Maya Patel has a pending appointment for tomorrow.', type: 'warning', read: false, createdAt: mockDate(0, 9) }
  ],
  activity: [{ _id: 'activity-1', action: 'system_started', actor: 'admin@example.com', entity: 'system', createdAt: mockDate(0, 8) }]
};

const mockRecord = (type, record) => ({
  ...record,
  ...(type === 'providers' ? { department: mockDb.departments.find((item) => item._id === record.department) || record.department } : {}),
  ...(type === 'appointments' ? {
    patient: mockDb.patients.find((item) => item._id === record.patient) || record.patient,
    provider: mockRecord('providers', mockDb.providers.find((item) => item._id === record.provider) || { department: record.department }),
    department: mockDb.departments.find((item) => item._id === record.department) || record.department
  } : {})
});

const mockApi = (req, res) => {
  const path = req.path.replace(/^\/(?:api\/)?/, '');
  if (path === 'auth/login') {
    const email = req.body.email?.toLowerCase();
    if (email !== (process.env.ADMIN_EMAIL || 'admin@example.com') || req.body.password !== (process.env.ADMIN_PASSWORD || 'ChangeMe123!')) {
      return res.status(401).json({ message: 'Invalid admin credentials.' });
    }
    const user = { id: 'admin-1', name: 'System Administrator', email, role: 'admin' };
    return res.json({ token: jwt.sign(user, process.env.JWT_SECRET || 'local-secret', { expiresIn: '8h' }), user });
  }
  if (path === 'auth/logout') return res.json({ message: 'Logged out.' });
  if (path === 'dashboard') {
    const today = new Date().toDateString();
    const todayAppointments = mockDb.appointments.filter((item) => new Date(item.start).toDateString() === today && item.status !== 'cancelled').length;
    const statuses = Object.fromEntries(['pending', 'confirmed', 'completed', 'cancelled'].map((status) => [status, mockDb.appointments.filter((item) => item.status === status).length]).filter(([, count]) => count));
    return res.json({ totals: { patients: mockDb.patients.length, providers: mockDb.providers.length, appointments: mockDb.appointments.length, todayAppointments, availableSlots: Math.max(mockDb.providers.length * 16 - todayAppointments, 0) }, statuses, utilization: Math.round(todayAppointments / (mockDb.providers.length * 16) * 100), recent: mockDb.appointments.map((item) => mockRecord('appointments', item)) });
  }
  if (path === 'schedule') {
    const from = new Date(); from.setHours(0, 0, 0, 0);
    return res.json(Array.from({ length: 7 }, (_, index) => {
      const date = new Date(from); date.setDate(date.getDate() + index);
      return { date: date.toISOString(), appointments: mockDb.appointments.filter((item) => new Date(item.start).toDateString() === date.toDateString()).length, availableProviders: mockDb.providers.length, blocked: false };
    }));
  }
  if (path === 'reports') {
    const byStatus = Object.entries(mockDb.appointments.reduce((counts, item) => ({ ...counts, [item.status]: (counts[item.status] || 0) + 1 }), {})).map(([_id, count]) => ({ _id, count }));
    const byDay = Object.entries(mockDb.appointments.reduce((counts, item) => { const day = item.start.slice(0, 10); return { ...counts, [day]: (counts[day] || 0) + 1 }; }, {})).map(([_id, count]) => ({ _id, count }));
    return res.json({ byStatus, byProvider: [], byDay });
  }
  if (path === 'notifications') return res.json(mockDb.notifications);
  if (path === 'activity') return res.json(mockDb.activity);
  const resourceMatch = path.match(/^(patients|providers|departments)(?:\/([^/]+))?$/);
  if (resourceMatch) {
    const [, type, recordId] = resourceMatch;
    if (req.method === 'GET') {
      const search = String(req.query.search || '').toLowerCase();
      return res.json(mockDb[type].filter((item) => !search || `${item.name} ${item.email || ''} ${item.phone || ''}`.toLowerCase().includes(search)).map((item) => mockRecord(type, item)));
    }
    if (req.method === 'POST') {
      const item = { _id: `${type.slice(0, -1)}-${Date.now()}`, active: true, ...req.body };
      mockDb[type].unshift(item);
      return res.status(201).json(mockRecord(type, item));
    }
    if (req.method === 'PATCH') {
      const item = mockDb[type].find((entry) => entry._id === recordId);
      if (!item) return res.status(404).json({ message: 'Record not found.' });
      Object.assign(item, req.body);
      return res.json(mockRecord(type, item));
    }
  }
  const appointmentMatch = path.match(/^appointments(?:\/([^/]+))?$/);
  if (appointmentMatch) {
    if (req.method === 'GET') return res.json(mockDb.appointments.filter((item) => !req.query.status || item.status === req.query.status).map((item) => mockRecord('appointments', item)));
    if (req.method === 'POST') {
      const item = { _id: `appointment-${Date.now()}`, status: 'pending', ...req.body };
      if (!item.department) item.department = mockDb.providers.find((provider) => provider._id === item.provider)?.department;
      mockDb.appointments.unshift(item);
      return res.status(201).json(mockRecord('appointments', item));
    }
    const item = mockDb.appointments.find((entry) => entry._id === appointmentMatch[1]);
    if (!item) return res.status(404).json({ message: 'Appointment not found.' });
    Object.assign(item, req.body);
    return res.json(mockRecord('appointments', item));
  }
  return res.status(404).json({ message: 'Mock endpoint not found.' });
};

if (process.env.MOCK_DATA === 'true') app.use('/api', mockApi);
app.post('/api/auth/login', [
  body('email').isEmail().withMessage('Enter a valid email.'), body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
], validate, async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase(), role: 'admin' });
  if (!user || !user.active || !(await bcrypt.compare(req.body.password, user.passwordHash))) return res.status(401).json({ message: 'Invalid admin credentials.' });
  const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
  await AuditLog.create({ action: 'login', entity: 'admin', entityId: user._id.toString(), actor: user.email });
  res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
});
app.post('/api/auth/logout', auth, async (req, res) => { await log('logout', 'admin', req.admin.id, req); res.json({ message: 'Logged out.' }); });

app.get('/api/dashboard', auth, async (_, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0); const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const [patients, providers, appointments, todayAppointments, statuses, recent] = await Promise.all([
    Patient.countDocuments({ active: true }), Provider.countDocuments({ active: true }), Appointment.countDocuments(),
    Appointment.countDocuments({ start: { $gte: today, $lt: tomorrow }, status: { $ne: 'cancelled' } }),
    Appointment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]), Appointment.find().sort({ createdAt: -1 }).limit(8).populate('patient provider department')
  ]);
  const counts = Object.fromEntries(statuses.map((s) => [s._id, s.count]));
  const capacity = providers * 16;
  res.json({ totals: { patients, providers, appointments, todayAppointments, availableSlots: Math.max(capacity - todayAppointments, 0) }, statuses: counts, utilization: providers ? Math.round((todayAppointments / Math.max(capacity, 1)) * 100) : 0, recent });
});

const resourceRoutes = [
  ['patients', Patient, ['name', 'email', 'phone', 'dateOfBirth', 'notes']],
  ['providers', Provider, ['name', 'email', 'phone', 'department', 'workingDays', 'startTime', 'endTime', 'slotDuration']],
  ['departments', Department, ['name', 'description', 'duration']]
];
for (const [path, Model, fields] of resourceRoutes) {
  app.get(`/api/${path}`, auth, async (req, res) => {
    const q = req.query.search ? { $or: fields.filter((f) => ['name', 'email', 'phone'].includes(f)).map((f) => ({ [f]: new RegExp(req.query.search, 'i') })) } : {};
    const query = Model.find(q).sort({ createdAt: -1 }).limit(500);
    if (path === 'providers') query.populate('department');
    res.json(await query);
  });
  app.post(`/api/${path}`, auth, fields.map((f) => body(f).optional()), validate, async (req, res) => { const item = await Model.create(req.body); await log(`create_${path.slice(0, -1)}`, path, item._id, req); res.status(201).json(item); });
  app.patch(`/api/${path}/:id`, auth, async (req, res) => { if (!id(req.params.id)) return res.status(400).json({ message: 'Invalid record id.' }); const item = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }); if (!item) return res.status(404).json({ message: 'Record not found.' }); await log(`update_${path.slice(0, -1)}`, path, item._id, req); res.json(item); });
}
app.patch('/api/patients/:id/status', auth, async (req, res) => { const item = await Patient.findByIdAndUpdate(req.params.id, { active: req.body.active }, { new: true }); res.json(item); });
app.patch('/api/providers/:id/status', auth, async (req, res) => { const item = await Provider.findByIdAndUpdate(req.params.id, { active: req.body.active }, { new: true }); res.json(item); });

const appointmentInput = [body('patient').custom(id).withMessage('Valid patient is required.'), body('provider').custom(id).withMessage('Valid provider is required.'), body('start').isISO8601().withMessage('Valid start time is required.'), body('end').isISO8601().withMessage('Valid end time is required.')];
const conflict = async ({ provider, start, end, exclude }) => Appointment.findOne({ provider, status: { $in: ['pending', 'confirmed'] }, ...(exclude ? { _id: { $ne: exclude } } : {}), start: { $lt: end }, end: { $gt: start } });
app.get('/api/appointments', auth, async (req, res) => { const query = {}; if (req.query.status) query.status = req.query.status; if (req.query.date) { const d = new Date(req.query.date); const n = new Date(d); n.setDate(d.getDate() + 1); query.start = { $gte: d, $lt: n }; } const items = await Appointment.find(query).populate('patient provider department').sort({ start: -1 }).limit(1000); res.json(items); });
app.post('/api/appointments', auth, appointmentInput, validate, async (req, res) => {
  const [patient, provider] = await Promise.all([Patient.findById(req.body.patient), Provider.findById(req.body.provider)]);
  if (!patient?.active || !provider?.active) return res.status(400).json({ message: 'Patient and provider must be active.' });
  const start = new Date(req.body.start), end = new Date(req.body.end); if (end <= start) return res.status(400).json({ message: 'End time must be after start time.' });
  const day = start.getDay() || 7; const hhmm = start.toTimeString().slice(0, 5); const endHhmm = end.toTimeString().slice(0, 5);
  if (!provider.workingDays.includes(day) || hhmm < provider.startTime || endHhmm > provider.endTime) return res.status(409).json({ message: 'Provider is unavailable during this time.' });
  if (await conflict({ provider: provider._id, start, end })) return res.status(409).json({ message: 'This provider already has an overlapping appointment.' });
  const department = req.body.department || provider.department; const item = await Appointment.create({ ...req.body, department, start, end }); await log('create_appointment', 'appointment', item._id, req); res.status(201).json(await item.populate('patient provider department'));
});
app.patch('/api/appointments/:id', auth, async (req, res) => {
  const current = await Appointment.findById(req.params.id); if (!current) return res.status(404).json({ message: 'Appointment not found.' });
  const data = { ...req.body }; if (data.start) data.start = new Date(data.start); if (data.end) data.end = new Date(data.end); const provider = data.provider || current.provider;
  if ((data.start || data.end || data.provider) && await conflict({ provider, start: data.start || current.start, end: data.end || current.end, exclude: current._id })) return res.status(409).json({ message: 'The change creates an overlapping appointment.' });
  const item = await Appointment.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true }).populate('patient provider department'); await log(`appointment_${data.status || 'updated'}`, 'appointment', item._id, req); res.json(item);
});
app.get('/api/schedule', auth, async (_, res) => {
  const from = new Date(); from.setHours(0, 0, 0, 0);
  const to = new Date(from); to.setDate(to.getDate() + 7);
  const [appointments, providers] = await Promise.all([
    Appointment.find({ start: { $gte: from, $lt: to }, status: { $ne: 'cancelled' } }),
    Provider.find({ active: true })
  ]);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(from); date.setDate(from.getDate() + index);
    const day = date.getDay() || 7;
    const dayAppointments = appointments.filter((appointment) => new Date(appointment.start).toDateString() === date.toDateString());
    const workingProviders = providers.filter((provider) => provider.workingDays.includes(day));
    return { date, appointments: dayAppointments.length, availableProviders: workingProviders.length, blocked: workingProviders.length === 0 };
  });
  res.json(days);
});

app.get('/api/reports', auth, async (req, res) => {
  const match = {}; if (req.query.from || req.query.to) match.start = { ...(req.query.from ? { $gte: new Date(req.query.from) } : {}), ...(req.query.to ? { $lte: new Date(req.query.to) } : {}) };
  const [byStatus, byProvider, byDay] = await Promise.all([Appointment.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]), Appointment.aggregate([{ $match: match }, { $group: { _id: '$provider', count: { $sum: 1 } } }, { $lookup: { from: 'providers', localField: '_id', foreignField: '_id', as: 'provider' } }]), Appointment.aggregate([{ $match: match }, { $group: { _id: { $dateToString: { date: '$start', format: '%Y-%m-%d' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }])]); res.json({ byStatus, byProvider, byDay });
});
app.get('/api/notifications', auth, async (_, res) => res.json(await Notification.find().sort({ createdAt: -1 }).limit(100)));
app.post('/api/notifications', auth, body('title').notEmpty(), body('message').notEmpty(), validate, async (req, res) => res.status(201).json(await Notification.create(req.body)));
app.get('/api/activity', auth, async (_, res) => res.json(await AuditLog.find().sort({ createdAt: -1 }).limit(200)));
app.use((err, _req, res, _next) => { console.error(err); res.status(err.name === 'ValidationError' ? 400 : 500).json({ message: err.name === 'ValidationError' ? err.message : 'Unexpected server error.' }); });

const port = process.env.PORT || 5000;
const startServer = () => app.listen(port, () => console.log(`API listening on ${port}${process.env.MOCK_DATA === 'true' ? ' (dummy data mode)' : ''}`));
if (process.env.MOCK_DATA === 'true') {
  startServer();
} else mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smart_appointments').then(async () => {
  const email = process.env.ADMIN_EMAIL || 'admin@example.com'; if (!await User.exists({ email })) await User.create({ name: 'System Administrator', email, passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'ChangeMe123!', 12), role: 'admin' });
  startServer();
}).catch((error) => { console.error('MongoDB connection failed:', error.message); process.exit(1); });
