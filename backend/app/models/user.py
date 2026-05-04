import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, Integer, Numeric, Text,
    ForeignKey, DateTime, Date, UniqueConstraint, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base


class Department(Base):
    __tablename__ = "departments"
    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code       = Column(String(20), unique=True, nullable=False)
    name       = Column(String(100), nullable=False)
    parent_id  = Column(UUID(as_uuid=True), ForeignKey("departments.id"), nullable=True)
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    users      = relationship("User", back_populates="department", foreign_keys="User.department_id")


class User(Base):
    __tablename__ = "users"
    id                   = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id          = Column(String(50), unique=True, nullable=False)
    email                = Column(String(255), unique=True, nullable=False)
    full_name            = Column(String(150), nullable=False)
    role                 = Column(String(20), nullable=False, default="STAFF")
    job_grade            = Column(String(20))
    department_id        = Column(UUID(as_uuid=True), ForeignKey("departments.id"))

    # Org structure
    employment_unit      = Column(String(100))
    division             = Column(String(100))
    section              = Column(String(100))
    position_title       = Column(String(150))
    category             = Column(String(50))
    country              = Column(String(100))
    work_location        = Column(String(100))
    employee_type        = Column(String(50))
    hire_date            = Column(Date)
    gender               = Column(String(20))

    # Legacy manager
    manager_id           = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    # Approval chain
    direct_manager_id    = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    reviewing_manager_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    hod_id               = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    approval_levels      = Column(Integer, default=3)

    is_active            = Column(Boolean, default=True)
    hashed_password      = Column(Text, nullable=False)
    last_login           = Column(DateTime(timezone=True))
    created_at           = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at           = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    department        = relationship("Department", back_populates="users", foreign_keys=[department_id])
    manager           = relationship("User", foreign_keys=[manager_id],            primaryjoin="User.manager_id==User.id",            remote_side="User.id")
    direct_manager    = relationship("User", foreign_keys=[direct_manager_id],     primaryjoin="User.direct_manager_id==User.id",     remote_side="User.id")
    reviewing_manager = relationship("User", foreign_keys=[reviewing_manager_id],  primaryjoin="User.reviewing_manager_id==User.id",  remote_side="User.id")
    hod               = relationship("User", foreign_keys=[hod_id],                primaryjoin="User.hod_id==User.id",                remote_side="User.id")

    kpis          = relationship("Kpi",          back_populates="user", foreign_keys="Kpi.user_id")
    scorecards    = relationship("Scorecard",    back_populates="user", foreign_keys="Scorecard.user_id")
    notifications = relationship("Notification", back_populates="user")


class PerformanceCycle(Base):
    __tablename__ = "performance_cycles"
    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name                = Column(String(100), nullable=False)
    year                = Column(Integer, nullable=False)
    status              = Column(String(20), default="DRAFT", nullable=False)
    kpi_setting_start   = Column(Date, nullable=False)
    kpi_setting_end     = Column(Date, nullable=False)
    self_eval_start     = Column(Date, nullable=False)
    self_eval_end       = Column(Date, nullable=False)
    mgr_eval_start      = Column(Date, nullable=False)
    mgr_eval_end        = Column(Date, nullable=False)
    mgr2_eval_start     = Column(Date)
    mgr2_eval_end       = Column(Date)
    hod_eval_start      = Column(Date)
    hod_eval_end        = Column(Date)
    calibration_start   = Column(Date)
    calibration_end     = Column(Date)
    created_by          = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at          = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at          = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    weight_rules        = relationship("WeightRule",    back_populates="cycle")
    kpi_templates       = relationship("KpiTemplate",  back_populates="cycle")
    rating_scales       = relationship("RatingScale",  back_populates="cycle")
    increment_bands     = relationship("IncrementBand", back_populates="cycle")


class WeightRule(Base):
    __tablename__ = "weight_rules"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cycle_id        = Column(UUID(as_uuid=True), ForeignKey("performance_cycles.id", ondelete="CASCADE"), nullable=False)
    department_id   = Column(UUID(as_uuid=True), ForeignKey("departments.id"))
    job_grade       = Column(String(20))
    category        = Column(String(50), nullable=False)
    min_weight      = Column(Integer, default=0, nullable=False)
    max_weight      = Column(Integer, default=100, nullable=False)
    fixed_weight    = Column(Integer)
    created_by      = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at      = Column(DateTime(timezone=True), default=datetime.utcnow)
    cycle           = relationship("PerformanceCycle", back_populates="weight_rules")


class KpiTemplate(Base):
    __tablename__ = "kpi_templates"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cycle_id        = Column(UUID(as_uuid=True), ForeignKey("performance_cycles.id", ondelete="CASCADE"), nullable=False)
    name            = Column(String(200), nullable=False)
    description     = Column(Text)
    category        = Column(String(50), nullable=False)
    kpi_type        = Column(String(20), default="FIXED", nullable=False)
    weight          = Column(Integer, nullable=False)
    target          = Column(String(200), nullable=False)
    measurement     = Column(Text)
    department_id   = Column(UUID(as_uuid=True), ForeignKey("departments.id"))
    job_grade       = Column(String(20))
    cascaded_by     = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime(timezone=True), default=datetime.utcnow)
    cycle           = relationship("PerformanceCycle", back_populates="kpi_templates")


