from sqlalchemy import Column, Integer, String, ForeignKey, LargeBinary
from sqlalchemy.orm import relationship
from module.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)

    files = relationship("UploadedFile", back_populates="owner")
    slides = relationship("Slide", back_populates="owner")

    def set_hashed_password(self, password_hash: str):
        self.hashed_password = password_hash

    def set_username(self, new_username: str):
        self.username = new_username

class UploadedFile(Base):
    __tablename__ = "uploaded_files"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    file_path = Column(String)
    file_type = Column(String)
    owner_id = Column(Integer, ForeignKey("users.id"))

    owner = relationship("User", back_populates="files")

class Slide(Base):
    __tablename__ = "slides"
    id = Column(Integer, primary_key=True, index=True)
    slide_data = Column(LargeBinary, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"))

    owner = relationship("User", back_populates="slides")