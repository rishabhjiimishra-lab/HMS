# Radiant Hospitals HMS

**Developed by CodeEternity Private Limited**

A full-stack hospital operations application for Radiant Hospitals. The current scope includes staff authentication, patient registration and search, doctor directory, OPD/IPD appointments, and billing. Pharmacy is intentionally excluded.

## Project Status

| Phase | Status | Delivered |
| --- | --- | --- |
| 1. Project scaffolding and setup | Complete | Backend package, environment templates, PostgreSQL connection/session layer, Next.js App Router scaffold |
| 2. Models and validation schemas | Complete | SQLAlchemy entities and Pydantic create/update/response schemas |
| 3. REST APIs and authentication | Complete | JWT login, Argon2 password hashing, role checks, CRUD routes, health/readiness endpoints, admin bootstrap |
| 4. Frontend and state | Complete | Typed authenticated API client, login, role-aware navigation, responsive staff workspace |
| 5. HMS screens and workflows | Complete | Patient registration/list/search, clinician directory, appointment scheduling/status updates, invoice creation/payment updates |

## Technology

- Python 3.11+; FastAPI; SQLAlchemy 2.x; Pydantic 2; PostgreSQL with psycopg 3
- Next.js App Router 15.5.28; React 19; TypeScript; Tailwind CSS 4; Lucide icons
- JWT bearer authentication; Argon2id password hashes
- Pytest API tests using an isolated in-memory SQLite database

## Repository Layout

```text
backend/
  .env.example
  requirements.txt
  requirements-dev.txt
  app/
    database.py
    models.py
    schemas.py
    security.py
    dependencies.py
    create_admin.py
    main.py
    routers/
      auth.py
      users.py
      patients.py
      doctors.py
      appointments.py
      billing.py
  tests/
    conftest.py
    test_api.py
frontend/
  .env.example
  package.json
  package-lock.json
  eslint.config.mjs
  next.config.ts
  src/
    app/
      layout.tsx
      page.tsx
      globals.css
    components/
      hms-app.tsx
    lib/
      api.ts
      types.ts
README.md
```

## Phase 1: Project Scaffolding and Setup

### Prerequisites

- Python 3.11 or later
- Node.js 20.9 or later and npm
- PostgreSQL 15 or later, running locally or at an accessible database host

Run PowerShell commands from the repository root (`hms/`).

### Backend environment

```powershell
if (!(Test-Path .\backend\.venv\Scripts\python.exe)) { py -3.11 -m venv .\backend\.venv }
.\backend\.venv\Scripts\python.exe -m pip install -r .\backend\requirements.txt
if (!(Test-Path .\backend\.env)) { Copy-Item .\backend\.env.example .\backend\.env }
```

Edit `backend/.env` and set the PostgreSQL URL and a unique JWT secret. Generate a secret with:

```powershell
.\backend\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
```

Example connection value (URL-encode special characters in the password):

```dotenv
DATABASE_URL=postgresql+psycopg://hms_user:your-password@localhost:5432/radiant_hms
JWT_SECRET_KEY=paste-a-generated-secret-here
ACCESS_TOKEN_EXPIRE_MINUTES=30
FRONTEND_ORIGIN=http://localhost:3000
```

Create a PostgreSQL role/database once, using `psql` or pgAdmin. For a local `postgres` superuser, one example is:

```powershell
psql -U postgres -h localhost -c "CREATE USER hms_user WITH PASSWORD 'your-password';"
psql -U postgres -h localhost -c "CREATE DATABASE radiant_hms OWNER hms_user;"
```

Do not run the create commands again if the role/database already exists. Keep `.env` private; it is ignored by Git. Never place the database password or JWT secret in a `NEXT_PUBLIC_` variable.

## Phase 2: Models and Pydantic Schemas

`backend/app/models.py` defines:

- `User`: unique username, Argon2 password hash, role (`Admin`, `Doctor`, `Receptionist`)
- `Patient`: unique generated `RH-YYMMDD-XXXXXX` patient ID, demographics, contact/address, medical history
- `Doctor`: linked staff account, department, specialization, fee and availability schedule
- `Appointment`: patient and doctor foreign keys, OPD/IPD, datetime, status, optional bed allocation
- `Billing`: patient foreign key, decimal total/discount/final amounts, payment status and invoice date

Database constraints protect unique usernames/patient IDs, valid ages, and non-negative billing values. Monetary values use decimal database columns rather than floats. `backend/app/schemas.py` validates create/update input and serializes response data without returning password hashes. Billing final amount is calculated by the server as `total_amount - discount`.

## Phase 3: REST APIs and Authentication

### Start the backend

Open a PowerShell terminal and run:

