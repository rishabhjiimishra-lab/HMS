from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app import models
from app.database import Base, engine, settings
from app.routers import appointments, auth, billing, doctors, patients, users


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Radiant Hospitals HMS API",
    version="1.0.0",
    description="Hospital operations API for Radiant Hospitals.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

api = "/api"
app.include_router(auth.router, prefix=api)
app.include_router(users.router, prefix=api)
app.include_router(patients.router, prefix=api)
app.include_router(doctors.router, prefix=api)
app.include_router(appointments.router, prefix=api)
app.include_router(billing.router, prefix=api)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready", tags=["health"])
def ready() -> dict[str, str]:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ready"}