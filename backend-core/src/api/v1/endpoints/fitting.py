import os
import shutil
import tempfile
import base64
from pathlib import Path
from datetime import datetime
from typing import List
from PIL import Image, ImageDraw

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session 
from gradio_client import Client, handle_file

from src.db.session import get_db
from src.models.user import User
from src.models.fitting import FittingResult
from src.api import deps    # 로그인 유저 확인용
from pydantic import BaseModel

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


# Helper : 이미지를 Base64 Data URI로 변환
def image_to_base64(image_path: str) -> str:
    # 파일이 실제로 존재하는지 확인
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Result file not found: {image_path}")
    
    with open(image_path, "rb") as img_file:
        encoded_string = base64.b64encode(img_file.read()).decode("utf-8")
        # JPEG 형식으로 가정
        return f"data:image/jpeg;base64,{encoded_string}"
    
# Helper : 강제 마스크 생성
def create_mask_image(image_path: str, category: str) -> str:
    """
    카테고리에 따라 이미지의 특정 영역을 검은색으로 칠한 마스크를 생성합니다.
    - upper: 마스크 없음 (자동 맡김)
    - lower: 하단 50% 마스킹
    - dresses: 머리 제외 전체 마스킹 (상단 15% 남김)
    """
    img = Image.open(image_path).convert("RGB")
    width, height = img.size

    # 마스크 레이어 생성 (투명 배경)
    mask = Image.new("RGBA", (width, height), (0,0,0,0))
    draw = ImageDraw.Draw(mask)

    # 영역 지정 (하얀색 = 바뀔 부분, 투명 = 유지할 부분)
    # 주의: Gradio Editor에서는 보통 '지워진 부분'을 채우거나, '칠해진 부분'을 채움.
    # IDM-VTON은 보통 "검은색 배경에 흰색 영역"이 마스크입니다.
    if category == "lower_body":
        # 하의: 이미지의 하단 60%를 바꿈
        draw.rectangle([(0, int(height * 0.4)), (width, height)], fill=(255, 255, 255, 255))
        
    elif category == "dresses":
        # 드레스: 얼굴(상단 10~15%)을 제외하고 전체를 바꿈
        draw.rectangle([(0, int(height * 0.15)), (width, height)], fill=(255, 255, 255, 255))
        
    else:
        # 상의는 자동 마스킹이 잘 되므로 빈 마스크 반환 (사용 안 함)
        return None
    
    # 마스크 파일 저장
    mask_path = image_path.replace(".jpg", "_mask.png")
    mask.save(mask_path)
    return mask_path


