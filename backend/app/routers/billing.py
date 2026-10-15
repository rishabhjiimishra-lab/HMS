from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import require_roles
from app.models import Billing, Patient, PaymentStatus, User, UserRole
from app.schemas import BillingCreate, BillingResponse, BillingUpdate

router = APIRouter(prefix="/billing", tags=["billing"])
STAFF = (UserRole.ADMIN, UserRole.RECEPTIONIST)


@router.get("", response_model=list[BillingResponse])
def list_invoices(
    payment_status: PaymentStatus | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST)),
) -> list[Billing]:
    query = db.query(Billing).options(joinedload(Billing.patient))
    if payment_status:
        query = query.filter(Billing.payment_status == payment_status)
    return query.order_by(Billing.invoice_date.desc()).limit(200).all()


@router.post("", response_model=BillingResponse, status_code=status.HTTP_201_CREATED)
def create_invoice(
    payload: BillingCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*STAFF)),
) -> Billing:
    if db.get(Patient, payload.patient_id) is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    invoice = Billing(
        patient_id=payload.patient_id,
        total_amount=payload.total_amount,
        discount=payload.discount,
        final_amount=payload.total_amount - payload.discount,
        payment_status=payload.payment_status,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return db.query(Billing).options(joinedload(Billing.patient)).filter(Billing.id == invoice.id).first()


@router.patch("/{invoice_id}", response_model=BillingResponse)
def update_invoice(
    invoice_id: int,
    payload: BillingUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*STAFF)),
) -> Billing:
    invoice = db.query(Billing).options(joinedload(Billing.patient)).filter(Billing.id == invoice_id).first()
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if payload.payment_status is not None:
        invoice.payment_status = payload.payment_status
    db.commit()
    return invoice