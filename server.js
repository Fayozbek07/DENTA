import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import session from "express-session";
import pg from "pg";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});
const PgSession = connectPgSimple(session);

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.APP_ORIGIN || "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: "30kb" }));
app.use(session({
  store: new PgSession({ pool, tableName: "user_sessions", createTableIfMissing: true }),
  name: "dentalux.sid",
  secret: process.env.SESSION_SECRET || "local-development-only-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));
app.use(express.static(path.join(__dirname, "public")));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const requireAuth = (req, res, next) => req.session.user ? next() : res.status(401).json({ error: "Tizimga kiring." });
const requireRole = (...roles) => (req, res, next) =>
  req.session.user && roles.includes(req.session.user.role) ? next() : res.status(403).json({ error: "Ruxsat yo‘q." });

app.get("/api/health", (req, res) => res.json({ ok: true, service: "Denta Lux CRM" }));

app.post("/api/auth/login", loginLimiter, asyncRoute(async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(8).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Email yoki parol formati noto‘g‘ri." });
  const { rows } = await pool.query("SELECT id, full_name, email, password_hash, role, doctor_id FROM users WHERE email=$1", [parsed.data.email.toLowerCase()]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
    return res.status(401).json({ error: "Email yoki parol noto‘g‘ri." });
  }
  req.session.user = { id: user.id, name: user.full_name, email: user.email, role: user.role, doctorId: user.doctor_id };
  res.json({ user: req.session.user });
}));

app.post("/api/auth/logout", requireAuth, (req, res) => req.session.destroy(() => {
  res.clearCookie("dentalux.sid"); res.json({ ok: true });
}));
app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: req.session.user }));

