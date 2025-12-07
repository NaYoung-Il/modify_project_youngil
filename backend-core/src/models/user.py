# backend-core/src/models/user.py
from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, Boolean, TIMESTAMP, Date
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
# [수정됨] Base 통일
from src.db.session import Base

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255))
    full_name: Mapped[Optional[str]] = mapped_column(String(100))
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    provider: Mapped[str] = mapped_column(String(50), default="local")

    is_marketing_agreed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # --- [추가된 필드] ---
    # 1. 생년월일 (YYYY-MM-DD)
    birth_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    
    # 2. 전화번호 (하이픈 없이 저장 권장, 예: 01012345678)
    phone_number: Mapped[Optional[str]] = mapped_column(String(20), unique=True, nullable=True)
    
    # 3. 전화번호 인증 여부
    is_phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # 4. 주소 관련 필드 (분리 저장 권장)
    zip_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # 우편번호 (location 대신 사용)
    address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # 기본 주소 (서울시 강남구...) -> API 연동
    detail_address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True) # 상세 주소 (101동 101호)

    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now()
    )