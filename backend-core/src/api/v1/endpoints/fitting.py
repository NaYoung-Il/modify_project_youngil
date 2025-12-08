import os
import base64
from fastapi import APIRouter, UploadFile, File, HTTPException
import replicate
from pydantic import BaseModel

router = APIRouter()

# .env 파일이나 settings.py에 REPLICATE_API_TOKEN이 있어야 합니다.

# 응답 스키마
class FittingResponse(BaseModel):
    image_url: str

@router.post("/generate", response_model=FittingResponse)
async def generate_fitting(
    human_img: UploadFile = File(...),
    garm_img: UploadFile = File(...),
    category: str = "upper_body" # upper_body, lower_body, dresses
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

        # 2. Base64 인코딩 (bytes -> string 변환) ✨ 핵심 수정 사항
        # f"data:{MIME_TYPE};base64,{ENCODED_STRING}" 형식이어야 함
        human_base64 = base64.b64encode(human_bytes).decode("utf-8")
        human_uri = f"data:{human_img.content_type};base64,{human_base64}"

        garm_base64 = base64.b64encode(garm_bytes).decode("utf-8")
        garm_uri = f"data:{garm_img.content_type};base64,{garm_base64}"

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
                "garment_des": category,    # 옷 종류 (hello world text는 무시됨)
                "crop": False,
                "seed": 42
            }
        )

        result_url = str(output)

        return {"image_url": result_url}
    
    except replicate.exceptions.ReplicateError as e:
        print(f"❌ Replicate API Error: {e}")
        raise HTTPException(status_code=500, detail=f"AI 모델 오류: {str(e)}")
    
    except Exception as e:
        print(f"❌ General Error: {e}")
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")