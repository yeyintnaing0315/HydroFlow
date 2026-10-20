"""add separate Bago East and Bago West stock tables

Revision ID: 20261018_0005
Revises: 20261017_0004
Create Date: 2026-10-18
"""
from alembic import op
from sqlalchemy.orm import Session

from app import models  # noqa: F401
from app.db import Base
from app.services.inventory import seed_regions

revision = "20261018_0005"
down_revision = "20261017_0004"
branch_labels = None
depends_on = None

TABLES = (
    "bago_east_balances",
    "bago_west_balances",
    "bago_east_movements",
    "bago_west_movements",
)


def upgrade() -> None:
    bind = op.get_bind()
    for name in TABLES:
        Base.metadata.tables[name].create(bind=bind, checkfirst=True)
    session = Session(bind=bind)
    seed_regions(session)
    session.flush()
    session.close()


def downgrade() -> None:
    bind = op.get_bind()
    for name in reversed(TABLES):
        Base.metadata.tables[name].drop(bind=bind, checkfirst=True)
