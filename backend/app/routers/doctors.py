from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import require_roles
from app.models import Doctor, User, UserRole
from app.schemas import DoctorCreate, DoctorResponse, DoctorUpdate
from app.security import hash_password

router = APIRouter(prefix="/doctors", tags=["doctors"])


@router.get("", response_model=list[DoctorResponse])
def list_doctors(
    db: Session = Depends(get_db), _: User = Depends(require_roles(*tuple(UserRole)))
) -> list[Doctor]:
    return db.query(Doctor).options(joinedload(Doctor.user)).order_by(Doctor.full_name).all()


@router.post("", response_model=DoctorResponse, status_code=status.HTTP_201_CREATED)
def create_doctor(
    payload: DoctorCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> Doctor:
    user = User(username=payload.username, password_hash=hash_password(payload.password), role=UserRole.DOCTOR)
    doctor = Doctor(
        full_name=payload.full_name,
        department=payload.department,
        specialization=payload.specialization,
        consultation_fee=payload.consultation_fee,
        availability_schedule=payload.availability_schedule,
        user=user,
    )
    db.add(doctor)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username is already in use") from exc
    db.refresh(doctor)
    return doctor


@router.patch("/{doctor_id}", response_model=DoctorResponse)
def update_doctor(
    doctor_id: int,
    payload: DoctorUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> Doctor:
    doctor = db.query(Doctor).options(joinedload(Doctor.user)).filter(Doctor.id == doctor_id).first()
    if doctor is None:
        raise HTTPException(status_code=404, detail="Doctor not found")
    for field, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(doctor, field, value)
    db.commit()
    db.refresh(doctor)
    return doctor