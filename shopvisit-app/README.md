# Shop Visit Entry App

Distributor staff log shop visits from their phone using a simple 4-digit PIN — no
passwords to remember. Each visit has an **IN time** (shop details) and an **OUT time**
(orders/collection/remarks) — a staff member cannot check in to a new shop until they've
checked out of their current one. A **daily summary email** goes out every night to each
Distributor and their assigned TM(s). Admin/Distributor/TM can log in anytime to see a
**live dashboard** — including who is currently inside a shop right now.

---

## 1. What's included

- **Staff Entry Form** (`/`) — mobile page. Staff enter their 4-digit PIN, which identifies
  them and their Distributor automatically. No name/distributor selection needed.
  - If they have no open shop visit, they see the **IN form**: Shop Type (Retailer/Mechanic),
    Outlet Status (New/Existing), Shop Name, Location, Segment (CVL/PCMO/MCO), Contact Number,
    and a Photo (GPS location is captured automatically the moment the photo is taken).
  - If they already checked IN to a shop and haven't checked OUT yet, they're shown the
    **OUT form** instead: Orders (Ltrs), Collection (Rs), Active/Tertiary, Remarks & Feedback.
  - **The app enforces the rule you asked for:** a staff member cannot check IN to a new
    shop while a previous shop visit is still open (no OUT time given) — the server rejects
    it and tells them to finish the OUT for their current shop first.
- **Admin Panel** (`/admin.html`) — add/remove Distributors, TMs, Staff (each staff gets a
  4-digit login PIN, auto-generated or set manually, and can be reset anytime); assign which
  Distributors each TM covers; create dashboard login accounts for Distributors/TMs; test
  email sending.
- **Live Dashboard** (`/dashboard.html`) — Admin sees everything, a Distributor login sees
  only their own staff's visits, a TM login sees only their assigned Distributors' visits.
  Includes a **"Currently In a Shop" live panel** showing which staff are checked in right
  now (auto-refreshes every 30 seconds) — this is how a TM checks things live instead of
  getting an email for every single visit.
- **Photo compression** — photos are automatically compressed in the staff's browser before
  upload (resized + JPEG compressed) so they use far less storage — this keeps you well within
  free hosting's disk limits for much longer.
- **Storage management** (Admin → Tools tab) — see how much disk space your photos are using,
  and clear photos older than a chosen number of days with one click (this only deletes the
  image file — the visit record, its data, and all past emails/Excel reports are untouched).
- **Daily summary email** — runs automatically every night (default 9:00 PM IST, configurable)
  and mails each Distributor and each TM a full table of that day's visits (IN + OUT details,
  orders, collection, remarks — everything).
- **Morning Excel report** — every morning (default 7:00 AM IST, configurable), an Excel (.xlsx)
  file with the **month-to-date** data is emailed out:
  - **You (Admin)** get one Excel with **all Distributors'** data combined, plus a Summary sheet
    with totals per Distributor.
  - **Each TM** gets their own Excel, scoped to just their assigned Distributors' data.
  - Distributors do **not** get this Excel report (only the nightly summary email).

---

## 2. Run it locally first (optional, to try it out)

