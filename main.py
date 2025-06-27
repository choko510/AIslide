from fastapi import ( # Grouped imports
    FastAPI, Depends, HTTPException, status, UploadFile,
    File, WebSocket, Request
)
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, Session
from pydantic import BaseModel
import os
from datetime import timedelta # Added timedelta

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
        from_attributes = True # Pydantic V2

class FileResponse(BaseModel):
    id: int
    filename: str
    file_type: str
    owner_id: int

    class Config:
        from_attributes = True

class SlideCreate(BaseModel):
    slide_data: str # Assuming slide data is a string for now

class SlideResponse(BaseModel):
    id: int
    slide_data: str
    owner_id: int

    class Config:
        from_attributes = True


app = FastAPI()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# @app.get("/") # This one is redundant and will be overshadowed by the one below
# async def root():
#     return {"message": "Hello World - Backend API"}

# ルートパスでindex.htmlを返すように変更
@app.get("/", response_class=HTMLResponse)
async def read_index(request: Request):
    # ここではまだDBからスライドを取得していませんが、将来的にはここで取得します。
    return templates.TemplateResponse("index.html", {"request": request, "slides": []})


# from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, WebSocket, Request # Removed duplicated import
from fastapi.responses import FileResponse as FastAPIFileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.concurrency import run_in_threadpool # Added for blocking I/O
from fastapi.templating import Jinja2Templates
import shutil # ファイル操作用
# from passlib.context import CryptContext # For password hashing <- Moved to auth.py
import logging # For logging

# auth.pyから認証関連の関数をインポート
import auth # import auth module

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 静的ファイルとテンプレートの設定
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# --- Helper Functions ---
# def get_password_hash(password): <- Moved to auth.py
#     return pwd_context.hash(password)
#
# def verify_password(plain_password, hashed_password): <- Moved to auth.py
#     return pwd_context.verify(plain_password, hashed_password)

# --- User Account Endpoints ---
@app.post("/auth/register", response_model=UserResponse)
async def register_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = auth.get_password_hash(user.password) # Use auth.get_password_hash
    db_user = User(username=user.username, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# Note: A proper login endpoint would typically return a JWT token.
@app.post("/auth/login", response_model=auth.Token) # Modified
async def login_user(form_data: UserCreate, db: Session = Depends(get_db)): # UserCreate is fine for form data with username/password
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password): # Use auth.verify_password
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, # Use status from fastapi
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

# Placeholder for logout - actual implementation depends on auth mechanism (e.g., token invalidation)
@app.post("/auth/logout")
async def logout_user():
    return {"message": "Logout successful (placeholder)"}

from typing import Annotated # For Annotated dependencies

# Placeholder for getting current user - would require token authentication
@app.get("/users/me", response_model=UserResponse)
async def read_users_me(current_user: Annotated[User, Depends(auth.get_current_user)]):
    # The user is now obtained from the token via get_current_user
    return current_user

@app.get("/users/me/slides", response_model=list[SlideResponse])
async def get_my_slides(db: Session = Depends(get_db), current_user: Annotated[User, Depends(auth.get_current_user)]):
    # 現状の認証システムはダミーのため、ここでは仮に owner_id が 1 のスライドを返すか、
    # もしくは全てのスライドを返します。本格的な認証導入後に修正が必要です。
    # ここでは例として全てのslidesを返します。
    # 実際のアプリケーションでは、認証されたユーザーのIDに基づいてフィルタリングします。
    # slides = db.query(Slide).all() # owner_idでフィルタリングする代わりに全て取得
    slides = db.query(Slide).filter(Slide.owner_id == current_user.id).all()
    if not slides:
        # No slides found for user 1, or no slides at all if not filtering
        # Return empty list, not an error, as per response_model=list[SlideResponse]
        return []
    return slides


# --- File Upload Endpoints ---
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True) # Create upload directory if it doesn't exist

import uuid # For generating unique filenames
from werkzeug.utils import secure_filename # For sanitizing filenames

