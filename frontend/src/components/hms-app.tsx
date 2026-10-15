"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgeIndianRupee,
  CalendarDays,
  Check,
  ClipboardList,
  Clock3,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Stethoscope,
  UsersRound,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, getToken, setToken } from "@/lib/api";
import type { Appointment, Doctor, EncounterStatus, EncounterType, Gender, Invoice, Patient, PaymentStatus, User } from "@/lib/types";

type View = "overview" | "patients" | "appointments" | "doctors" | "billing";
type Toast = { kind: "success" | "error"; message: string };

const NAV_ITEMS: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "patients", label: "Patients", icon: UsersRound },
  { id: "appointments", label: "Appointments", icon: CalendarDays },
  { id: "doctors", label: "Care team", icon: Stethoscope },
  { id: "billing", label: "Billing", icon: BadgeIndianRupee },
];
const STATUSES: EncounterStatus[] = ["Pending", "Active", "Discharged", "Cancelled"];
const GENDERS: Gender[] = ["Female", "Male", "Other", "Prefer not to say"];
const money = (value: string | number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value));
const dateTime = (value: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default function HMSApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [modal, setModal] = useState<"patient" | "appointment" | "invoice" | null>(null);
  const [search, setSearch] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  const notify = useCallback((message: string, kind: Toast["kind"] = "success") => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const loadWorkspace = useCallback(async (searchTerm = "") => {
    setLoading(true);
    try {
      const [patientRows, doctorRows, appointmentRows, invoiceRows] = await Promise.all([
        api.patients(searchTerm), api.doctors(), api.appointments(),
        user?.role === "Doctor" ? Promise.resolve([]) : api.invoices(),
      ]);
      setPatients(patientRows);
      setDoctors(doctorRows);
      setAppointments(appointmentRows);
      setInvoices(invoiceRows);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not load HMS data", "error");
    } finally {
      setLoading(false);
    }
  }, [notify, user?.role]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthReady(true);
      return;
    }
    api.me().then(setUser).catch(() => setToken(null)).finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (user) void loadWorkspace();
  }, [user, loadWorkspace]);

  useEffect(() => {
    if (!user || view !== "patients") return;
    const timeout = window.setTimeout(() => void loadWorkspace(search), 250);
    return () => window.clearTimeout(timeout);
  }, [search, user, view, loadWorkspace]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api.login(String(form.get("username")), String(form.get("password")));
      setToken(result.access_token);
      setUser(result.user);
      notify("Welcome to Radiant Hospitals");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to sign in", "error");
    }
  }

  function signOut() {
    setToken(null);
    setUser(null);
    setPatients([]);
    setAppointments([]);
    setDoctors([]);
    setInvoices([]);
  }

  async function refresh(message: string) {
    await loadWorkspace(view === "patients" ? search : "");
    setModal(null);
    notify(message);
  }

  if (!authReady) return <div className="boot-screen"><span className="brand-mark"><Activity size={21} /></span><p>Loading secure workspace</p></div>;
  if (!user) return <LoginScreen onSubmit={handleLogin} />;

  const allowedNav = NAV_ITEMS.filter((item) => {
    if (item.id === "doctors") return user.role === "Admin" || user.role === "Receptionist";
    if (item.id === "billing") return user.role !== "Doctor";
    return true;
  });
  const heading = NAV_ITEMS.find((item) => item.id === view)?.label ?? "Overview";
  const todayAppointments = appointments.filter((item) => new Date(item.appointment_datetime).toDateString() === new Date().toDateString());
  const unpaidTotal = invoices.filter((invoice) => invoice.payment_status === "Unpaid").reduce((total, invoice) => total + Number(invoice.final_amount), 0);

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand-lockup"><span className="brand-mark"><Activity size={21} strokeWidth={2.5} /></span><span><strong>radiant</strong><small>HOSPITALS</small></span></div>
        <div className="workspace-tag"><span className="status-dot" /> CARE OPERATIONS</div>
        <nav className="primary-nav" aria-label="Main navigation">
          <p className="nav-caption">WORKSPACE</p>
          {allowedNav.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${view === id ? "nav-active" : ""}`} onClick={() => { setView(id); setMobileNav(false); }}><Icon size={18} /><span>{label}</span>{id === "appointments" && appointments.filter((item) => item.status === "Pending").length > 0 && <span className="nav-count">{appointments.filter((item) => item.status === "Pending").length}</span>}</button>)}
        </nav>
        <div className="sidebar-bottom"><div className="privacy-note"><ShieldCheck size={17} /><span>Protected clinical workspace</span></div><button className="profile-button" onClick={signOut}><span className="avatar">{user.username.slice(0, 1).toUpperCase()}</span><span className="profile-copy"><strong>{user.username}</strong><small>{user.role}</small></span><LogOut size={16} className="logout-icon" /></button><div className="company-mark">CODEETERNITY <span>·</span> 2026</div></div>
      </aside>

      <section className="main-column">
        <header className="topbar"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(!mobileNav)}><Menu size={19} /></button><div className="breadcrumbs"><span>Radiant Hospitals</span><span className="crumb-divider">/</span><strong>{heading}</strong></div><div className="topbar-right"><span className="live-indicator"><i /> Operations live</span><span className="topbar-date">{new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(new Date())}</span><span className="avatar avatar-small">{user.username.slice(0, 1).toUpperCase()}</span></div></header>
        <div className="content-area">
          <div className="page-heading"><div><p className="eyebrow">RADIANT HOSPITALS <span>·</span> {user.role.toUpperCase()}</p><h1>{view === "overview" ? "Good care starts here." : heading}</h1><p className="page-subtitle">{view === "overview" ? "A clear view of today’s care operations." : pageDescription(view)}</p></div><div className="heading-actions"><button className="button button-quiet" onClick={() => void loadWorkspace(view === "patients" ? search : "")}><Activity size={16} className={loading ? "spin" : ""} /> Refresh</button>{(view === "overview" || view === "patients") && user.role !== "Doctor" && <button className="button button-primary" onClick={() => setModal("patient")}><Plus size={17} /> Register patient</button>}{view === "appointments" && user.role !== "Doctor" && <button className="button button-primary" onClick={() => setModal("appointment")}><Plus size={17} /> New appointment</button>}{view === "billing" && user.role !== "Doctor" && <button className="button button-primary" onClick={() => setModal("invoice")}><Plus size={17} /> Create invoice</button>}</div></div>
          {view === "overview" && <Overview patients={patients} doctors={doctors} appointments={appointments} invoices={invoices} todayAppointments={todayAppointments} unpaidTotal={unpaidTotal} canCreateAppointment={user.role !== "Doctor"} onNavigate={setView} onCreateAppointment={() => setModal("appointment")} />}

          {view === "patients" && <PatientsView patients={patients} search={search} onSearch={setSearch} loading={loading} />}
          {view === "doctors" && <DoctorsView doctors={doctors} appointments={appointments} />}
          {view === "appointments" && <AppointmentsView appointments={appointments} onStatus={async (id, status) => { try { await api.updateAppointment(id, status); await refresh("Appointment updated"); } catch (error) { notify(error instanceof Error ? error.message : "Update failed", "error"); } }} />}
          {view === "billing" && <BillingView invoices={invoices} onStatus={async (id, status) => { try { await api.updateInvoice(id, status); await refresh("Invoice updated"); } catch (error) { notify(error instanceof Error ? error.message : "Update failed", "error"); } }} />}
          <footer className="page-footer"><span>Radiant Hospitals · Care with clarity</span><span>HMS <b>1.0</b></span></footer>
        </div>
      </section>

      {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      {modal && <Modal title={modalTitle(modal)} onClose={() => setModal(null)}><ModalForm kind={modal} patients={patients} doctors={doctors} onSaved={refresh} onError={(message) => notify(message, "error")} /></Modal>}
      {toast && <div className={`toast toast-${toast.kind}`} role="status">{toast.kind === "success" ? <Check size={17} /> : <X size={17} />}<span>{toast.message}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={15} /></button></div>}
    </main>
  );
}

function pageDescription(view: View) {
  return ({ patients: "Patient records, registration and clinical history.", appointments: "Coordinate OPD and IPD care across the hospital.", doctors: "Your clinical team and today’s appointment load.", billing: "Invoices, collections and outstanding balances.", overview: "A clear view of today’s care operations." })[view];
}

function LoginScreen({ onSubmit }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <main className="login-screen"><section className="login-brand"><div className="brand-lockup brand-lockup-light"><span className="brand-mark"><Activity size={21} /></span><span><strong>radiant</strong><small>HOSPITALS</small></span></div><div className="login-quote"><span className="eyebrow">CARE OPERATIONS PLATFORM</span><h1>Better care,<br /><em>beautifully coordinated.</em></h1><p>One calm workspace for the people who make every patient feel seen.</p><div className="login-rule"><span /><small>RADIANT HOSPITALS · INDIA</small></div></div><div className="login-brand-foot">A CODEETERNITY PRIVATE LIMITED PRODUCT</div></section><section className="login-panel"><div className="login-form-wrap"><div className="login-icon"><ShieldCheck size={22} /></div><p className="eyebrow">SECURE STAFF ACCESS</p><h2>Welcome back</h2><p className="login-hint">Sign in with your hospital account to continue.</p><form onSubmit={onSubmit} className="form-stack"><label>Username<input name="username" autoComplete="username" required minLength={3} placeholder="Your username" /></label><label>Password<input name="password" type="password" autoComplete="current-password" required placeholder="Your password" /></label><button className="button button-primary button-full" type="submit">Sign in securely <ArrowUpRight size={16} /></button></form><p className="login-help">Need access? Contact your hospital administrator.</p></div><footer>Protected by role-based access controls <span>·</span> © 2026 Radiant Hospitals</footer></section></main>;
}

function Overview({ patients, doctors, appointments, invoices, todayAppointments, unpaidTotal, canCreateAppointment, onNavigate, onCreateAppointment }: { patients: Patient[]; doctors: Doctor[]; appointments: Appointment[]; invoices: Invoice[]; todayAppointments: Appointment[]; unpaidTotal: number; canCreateAppointment: boolean; onNavigate: (view: View) => void; onCreateAppointment: () => void }) {
  const active = appointments.filter((item) => item.status === "Active").length;
  const now = Date.now();
  const recent = appointments
    .filter((item) => new Date(item.appointment_datetime).getTime() >= now)
    .sort((a, b) => new Date(a.appointment_datetime).getTime() - new Date(b.appointment_datetime).getTime())
    .slice(0, 5);
  const scheduleAction = canCreateAppointment ? <button className="button button-small button-outline" onClick={onCreateAppointment}><Plus size={15} /> Create appointment</button> : undefined;
  return <>
    <div className="stats-grid"><StatCard label="Registered patients" value={patients.length.toLocaleString("en-IN")} note="Across all records" icon={UsersRound} tone="mint" trend="Patient registry" /><StatCard label="Today’s appointments" value={todayAppointments.length.toString().padStart(2, "0")} note={`${appointments.filter((item) => item.status === "Pending").length} awaiting review`} icon={CalendarDays} tone="blue" trend="OPD + IPD" /><StatCard label="Active care" value={active.toString().padStart(2, "0")} note="Currently in progress" icon={Activity} tone="coral" trend="Live census" /><StatCard label="Outstanding" value={money(unpaidTotal)} note={`${invoices.filter((item) => item.payment_status === "Unpaid").length} unpaid invoices`} icon={BadgeIndianRupee} tone="gold" trend="Accounts receivable" /></div>
    <div className="overview-grid"><section className="panel schedule-panel"><div className="panel-heading"><div><span className="panel-kicker">CARE COORDINATION</span><h2>Upcoming appointments</h2></div><button className="text-link" onClick={() => onNavigate("appointments")}>View schedule <ArrowUpRight size={15} /></button></div>{recent.length ? <div className="appointment-list">{recent.map((item) => <AppointmentRow key={item.id} item={item} />)}</div> : <EmptyState icon={CalendarDays} title="No appointments yet" copy="Add an appointment to start coordinating care." action={scheduleAction} />}</section><section className="panel snapshot-panel"><div className="panel-heading"><div><span className="panel-kicker">HOSPITAL SNAPSHOT</span><h2>Today at a glance</h2></div><span className="snapshot-date">{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date())}</span></div><div className="snapshot-list"><SnapshotLine icon={Clock3} label="Appointments today" value={String(todayAppointments.length).padStart(2, "0")} /><SnapshotLine icon={Stethoscope} label="Available clinicians" value={String(doctors.length).padStart(2, "0")} /><SnapshotLine icon={ClipboardList} label="Pending requests" value={String(appointments.filter((item) => item.status === "Pending").length).padStart(2, "0")} />{canCreateAppointment && <SnapshotLine icon={FileText} label="Invoices issued" value={String(invoices.length).padStart(2, "0")} />}</div><button className="snapshot-footer" onClick={() => onNavigate("doctors")}>Explore care team <ArrowUpRight size={15} /></button></section></div>
    <section className="panel attention-panel"><div className="attention-icon"><ShieldCheck size={19} /></div><div><strong>Every record, handled with care.</strong><p>Patient information is protected by role-based access. Only authorized hospital staff can view or update records.</p></div><span className="attention-label">SECURE OPERATIONS</span></section>
  </>;
}

function StatCard({ label, value, note, icon: Icon, tone, trend }: { label: string; value: string; note: string; icon: typeof Activity; tone: string; trend: string }) {
  return <article className="stat-card"><div className="stat-top"><span className={`stat-icon icon-${tone}`}><Icon size={18} /></span><span className="stat-trend">{trend}</span></div><p className="stat-label">{label}</p><div className="stat-value">{value}</div><p className="stat-note"><span className="tiny-pulse" />{note}</p></article>;
}
function SnapshotLine({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) { return <div className="snapshot-line"><span className="snapshot-line-icon"><Icon size={16} /></span><span>{label}</span><strong>{value}</strong></div>; }
function AppointmentRow({ item }: { item: Appointment }) { return <div className="appointment-row"><div className="appointment-time"><strong>{new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.appointment_datetime))}</strong><small>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(item.appointment_datetime))}</small></div><span className="timeline-marker"><i /></span><div className="appointment-details"><strong>{item.patient.full_name}</strong><small>{item.doctor.full_name} <span>·</span> {item.doctor.department}</small></div><span className={`type-pill type-${item.type.toLowerCase()}`}>{item.type}</span><StatusBadge value={item.status} /></div>; }
function StatusBadge({ value }: { value: EncounterStatus | PaymentStatus }) { return <span className={`status-badge status-${value.toLowerCase()}`}>{value}</span>; }

function PatientsView({ patients, search, onSearch, loading }: { patients: Patient[]; search: string; onSearch: (value: string) => void; loading: boolean }) {
  return <section className="panel table-panel"><div className="table-toolbar"><div className="result-count"><strong>{patients.length}</strong> patient records</div><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search name, patient ID, contact" aria-label="Search patients" />{search && <button aria-label="Clear search" onClick={() => onSearch("")}><X size={14} /></button>}</label></div><div className="table-scroll"><table><thead><tr><th>Patient</th><th>Patient ID</th><th>Age / gender</th><th>Contact</th><th>Registered</th></tr></thead><tbody>{patients.map((patient) => <tr key={patient.id}><td><div className="table-person"><span className="person-avatar">{patient.full_name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><strong>{patient.full_name}</strong><small>{patient.address}</small></div></div></td><td><span className="record-id">{patient.unique_patient_id}</span></td><td>{patient.age} yrs <span className="muted-dot">·</span> {patient.gender}</td><td>{patient.contact}</td><td>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(patient.created_at))}</td></tr>)}</tbody></table>{!patients.length && <EmptyState icon={UsersRound} title={loading ? "Loading patient records" : search ? "No matching patients" : "Your registry is ready"} copy={loading ? "Fetching the latest records." : search ? "Try a different name, patient ID or contact number." : "New registrations will appear here."} />}</div></section>;
}

function DoctorsView({ doctors, appointments }: { doctors: Doctor[]; appointments: Appointment[] }) {
  return <div className="doctor-grid">{doctors.map((doctor, index) => { const count = appointments.filter((item) => item.doctor_id === doctor.id && item.status !== "Cancelled").length; return <article className="doctor-card" key={doctor.id}><div className={`doctor-art doctor-art-${index % 4}`}><span className="doctor-monogram">{doctor.full_name.split(" ").filter(Boolean).slice(-1)[0]?.slice(0, 1) ?? "D"}</span><span className="doctor-availability"><i /> On staff</span></div><div className="doctor-info"><p className="doctor-department">{doctor.department}</p><h2>{doctor.full_name}</h2><p className="doctor-specialty">{doctor.specialization}</p><div className="doctor-meta"><span><CalendarDays size={15} /> {count} appointments</span><strong>{money(doctor.consultation_fee)} <small>/ visit</small></strong></div>{doctor.availability_schedule && <p className="doctor-schedule">{doctor.availability_schedule}</p>}</div></article>; })}{!doctors.length && <EmptyState icon={Stethoscope} title="No clinicians listed" copy="An administrator can create doctor accounts from user management." />}</div>;
}

function AppointmentsView({ appointments, onStatus }: { appointments: Appointment[]; onStatus: (id: number, status: EncounterStatus) => Promise<void> }) {
  const [filter, setFilter] = useState("All");
  const visible = useMemo(() => appointments.filter((item) => filter === "All" || item.status === filter).sort((a, b) => new Date(b.appointment_datetime).getTime() - new Date(a.appointment_datetime).getTime()), [appointments, filter]);
  return <section className="panel table-panel"><div className="filter-toolbar"><div className="segmented-control">{["All", ...STATUSES].map((status) => <button className={filter === status ? "segment-active" : ""} key={status} onClick={() => setFilter(status)}>{status}{status === "All" && <span>{appointments.length}</span>}</button>)}</div><span className="table-help">Select a status to update an appointment</span></div><div className="table-scroll"><table><thead><tr><th>Date &amp; time</th><th>Patient</th><th>Care team</th><th>Type</th><th>Bed</th><th>Status</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><strong>{dateTime(item.appointment_datetime)}</strong></td><td><div className="table-person compact"><span className="person-avatar">{item.patient.full_name[0]}</span><div><strong>{item.patient.full_name}</strong><small>{item.patient.unique_patient_id}</small></div></div></td><td><strong>{item.doctor.full_name}</strong><small className="cell-subline">{item.doctor.department}</small></td><td><span className={`type-pill type-${item.type.toLowerCase()}`}>{item.type}</span></td><td>{item.bed_allocation ?? <span className="muted">—</span>}</td><td><select className={`status-select status-${item.status.toLowerCase()}`} value={item.status} onChange={(event) => void onStatus(item.id, event.target.value as EncounterStatus)} aria-label={`Update status for appointment ${item.id}`}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></td></tr>)}</tbody></table>{!visible.length && <EmptyState icon={CalendarDays} title="No appointments in this view" copy="Appointments will appear here when scheduled." />}</div></section>;
}

function BillingView({ invoices, onStatus }: { invoices: Invoice[]; onStatus: (id: number, status: PaymentStatus) => Promise<void> }) {
  const collected = invoices.filter((invoice) => invoice.payment_status === "Paid").reduce((total, invoice) => total + Number(invoice.final_amount), 0);
  const due = invoices.filter((invoice) => invoice.payment_status === "Unpaid").reduce((total, invoice) => total + Number(invoice.final_amount), 0);
  return <><div className="billing-summary"><div><span>INVOICES</span><strong>{invoices.length.toString().padStart(2, "0")}</strong></div><div><span>COLLECTED</span><strong>{money(collected)}</strong><small><ArrowUpRight size={14} /> Paid invoices</small></div><div><span>OUTSTANDING</span><strong>{money(due)}</strong><small className="due-note"><ArrowDownRight size={14} /> Awaiting payment</small></div></div><section className="panel table-panel"><div className="panel-heading billing-heading"><div><span className="panel-kicker">ACCOUNTS</span><h2>Recent invoices</h2></div><span className="table-help">Amounts in INR</span></div><div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Patient</th><th>Invoice date</th><th>Total</th><th>Discount</th><th>Amount due</th><th>Payment</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td><span className="record-id">RH-INV-{String(invoice.id).padStart(5, "0")}</span></td><td><div className="table-person compact"><span className="person-avatar">{invoice.patient.full_name[0]}</span><div><strong>{invoice.patient.full_name}</strong><small>{invoice.patient.unique_patient_id}</small></div></div></td><td>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(invoice.invoice_date))}</td><td>{money(invoice.total_amount)}</td><td>{money(invoice.discount)}</td><td><strong>{money(invoice.final_amount)}</strong></td><td><select className={`status-select status-${invoice.payment_status.toLowerCase()}`} value={invoice.payment_status} onChange={(event) => void onStatus(invoice.id, event.target.value as PaymentStatus)} aria-label={`Update payment status for invoice ${invoice.id}`}><option>Unpaid</option><option>Paid</option></select></td></tr>)}</tbody></table>{!invoices.length && <EmptyState icon={FileText} title="No invoices yet" copy="Create an invoice after adding a patient record." />}</div></section></>;
}

function EmptyState({ icon: Icon, title, copy, action }: { icon: typeof Activity; title: string; copy: string; action?: React.ReactNode }) { return <div className="empty-state"><span className="empty-icon"><Icon size={20} /></span><strong>{title}</strong><p>{copy}</p>{action}</div>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]); return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><p className="eyebrow">RADIANT HOSPITALS</p><h2 id="modal-title">{title}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></header>{children}</section></div>; }
function modalTitle(kind: "patient" | "appointment" | "invoice") { return ({ patient: "Register a patient", appointment: "Schedule appointment", invoice: "Create invoice" })[kind]; }

function ModalForm({ kind, patients, doctors, onSaved, onError }: { kind: "patient" | "appointment" | "invoice"; patients: Patient[]; doctors: Doctor[]; onSaved: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<EncounterType>("OPD");
  const [total, setTotal] = useState("");
  const [discount, setDiscount] = useState("0");
  const final = Math.max(0, Number(total || 0) - Number(discount || 0));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      if (kind === "patient") {
        await api.createPatient({ full_name: String(form.get("full_name")), age: Number(form.get("age")), gender: String(form.get("gender")) as Gender, contact: String(form.get("contact")), address: String(form.get("address")), medical_history: String(form.get("medical_history") ?? "") });
        await onSaved("Patient registered successfully");
      } else if (kind === "appointment") {
        await api.createAppointment({ patient_id: Number(form.get("patient_id")), doctor_id: Number(form.get("doctor_id")), type, appointment_datetime: new Date(String(form.get("appointment_datetime"))).toISOString(), bed_allocation: type === "IPD" ? String(form.get("bed_allocation")) : undefined });
        await onSaved("Appointment scheduled successfully");
      } else {
        await api.createInvoice({ patient_id: Number(form.get("patient_id")), total_amount: Number(total), discount: Number(discount), payment_status: String(form.get("payment_status")) as PaymentStatus });
        await onSaved("Invoice created successfully");
      }
    } catch (error) {
      onError(error instanceof ApiError || error instanceof Error ? error.message : "Unable to save record");
    } finally {
      setSaving(false);
    }
  }

  return <form className="form-stack modal-form" onSubmit={submit}>
    {kind === "patient" && <><div className="form-grid"><label>Full name<input name="full_name" required minLength={2} maxLength={160} placeholder="Patient full name" /></label><label>Age<input name="age" type="number" required min={0} max={130} placeholder="Age in years" /></label></div><div className="form-grid"><label>Gender<select name="gender" required defaultValue=""><option value="" disabled>Select gender</option>{GENDERS.map((gender) => <option key={gender}>{gender}</option>)}</select></label><label>Contact number<input name="contact" required minLength={5} maxLength={32} placeholder="Phone number" /></label></div><label>Address<input name="address" required minLength={3} maxLength={300} placeholder="Street, city, postal code" /></label><label>Medical history <span className="optional">OPTIONAL</span><textarea name="medical_history" rows={3} maxLength={10000} placeholder="Relevant history, allergies or notes" /></label></>}
    {kind === "appointment" && <><label>Patient<select name="patient_id" required defaultValue=""><option value="" disabled>Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} · {patient.unique_patient_id}</option>)}</select></label><label>Doctor<select name="doctor_id" required defaultValue=""><option value="" disabled>Select doctor</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name} · {doctor.department}</option>)}</select></label><div className="form-grid"><label>Encounter type<select value={type} onChange={(event) => setType(event.target.value as EncounterType)}><option>OPD</option><option>IPD</option></select></label><label>Date and time<input name="appointment_datetime" type="datetime-local" required min={new Date().toISOString().slice(0, 16)} /></label></div>{type === "IPD" && <label>Bed allocation<input name="bed_allocation" required maxLength={40} placeholder="Ward / room / bed" /></label>}</>}
    {kind === "invoice" && <><label>Patient<select name="patient_id" required defaultValue=""><option value="" disabled>Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} · {patient.unique_patient_id}</option>)}</select></label><div className="form-grid"><label>Total amount (INR)<input name="total" type="number" min="0" step="0.01" required value={total} onChange={(event) => setTotal(event.target.value)} placeholder="0.00" /></label><label>Discount (INR)<input name="discount" type="number" min="0" step="0.01" max={total || 0} required value={discount} onChange={(event) => setDiscount(event.target.value)} placeholder="0.00" /></label></div><div className="invoice-total"><span>AMOUNT DUE</span><strong>{money(final)}</strong></div><label>Payment status<select name="payment_status"><option>Unpaid</option><option>Paid</option></select></label></>}
    <div className="modal-actions"><button className="button button-quiet" type="button" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))}>Cancel</button><button className="button button-primary" disabled={saving || (kind !== "patient" && !patients.length) || (kind === "appointment" && !doctors.length)} type="submit">{saving ? "Saving…" : kind === "patient" ? "Register patient" : kind === "appointment" ? "Schedule appointment" : "Create invoice"}</button></div>
    {kind !== "patient" && !patients.length && <p className="form-note">Register a patient before creating this record.</p>}
  </form>;
}