class Kpi(Base):
    __tablename__ = "kpis"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cycle_id        = Column(UUID(as_uuid=True), ForeignKey("performance_cycles.id"), nullable=False)
    user_id         = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    template_id     = Column(UUID(as_uuid=True), ForeignKey("kpi_templates.id"))
    name            = Column(String(200), nullable=False)
    description     = Column(Text)
    category        = Column(String(50), nullable=False)
    kpi_type        = Column(String(20), default="OPTIONAL", nullable=False)
    weight          = Column(Integer, nullable=False)
    target          = Column(String(200), nullable=False)
    measurement     = Column(Text)
    self_score      = Column(Numeric(3, 1))
    mgr_score       = Column(Numeric(3, 1))
    mgr2_score      = Column(Numeric(3, 1))
    hod_score       = Column(Numeric(3, 1))
    final_score     = Column(Numeric(3, 1))
    self_comment    = Column(Text)
    mgr_comment     = Column(Text)
    mgr2_comment    = Column(Text)
    hod_comment     = Column(Text)
    status          = Column(String(20), default="DRAFT", nullable=False)
    created_at      = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at      = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    user            = relationship("User", back_populates="kpis", foreign_keys=[user_id])
    audit_logs      = relationship("KpiAuditLog", back_populates="kpi")
    __table_args__  = (
        UniqueConstraint("cycle_id", "user_id", "name"),
        CheckConstraint("weight >= 0 AND weight <= 100"),
    )


class KpiAuditLog(Base):
    __tablename__ = "kpi_audit_log"
    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kpi_id      = Column(UUID(as_uuid=True), ForeignKey("kpis.id"), nullable=False)
    actor_id    = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    from_status = Column(String(20))
    to_status   = Column(String(20), nullable=False)
    comment     = Column(Text)
    score_given = Column(Numeric(3, 1))
    created_at  = Column(DateTime(timezone=True), default=datetime.utcnow)
    kpi         = relationship("Kpi", back_populates="audit_logs")


class RatingScale(Base):
    __tablename__ = "rating_scales"
    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cycle_id    = Column(UUID(as_uuid=True), ForeignKey("performance_cycles.id", ondelete="CASCADE"), nullable=False)
    score       = Column(Numeric(3, 1), nullable=False)
    label       = Column(String(50), nullable=False)
    description = Column(Text)
    color_hex   = Column(String(7))
    cycle       = relationship("PerformanceCycle", back_populates="rating_scales")
    __table_args__ = (UniqueConstraint("cycle_id", "score"),)


class Scorecard(Base):
    __tablename__ = "scorecards"
    id                      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cycle_id                = Column(UUID(as_uuid=True), ForeignKey("performance_cycles.id"), nullable=False)
    user_id                 = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    self_total              = Column(Numeric(4, 2))
    mgr_total               = Column(Numeric(4, 2))
    mgr2_total              = Column(Numeric(4, 2))
    hod_total               = Column(Numeric(4, 2))
    final_score             = Column(Numeric(4, 2))
    performance_band        = Column(String(50))
    band_rank               = Column(Integer)
    percentile              = Column(Numeric(5, 2))
    increment_pct           = Column(Numeric(5, 2))
    increment_status        = Column(String(20), default="PENDING")
    increment_confirmed_by  = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    increment_confirmed_at  = Column(DateTime(timezone=True))
    eval_status             = Column(String(20), default="NOT_STARTED", nullable=False)
    is_locked               = Column(Boolean, default=False)
    created_at              = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at              = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    user                    = relationship("User", back_populates="scorecards", foreign_keys=[user_id])
    __table_args__          = (UniqueConstraint("cycle_id", "user_id"),)


class IncrementBand(Base):
    __tablename__ = "increment_bands"
    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cycle_id      = Column(UUID(as_uuid=True), ForeignKey("performance_cycles.id", ondelete="CASCADE"), nullable=False)
    band_name     = Column(String(50), nullable=False)
    min_score     = Column(Numeric(4, 2), nullable=False)
    max_score     = Column(Numeric(4, 2), nullable=False)
    increment_pct = Column(Numeric(5, 2), nullable=False)
    description   = Column(Text)
    cycle         = relationship("PerformanceCycle", back_populates="increment_bands")


class BellCurveTarget(Base):
    __tablename__ = "bell_curve_targets"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cycle_id        = Column(UUID(as_uuid=True), ForeignKey("performance_cycles.id", ondelete="CASCADE"), nullable=False)
    department_id   = Column(UUID(as_uuid=True), ForeignKey("departments.id"))
    band_name       = Column(String(50), nullable=False)
    target_pct      = Column(Numeric(5, 2), nullable=False)


class Notification(Base):
    __tablename__ = "notifications"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id         = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title           = Column(String(200), nullable=False)
    body            = Column(Text, nullable=False)
    type            = Column(String(50))
    reference_id    = Column(UUID(as_uuid=True))
    is_read         = Column(Boolean, default=False)
    created_at      = Column(DateTime(timezone=True), default=datetime.utcnow)
    user            = relationship("User", back_populates="notifications")
