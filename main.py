import os
import shutil
import uuid
import logging
from datetime import timedelta
from typing import Annotated, Optional, List
import asyncio
import httpx
import trafilatura
from duckduckgo_search import DDGS


from fastapi import (
    FastAPI, Depends, HTTPException, status, UploadFile,
    File, WebSocket, Request, Form
)

from fastapi.responses import FileResponse as FastAPIFileResponse, HTMLResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.concurrency import run_in_threadpool
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy.orm import Session
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from google import genai
from google.genai import types
from PIL import Image

import module.auth as auth
from module.database import engine, get_db
from module.models import Base, User, UploadedFile, Slide

os.makedirs("data", exist_ok=True)
# Create DB tables
Base.metadata.create_all(bind=engine)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Pydantic models (Schemas)
class UserCreate(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str

    class Config:
        from_attributes = True

class UserUpdatePassword(BaseModel):
    current_password: str
    new_password: str

class UserUpdateUsername(BaseModel):
    new_username: str

class FileResponse(BaseModel):
    id: int
    filename: str
    file_type: str
    owner_id: int

    class Config:
        from_attributes = True

class SlideCreate(BaseModel):
    slide_data: str

class SlideResponse(BaseModel):
    id: int
    slide_data: str
    owner_id: int

    class Config:
        from_attributes = True

class AIPrompt(BaseModel):
    prompt: str

class URLRequest(BaseModel):
    url: str

class WordRequest(BaseModel):
    keyword: str

app = FastAPI()

templates = Jinja2Templates(directory="templates")

# --- Root Endpoint ---
@app.get("/", response_class=HTMLResponse)
async def read_index(request: Request):
    return templates.TemplateResponse("main.html", {"request": request, "slides": []})

@app.get("/plan/", response_class=HTMLResponse)
async def read_plan(request: Request):
    return templates.TemplateResponse("plan.html", {"request": request})

@app.get("/slide/", response_class=HTMLResponse)
async def read_slide_index(request: Request, data: Optional[str] = None):
    return templates.TemplateResponse("slide.html", {"request": request, "data": data})

# --- User Account Endpoints ---
@app.post("/auth/register", response_model=UserResponse)
async def register_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter_by(username=user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = auth.get_password_hash(user.password)
    db_user = User(username=user.username, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/auth/login", response_model=auth.Token)
async def login_user(form_data: UserCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(username=form_data.username).first()
    if not user or not auth.verify_password(form_data.password, str(user.hashed_password)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/auth/logout")
async def logout_user():
    return {"message": "Logout successful (placeholder)"}

@app.get("/users/me", response_model=UserResponse)
async def read_users_me(current_user: Annotated[User, Depends(auth.get_current_user)]):
    return current_user

@app.get("/users/me/slides", response_model=list[SlideResponse])
async def get_my_slides(*, db: Session = Depends(get_db), current_user: Annotated[User, Depends(auth.get_current_user)]) -> List[SlideResponse]:
    slides = db.query(Slide).filter(Slide.owner_id == current_user.id).all()
    return [SlideResponse.model_validate(slide) for slide in slides]

@app.put("/users/me/password", status_code=status.HTTP_200_OK)
async def update_password(
    user_update: UserUpdatePassword,
    current_user: Annotated[User, Depends(auth.get_current_user)],
    db: Session = Depends(get_db)
):
    if not auth.verify_password(user_update.current_password, str(current_user.hashed_password)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect current password")
    
    current_user.set_hashed_password(auth.get_password_hash(user_update.new_password))
    # SQLAlchemyのセッションを通じて更新をコミット
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return {"message": "Password updated successfully"}

@app.put("/users/me/username", status_code=status.HTTP_200_OK)
async def update_username(
    user_update: UserUpdateUsername,
    current_user: Annotated[User, Depends(auth.get_current_user)],
    db: Session = Depends(get_db)
):
    if db.query(User).filter_by(username=user_update.new_username).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")
    
    current_user.set_username(user_update.new_username)
    # SQLAlchemyのセッションを通じて更新をコミット
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return {"message": "Username updated successfully"}


# --- File Upload Endpoints ---
UPLOAD_DIR = "data/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# File upload settings with type-specific size limits
MAX_FILE_SIZES = {
    "image": 15 * 1024 * 1024,  # 15 MB
    "font": 10 * 1024 * 1024,   # 10 MB
    "video": 100 * 1024 * 1024  # 100 MB
}
ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif"]
ALLOWED_FONT_TYPES = ["font/ttf", "font/otf", "font/woff", "font/woff2"]
ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg"]

async def save_upload_file(upload_file: UploadFile, destination_folder: str, db_file_entry: UploadedFile, db: Session, file_type: str):
    max_size = MAX_FILE_SIZES.get(file_type)
    if not max_size:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid file type: {file_type}")
    
    if upload_file.size is None or upload_file.size > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Max size for {file_type} is {max_size // (1024*1024)}MB."
        )

    content_type = upload_file.content_type
    if file_type == "image" and content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid image type. Allowed: {ALLOWED_IMAGE_TYPES}")
    elif file_type == "font" and content_type not in ALLOWED_FONT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid font type. Allowed: {ALLOWED_FONT_TYPES}")
    elif file_type == "video" and content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid video type. Allowed: {ALLOWED_VIDEO_TYPES}")

    original_filename = secure_filename(upload_file.filename or "")
    file_extension = os.path.splitext(original_filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_location = os.path.join(destination_folder, unique_filename)

    # パス検証: 許可ディレクトリ配下のみ
    uploads_root = os.path.abspath(UPLOAD_DIR)
    abs_path = os.path.abspath(file_location)
    if not abs_path.startswith(uploads_root):
        logger.error(f"Attempted to save file outside uploads dir: {abs_path}")
        raise HTTPException(status_code=400, detail="Invalid file path.")


    try:
        with open(file_location, "wb+") as file_object:
            await run_in_threadpool(shutil.copyfileobj, upload_file.file, file_object)

        db.add(db_file_entry)
        db.commit()
        db.refresh(db_file_entry)
        return db_file_entry
    except Exception as e:
        logger.error(f"Error saving file {upload_file.filename}: {e}", exc_info=True)
        if os.path.exists(file_location):
            try:
                await run_in_threadpool(os.remove, file_location)
            except Exception as remove_e:
                logger.error(f"Failed to remove partial file {file_location}: {remove_e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not save file.")

@app.post("/upload/{file_type}", response_model=FileResponse)
async def upload_file_unified(
    file_type: str,
    file: UploadFile = File(...),
    *,
    db: Session = Depends(get_db),
    current_user: Annotated[User, Depends(auth.get_current_user)]
):
    allowed_file_types = ["image", "font", "video"]
    if file_type not in allowed_file_types:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid file type: {file_type}")

    # file_typeの値を検証
    allowed_file_types = ["image", "font", "video"]
    if file_type not in allowed_file_types:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid file type: {file_type}")

    # file_typeの値を正規化し、パストラバーサル防止
    safe_file_type = os.path.basename(file_type)
    destination_subfolder = f"{safe_file_type}s"
    destination_folder = os.path.join(UPLOAD_DIR, destination_subfolder)
    # パス検証: 許可ディレクトリ配下のみ
    uploads_root = os.path.abspath(UPLOAD_DIR)
    abs_dest_folder = os.path.abspath(destination_folder)
    if not abs_dest_folder.startswith(uploads_root):
        logger.error(f"Attempted to create/access folder outside uploads dir: {abs_dest_folder}")
        raise HTTPException(status_code=400, detail="Invalid destination folder path.")
    os.makedirs(destination_folder, exist_ok=True)

    db_file = UploadedFile(
        filename=file.filename, # ここは元のファイル名
        file_path="", # 仮の値。save_upload_fileで設定される
        file_type=file_type,
        owner_id=current_user.id
    )
    return await save_upload_file(file, destination_folder, db_file, db, file_type)

# --- File Read/Delete Endpoints ---
@app.get("/files/{file_id}")
async def read_file(file_id: int, *, db: Session = Depends(get_db), current_user: Annotated[User, Depends(auth.get_current_user)]):
    db_file = db.query(UploadedFile).filter(UploadedFile.id == file_id, UploadedFile.owner_id == current_user.id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found or not authorized")
    # パス検証: 許可ディレクトリ配下のみ
    uploads_root = os.path.abspath(UPLOAD_DIR)
    abs_path = os.path.abspath(str(db_file.file_path))
    if not abs_path.startswith(uploads_root):
        logger.error(f"Attempted to access file outside uploads dir: {abs_path}")
        raise HTTPException(status_code=400, detail="Invalid file path.")
    if not os.path.exists(str(db_file.file_path)):
        raise HTTPException(status_code=404, detail="File not found on server")
    return FastAPIFileResponse(path=str(db_file.file_path), filename=str(db_file.filename))

@app.delete("/files/{file_id}", response_model=FileResponse)
async def delete_file_endpoint(file_id: int, *, db: Session = Depends(get_db), current_user: Annotated[User, Depends(auth.get_current_user)]):
    db_file = db.query(UploadedFile).filter(UploadedFile.id == file_id, UploadedFile.owner_id == current_user.id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found or not authorized")

    deleted_file_response = FileResponse.model_validate(db_file)
    file_path_to_delete = db_file.file_path

    # パス検証: 許可ディレクトリ配下のみ削除
    uploads_root = os.path.abspath(UPLOAD_DIR)
    abs_path = os.path.abspath(str(file_path_to_delete))
    if not abs_path.startswith(uploads_root):
        logger.error(f"Attempted to delete file outside uploads dir: {abs_path}")
        raise HTTPException(status_code=400, detail="Invalid file path.")

    try:
        db.delete(db_file)
        db.commit()
        if os.path.exists(str(file_path_to_delete)):
            await run_in_threadpool(os.remove, str(file_path_to_delete))
        return deleted_file_response
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting file id {file_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error deleting file.")

# --- Slide Endpoints ---
@app.post("/slides", response_model=SlideResponse)
async def create_slide_endpoint(slide: SlideCreate, *, db: Session = Depends(get_db), current_user: Annotated[User, Depends(auth.get_current_user)]):
    db_slide = Slide(**slide.model_dump(), owner_id=current_user.id)
    db.add(db_slide)
    db.commit()
    db.refresh(db_slide)
    return db_slide

@app.get("/slides/{slide_id}", response_model=SlideResponse)
async def get_slide_endpoint(slide_id: int, *, db: Session = Depends(get_db), current_user: Annotated[User, Depends(auth.get_current_user)]):
    db_slide = db.query(Slide).filter(Slide.id == slide_id, Slide.owner_id == current_user.id).first()
    if not db_slide:
        raise HTTPException(status_code=404, detail="Slide not found or not authorized")
    return db_slide

@app.delete("/slides/{slide_id}", response_model=SlideResponse)
async def delete_slide_endpoint(slide_id: int, *, db: Session = Depends(get_db), current_user: Annotated[User, Depends(auth.get_current_user)]):
    db_slide = db.query(Slide).filter(Slide.id == slide_id, Slide.owner_id == current_user.id).first()
    if not db_slide:
        raise HTTPException(status_code=404, detail="Slide not found or not authorized")

    deleted_slide_details = SlideResponse.model_validate(db_slide)
    db.delete(db_slide)
    db.commit()
    return deleted_slide_details


load_dotenv()

# --- AI (Gemini) Endpoint ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY not found. AI endpoint is disabled.")

async def reqAI(prompt: str, model_name: str = "gemini-2.5-flash", is_search: bool = False, images: Optional[List[Image.Image]] = None):
    """
    AIモデルにリクエストを送信し、ストリーミングで応答を返す非同期ジェネレータ。
    """
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        
        model_to_use = "gemini-2.5-flash" if images else model_name

        parts = []
        if prompt:
            parts.append(types.Part(text=prompt))
        if images:
            for img in images:
                parts.append(types.Part.from_pil(img))
        
        contents = [types.Content(role="user", parts=parts)]

        # ユーザー提供のコードに基づき、ツール設定を追加
        if is_search:
            tools = [
                types.Tool(url_context=types.UrlContext()),
                types.Tool(googleSearch=types.GoogleSearch()),
            ]

            generation_config = types.GenerateContentConfig(
                tools=tools,
            )

            response_stream = client.models.generate_content_stream(
                model=f"models/{model_to_use}",
                contents=contents,
                generation_config=generation_config,
            )

        else:
            response_stream = client.models.generate_content_stream(
                model=f"models/{model_to_use}",
                contents=contents,
            )

        for chunk in response_stream:
            if chunk.text:
                yield chunk.text

    except Exception as e:
        logger.error(f"Geminiリクエストでエラーが発生しました: {e}", exc_info=True)
        yield f"Error: {str(e)}"


@app.post("/ai/ask")
async def ai_ask(
    prompt: str = Form(...),
    is_search: bool = Form(False),
    image: UploadFile = File(None)
):
    """
    AIに質問を投げてストリーミングで回答を得るエンドポイント。
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="AI service is currently unavailable")

    images = None
    if image and image.file:
        try:
            img = Image.open(image.file)
            images = [img]
        except Exception as e:
            logger.error(f"画像ファイルの読み込みに失敗: {e}", exc_info=True)
            raise HTTPException(status_code=400, detail=f"Invalid image file: {str(e)}")

    # 非同期ジェネレータであるreqAIをStreamingResponseに渡す
    return StreamingResponse(reqAI(prompt, is_search=is_search, images=images), media_type="text/event-stream")


# --- Wikipedia Image Endpoint ---
async def get_image_titles(client: httpx.AsyncClient, keyword: str, lang: str):
    """Fetches image titles for a keyword from a specific language Wikipedia."""
    URL = f"https://{lang}.wikipedia.org/w/api.php"
    params = {"action": "query", "prop": "images", "titles": keyword, "format": "json"}
    try:
        resp = await client.get(URL, params=params, timeout=0.5)
        resp.raise_for_status()
        data = resp.json()
        pages = data.get("query", {}).get("pages", {})
        page_id = list(pages.keys())[0]
        if page_id == "-1" or "images" not in pages[page_id]:
            return []
        return [img["title"] for img in pages[page_id]["images"]]
    except (httpx.RequestError, KeyError, IndexError):
        return []

async def get_image_urls(client: httpx.AsyncClient, titles: list[str], lang: str):
    """Fetches image URLs for a list of titles from a specific language Wikipedia."""
    if not titles:
        return []
    URL = f"https://{lang}.wikipedia.org/w/api.php"
    params = {"action": "query", "prop": "imageinfo", "iiprop": "url", "titles": "|".join(titles), "format": "json"}
    try:
        resp = await client.get(URL, params=params, timeout=0.5)
        resp.raise_for_status()
        data = resp.json()
        pages = data.get("query", {}).get("pages", {})
        return [
            page["imageinfo"][0]["url"]
            for page in pages.values()
            if "imageinfo" in page and page["imageinfo"]
        ]
    except (httpx.RequestError, KeyError, IndexError):
        return []

@app.get("/wiki/image/{keyword}")
async def get_wiki_image(keyword: str):
    async with httpx.AsyncClient() as client:
        # Step 1: Fetch image titles from both languages concurrently
        title_tasks = [
            get_image_titles(client, keyword, "en"),
            get_image_titles(client, keyword, "ja"),
        ]
        en_titles, ja_titles = await asyncio.gather(*title_tasks)

        # Step 2: Fetch image URLs from both languages concurrently
        url_tasks = [
            get_image_urls(client, en_titles, "en"),
            get_image_urls(client, ja_titles, "ja"),
        ]
        en_urls, ja_urls = await asyncio.gather(*url_tasks)

        # Combine and deduplicate results
        all_urls = set(en_urls) | set(ja_urls)
        
        if not all_urls:
            raise HTTPException(status_code=404, detail="No images found on both English and Japanese Wikipedia.")

        return JSONResponse(content={"image_urls": sorted(list(all_urls))})

# --- WebSocket Endpoint ---
@app.websocket("/ws/collaborate/{slide_id}")
async def websocket_collaborate(websocket: WebSocket, slide_id: str, *, token: Optional[str] = None, db: Session = Depends(get_db)):
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing token")
        return

    user = await auth._decode_token_and_get_user(token, db)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication failed")
        return

    await websocket.accept()
    logger.info(f"User {user.username} connected to WebSocket for slide {slide_id}")
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"User {user.username} said: {data} (slide: {slide_id})")
    except Exception as e:
        logger.info(f"WebSocket connection closed for slide {slide_id}, user {user.username}: {e}")
    finally:
        logger.info(f"User {user.username} disconnected from slide {slide_id}")

app.mount("/", StaticFiles(directory="static"), name="static")

# --- Uvicorn startup ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8000)

