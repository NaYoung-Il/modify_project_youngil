import os
import base64
import io
from PIL import Image
from typing import List, Any
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

import replicate
from pydantic import BaseModel
from datetime import datetime

from src.db.session import get_db
from src.models.user import User
from src.models.fitting import FittingResult
from src.api import deps    # 로그인 유저 확인용

router = APIRouter()

# 응답 스키마 (Schemas)
class FittingResponse(BaseModel):
    image_url: str
    id: int # 저장된 ID도 반환

class FittingHistoryResponse(BaseModel):
    id: int
    result_image_url: str
    category: str | None
    created_at: datetime
    
    class Config:
        from_attributes = True


# 이미지 최적화 함수 (Helper Function)
def optimize_image(image_bytes: bytes) -> str:

    # 1. 바이트를 이미지 객체로 변환
    img = Image.open(io.BytesIO(image_bytes))

    # 2. RGB로 변환 (PNG 등 투명 배경 이미지 처리)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    # 3. 3:4 비율(768x1024)로 캔버스 만들기 (Padding)
    target_ratio = 3 / 4
    target_width = 768
    target_height = 1024
    
    current_width, current_height = img.size
    current_ratio = current_width / current_height

    # 이미지가 들어갈 최종 크기 계산
    if current_ratio > target_ratio:
        # 이미지가 더 넓적한 경우 (가로 기준 맞춤)
        new_width = target_width
        new_height = int(target_width / current_ratio)
    else:
        # 이미지가 더 길쭉하거나 같은 경우 (세로 기준 맞춤)
        new_height = target_height
        new_width = int(target_height * current_ratio)
        
    # 리사이징 (LANCZOS 필터로 고화질 유지)
    img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    # 3:4 비율의 흰색(또는 검은색) 배경 생성
    # AI 모델은 배경이 단순할수록 인식을 잘 하므로 흰색 추천
    new_img = Image.new("RGB", (target_width, target_height), (255, 255, 255))
    
    # 중앙에 이미지 붙여넣기
    paste_x = (target_width - new_width) // 2
    paste_y = (target_height - new_height) // 2
    new_img.paste(img, (paste_x, paste_y))

    # 4. JPEG로 압축 (퀄리티 85)
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=85)

    # 5. Base64 변환
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{encoded}"


# 1. 가상 피팅 생성 및 저장 엔드포인트
# .env 파일이나 settings.py에 REPLICATE_API_TOKEN이 있어야 합니다.
@router.post("/generate", response_model=FittingResponse)
async def generate_fitting(
    human_img: UploadFile = File(...),
    garm_img: UploadFile = File(...),
    category: str = Form("upper_body"),  # 프론트에서 보낸 값이 여기로 들어온다.
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)  # 로그인 유저 필수
):
    """
    [가상 피팅 생성 API]
    1. 프론트에서 사람 이미지와 옷 이미지를 받습니다.
    2. Base64 문자열로 변환
    3. Replicate의 IDM-VTON 모델에 전송합니다.
    4. 결과 이미지 URL을 반환합니다.
    """
    try:
        # 1. 파일 읽기 (바이트 변환)
        human_bytes = await human_img.read()
        garm_bytes = await garm_img.read()

        print("🚀 이미지 최적화 중...")

        # 2. [수정] 최적화 함수 사용 (용량 대폭 감소)
        human_uri = optimize_image(human_bytes)
        garm_uri = optimize_image(garm_bytes)

        print(f"🚀 가상 피팅 생성 시작 (User: {current_user.email}), (Category: {category})...")

        # 3. Replicate 모델 실행 (IDM-VTON)
        # 주의) Replicate는 파일을 URL로 받거나 파일 객체로 받아야 함.
        # 가장 쉬운 방법은 Replicate가 제공하는 임시 파일 업로드를 사용하는 것이지만,
        # 여기서는 바이너리를 직접 넘기는 방식을 시도하거나, 
        # 실제로는 S3에 업로드 후 URL을 넘기는 것이 정석입니다.
        # (간단한 구현을 위해 Replicate SDK가 바이너리를 처리하도록 함)

        model_id = "cuuupid/idm-vton:0513734a452173b8173e907e3a59d19a36266e55b48528559432bd21c7d7e985"

        output = replicate.run(
            model_id, 
            input={
                "human_img": human_uri,   
                "garm_img": garm_uri,
                "category": category,       # upper_body, lower_body, dresses
                "garment_des": "clothing",  # 기본값 (옷에 대한 설명(텍스트))
                "crop": False,
                "seed": 42
            }
        )

        result_url = str(output)

        # DB 저장 로직
        history = FittingResult(
            user_id=current_user.id,
            result_image_url=result_url,
            category=category,
            created_at=datetime.utcnow()
        )
        db.add(history)
        await db.commit()
        await db.refresh(history)

        print(f"✅ DB 저장 완료 (ID: {history.id})")

        return {"image_url": result_url, "id": history.id}
    
    except replicate.exceptions.ReplicateError as e:
        print(f"❌ Replicate API Error: {e}")
        raise HTTPException(status_code=500, detail=f"AI 모델 오류: {str(e)}")
    
    except Exception as e:
        print(f"❌ General Error: {e}")
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")


# 2. 가상 피팅 히스토리 목록 조회 엔드포인트
@router.get("/history", response_model=List[FittingHistoryResponse])
async def get_fitting_history(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)  # 로그인 유저 필수
):
    """
    [가상 피팅 히스토리 조회 API]
    1. 로그인한 유저의 가상 피팅 히스토리를 조회합니다.
    2. 최신 순으로 정렬하여 반환합니다.
    """
    query = select(FittingResult)\
        .where(FittingResult.user_id == current_user.id)\
        .order_by(desc(FittingResult.created_at))\
        .offset(skip)\
        .limit(limit)
        
    result = await db.execute(query) 
    histories = result.scalars().all() 
    
    return histories