You need [Node.js](https://nodejs.org) installed (v18+).

```bash
cd shopvisit-app
npm install
cp .env.example .env
npm start
```

Open `http://localhost:3000` in your browser for the entry form, and
`http://localhost:3000/login.html` for the admin panel.

**Default admin login:** username `admin`, password `admin123` (from `.env` —
change `ADMIN_DEFAULT_PASSWORD` before first run, or change the password from
Admin → Tools after logging in).

---

## 3. Setting up Gmail to send emails

You cannot use your normal Gmail password — Google requires an "App Password".

1. Go to your Google Account → **Security**.
2. Turn on **2-Step Verification** (required for App Passwords to appear).
3. Search for **App Passwords** (or go to https://myaccount.google.com/apppasswords).
4. Create one — name it "Shop Visit App" — Google gives you a 16-character password.
5. In your `.env` file, set:
   ```
   SMTP_USER=youraccount@gmail.com
   SMTP_PASS=the16characterapppassword
   ```
6. Gmail's free account can send ~500 emails/day — more than enough for this use case.

---

## 4. Deploying so it's live 24x7 (Render.com — free to start)

Render keeps your app running on the internet, so staff can open the link from
anywhere, and the nightly email job runs even when your laptop is off.

### Step 1 — Put the code on GitHub
1. Create a free account at https://github.com if you don't have one.
2. Create a new repository (e.g. `shopvisit-app`), and upload this whole folder
   to it (GitHub's website has an "upload files" option — no command line needed).

### Step 2 — Create a Render account
1. Go to https://render.com and sign up (you can sign up with your GitHub account).

### Step 3 — Create the Web Service
1. On Render, click **New +** → **Web Service**.
2. Connect your GitHub repo (`shopvisit-app`).
3. Fill in:
   - **Name:** `shopvisit-app` (or anything)
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Under **Environment Variables**, add these (same as your `.env` file):
   | Key | Value |
   |---|---|
   | `SESSION_SECRET` | any long random text |
   | `ADMIN_DEFAULT_PASSWORD` | a password you'll use to log in the first time |
   | `SMTP_USER` | your Gmail address |
   | `SMTP_PASS` | the 16-character App Password |
   | `SUMMARY_CRON_TIME` | `0 21 * * *` (9 PM daily — change the `21` to any hour, 24-hr format) |
   | `ADMIN_REPORT_EMAIL` | your own email — gets the morning Excel report (all distributors) |
   | `MORNING_REPORT_CRON_TIME` | `0 7 * * *` (7 AM daily — change the `7` to any hour) |

5. **Important — add a Persistent Disk** (so your data and uploaded photos aren't
   lost when Render restarts the app): Settings → **Disks** → Add Disk →
   Mount Path: `/opt/render/project/src/data` (and a second one for `/opt/render/project/src/uploads`
   if you want photos to persist too). Free tier gives 1GB, which is plenty for this.

   **About photo storage running out:** photos are automatically compressed before upload, so
   1GB comfortably holds a few thousand photos. If you ever get close to the limit, Admin →
   Tools → **Photo Storage** shows how much space is used and lets you clear old photos (only
   the image — visit data and reports are kept forever). If you need more room permanently,
   Render lets you resize the disk (a few more GB costs only cents/month) — no code changes needed.

6. Click **Create Web Service**. First deploy takes 2-3 minutes.

7. Render gives you a live URL like `https://shopvisit-app.onrender.com` — this is
   what you'll share with your staff (bookmark it on their phones) and use yourself
   for `/login.html`.

**Note on the free tier:** Render's free web services "sleep" after 15 minutes of no
traffic and take ~30-60 seconds to wake up on the next visit. This is fine for staff
entries during the day, but if you want it always instantly-on (and want the nightly
cron job to be 100% reliable even with zero traffic), upgrade to Render's paid
"Starter" plan (~$7/month) later once you're happy with how it works.

---

## 5. First-time setup after deploying

1. Go to `https://your-app-url.onrender.com/login.html`, log in as `admin`.
2. **Distributors tab** → add your 4-5 Distributors (name + email).
3. **Managers (TM) tab** → add your TMs (name + email), then tick which
   Distributors each TM covers (2 each, in your case).
4. **Staff tab** → add each Distributor's 8-10 staff members. Each one gets a **4-digit PIN**
   shown right after you add them (or leave the PIN box blank and one is generated for you).
   Write it down / message it to that staff member — this is what they'll type on the entry
   form instead of a username/password. You can reset anyone's PIN anytime from this tab.
5. **Dashboard Logins tab** → create a login for each Distributor and each TM
   so they can check their own Live Report anytime (e.g. username `chennai_dist`,
   a password you choose — share it with them).
6. **Tools tab** → click "Send Test Summary Now" to confirm emails are working
   before relying on the nightly job.
7. Share the entry form link (`https://your-app-url.onrender.com/`) with all staff —
   they can bookmark it on their phone home screen. They just open it, type their PIN,
   and the app shows them the right form (IN or OUT) automatically.

---

## 6. Day-to-day changes (no coding needed)

- **New Distributor joins:** Admin → Distributors → Add.
- **Distributor stops:** Admin → Distributors → Deactivate (keeps history, hides from staff form) or Delete.
- **Staff joins/leaves a Distributor:** Admin → Staff → Add / Deactivate / Delete.
- **TM changes territory:** Admin → Managers (TM) → tick/untick the Distributor checkboxes.
- **Change nightly email time:** Render → Environment → edit `SUMMARY_CRON_TIME`, redeploy.

---

## 7. If you'd rather not use Render

Any Node.js hosting works the same way (Railway, a VPS, etc.) — the requirements are:
Node.js 18+, a persistent disk for the `data/` and `uploads/` folders (SQLite database
+ photos live there), and the same environment variables from `.env.example`.
