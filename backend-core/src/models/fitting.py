from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from src.db.session import Base

class FittingResult(Base):
    __tablename__ = "fitting_results"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # 결과 이미지 URL (Replicate에서 받은 주소)
    result_image_url = Column(String, nullable=False)

    category = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="fitting_results")