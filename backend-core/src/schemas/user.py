from typing import Optional
from datetime import date, datetime
from pydantic import BaseModel, EmailStr, ConfigDict, field_validator
import re

# 공통 속성 (DB 모델과 매핑되는 기본 필드들)
class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    is_active: Optional[bool] = True
    is_superuser: Optional[bool] = False
    phone_number: Optional[str] = None
    birth_date: Optional[date] = None

    # 🏠 주소 정보 (3분할)
    zip_code: Optional[str] = None          # 우편번호
    address: Optional[str] = None           # 기본 주소
    detail_address: Optional[str] = None    # 상세 주소

# 회원가입/생성 시 필요한 속성 (검증 로직 포함)
class UserCreate(UserBase):
    password: str

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 6 or len(v) > 100:
            raise ValueError('비밀번호는 6자 이상 100자 이하이어야 합니다.')
        
        if not re.match(r"^(?=.*[A-Za-z])(?=.*\d).+$", v):
            raise ValueError('비밀번호는 영문과 숫자를 반드시 포함해야 합니다.')
            
        return v
    
    # 📱 전화번호 유효성 검사 (01012345678 or 010-1234-5678)
    @field_validator('phone_number')
    @classmethod
    def validate_phone_number(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
            
        # 하이픈 제거 후 숫자만 남김
        clean_number = v.replace("-", "").strip()
        
        # 한국 휴대폰 번호 형식 체크 (010, 011 등으로 시작하는 10~11자리 숫자)
        if not re.match(r"^01([0|1|6|7|8|9])([0-9]{3,4})([0-9]{4})$", clean_number):
            raise ValueError('올바른 휴대전화 번호 형식이 아닙니다.')
            
        return clean_number  # DB에는 하이픈 없이 저장 (권장)

# 업데이트 시 필요한 속성
class UserUpdate(BaseModel): 
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_marketing_agreed: Optional[bool] = None
    phone_number: Optional[str] = None # ✨ 휴대폰 변경 가능
    birth_date: Optional[date] = None
    zip_code: Optional[str] = None
    address: Optional[str] = None
    detail_address: Optional[str] = None

# DB에서 조회해서 나갈 때 쓰는 속성
class UserResponse(UserBase):
    id: int
    provider: str = "email"
    created_at: datetime 
    updated_at: datetime 
    is_marketing_agreed: bool 

    # Pydantic v2 설정 (ORM 객체를 Pydantic 모델로 변환 허용)
    model_config = ConfigDict(from_attributes=True)

# 로그인 시 토큰 응답 스키마
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str

class TokenPayload(BaseModel):
    sub: Optional[int] = None

# 🚨 FIX: 외부 파일에서 'User'라는 이름으로 임포트할 때 오류 방지
# UserResponse를 User라는 이름으로도 사용할 수 있게 별칭 지정
User = UserResponse