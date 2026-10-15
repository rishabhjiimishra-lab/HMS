import type {
  Appointment,
  Appointment as AppointmentType,
  Doctor,
  EncounterStatus,
  EncounterType,
  Gender,
  Invoice,
  Patient,
  PaymentStatus,
  TokenResponse,
  User,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const TOKEN_KEY = "radiant_hms_token";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
  } catch {
    throw new ApiError("Cannot reach the HMS API. Check that the backend is running.", 0);
  }

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { detail?: string } | null;
    if (response.status === 401) setToken(null);
    throw new ApiError(data?.detail ?? `Request failed (${response.status})`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<User>("/auth/me"),
  patients: (search = "") =>
    request<Patient[]>(`/patients${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  createPatient: (payload: {
    full_name: string;
    age: number;
    gender: Gender;
    contact: string;
    address: string;
    medical_history?: string;
  }) => request<Patient>("/patients", { method: "POST", body: JSON.stringify(payload) }),
  doctors: () => request<Doctor[]>("/doctors"),
  appointments: () => request<Appointment[]>("/appointments"),
  createAppointment: (payload: {
    patient_id: number;
    doctor_id: number;
    type: EncounterType;
    appointment_datetime: string;
    bed_allocation?: string;
  }) => request<AppointmentType>("/appointments", { method: "POST", body: JSON.stringify(payload) }),
  updateAppointment: (id: number, status: EncounterStatus) =>
    request<Appointment>(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  invoices: () => request<Invoice[]>("/billing"),
  createInvoice: (payload: { patient_id: number; total_amount: number; discount: number; payment_status: PaymentStatus }) =>
    request<Invoice>("/billing", { method: "POST", body: JSON.stringify(payload) }),
  updateInvoice: (id: number, payment_status: PaymentStatus) =>
    request<Invoice>(`/billing/${id}`, { method: "PATCH", body: JSON.stringify({ payment_status }) }),
};
