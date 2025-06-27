from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, Session
from pydantic import BaseModel
import os

# Database setup
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./test.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Models
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)

    files = relationship("UploadedFile", back_populates="owner")
    slides = relationship("Slide", back_populates="owner")

class UploadedFile(Base):
    __tablename__ = "uploaded_files"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    file_path = Column(String) # Store path to the file on the server
    file_type = Column(String) # e.g., "image", "font", "video"
    owner_id = Column(Integer, ForeignKey("users.id"))

    owner = relationship("User", back_populates="files")

class Slide(Base):
    __tablename__ = "slides"
    id = Column(Integer, primary_key=True, index=True)
    slide_data = Column(Text) # Store slide content, could be JSON or other format
    owner_id = Column(Integer, ForeignKey("users.id"))

    owner = relationship("User", back_populates="slides")

Base.metadata.create_all(bind=engine)

# Pydantic models (Schemas) for request/response validation
class UserCreate(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str

    class Config:
        # orm_mode = True # Pydantic V1
        from_attributes = True # Pydantic V2

class FileResponse(BaseModel):
    id: int
    filename: str
    file_type: str
    owner_id: int

    class Config:
        # orm_mode = True
        from_attributes = True

class SlideCreate(BaseModel):
    slide_data: str # Assuming slide data is a string for now

class SlideResponse(BaseModel):
    id: int
    slide_data: str
    owner_id: int

    class Config:
        # orm_mode = True
        from_attributes = True


app = FastAPI()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/")
async def root():
    return {"message": "Hello World - Backend API"}

# ルートパスでindex.htmlを返すように変更
@app.get("/", response_class=HTMLResponse)
async def read_index(request: Request):
    # ここではまだDBからスライドを取得していませんが、将来的にはここで取得します。
    return templates.TemplateResponse("index.html", {"request": request, "slides": []})


from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, WebSocket, Request
from fastapi.responses import FileResponse as FastAPIFileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import shutil # ファイル操作用
from passlib.context import CryptContext # For password hashing
import logging # For logging

# Password hashing setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 静的ファイルとテンプレートの設定
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# --- Helper Functions ---
def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

# --- User Account Endpoints ---
@app.post("/auth/register", response_model=UserResponse)
async def register_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = get_password_hash(user.password)
    db_user = User(username=user.username, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# Note: A proper login endpoint would typically return a JWT token.
# This is a simplified version for now.
@app.post("/auth/login") # Simplified login
async def login_user(form_data: UserCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    # In a real app, generate and return a token here
    return {"message": "Login successful", "username": user.username}

# Placeholder for logout - actual implementation depends on auth mechanism (e.g., token invalidation)
@app.post("/auth/logout")
async def logout_user():
    return {"message": "Logout successful (placeholder)"}

# Placeholder for getting current user - would require token authentication
@app.get("/users/me", response_model=UserResponse)
async def read_users_me(db: Session = Depends(get_db)):
    # This is a placeholder. In a real app, you'd get the user from the auth token.
    # For now, let's return the first user as an example.
    # 실제로는 인증된 사용자 정보를 반환해야 합니다. 여기서는 첫 번째 사용자를 예시로 반환합니다.
    user = db.query(User).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.get("/users/me/slides", response_model=list[SlideResponse])
async def get_my_slides(db: Session = Depends(get_db)):
    # 現状の認証システムはダミーのため、ここでは仮に owner_id が 1 のスライドを返すか、
    # もしくは全てのスライドを返します。本格的な認証導入後に修正が必要です。
    # ここでは例として全てのslidesを返します。
    # 実際のアプリケーションでは、認証されたユーザーのIDに基づいてフィルタリングします。
    slides = db.query(Slide).all() # owner_idでフィルタリングする代わりに全て取得
    if not slides:
        # No slides found for user 1, or no slides at all if not filtering
        # Return empty list, not an error, as per response_model=list[SlideResponse]
        return []
    return slides


# --- File Upload Endpoints ---
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True) # Create upload directory if it doesn't exist

# Helper function to save uploaded file
async def save_upload_file(upload_file: UploadFile, destination_folder: str, db_file_entry: UploadedFile, db: Session):
    file_location = os.path.join(destination_folder, upload_file.filename)
    try:
        with open(file_location, "wb+") as file_object:
            shutil.copyfileobj(upload_file.file, file_object)

        db_file_entry.file_path = file_location
        db.add(db_file_entry)
        db.commit()
        db.refresh(db_file_entry)
        return db_file_entry
    except Exception as e:
        logger.error(f"Error saving file {upload_file.filename}: {e}")
        # Potentially delete the partial file if save fails
        if os.path.exists(file_location):
            os.remove(file_location)
        raise HTTPException(status_code=500, detail=f"Could not save file: {e}")


@app.post("/upload/image", response_model=FileResponse)
async def upload_image(file: UploadFile = File(...), db: Session = Depends(get_db), current_user_id: int = 1): # Assuming user_id 1 for now
    # In a real app, current_user_id would come from an authenticated user
    db_file = UploadedFile(filename=file.filename, file_type="image", owner_id=current_user_id)
    return await save_upload_file(file, os.path.join(UPLOAD_DIR, "images"), db_file, db)

@app.post("/upload/font", response_model=FileResponse)
async def upload_font(file: UploadFile = File(...), db: Session = Depends(get_db), current_user_id: int = 1):
    db_file = UploadedFile(filename=file.filename, file_type="font", owner_id=current_user_id)
    return await save_upload_file(file, os.path.join(UPLOAD_DIR, "fonts"), db_file, db)

@app.post("/upload/video", response_model=FileResponse)
async def upload_video(file: UploadFile = File(...), db: Session = Depends(get_db), current_user_id: int = 1):
    db_file = UploadedFile(filename=file.filename, file_type="video", owner_id=current_user_id)
    return await save_upload_file(file, os.path.join(UPLOAD_DIR, "videos"), db_file, db)

# --- File Read Endpoint ---
@app.get("/files/{file_id}")
async def read_file(file_id: int, db: Session = Depends(get_db)):
    db_file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if db_file is None:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = db_file.file_path
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")

    return FastAPIFileResponse(path=file_path, filename=db_file.filename)

# --- File Delete Endpoint ---
@app.delete("/files/{file_id}", response_model=FileResponse)
async def delete_file_endpoint(file_id: int, db: Session = Depends(get_db)):
    db_file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if db_file is None:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        if os.path.exists(db_file.file_path):
            os.remove(db_file.file_path)

        # deleted_file_details = FileResponse.from_orm(db_file) # Pydantic V1
        deleted_file_details = FileResponse.model_validate(db_file) # Pydantic V2

        db.delete(db_file)
        db.commit()
        return deleted_file_details
    except Exception as e:
        logger.error(f"Error deleting file {db_file.filename}: {e}")
        # Potentially rollback commit if os.remove fails but db.delete was called
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Could not delete file: {e}")


# --- Slide Endpoints ---
@app.post("/slides", response_model=SlideResponse)
async def create_slide_endpoint(slide: SlideCreate, db: Session = Depends(get_db), current_user_id: int = 1): # Assuming user_id 1 for now
    # db_slide = Slide(**slide.dict(), owner_id=current_user_id) # Pydantic V1
    db_slide = Slide(**slide.model_dump(), owner_id=current_user_id) # Pydantic V2
    db.add(db_slide)
    db.commit()
    db.refresh(db_slide)
    return db_slide

@app.get("/slides/{slide_id}", response_model=SlideResponse)
async def get_slide_endpoint(slide_id: int, db: Session = Depends(get_db)):
    db_slide = db.query(Slide).filter(Slide.id == slide_id).first()
    if db_slide is None:
        raise HTTPException(status_code=404, detail="Slide not found")
    return db_slide

@app.delete("/slides/{slide_id}", response_model=SlideResponse)
async def delete_slide_endpoint(slide_id: int, db: Session = Depends(get_db)):
    db_slide = db.query(Slide).filter(Slide.id == slide_id).first()
    if db_slide is None:
        raise HTTPException(status_code=404, detail="Slide not found")

    # deleted_slide_details = SlideResponse.from_orm(db_slide) # Pydantic V1
    deleted_slide_details = SlideResponse.model_validate(db_slide) # Pydantic V2

    db.delete(db_slide)
    db.commit()
    return deleted_slide_details


import google.generativeai as genai

# --- AI (Gemini) Endpoint ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY not found in environment variables. AI endpoint will not work.")
    genai.configure(api_key="YOUR_API_KEY") # Fallback, but ideally should fail or be handled
else:
    genai.configure(api_key=GEMINI_API_KEY)

# Model setup - choose your model
gemini_model = genai.GenerativeModel('gemini-pro')


class AIPrompt(BaseModel):
    prompt: str

@app.post("/ai/ask")
async def ai_ask(ai_prompt: AIPrompt, db: Session = Depends(get_db)):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured. Missing API key.")
    try:
        response = gemini_model.generate_content(ai_prompt.prompt)
        return {"response": response.text}
    except Exception as e:
        logger.error(f"Error calling Gemini API: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing AI request: {e}")


# --- WebSocket Endpoint (Initial Stub) ---
@app.websocket("/ws/collaborate/{slide_id}")
async def websocket_collaborate(websocket: WebSocket, slide_id: str):
    await websocket.accept()
    # Basic echo for now, or just connection management
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Message text was: {data}, for slide: {slide_id}")
    except Exception as e:
        logger.info(f"WebSocket connection closed for slide {slide_id}: {e}")
    finally:
        logger.info(f"Client disconnected from slide {slide_id}")
