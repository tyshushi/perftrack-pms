from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

from app.api.routes.auth import router as auth_router
from app.api.routes.users import router as users_router
from app.api.routes.departments import router as departments_router
from app.api.routes.cycles import router as cycles_router
from app.api.routes.weight_rules import router as weight_rules_router
from app.api.routes.kpi_templates import router as kpi_templates_router
from app.api.routes.kpis import router as kpis_router
from app.api.routes.evaluations import router as evaluations_router
from app.api.routes.scorecards import router as scorecards_router
from app.api.routes.increments import router as increments_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.admin import router as admin_router


async def run_schema_and_seed():
    import asyncpg
    raw_url = os.environ.get("DATABASE_URL", "")
    url = raw_url.replace("postgresql+asyncpg://", "postgresql://").replace("postgres://", "postgresql://")
    if not url:
        return
    try:
        conn = await asyncpg.connect(url)
        
        # Check if enums exist and create if missing
        enum_check = await conn.fetchval(
            "SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname='cyclestatus')"
        )
        if not enum_check:
    print("==> Creating enums...")
    # ... enum creation code ...
    print("==> Enums created.")

# Always run this to fix column types
print("==> Converting enum columns to varchar...")
await conn.execute("""
    DO $$ BEGIN
        ALTER TABLE performance_cycles ALTER COLUMN status TYPE VARCHAR(20) USING status::text;
    EXCEPTION WHEN others THEN NULL; END $$;
    DO $$ BEGIN
        ALTER TABLE kpis ALTER COLUMN status TYPE VARCHAR(20) USING status::text;
    EXCEPTION WHEN others THEN NULL; END $$;
    DO $$ BEGIN
        ALTER TABLE kpis ALTER COLUMN kpi_type TYPE VARCHAR(20) USING kpi_type::text;
    EXCEPTION WHEN others THEN NULL; END $$;
    DO $$ BEGIN
        ALTER TABLE kpi_templates ALTER COLUMN kpi_type TYPE VARCHAR(20) USING kpi_type::text;
    EXCEPTION WHEN others THEN NULL; END $$;
    DO $$ BEGIN
        ALTER TABLE kpi_audit_log ALTER COLUMN from_status TYPE VARCHAR(20) USING from_status::text;
    EXCEPTION WHEN others THEN NULL; END $$;
    DO $$ BEGIN
        ALTER TABLE kpi_audit_log ALTER COLUMN to_status TYPE VARCHAR(20) USING to_status::text;
    EXCEPTION WHEN others THEN NULL; END $$;
    DO $$ BEGIN
        ALTER TABLE scorecards ALTER COLUMN eval_status TYPE VARCHAR(20) USING eval_status::text;
    EXCEPTION WHEN others THEN NULL; END $$;
    DO $$ BEGIN
        ALTER TABLE scorecards ALTER COLUMN increment_status TYPE VARCHAR(20) USING increment_status::text;
    EXCEPTION WHEN others THEN NULL; END $$;
    DO $$ BEGIN
        ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(20) USING role::text;
    EXCEPTION WHEN others THEN NULL; END $$;
""")
print("==> Column types fixed.")

        exists = await conn.fetchval(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='users')"
        )
        if not exists:
            print("==> Running schema.sql...")
            schema = open("schema.sql").read()
            await conn.execute(schema)
            print("==> Running seed.sql...")
            seed = open("seed.sql").read()
            await conn.execute(seed)
            print("==> Database ready!")
        else:
            print("==> Database already initialised, skipping seed.")
        await conn.close()
    except Exception as e:
        print(f"==> DB init warning: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_schema_and_seed()
    yield


app = FastAPI(
    title="Performance Management System",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://tyshushi.github.io"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

app.include_router(auth_router,          prefix="/api/v1/auth",          tags=["Auth"])
app.include_router(users_router,         prefix="/api/v1/users",         tags=["Users"])
app.include_router(departments_router,   prefix="/api/v1/departments",   tags=["Departments"])
app.include_router(cycles_router,        prefix="/api/v1/cycles",        tags=["Cycles"])
app.include_router(weight_rules_router,  prefix="/api/v1/weight-rules",  tags=["Weight Rules"])
app.include_router(kpi_templates_router, prefix="/api/v1/kpi-templates", tags=["KPI Templates"])
app.include_router(kpis_router,          prefix="/api/v1/kpis",          tags=["KPIs"])
app.include_router(evaluations_router,   prefix="/api/v1/evaluations",   tags=["Evaluations"])
app.include_router(scorecards_router,    prefix="/api/v1/scorecards",    tags=["Scorecards"])
app.include_router(increments_router,    prefix="/api/v1/increments",    tags=["Increments"])
app.include_router(notifications_router, prefix="/api/v1/notifications", tags=["Notifications"])
app.include_router(admin_router,         prefix="/api/v1/admin",         tags=["Admin"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "PMS API v1.0"}