# 1. 가상 피팅 생성 및 저장 엔드포인트
@router.post("/generate", response_model=FittingResponse)
async def generate_fitting(
    human_img: UploadFile = File(...),
    garm_img: UploadFile = File(...),
    category: str = Form("upper_body"),
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)  # 로그인 유저 필수
):
    # 임시 파일 경로 변수 (finally 블록에서 삭제하기 위해 미리 선언)
    temp_human_path = None
    temp_garm_path = None
    temp_mask_path = None

    try:
        print(f"🚀 IDM-VTON 피팅 시작 (User: {current_user.email}, Category: {category})")

        # 1. 임시 파일 생성 (Gradio Client는 파일 경로가 필요함)
        # NamedTemporaryFile을 사용하여 업로드된 바이너리를 디스크에 잠시 저장
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp_human:
            shutil.copyfileobj(human_img.file, tmp_human)
            temp_human_path = tmp_human.name
            
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp_garm:
            shutil.copyfileobj(garm_img.file, tmp_garm)
            temp_garm_path = tmp_garm.name
        
        # 2. 카테고리 텍스트 변환
        # yisol/IDM-VTON은 'garment_des'라는 텍스트 설명을 받습니다.
        # 우리가 선택한 카테고리를 그럴싸한 영어 텍스트로 바꿔줍니다.
        description_map = {
            "upper_body": "upper body garment, short sleeve top, t-shirt",          # 상의
            "lower_body": "lower body garment, trousers, pants, jeans, legs",       # 하의
            "dresses": "full body garment, long dress, one piece dress, gown"       # 드레스
        }
        garment_desc = description_map.get(category, "clothes") # 기본값

        # 2. Hugging Face Space 연결
        print("🚀 Hugging Face API 연결 중 (yisol/IDM-VTON)...")

        # 환경 변수에서 액세스 토큰을 가져와서 Client에 전달
        hf_token = os.getenv("HUGGINGFACE_API_TOKEN")

        # hf_token을 넣으면 'Logged user'로 인식되어 할당량이 늘어납니다.
        client = Client("yisol/IDM-VTON", headers={"Authorization": f"Bearer {hf_token}"}) 

        # 3. 예측 요청 (API 호출)
        # yisol/IDM-VTON의 입력 스펙:
        # param 0: dict {"background": file, "layers": [], "composite": null}
        # param 1: garment image file
        # param 2: garment description (text)
        # param 3: is_checked (auto-masking true)
        # ...
        print("🚀 AI 모델 실행 중 (Queue 대기 가능)...")

        # 상의가 아니면 강제 마스크 생성 
        generated_mask_path = None
        use_auto_mask = True

        if category in ["lower_body", "dresses"]:
            generated_mask_path = create_mask_image(temp_human_path, category)
            if generated_mask_path:
                use_auto_mask = False # 자동 마스킹 끄기
                temp_mask_path = generated_mask_path
                print(f"👉 강제 마스킹 적용됨: {category}")
        
        # Gradio 입력 데이터 구성
        # mask가 있으면 layers에 넣어서 보낸다.
        dict_input = {
            "background": handle_file(temp_human_path),
            "layers": [handle_file(generated_mask_path)] if generated_mask_path else [],
            "composite": None
        }

        result = client.predict(
            dict=dict_input,
            garm_img=handle_file(temp_garm_path),
            garment_des=garment_desc,
            is_checked=use_auto_mask,   # 상의는 True(자동), 하의/드레스는 False(수동)
            is_checked_crop=False,      # 크롭 안 함
            denoise_steps=30,           # 스텝 수 (30이 표준)
            seed=42,                    # 시드 고정
            api_name="/tryon"
        )

        # result는 보통 (image_path, seed) 형태의 튜플로 반환됩니다.
        # 첫 번째 요소가 결과 이미지 경로입니다.
        result_path = result[0]

        print(f"✅ 생성 완료. 파일 위치: {result_path}")

        # 4. 결과 파일을 Base64로 변환 (DB 저장 및 반환용)
        # 주의: Base64 문자열이 길어질 수 있으므로, 실제 서비스에선 S3 업로드를 추천
        # 여기서는 빠른 구현을 위해 Data URI로 변환합니다.
        result_url = image_to_base64(result_path)

        # 5. DB 저장
        history = FittingResult(
            user_id=current_user.id,
            result_image_url=result_url, # Base64 문자열이 들어감 (DB 컬럼 크기 주의)
            category=category,
            created_at=datetime.utcnow()
        )
        db.add(history)
        await db.commit()
        await db.refresh(history)

        return {"image_url": result_url, "id": history.id}

    except Exception as e:
        print(f"❌ CatVTON Error: {e}")
        raise HTTPException(status_code=500, detail=f"가상 피팅 실패: {str(e)}")
        
    finally:
        # 6. 임시 파일 정리 (서버 용량 확보)
        if temp_human_path and os.path.exists(temp_human_path):
            os.remove(temp_human_path)
        if temp_garm_path and os.path.exists(temp_garm_path):
            os.remove(temp_garm_path)
        if temp_mask_path and os.path.exists(temp_mask_path): 
            os.remove(temp_mask_path) 


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