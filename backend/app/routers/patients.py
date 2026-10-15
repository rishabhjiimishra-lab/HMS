import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models import Patient, User, UserRole
from app.schemas import PatientCreate, PatientResponse, PatientUpdate

router = APIRouter(prefix="/patients", tags=["patients"])
STAFF = (UserRole.ADMIN, UserRole.RECEPTIONIST)


@router.get("", response_model=list[PatientResponse])
def list_patients(
    search: str | None = Query(default=None, max_length=160),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*tuple(UserRole))),
) -> list[Patient]:
    query = db.query(Patient)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(Patient.full_name.ilike(term), Patient.unique_patient_id.ilike(term), Patient.contact.ilike(term))
        )
    return query.order_by(Patient.created_at.desc()).offset(skip).limit(limit).all()


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
def create_patient(
    payload: PatientCreate, db: Session = Depends(get_db), _: User = Depends(require_roles(*STAFF))
) -> Patient:
    patient = Patient(
        **payload.model_dump(),
        unique_patient_id=f"RH-{datetime.now(UTC):%y%m%d}-{secrets.token_hex(3).upper()}",
    )
    db.add(patient)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Could not generate a unique patient ID; retry") from exc
    db.refresh(patient)
    return patient


@router.get("/{patient_id}", response_model=PatientResponse)
def get_patient(
    patient_id: int, db: Session = Depends(get_db), _: User = Depends(require_roles(*tuple(UserRole)))
) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.patch("/{patient_id}", response_model=PatientResponse)
def update_patient(
    patient_id: int,
    payload: PatientUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*STAFF)),
) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    for field, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(patient, field, value)
    db.commit()
    db.refresh(patient)
    return patient