```powershell
Set-Location .\backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Interactive API documentation is available at <http://localhost:8000/docs>. Liveness is `GET /health`; database readiness is `GET /ready`.

Tables are created automatically on application startup for this initial implementation. This does **not** migrate an existing schema; use a controlled migration process before production schema changes.

### Bootstrap the first administrator

After the API can connect to PostgreSQL, open another PowerShell terminal:

```powershell
Set-Location .\backend
..\.venv\Scripts\python.exe -m app.create_admin --username admin
```

Enter a unique password of at least 12 characters at the hidden prompt. There is no public administrator-registration endpoint. Admins can add users using the API; administrators can create doctor accounts through the doctor endpoint. The login page itself does not contain demo credentials.

### API route reference

All application endpoints are prefixed with `/api` and require `Authorization: Bearer <access_token>` except login.

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | Public | Authenticate and issue JWT |
| `GET` | `/api/auth/me` | Any signed-in user | Current identity and role |
| `GET`, `POST` | `/api/users` | Admin | List/create staff accounts |
| `GET`, `POST` | `/api/patients` | Any signed-in user for read; Admin/Receptionist for create | Search/list and register patients |
| `GET`, `PATCH` | `/api/patients/{id}` | Any signed-in user for read; Admin/Receptionist for update | Patient record |
| `GET`, `POST` | `/api/doctors` | Any signed-in user for read; Admin for create | Clinician directory and doctor account setup |
| `PATCH` | `/api/doctors/{id}` | Admin | Update clinician profile |
| `GET` | `/api/appointments` | Any signed-in user | List appointments; doctor accounts only receive their own |
| `POST` | `/api/appointments` | Admin/Receptionist | Schedule OPD/IPD care |
| `PATCH` | `/api/appointments/{id}` | Admin/Receptionist; Doctor for own status only | Update appointment/status |
| `GET` | `/api/billing` | Admin/Receptionist | List invoices |
| `POST` | `/api/billing` | Admin/Receptionist | Create invoice; final amount calculated server-side |
| `PATCH` | `/api/billing/{id}` | Admin/Receptionist | Update payment status |

IPD appointments require a bed allocation; OPD appointments cannot have one. Invalid references return `404`, validation failures return `422`, duplicate accounts return `409`, and insufficient permissions return `403`.

## Phase 4: Frontend, API State and Navigation

The frontend uses a typed `fetch` client in `frontend/src/lib/api.ts`. It adds the bearer token, disables stale caching for API calls, parses API error messages, and clears invalid tokens on `401`. The signed-in user and role are loaded from `/auth/me`; the sidebar and staff actions follow role permissions. Client-side token storage is currently `localStorage`, so production deployments should move authentication to a same-site `HttpOnly`, `Secure`, `SameSite` cookie or a backend-for-frontend session and apply CSRF controls.

## Phase 5: User Workflows

- **Overview:** patient count, today’s appointments, active care and staff billing summaries; upcoming schedule and operational snapshot.
- **Patient management:** validated patient registration, search by name/patient ID/contact, patient list and generated patient identifiers.
- **Care team:** doctor directory, specialties, departments, consultation fees and appointment counts.
- **Appointments:** OPD/IPD scheduling, date/time and IPD bed allocation; status changes for Pending, Active, Discharged or Cancelled. Doctors see their own appointments and may only update status.
- **Billing:** invoice creation with live discount/final calculation and Paid/Unpaid status updates. Currency display is INR; API amounts remain decimal values.
- **Feedback:** toast errors/success states, loading states, empty states, responsive navigation, accessible labels, and keyboard-dismissable dialogs.

## Frontend Setup and Run

Open another PowerShell terminal from the repository root:

```powershell
if (!(Test-Path .\frontend\.env.local)) { Copy-Item .\frontend\.env.example .\frontend\.env.local }
npm.cmd --prefix .\frontend install
npm.cmd --prefix .\frontend run dev
```

Open <http://localhost:3000>. `frontend/.env.local` should contain:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

The API must be running and `FRONTEND_ORIGIN` in `backend/.env` must match the frontend origin. A user account must be created with the admin bootstrap command before anyone can sign in.

## Tests and Production Build

Backend tests run against SQLite and do not need a PostgreSQL test database:

```powershell
.\backend\.venv\Scripts\python.exe -m pip install -r .\backend\requirements-dev.txt
$env:PYTHONPATH = (Resolve-Path .\backend).Path
.\backend\.venv\Scripts\python.exe -m pytest -q .\backend\tests
Remove-Item Env:\PYTHONPATH
```

Frontend lint and optimized build:

```powershell
npm.cmd --prefix .\frontend run lint
npm.cmd --prefix .\frontend run build
```

## Security and Deployment Notes

This code is a functional HMS foundation, not a certification of regulatory compliance or a production deployment by itself. Before handling real patient data, complete a security/privacy review and deployment hardening appropriate to your jurisdiction. At minimum:

- Enforce TLS, secrets management/rotation, least-privilege database credentials, firewalling, encrypted backups and tested restore procedures.
- Replace localStorage token handling with secure cookie/BFF sessions, add CSRF protections, rate limits, login lockout/monitoring, and security headers.
- Add an append-only audit trail for every access/change to patient and billing records, retention/deletion policies, and incident response procedures.
- Add Alembic migrations and a reviewed deployment process; startup `create_all` is development convenience, not a production migration strategy.
- Review authorization/data-minimization requirements, logging for sensitive data, accessibility, and local healthcare privacy rules.
- Configure PostgreSQL, JWT secrets, origins, backups, and operational monitoring for each environment; never use sample/test credentials in production.

No pharmacy, insurance claims, lab systems, medication ordering, bed inventory management, or external EHR integration is included in the current scope.
