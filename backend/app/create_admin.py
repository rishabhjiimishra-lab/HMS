import argparse
from getpass import getpass

from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal
from app.models import User, UserRole
from app.security import hash_password


def main() -> None:
    parser = argparse.ArgumentParser(description="Create the first or an additional HMS administrator.")
    parser.add_argument("--username", required=True, help="Unique administrator username")
    args = parser.parse_args()
    password = getpass("Admin password (minimum 12 characters): ")
    if len(password) < 12:
        parser.error("Password must contain at least 12 characters")

    with SessionLocal() as db:
        if db.query(User).filter(User.username == args.username).first() is not None:
            parser.error("That username is already in use")
        db.add(User(username=args.username, password_hash=hash_password(password), role=UserRole.ADMIN))
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            parser.error("Unable to create administrator; confirm the username is unique")
            raise exc
    print(f"Administrator '{args.username}' created.")


if __name__ == "__main__":
    main()