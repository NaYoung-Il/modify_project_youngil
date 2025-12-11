import os
import shutil
import tempfile
import base64
import logging
import io
from pathlib import Path
from datetime import datetime
from typing import List

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session 
from gradio_client import Client, handle_file
from PIL import Image, ImageDraw

from src.db.session import get_db
from src.models.user import User
from src.models.fitting import FittingResult
from src.api import deps    # 로그인 유저 확인용
from pydantic import BaseModel

# 불필요한 로그 숨기기
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("gradio_client").setLevel(logging.WARNING)

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

# Helper : 결과 이미지 처리 -> 이미지를 Base64 Data URI로 변환
def image_to_base64(image_path: str) -> str:
    # 파일이 실제로 존재하는지 확인
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Result file not found: {image_path}")
    
    # 1. 이미지 열기
    img = Image.open(image_path)
    
    # 2. 조건문 없이 무조건 RGB(불투명)로 변환
    img = img.convert("RGB")
        
    # 3. JPEG로 변환 (용량 최적화)
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=95)
    
    encoded_string = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{encoded_string}"

# Helper : 입력 파일 정화(Sanitizing) + 리사이징 (OOM 방지)
def save_as_clean_png(upload_file: UploadFile, save_path: str):
    # 파일을 PIL 이미지로 열기
    img = Image.open(upload_file.file)
    
    # PNG는 RGBA를 지원하므로 굳이 변환 안 해도 되지만, 
    # 혹시 모를 호환성을 위해 RGB로 변환해도 좋습니다.
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")

    # 이미지 리사이징
    # 해상도가 너무 크면 GPU 메모리(VRAM)가 터지므로 적절히 줄여야 함.
    # 긴 변을 기준으로 768px로 맞춤 (비율 유지)
    max_size = 768
    if max(img.size) > max_size:
        # LANCZOS 필터를 써서 화질 저하를 최소화하며 줄임
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        print(f"📉 이미지 리사이징 적용됨: {img.size}")
        
    # JPEG로 강제 저장
    img.save(save_path, format="PNG")

# Helper : 강제 마스크 생성 함수 (하의/드레스용) 
def create_mask_image(image_path: str, category: str) -> str:
    try:
        img = Image.open(image_path).convert("RGB")
        width, height = img.size
        
        # 투명 배경 마스크 생성
        mask = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(mask)
        
        # Gradio ImageEditor는 보통 '칠한 부분'을 마스크로 인식함
        # 흰색(255)으로 칠해서 "여기를 바꿔라"고 표시
        if category == "lower_body":
            # 하의: 아래쪽 55%
            draw.rectangle([(0, int(height * 0.45)), (width, height)], fill=(255, 255, 255, 255))
        elif category == "dresses":
            # 드레스: 얼굴(상위 15%) 빼고 전체
            draw.rectangle([(0, int(height * 0.15)), (width, height)], fill=(255, 255, 255, 255))
        else:
            # 상의: '자동 마스킹'을 쓰고 싶지만, 빈 리스트를 보내면 서버가 죽음.
            # 해결책: "가슴~배" 부분을 대충 칠해서 보냅니다. (어차피 CatVTON이 보정함)
            # 상단 20% ~ 55% 영역 지정
            draw.rectangle([(0, int(height * 0.20)), (width, int(height * 0.55))], fill=(255, 255, 255, 255))

        mask_path = image_path.replace(".png", "_mask.png")
        mask.save(mask_path)
        return mask_path
    except Exception as e:
        print(f"⚠️ 마스크 생성 실패: {e}")
        return None


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
        print(f"🚀 CatVTON(Colab) 피팅 시작 (User: {current_user.email}, Category: {category})")

        # 1. Colab 주소 확인 (.env에서 관리 추천)
        colab_url = os.getenv("COLAB_API_URL")
        if not colab_url:
             raise HTTPException(status_code=500, detail="Colab 주소(COLAB_API_URL)가 설정되지 않았습니다.")

        # 2. 임시 파일 생성 (Gradio Client는 파일 경로가 필요함)
        # NamedTemporaryFile을 사용하여 업로드된 바이너리를 디스크에 잠시 저장
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp_human:
            temp_human_path = tmp_human.name
            
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp_garm:
            temp_garm_path = tmp_garm.name

        # 입력 이미지를 깨끗한 PNG로 변환하여 저장
        # 기존 shutil.copyfileobj 대신 사용
        save_as_clean_png(human_img, temp_human_path)
        save_as_clean_png(garm_img, temp_garm_path)

        # 3. 마스크 생성 (하의/드레스인 경우)
        generated_mask_path = None
        if category in ["lower_body", "dresses"]:
            generated_mask_path = create_mask_image(temp_human_path, category)
            if generated_mask_path:
                temp_mask_path = generated_mask_path
                print(f"👉 강제 마스킹 적용됨: {category}")

        # 4. Colab 서버 연결
        print(f"🚀 AI 서버 연결 중: {colab_url}")
        client = Client(colab_url)

        # 5. 예측 요청 (CatVTON API)
        # CatVTON의 공식 데모 앱은 보통 아래와 같은 순서로 파라미터를 받습니다.
        # 정확한 API 형태 확인을 위해 client.view_api()를 사용할 수 있습니다.
        # 일반적인 순서: [사람이미지, 옷이미지, 마스크(선택), 시드, ...]
        
        # 카테고리 매핑 (CatVTON은 보통 옷 종류를 자동 인식하거나 단순화함)
        # 만약 마스크를 직접 보내야 한다면 create_mask_image 함수 활용 가능
        print("🚀 AI 모델 실행 중...")

        # 카테고리 매핑 (CatVTON API 요구사항: 'upper', 'lower', 'overall')
        cat_map = {
            "upper_body": "upper", 
            "lower_body": "lower", 
            "dresses": "overall"
        }
        target_cloth_type = cat_map.get(category, "upper")

        # Gradio ImageEditor 입력 구조 생성
        if generated_mask_path:
            # 하의/드레스: 강제 마스크가 있으므로 '딕셔너리' 형태로 보냄
            person_input = {
                "background": handle_file(temp_human_path),
                "layers": [handle_file(generated_mask_path)],
                "composite": None
            }
        else:
            # 상의(upper): 마스크가 없으므로 '파일 핸들'만 보냄
            # -> 서버가 빈 리스트 에러를 내지 않고 '자동 마스킹'을 수행함
            person_input = handle_file(temp_human_path)

        # API 호출 (CatVTON 데모의 일반적인 파라미터 구조)
        result = client.predict(
            person_input,                      # 1. person_image
            handle_file(temp_garm_path),       # 2. condition_image 
            target_cloth_type,                 # 3. tryon_cloth_type 
            50,                                # 4. inferenct_step
            2.5,                               # 5. cfg_strength
            42,                                # 6. seed
            "result only",                     # 7. show_type
            api_name="/submit_function"        # 8. api_name 
        )

        # 결과값 처리
        result_path = result
        print(f"✅ 생성 완료. 파일 위치: {result_path}")

        # 5. 결과 파일을 Base64로 변환 (DB 저장 및 반환용)
        # 주의: Base64 문자열이 길어질 수 있으므로, 실제 서비스에선 S3 업로드를 추천
        # 여기서는 빠른 구현을 위해 Data URI로 변환합니다.
        result_url = image_to_base64(result_path)

        # 6. DB 저장
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
        # 디버깅용: 실패 시 다시 API 정보를 찍어서 확인
        try:
            if 'client' in locals():
                print("--- API 정보 ---")
                client.view_api()
        except:
            pass
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