// Public: list active doctors/services and request an appointment.
app.get("/api/public/doctors", asyncRoute(async (req, res) => {
  const { rows } = await pool.query("SELECT id, full_name, specialty FROM doctors WHERE is_active=true ORDER BY full_name");
  res.json(rows);
}));
app.get("/api/public/services", asyncRoute(async (req, res) => {
  const { rows } = await pool.query("SELECT id, name, price, duration_minutes FROM services WHERE is_active=true ORDER BY name");
  res.json(rows);
}));
app.post("/api/public/appointments", asyncRoute(async (req, res) => {
  const schema = z.object({
    fullName: z.string().trim().min(2).max(140),
    phone: z.string().trim().min(7).max(30),
    doctorId: z.string().uuid(),
    serviceId: z.string().uuid(),
    startsAt: z.string().datetime(),
    notes: z.string().max(1000).optional().default("")
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Ma’lumotlarni tekshirib qayta kiriting." });
  const d = parsed.data;
  const start = new Date(d.startsAt);
  if (start <= new Date()) return res.status(400).json({ error: "O‘tgan vaqtga bron qilib bo‘lmaydi." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let patient = await client.query("SELECT id FROM patients WHERE phone=$1", [d.phone]);
    if (!patient.rowCount) {
      patient = await client.query(
        "INSERT INTO patients(full_name, phone) VALUES($1,$2) RETURNING id",
        [d.fullName, d.phone]
      );
    } else {
      await client.query("UPDATE patients SET full_name=$1 WHERE id=$2", [d.fullName, patient.rows[0].id]);
    }
    const svc = await client.query("SELECT duration_minutes FROM services WHERE id=$1 AND is_active=true", [d.serviceId]);
    const doc = await client.query("SELECT id FROM doctors WHERE id=$1 AND is_active=true", [d.doctorId]);
    if (!svc.rowCount || !doc.rowCount) throw Object.assign(new Error("Shifokor yoki xizmat topilmadi."), { status: 400 });
    const end = new Date(start.getTime() + Number(svc.rows[0].duration_minutes) * 60000);
    const result = await client.query(
      `INSERT INTO appointments(patient_id,doctor_id,service_id,starts_at,ends_at,notes,source)
       VALUES($1,$2,$3,$4,$5,$6,'website') RETURNING id,status`,
      [patient.rows[0].id, d.doctorId, d.serviceId, start, end, d.notes]
    );
    await client.query("COMMIT");
    res.status(201).json({ message: "Qabul so‘rovi yuborildi. Tasdiqlash uchun klinika siz bilan bog‘lanadi.", appointment: result.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23P01" || err.code === "23505") return res.status(409).json({ error: "Bu shifokor tanlangan vaqtda band. Boshqa vaqtni tanlang." });
    throw err;
  } finally { client.release(); }
}));

// Admin/receptionist dashboard.
app.get("/api/admin/summary", requireAuth, requireRole("admin","receptionist"), asyncRoute(async (req,res)=>{
  const { rows } = await pool.query(`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status='pending')::int AS pending,
      COUNT(*) FILTER (WHERE status='confirmed')::int AS confirmed,
      COUNT(*) FILTER (WHERE starts_at::date=CURRENT_DATE AND status IN ('pending','confirmed'))::int AS today
    FROM appointments`);
  res.json(rows[0]);
}));
app.get("/api/admin/appointments", requireAuth, requireRole("admin","receptionist"), asyncRoute(async (req,res)=>{
  const { rows } = await pool.query(`
    SELECT a.id, p.full_name AS patient, p.phone, d.full_name AS doctor, s.name AS service,
      a.starts_at, a.ends_at, a.status, a.source, a.notes
    FROM appointments a JOIN patients p ON p.id=a.patient_id
    JOIN doctors d ON d.id=a.doctor_id JOIN services s ON s.id=a.service_id
    ORDER BY a.starts_at DESC LIMIT 300`);
  res.json(rows);
}));
app.patch("/api/admin/appointments/:id/status", requireAuth, requireRole("admin","receptionist"), asyncRoute(async(req,res)=>{
  const idSchema=z.string().uuid(); const statusSchema=z.enum(["confirmed","completed","cancelled","no_show"]);
  if(!idSchema.safeParse(req.params.id).success || !statusSchema.safeParse(req.body.status).success)
    return res.status(400).json({error:"Noto‘g‘ri ID yoki holat."});
  const {rows}=await pool.query("UPDATE appointments SET status=$1 WHERE id=$2 RETURNING id,status",[req.body.status,req.params.id]);
  if(!rows.length)return res.status(404).json({error:"Bron topilmadi."});
  res.json(rows[0]);
}));
app.get("/api/admin/patients", requireAuth, requireRole("admin","receptionist","doctor"), asyncRoute(async(req,res)=>{
  const {rows}=await pool.query(`SELECT p.id,p.full_name,p.phone,p.email,p.created_at,COUNT(a.id)::int AS visits
    FROM patients p LEFT JOIN appointments a ON a.patient_id=p.id
    GROUP BY p.id ORDER BY p.created_at DESC LIMIT 500`);
  res.json(rows);
}));
app.get("/api/admin/doctors", requireAuth, requireRole("admin","receptionist"), asyncRoute(async(req,res)=>{
  const {rows}=await pool.query("SELECT id,full_name,specialty,phone,is_active FROM doctors ORDER BY full_name");
  res.json(rows);
}));
app.post("/api/admin/doctors", requireAuth, requireRole("admin"), asyncRoute(async(req,res)=>{
  const parsed=z.object({fullName:z.string().trim().min(3).max(120),specialty:z.string().trim().min(2).max(120),phone:z.string().max(30).optional()}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Shifokor ma’lumotlari noto‘g‘ri."});
  const {rows}=await pool.query("INSERT INTO doctors(full_name,specialty,phone) VALUES($1,$2,$3) RETURNING *",[parsed.data.fullName,parsed.data.specialty,parsed.data.phone||null]);
  res.status(201).json(rows[0]);
}));
app.get("/api/admin/services", requireAuth, requireRole("admin","receptionist"), asyncRoute(async(req,res)=>{
  const {rows}=await pool.query("SELECT * FROM services ORDER BY name");res.json(rows);
}));
app.post("/api/admin/services", requireAuth, requireRole("admin"), asyncRoute(async(req,res)=>{
  const parsed=z.object({name:z.string().trim().min(2).max(140),description:z.string().max(1000).optional(),price:z.coerce.number().min(0),durationMinutes:z.coerce.number().int().min(5).max(480)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Xizmat ma’lumotlari noto‘g‘ri."});
  const d=parsed.data;const {rows}=await pool.query("INSERT INTO services(name,description,price,duration_minutes) VALUES($1,$2,$3,$4) RETURNING *",[d.name,d.description||"",d.price,d.durationMinutes]);res.status(201).json(rows[0]);
}));
app.get("/api/admin/revenue", requireAuth, requireRole("admin"), asyncRoute(async(req,res)=>{
  const {rows}=await pool.query(`SELECT date_trunc('month',paid_at)::date AS month,SUM(amount)::numeric(12,2) AS revenue
    FROM payments WHERE status='paid' AND paid_at >= now()-interval '12 months'
    GROUP BY 1 ORDER BY 1`);
  res.json(rows);
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : "Serverda xatolik yuz berdi." });
});

async function bootstrap() {
  // Create initial admin once. Set credentials in .env before first launch.
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const existing = await pool.query("SELECT id FROM users WHERE email=$1", [process.env.ADMIN_EMAIL.toLowerCase()]);
    if (!existing.rowCount) {
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
      await pool.query("INSERT INTO users(full_name,email,password_hash,role) VALUES($1,$2,$3,'admin')",
        [process.env.ADMIN_NAME || "Administrator", process.env.ADMIN_EMAIL.toLowerCase(), hash]);
      console.log("Initial admin user created.");
    }
  }
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Denta Lux CRM running at http://localhost:${port}`));
}
bootstrap().catch(err => { console.error("Startup failed:", err); process.exit(1); });
