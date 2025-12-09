import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy import text # text 임포트 필수
from alembic import context
from pgvector.sqlalchemy import Vector # pgvector 타입 인식

# 모델 메타데이터 임포트 (모든 모델이 로드되어야 함)
from src.db.session import Base
from src.models.product import Product
from src.models.user import User
from src.models.fitting import FittingResult
from src.config.settings import settings

config = context.config

# DATABASE_URL 환경변수 주입
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # pgvector 타입 변경 감지 허용
        include_object=lambda obj, name, type_, reflected, compare_to: True
    )

    with context.begin_transaction():
        context.run_migrations()

def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()

async def run_migrations_online() -> None:
    """Run migrations in 'online' mode (Async)."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        # pgvector 익스텐션 활성화 (매번 확인)
        await connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await connection.commit()
        
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()

if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())