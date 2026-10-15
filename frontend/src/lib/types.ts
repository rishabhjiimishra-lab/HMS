export type Role = "Admin" | "Doctor" | "Receptionist";
export type Gender = "Female" | "Male" | "Other" | "Prefer not to say";
export type EncounterType = "OPD" | "IPD";
export type EncounterStatus = "Pending" | "Active" | "Discharged" | "Cancelled";
export type PaymentStatus = "Paid" | "Unpaid";

export interface User {
  id: number;
  username: string;
  role: Role;
  created_at?: string;
}

export interface Patient {
  id: number;
  unique_patient_id: string;
  full_name: string;
  age: number;
  gender: Gender;
  contact: string;
  address: string;
  medical_history?: string | null;
  created_at: string;
}

export interface Doctor {
  id: number;
  user_id: number;
  username: string;
  full_name: string;
  department: string;
  specialization: string;
  consultation_fee: string;
  availability_schedule: string;
}

export interface Appointment {
  id: number;
  patient_id: number;
  doctor_id: number;
  type: EncounterType;
  appointment_datetime: string;
  status: EncounterStatus;
  bed_allocation?: string | null;
  patient: Patient;
  doctor: Doctor;
}

export interface Invoice {
  id: number;
  patient_id: number;
  total_amount: string;
  discount: string;
  final_amount: string;
  payment_status: PaymentStatus;
  invoice_date: string;
  patient: Patient;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}