# File upload settings
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif"]
ALLOWED_FONT_TYPES = ["font/ttf", "font/otf", "font/woff", "font/woff2"] # Example font types
ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg"] # Example video types

# Helper function to save uploaded file
async def save_upload_file(upload_file: UploadFile, destination_folder: str, db_file_entry: UploadedFile, db: Session, file_type: str):
    # Validate file size
    if upload_file.size > MAX_FILE_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=f"File too large. Max size is {MAX_FILE_SIZE // (1024*1024)}MB.")

    # Validate content type based on file_type
    if file_type == "image" and upload_file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid image type. Allowed types: {ALLOWED_IMAGE_TYPES}")
    elif file_type == "font" and upload_file.content_type not in ALLOWED_FONT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid font type. Allowed types: {ALLOWED_FONT_TYPES}")
    elif file_type == "video" and upload_file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid video type. Allowed types: {ALLOWED_VIDEO_TYPES}")
    # Add more types if necessary, or a more generic check if file_type doesn't strictly map to content types

    original_filename = secure_filename(upload_file.filename)
    file_extension = original_filename.split('.')[-1] if '.' in original_filename else ''
    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    file_location = os.path.join(destination_folder, unique_filename)

    # Update db_file_entry with the unique filename before saving
    db_file_entry.filename = unique_filename

    try:
        with open(file_location, "wb+") as file_object:
            await run_in_threadpool(shutil.copyfileobj, upload_file.file, file_object)

        db_file_entry.file_path = file_location
        db.add(db_file_entry)
        db.commit()
        db.refresh(db_file_entry)
        return db_file_entry
    except Exception as e:
        logger.error(f"Error saving file {upload_file.filename}: {e}")
        # Potentially delete the partial file if save fails
        if os.path.exists(file_location):
            try:
                await run_in_threadpool(os.remove, file_location)
            except Exception as remove_e:
                logger.error(f"Failed to remove partial file {file_location}: {remove_e}")
        logger.error(f"Error saving file {db_file_entry.filename} (original: {upload_file.filename}): {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An internal error occurred while saving the file.")


# Unified Upload Endpoint
@app.post("/upload/{file_type}", response_model=FileResponse)
async def upload_file_unified(
    file_type: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Annotated[User, Depends(auth.get_current_user)]
):
    allowed_file_types = ["image", "font", "video"] # Define allowed file types
    if file_type not in allowed_file_types:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid file type. Allowed types: {allowed_file_types}")

    # Determine destination folder based on file_type
    # Example: "images", "fonts", "videos"
    destination_subfolder = f"{file_type}s"
    destination_folder = os.path.join(UPLOAD_DIR, destination_subfolder)
    os.makedirs(destination_folder, exist_ok=True)

    # Note: The filename in UploadedFile will be the unique one generated by save_upload_file
    db_file = UploadedFile(
        filename=file.filename, # This will be overwritten by save_upload_file with the unique name
        file_type=file_type,
        owner_id=current_user.id
    )

    # Pass file_type to save_upload_file for content type validation
    return await save_upload_file(file, destination_folder, db_file, db, file_type)


# --- File Read Endpoint ---
@app.get("/files/{file_id}")
async def read_file(file_id: int, db: Session = Depends(get_db), current_user: Annotated[User, Depends(auth.get_current_user)]):
    db_file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if db_file is None:
        raise HTTPException(status_code=404, detail="File not found")

    if db_file.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to read this file")

    file_path = db_file.file_path
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")

    return FastAPIFileResponse(path=file_path, filename=db_file.filename)

