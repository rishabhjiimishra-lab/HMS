from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from typing import Annotated

from app.models import EncounterStatus, EncounterType, Gender, PaymentStatus, UserRole


NonEmptyName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=160)]
Username = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=80)]
Contact = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=32)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserCreate(BaseModel):
    username: Username
    password: Annotated[str, Field(min_length=12, max_length=128)]
    role: UserRole


class UserResponse(ORMModel):
    id: int
    username: str
    role: UserRole
    created_at: datetime


class LoginRequest(BaseModel):
    username: Username
    password: Annotated[str, Field(min_length=1, max_length=128)]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class PatientBase(BaseModel):
    full_name: NonEmptyName
    age: int = Field(ge=0, le=130)
    gender: Gender
    contact: Contact
    address: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=300)]
    medical_history: Annotated[str | None, Field(max_length=10000)] = None


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    full_name: NonEmptyName | None = None
    age: int | None = Field(default=None, ge=0, le=130)
    gender: Gender | None = None
    contact: Contact | None = None
    address: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=300)] | None = None
    medical_history: Annotated[str | None, Field(max_length=10000)] = None


class PatientResponse(ORMModel):
    id: int
    unique_patient_id: str
    full_name: str
    age: int
    gender: Gender
    contact: str
    address: str
    medical_history: str | None
    created_at: datetime
    updated_at: datetime


class DoctorCreate(BaseModel):
    username: Username
    password: Annotated[str, Field(min_length=12, max_length=128)]
    full_name: NonEmptyName
    department: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
    specialization: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
    consultation_fee: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    availability_schedule: Annotated[str, Field(max_length=4000)] = ""


class DoctorUpdate(BaseModel):
    full_name: NonEmptyName | None = None
    department: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)] | None = None
    specialization: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)] | None = None
    consultation_fee: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    availability_schedule: Annotated[str, Field(max_length=4000)] | None = None


class DoctorResponse(ORMModel):
    id: int
    user_id: int
    username: str
    full_name: str
    department: str
    specialization: str
    consultation_fee: Decimal
    availability_schedule: str


class AppointmentCreate(BaseModel):
    patient_id: int = Field(gt=0)
    doctor_id: int = Field(gt=0)
    type: EncounterType
    appointment_datetime: datetime
    bed_allocation: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=40)] = None


class AppointmentUpdate(BaseModel):
    patient_id: int | None = Field(default=None, gt=0)
    doctor_id: int | None = Field(default=None, gt=0)
    type: EncounterType | None = None
    appointment_datetime: datetime | None = None
    status: EncounterStatus | None = None
    bed_allocation: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=40)] = None


class AppointmentResponse(ORMModel):
    id: int
    patient_id: int
    doctor_id: int
    type: EncounterType
    appointment_datetime: datetime
    status: EncounterStatus
    bed_allocation: str | None
    patient: PatientResponse
    doctor: DoctorResponse
    created_at: datetime


class BillingCreate(BaseModel):
    patient_id: int = Field(gt=0)
    total_amount: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    discount: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=10, decimal_places=2)
    payment_status: PaymentStatus = PaymentStatus.UNPAID

    @model_validator(mode="after")
    def discount_cannot_exceed_total(self) -> "BillingCreate":
        if self.discount > self.total_amount:
            raise ValueError("discount cannot exceed total_amount")
        return self


class BillingUpdate(BaseModel):
    payment_status: PaymentStatus | None = None


class BillingResponse(ORMModel):
    id: int
    patient_id: int
    total_amount: Decimal
    discount: Decimal
    final_amount: Decimal
    payment_status: PaymentStatus
    invoice_date: datetime
    patient: PatientResponse


class PageInfo(BaseModel):
    items: list[object]
    total: int
    skip: int
    limit: int