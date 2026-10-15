from datetime import datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import CheckConstraint, DateTime, Enum as SqlEnum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, Enum):
    ADMIN = "Admin"
    DOCTOR = "Doctor"
    RECEPTIONIST = "Receptionist"


class Gender(str, Enum):
    FEMALE = "Female"
    MALE = "Male"
    OTHER = "Other"
    PREFER_NOT_TO_SAY = "Prefer not to say"


class EncounterType(str, Enum):
    OPD = "OPD"
    IPD = "IPD"


class EncounterStatus(str, Enum):
    PENDING = "Pending"
    ACTIVE = "Active"
    DISCHARGED = "Discharged"
    CANCELLED = "Cancelled"


class PaymentStatus(str, Enum):
    PAID = "Paid"
    UNPAID = "Unpaid"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SqlEnum(UserRole, native_enum=False, length=20), nullable=False
    )
    doctor: Mapped["Doctor | None"] = relationship(back_populates="user", uselist=False)
    deactivation: Mapped["UserDeactivation | None"] = relationship(back_populates="user", uselist=False)

    @property
    def is_active(self) -> bool:
        return self.deactivation is None


class UserDeactivation(Base):
    __tablename__ = "user_deactivations"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    user: Mapped[User] = relationship(back_populates="deactivation")


class Patient(TimestampMixin, Base):
    __tablename__ = "patients"
    __table_args__ = (CheckConstraint("age >= 0 AND age <= 130", name="ck_patient_age_range"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    unique_patient_id: Mapped[str] = mapped_column(String(24), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    age: Mapped[int] = mapped_column(Integer, nullable=False)
    gender: Mapped[Gender] = mapped_column(SqlEnum(Gender, native_enum=False, length=24), nullable=False)
    contact: Mapped[str] = mapped_column(String(32), nullable=False)
    address: Mapped[str] = mapped_column(String(300), nullable=False)
    medical_history: Mapped[str | None] = mapped_column(Text)
    appointments: Mapped[list["Appointment"]] = relationship(back_populates="patient")
    invoices: Mapped[list["Billing"]] = relationship(back_populates="patient")


class Doctor(TimestampMixin, Base):
    __tablename__ = "doctors"
    __table_args__ = (
        CheckConstraint("consultation_fee >= 0", name="ck_doctor_consultation_fee_nonnegative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    full_name: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    department: Mapped[str] = mapped_column(String(120), nullable=False)
    specialization: Mapped[str] = mapped_column(String(120), nullable=False)
    consultation_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    availability_schedule: Mapped[str] = mapped_column(Text, nullable=False, default="")
    user: Mapped[User] = relationship(back_populates="doctor")
    appointments: Mapped[list["Appointment"]] = relationship(back_populates="doctor")

    @property
    def username(self) -> str:
        return self.user.username

    @property
    def is_active(self) -> bool:
        return self.user.is_active


class Appointment(TimestampMixin, Base):
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id", ondelete="RESTRICT"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id", ondelete="RESTRICT"), index=True)
    type: Mapped[EncounterType] = mapped_column(
        SqlEnum(EncounterType, native_enum=False, length=8), nullable=False
    )
    appointment_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    status: Mapped[EncounterStatus] = mapped_column(
        SqlEnum(EncounterStatus, native_enum=False, length=16),
        nullable=False,
        default=EncounterStatus.PENDING,
        server_default=EncounterStatus.PENDING.value,
    )
    bed_allocation: Mapped[str | None] = mapped_column(String(40))
    patient: Mapped[Patient] = relationship(back_populates="appointments")
    doctor: Mapped[Doctor] = relationship(back_populates="appointments")


class Billing(TimestampMixin, Base):
    __tablename__ = "billing"
    __table_args__ = (
        CheckConstraint("total_amount >= 0", name="ck_billing_total_nonnegative"),
        CheckConstraint("discount >= 0", name="ck_billing_discount_nonnegative"),
        CheckConstraint("final_amount >= 0", name="ck_billing_final_nonnegative"),
        CheckConstraint("discount <= total_amount", name="ck_billing_discount_lte_total"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id", ondelete="RESTRICT"), index=True)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    discount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    final_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    payment_status: Mapped[PaymentStatus] = mapped_column(
        SqlEnum(PaymentStatus, native_enum=False, length=8),
        nullable=False,
        default=PaymentStatus.UNPAID,
        server_default=PaymentStatus.UNPAID.value,
    )
    invoice_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    patient: Mapped[Patient] = relationship(back_populates="invoices")