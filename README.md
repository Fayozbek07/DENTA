# Denta Lux CRM — boshlang‘ich professional loyiha

## 0. Talablar
- Node.js 20 yoki yangiroq
- VS Code
- Supabase akkaunti (PostgreSQL)
- Git (deploy uchun tavsiya qilinadi)

## 1. Supabase database yaratish
1. https://supabase.com saytida yangi project yarating.
2. Database password'ni xavfsiz joyda saqlang.
3. Project → SQL Editor → New query bo‘limiga kiring.
4. `schema.sql` ichidagi kodni to‘liq joylab, Run bosing.
5. Project Settings → Database bo‘limidan connection string (URI) oling. `DATABASE_URL` sifatida ishlating.

## 2. Lokal server
Terminalda loyiha papkasiga kiring:
```bash
npm install
```
`.env.example` faylidan nusxa olib `.env` deb nomlang. Ichidagi qiymatlarni o‘zgartiring:
- `DATABASE_URL` — Supabase connection string
- `SESSION_SECRET` — uzun, tasodifiy secret
- `ADMIN_EMAIL` — admin email
- `ADMIN_PASSWORD` — kuchli, unikal parol
- `APP_ORIGIN=http://localhost:3000`

Keyin:
```bash
npm run dev
```
Brauzerda `http://localhost:3000/admin.html` oching.

## 3. Birinchi marta ma’lumot kiritish
Admin foydalanuvchisi server start bo‘lganda `.env`-ээс avtomatik yaratiladi. `schema.sql`ni ishga tushirgandan keyin serverni ishga tushiring.
Hozirgi CRM panelda shifokor va xizmat qo‘shish, bronlarni ko‘rish/tasdiqlash va bemorlar ro‘yxati bor.

## 4. Muhim API
- `POST /api/auth/login` — admin login
- `POST /api/auth/logout` — chiqish
- `GET /api/auth/me` — sessiya
- `GET /api/public/doctors` — faol shifokorlar
- `GET /api/public/services` — faol xizmatlar
- `POST /api/public/appointments` — ommaviy bron so‘rovi
- `GET /api/admin/summary` — dashboard ko‘rsatkichlari
- `GET /api/admin/appointments` — bronlar
- `PATCH /api/admin/appointments/:id/status` — holatni yangilash
- `GET /api/admin/patients` — bemorlar
- `GET/POST /api/admin/doctors` — shifokorlar
- `GET/POST /api/admin/services` — xizmatlar
- `GET /api/admin/revenue` — tushum bo‘yicha oylik agregat

## 5. Production deploy (Render)
1. GitHub'da private repository yarating va loyihani push qiling.
2. Render → New → Web Service → GitHub repo tanlang.
3. Build command: `npm install`
4. Start command: `npm start`
5. Render Environment bo‘limiga `.env` qiymatlarini kiriting.
6. `NODE_ENV=production` va `APP_ORIGIN`ni deploy bo‘lgan domeningizga sozlang.
7. Supabase database SSL ulanishi ishlashini tekshiring.
8. Render URL'da `/api/health` ochib `{ "ok": true }` javobini tekshiring.

## 6. Xavfsizlik va ishga tushirishdan oldin bajariladigan ishlar
- `.env` hech qachon GitHub'ga yuklanmasin. `.gitignore` bunga yo‘l qo‘ymaydi.
- Production'da kuchli `SESSION_SECRET`, HTTPS va `secure` cookie ishlating.
- Admin paroli faqat serverda bcrypt hash ko‘rinishida saqlanadi.
- Klinika real bemorlarining tibbiy ma’lumotlarini yig‘ishdan oldin mahalliy shaxsiy ma’lumotlar va tibbiy ma’lumotlarni himoya qilish talablarini mutaxassis bilan tekshiring.
- Zaxira nusxa, audit log, role permissions, CSRF himoyasi, monitoring va ma’lumotlarni saqlash siyosatini production oldidan qo‘shing.
- To‘lov kartasi ma’lumotlarini o‘zingiz saqlamang; litsenziyalangan to‘lov provayderidan foydalaning.

## Hozircha cheklovlar
Bu CRM backend va admin starter. Ish jadvali CRUD, bo‘sh slot endpointi, SMS gateway, to‘lov provayderi integratsiyasi, audit log, shifokor kabineti va mijoz frontendini API bilan ulash keyingi bosqichlarda qo‘shiladi. Bronlar bazada overlap constraint bilan himoyalangan. Session cookie ishlatiladi; production uchun CSRF himoyasini ham qo‘shish kerak.
