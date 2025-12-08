from fastapi import APIRouter
from src.api.v1.endpoints import auth, admin, users, products, search, fitting

# 👇 이 변수(api_router)를 main.py에서 가져가려고 하는 겁니다.
api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(products.router, prefix="/products", tags=["products"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(fitting.router, prefix="/fitting", tags=["fitting"])