# --- File Delete Endpoint ---
@app.delete("/files/{file_id}", response_model=FileResponse)
async def delete_file_endpoint(file_id: int, db: Session = Depends(get_db), current_user: Annotated[User, Depends(auth.get_current_user)]):
    db_file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if db_file is None:
        raise HTTPException(status_code=404, detail="File not found")

    if db_file.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this file")

    try:
        # Store details for response and file path before deleting from DB
        deleted_file_response = FileResponse.model_validate(db_file)
        file_path_to_delete = db_file.file_path

        # DB operation first
        db.delete(db_file)
        db.commit()

        # Then physical file deletion
        if os.path.exists(file_path_to_delete):
            try:
                await run_in_threadpool(os.remove, file_path_to_delete)
            except Exception as e_remove:
                # Log error if physical file deletion fails, but DB record is already deleted.
                logger.error(f"DB record for file id {file_id} (path: {file_path_to_delete}) deleted, but physical file removal failed: {e_remove}", exc_info=True)
                # Optionally, you could raise a different kind of alert or add to a cleanup queue here.
                # For now, we proceed to return success as the DB operation was successful.

        return deleted_file_response
    except Exception as e_db:
        db.rollback()
        logger.error(f"Error during DB operation for deleting file id {file_id}: {e_db}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An internal error occurred while deleting the file metadata.")


# --- Slide Endpoints ---
@app.post("/slides", response_model=SlideResponse)
async def create_slide_endpoint(slide: SlideCreate, db: Session = Depends(get_db), current_user: Annotated[User, Depends(auth.get_current_user)]):
    db_slide = Slide(**slide.model_dump(), owner_id=current_user.id)
    db.add(db_slide)
    db.commit()
    db.refresh(db_slide)
    return db_slide

@app.get("/slides/{slide_id}", response_model=SlideResponse)
async def get_slide_endpoint(slide_id: int, db: Session = Depends(get_db), current_user: Annotated[User, Depends(auth.get_current_user)]):
    db_slide = db.query(Slide).filter(Slide.id == slide_id).first()
    if db_slide is None:
        raise HTTPException(status_code=404, detail="Slide not found")
    if db_slide.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to read this slide")
    return db_slide

@app.delete("/slides/{slide_id}", response_model=SlideResponse)
async def delete_slide_endpoint(slide_id: int, db: Session = Depends(get_db), current_user: Annotated[User, Depends(auth.get_current_user)]):
    db_slide = db.query(Slide).filter(Slide.id == slide_id).first()
    if db_slide is None:
        raise HTTPException(status_code=404, detail="Slide not found")

    if db_slide.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this slide")

    deleted_slide_details = SlideResponse.model_validate(db_slide)

    db.delete(db_slide)
    db.commit()
    return deleted_slide_details


import google.generativeai as genai

# --- AI (Gemini) Endpoint ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY not found in environment variables. AI endpoint will not work properly and will return an error if called.")
    # genai.configure(api_key="YOUR_API_KEY") # Fallback removed
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
        logger.error(f"Error calling Gemini API: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An internal error occurred while processing the AI request.")


# --- WebSocket Endpoint (Initial Stub) ---
@app.websocket("/ws/collaborate/{slide_id}")
async def websocket_collaborate(
    websocket: WebSocket,
    slide_id: str,
    token: Optional[str] = None, # Changed from str to Optional[str] and added default None
    db: Session = Depends(get_db) # Added db session
):
    if token is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing token")
        return

    try:
        user = await auth._decode_token_and_get_user(token, db) # Call the helper
        if not user: # Should be handled by get_current_user raising exception, but as a safeguard
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication failed")
            return
    except HTTPException: # Catch exception from get_current_user
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication failed")
        return

    await websocket.accept()
    logger.info(f"User {user.username} connected to WebSocket for slide {slide_id}")
    # Basic echo for now, or just connection management
    try:
        while True:
            data = await websocket.receive_text()
            # TODO: Implement actual collaboration logic here
            # For example, broadcast message to other users on the same slide_id (requires connection manager)
            await websocket.send_text(f"User {user.username} said: {data} (slide: {slide_id})")
    except Exception as e: # Catch WebSocketDisconnect or other errors
        logger.info(f"WebSocket connection closed for slide {slide_id}, user {user.username}: {e}")
    finally:
        logger.info(f"User {user.username} disconnected from slide {slide_id}")
