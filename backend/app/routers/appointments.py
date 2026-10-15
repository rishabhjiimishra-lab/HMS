from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.models import Appointment, Doctor, EncounterStatus, EncounterType, Patient, User, UserRole
from app.schemas import AppointmentCreate, AppointmentResponse, AppointmentUpdate

router = APIRouter(prefix="/appointments", tags=["appointments"])
STAFF = (UserRole.ADMIN, UserRole.RECEPTIONIST)


def appointment_query(db: Session):
    return db.query(Appointment).options(
        joinedload(Appointment.patient),
        joinedload(Appointment.doctor).joinedload(Doctor.user).joinedload(User.deactivation),
    )


@router.get("", response_model=list[AppointmentResponse])
def list_appointments(
    status_filter: EncounterStatus | None = Query(default=None, alias="status"),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Appointment]:
    query = appointment_query(db)
    if user.role == UserRole.DOCTOR:
        doctor = db.query(Doctor).filter(Doctor.user_id == user.id).first()
        if doctor is None:
            return []
        query = query.filter(Appointment.doctor_id == doctor.id)
    if status_filter:
        query = query.filter(Appointment.status == status_filter)
    if date_from:
        if date_from.tzinfo is None:
            date_from = date_from.replace(tzinfo=UTC)
        query = query.filter(Appointment.appointment_datetime >= date_from)
    if date_to:
        if date_to.tzinfo is None:
            date_to = date_to.replace(tzinfo=UTC)
        query = query.filter(Appointment.appointment_datetime <= date_to)
    return query.order_by(Appointment.appointment_datetime.desc()).limit(200).all()


@router.post("", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
def create_appointment(
    payload: AppointmentCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*STAFF)),
) -> Appointment:
    if payload.type == EncounterType.IPD and not payload.bed_allocation:
        raise HTTPException(status_code=422, detail="IPD encounters require a bed allocation")
    if payload.type == EncounterType.OPD and payload.bed_allocation:
        raise HTTPException(status_code=422, detail="OPD encounters cannot have a bed allocation")
    if db.get(Patient, payload.patient_id) is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    doctor = (
        db.query(Doctor)
        .options(joinedload(Doctor.user).joinedload(User.deactivation))
        .filter(Doctor.id == payload.doctor_id)
        .first()
    )
    if doctor is None or not doctor.user.is_active:
        raise HTTPException(status_code=404, detail="Doctor not found")
    appointment = Appointment(**payload.model_dump())
    if appointment.appointment_datetime.tzinfo is None:
        appointment.appointment_datetime = appointment.appointment_datetime.replace(tzinfo=UTC)
    db.add(appointment)
    db.commit()
    db.refresh(appointment)
    return appointment_query(db).filter(Appointment.id == appointment.id).first()


@router.patch("/{appointment_id}", response_model=AppointmentResponse)
def update_appointment(
    appointment_id: int,
    payload: AppointmentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Appointment:
    if user.role not in (UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.DOCTOR):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    appointment = appointment_query(db).filter(Appointment.id == appointment_id).first()
    if appointment is None:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if user.role == UserRole.DOCTOR:
        doctor = db.query(Doctor).filter(Doctor.user_id == user.id).first()
        if doctor is None or appointment.doctor_id != doctor.id:
            raise HTTPException(status_code=403, detail="You can only update your own appointments")
        if set(payload.model_fields_set) - {"status"}:
            raise HTTPException(status_code=403, detail="Doctors may only update appointment status")
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("patient_id") and db.get(Patient, changes["patient_id"]) is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    if changes.get("doctor_id"):
        doctor = (
            db.query(Doctor)
            .options(joinedload(Doctor.user).joinedload(User.deactivation))
            .filter(Doctor.id == changes["doctor_id"])
            .first()
        )
        if doctor is None or not doctor.user.is_active:
            raise HTTPException(status_code=404, detail="Doctor not found")
    resulting_type = changes.get("type", appointment.type)
    resulting_bed = changes.get("bed_allocation", appointment.bed_allocation)
    if resulting_type == EncounterType.IPD and not resulting_bed:
        raise HTTPException(status_code=422, detail="IPD encounters require a bed allocation")
    if resulting_type == EncounterType.OPD and resulting_bed:
        raise HTTPException(status_code=422, detail="OPD encounters cannot have a bed allocation")
    for field, value in changes.items():
        setattr(appointment, field, value)
    db.commit()
    return appointment_query(db).filter(Appointment.id == appointment_id).first()