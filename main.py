import os
import shutil
import uuid
import logging
from datetime import timedelta
from typing import Annotated, Optional, List, Dict, Any
import asyncio
import httpx

from fastapi import (
    FastAPI, Depends, HTTPException, status, UploadFile,
    File, WebSocket, Request, Form
)
from fastapi.security import OAuth2PasswordRequestForm

from fastapi.responses import FileResponse as FastAPIFileResponse, HTMLResponse, StreamingResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.concurrency import run_in_threadpool
from contextlib import asynccontextmanager
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy.orm import Session
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from google import genai
from google.genai import types
from PIL import Image
import io

import module.auth as auth
from module.database import engine, get_db
from module.models import Base, User, UploadedFile, Slide

# 多言語対応メッセージ定義
MESSAGES = {
    'ja': {
        'user_registered': 'ユーザー登録が完了しました',
        'login_success': 'ログインしました',
        'logout_success': 'ログアウトしました',
        'file_uploaded': 'ファイルのアップロードが完了しました',
        'file_deleted': 'ファイルを削除しました',
        'slide_created': '新しいスライドを作成しました',
        'slide_updated': 'スライドを更新しました',
        'slide_deleted': 'スライドを削除しました',
        'password_updated': 'パスワードを更新しました',
        'username_updated': 'ユーザー名を更新しました',
        'ai_request_processing': 'AI機能を処理中です',
        'error_file_save': 'ファイルの保存中にエラーが発生しました',
        'error_database': 'データベースエラーが発生しました',
        'error_ai_service': 'AI機能でエラーが発生しました',
        'error_validation': '入力内容に問題があります',
        'username_already_exists': 'このユーザー名は既に使用されています',
        'invalid_credentials': 'ユーザー名またはパスワードが正しくありません',
        'file_not_found': 'ファイルが見つかりません',
        'unauthorized_access': 'アクセス権限がありません',
        'file_too_large': 'ファイルサイズが上限を超えています',
        'invalid_file_type': 'サポートされていないファイル形式です'
    },
    'en': {
        'user_registered': 'User registration completed',
        'login_success': 'Successfully logged in',
        'logout_success': 'Successfully logged out',
        'file_uploaded': 'File uploaded successfully',
        'file_deleted': 'File deleted successfully',
        'slide_created': 'New slide created',
        'slide_updated': 'Slide updated',
        'slide_deleted': 'Slide deleted',
        'password_updated': 'Password updated successfully',
        'username_updated': 'Username updated successfully',
        'ai_request_processing': 'Processing AI request',
        'error_file_save': 'Error occurred while saving file',
        'error_database': 'Database error occurred',
        'error_ai_service': 'AI service error occurred',
        'error_validation': 'Input validation failed',
        'username_already_exists': 'Username already exists',
        'invalid_credentials': 'Invalid username or password',
        'file_not_found': 'File not found',
        'unauthorized_access': 'Access denied',
        'file_too_large': 'File size exceeds limit',
        'invalid_file_type': 'Unsupported file type'
    }
}

def get_message(key: str, lang: str = 'ja') -> str:
    """指定された言語のメッセージを取得"""
    return MESSAGES.get(lang, MESSAGES['ja']).get(key, key)

def log_user_action(action: str, user_id: Optional[int] = None, details: str = "", lang: str = 'ja'):
    """ユーザーアクションをフレンドリーなメッセージでログ出力"""
    message = get_message(action, lang)
    if user_id:
        logger.info(f"[ユーザーID: {user_id}] {message} {details}")
    else:
        logger.info(f"{message} {details}")

def create_user_response(message_key: str, lang: str = 'ja', **kwargs) -> Dict[str, Any]:
    """ユーザー向けレスポンスを生成"""
    return {
        "message": get_message(message_key, lang),
        "status": "success",
        **kwargs
    }

def create_error_response(message_key: str, lang: str = 'ja', status_code: int = 400) -> HTTPException:
    """エラーレスポンスを生成"""
    return HTTPException(
        status_code=status_code,
        detail=get_message(message_key, lang)
    )

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

class URLSafetyResponse(BaseModel):
    safe: bool
    reason: str
    matched_domain: Optional[str] = None
    source: Optional[str] = None

class WordRequest(BaseModel):
    keyword: str

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    アプリのライフスパン管理:
    - startup: ブロックリストをプリフェッチ
    - shutdown: 共有HTTPクライアントをクローズ
    """
    try:
        await _ensure_blocklists_loaded(force=True)
        logger.info("Lifespan startup: blocklists prefetched.")
    except Exception as e:
        logger.error(f"Lifespan startup failed: {e}", exc_info=True)
    # アプリ稼働期間へ遷移
    try:
        yield
    finally:
        try:
            await shared_http_client.aclose()
            logger.info("Lifespan shutdown: shared_http_client closed.")
        except Exception as e:
            logger.warning(f"Lifespan shutdown cleanup failed: {e}", exc_info=True)

app = FastAPI(lifespan=lifespan)

# --- HTTP client (app-scope) and utilities for Wikipedia endpoint ---
# Shared AsyncClient with HTTP/2, connection pooling, and split timeouts
# Note: keep a single client instance to benefit from connection reuse
client_timeout = httpx.Timeout(connect=1.0, read=5.0, write=5.0, pool=2.0)
shared_http_client = httpx.AsyncClient(http2=True, timeout=client_timeout, headers={"Accept-Encoding": "gzip, deflate"})

# --- URL Safety (Blocklist) Utilities ---
PHISHING_LIST_URL = "https://malware-filter.gitlab.io/malware-filter/phishing-filter-domains.txt"
URLHAUS_LIST_URL = "https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-domains-online.txt"

# メモリキャッシュ（アプリ存続期間内）
_blocklist_cache: dict[str, set[str]] = {"phishing": set(), "urlhaus": set()}
_blocklist_loaded = False
_blocklist_lock = asyncio.Lock()
# 1日(24h)に1回の更新
_BLOCKLIST_TTL = 24 * 60 * 60.0  # 86400秒
_blocklist_expire_at: float = 0.0

def _extract_domain_from_url(url: str) -> Optional[str]:
    """
    URLからホスト名(ドメイン)を抽出し、先頭/末尾のドットを除去して小文字化。
    """
    try:
        import urllib.parse as up
        parsed = up.urlparse(url.strip())
        host = parsed.hostname
        if not host:
            return None
        host = host.strip(".").lower()
        return host
    except Exception:
        return None

def _domain_matches(blocked: str, target: str) -> bool:
    """
    サブドメインも含めて一致判定。
    blocked: example.com
    target:  a.b.example.com -> True,  example.net -> False
    """
    if target == blocked:
        return True
    return target.endswith("." + blocked)

async def _download_blocklist(url: str) -> set[str]:
    """
    テキストのブロックリストを取得し、コメント/空行を除外してドメイン集合にする。
    """
    try:
        resp = await _retrying_get(shared_http_client, url, params={}, max_retries=2, max_backoff_sec=2.0)
        resp.raise_for_status()
        text = resp.text
        result: set[str] = set()
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith("#") or line.startswith("!"):
                continue
            # hosts形式や余分なプレフィックスの緩和
            # 例: 0.0.0.0 domain.tld / 127.0.0.1 domain.tld
            if " " in line:
                parts = line.split()
                line = parts[-1]
            # ドメインだけに正規化
            dom = line.strip(".").lower()
            # 簡易ドメインバリデーション
            if "." in dom and all(part for part in dom.split(".")):
                result.add(dom)
        return result
    except Exception as e:
        logger.error(f"Blocklist download failed: {url} : {e}", exc_info=True)
        return set()

async def _ensure_blocklists_loaded(force: bool = False):
    global _blocklist_loaded, _blocklist_expire_at
    async with _blocklist_lock:
        now = asyncio.get_event_loop().time()
        if not force and _blocklist_loaded and now < _blocklist_expire_at:
            return
        phishing, urlhaus = await asyncio.gather(
            _download_blocklist(PHISHING_LIST_URL),
            _download_blocklist(URLHAUS_LIST_URL),
        )
        if phishing:
            _blocklist_cache["phishing"] = phishing
        if urlhaus:
            _blocklist_cache["urlhaus"] = urlhaus
        _blocklist_loaded = True
        _blocklist_expire_at = now + _BLOCKLIST_TTL
        logger.info(f"Blocklists loaded (TTL={int(_BLOCKLIST_TTL)}s). phishing={len(_blocklist_cache['phishing'])}, urlhaus={len(_blocklist_cache['urlhaus'])}")

# Simple in-memory TTL cache
# key: str -> (expires_epoch: float, value: Any)
_ttl_cache: dict[str, tuple[float, Any]] = {}
_TTL_SECONDS = 60.0  # as agreed

def _cache_get(key: str):
    item = _ttl_cache.get(key)
    if not item:
        return None
    exp, val = item
    if exp < asyncio.get_event_loop().time():
        # expired
        _ttl_cache.pop(key, None)
        return None
    return val

def _cache_set(key: str, value: Any, ttl: float = _TTL_SECONDS):
    _ttl_cache[key] = (asyncio.get_event_loop().time() + ttl, value)

def _make_titles_cache_key(keyword: str, lang: str) -> str:
    return f"titles::{lang}::{keyword}"

def _make_imageinfo_cache_key(titles: list[str], lang: str) -> str:
    # titles order-insensitive to increase hit rate
    joined = "|".join(sorted(titles))
    return f"imageinfo::{lang}::{joined}"

def _make_pixabay_cache_key(q: str, page: int, per_page: int, lang: str) -> str:
    # Normalize and create key
    qn = q.strip().lower()
    return f"pixabay::{lang}::{qn}::p{page}::pp{per_page}"

# --- URL Safety Check Endpoint ---
@app.post("/api/url/safe-check", response_model=URLSafetyResponse)
async def url_safe_check(payload: URLRequest):
    """
    指定URLがブロックリストに該当するかを判定する。
    - 入力: { "url": "https://example.com/page" }
    - 出力: { safe: bool, reason: "matched|clean|invalid_url|error", matched_domain?: str, source?: "phishing|urlhaus" }
    """
    # ブロックリストのロード/更新
    # 起動時にプリフェッチ済み。TTL(1日)超過時のみ更新を行うため、通常はヒット即判定。
    await _ensure_blocklists_loaded()

    # URLからドメイン抽出
    domain = _extract_domain_from_url(payload.url)
    if not domain:
        return URLSafetyResponse(safe=False, reason="invalid_url")

    # 照合（サブドメイン含む）
    for source in ("phishing", "urlhaus"):
        for blocked in _blocklist_cache[source]:
            if _domain_matches(blocked, domain):
                return URLSafetyResponse(
                    safe=False,
                    reason="matched",
                    matched_domain=blocked,
                    source=source,
                )
    return URLSafetyResponse(safe=True, reason="clean")

async def _retrying_get(client: httpx.AsyncClient, url: str, *, params: dict[str, Any], max_retries: int = 2, max_backoff_sec: float = 2.0) -> httpx.Response:
    """
    GET with exponential backoff retries for transient statuses: 429/502/503/504.
    """
    attempt = 0
    backoff = 0.3
    while True:
        try:
            resp = await client.get(url, params=params)
            # Retry on specific transient HTTP status codes
            if resp.status_code in (429, 502, 503, 504):
                raise httpx.HTTPStatusError("Transient HTTP error", request=resp.request, response=resp)
            return resp
        except (httpx.RequestError, httpx.HTTPStatusError) as e:
            if attempt >= max_retries:
                raise
            await asyncio.sleep(min(backoff, max_backoff_sec))
            backoff *= 2
            attempt += 1

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
async def register_user(user: UserCreate, db: Session = Depends(get_db), lang: str = 'ja'):
    db_user = db.query(User).filter_by(username=user.username).first()
    if db_user:
        raise create_error_response('username_already_exists', lang, 400)
    
    hashed_password = auth.get_password_hash(user.password)
    db_user = User(username=user.username, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    log_user_action('user_registered', db_user.id, f"ユーザー名: {user.username}", lang)  # type: ignore
    return db_user

@app.post("/auth/login", response_model=auth.Token)
async def login_user(form_data: Annotated[OAuth2PasswordRequestForm, Depends()], db: Session = Depends(get_db), lang: str = 'ja'):
    user = db.query(User).filter_by(username=form_data.username).first()
    if not user or not auth.verify_password(form_data.password, str(user.hashed_password)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=get_message('invalid_credentials', lang),
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    log_user_action('login_success', user.id, f"ユーザー名: {user.username}", lang)  # type: ignore
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/auth/logout")
async def logout_user(lang: str = 'ja'):
    log_user_action('logout_success', details="", lang=lang)
    return create_user_response('logout_success', lang)

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
    db: Session = Depends(get_db),
    lang: str = 'ja'
):
    if not auth.verify_password(user_update.current_password, str(current_user.hashed_password)):
        raise create_error_response('invalid_credentials', lang, status.HTTP_400_BAD_REQUEST)
    
    current_user.set_hashed_password(auth.get_password_hash(user_update.new_password))
    db.commit()
    db.refresh(current_user)
    
    log_user_action('password_updated', current_user.id, lang=lang) # type: ignore
    return create_user_response('password_updated', lang)

@app.put("/users/me/username", status_code=status.HTTP_200_OK)
async def update_username(
    user_update: UserUpdateUsername,
    current_user: Annotated[User, Depends(auth.get_current_user)],
    db: Session = Depends(get_db),
    lang: str = 'ja'
):
    if db.query(User).filter_by(username=user_update.new_username).first():
        raise create_error_response('username_already_exists', lang, status.HTTP_400_BAD_REQUEST)
    
    current_user.set_username(user_update.new_username)
    db.commit()
    db.refresh(current_user)

    log_user_action('username_updated', current_user.id, f"New username: {user_update.new_username}", lang) # type: ignore
    return create_user_response('username_updated', lang)


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

async def save_upload_file(upload_file: UploadFile, destination_folder: str, db_file_entry: UploadedFile, db: Session, file_type: str, lang: str = 'ja'):
    max_size = MAX_FILE_SIZES.get(file_type)
    if not max_size:
        raise create_error_response('invalid_file_type', lang, status.HTTP_400_BAD_REQUEST)
    
    if upload_file.size is None or upload_file.size > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=get_message('file_too_large', lang) + f" ({file_type}: {max_size // (1024*1024)}MB)"
        )

    content_type = upload_file.content_type
    if file_type == "image" and content_type not in ALLOWED_IMAGE_TYPES:
        raise create_error_response('invalid_file_type', lang, status.HTTP_400_BAD_REQUEST)
    elif file_type == "font" and content_type not in ALLOWED_FONT_TYPES:
        raise create_error_response('invalid_file_type', lang, status.HTTP_400_BAD_REQUEST)
    elif file_type == "video" and content_type not in ALLOWED_VIDEO_TYPES:
        raise create_error_response('invalid_file_type', lang, status.HTTP_400_BAD_REQUEST)

    original_filename = secure_filename(upload_file.filename or "")
    file_extension = os.path.splitext(original_filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_location = os.path.join(destination_folder, unique_filename)

    # パス検証: 許可ディレクトリ配下のみ
    uploads_root = os.path.abspath(UPLOAD_DIR)
    abs_path = os.path.abspath(file_location)
    if not abs_path.startswith(uploads_root):
        logger.error(f"セキュリティエラー: 許可されていないパスへのファイル保存を試行: {abs_path}")
        raise create_error_response('error_validation', lang, 400)

    try:
        with open(file_location, "wb+") as file_object:
            await run_in_threadpool(shutil.copyfileobj, upload_file.file, file_object)

        # ファイルパスを設定 - SQLAlchemyモデルの更新
        setattr(db_file_entry, 'file_path', file_location)
        db.add(db_file_entry)
        db.commit()
        db.refresh(db_file_entry)
        
        log_user_action('file_uploaded', db_file_entry.owner_id, f"ファイル名: {original_filename}", lang)  # type: ignore
        return db_file_entry
    except Exception as e:
        logger.error(f"ファイル保存エラー ({upload_file.filename}): {e}", exc_info=True)
        if os.path.exists(file_location):
            try:
                await run_in_threadpool(os.remove, file_location)
            except Exception as remove_e:
                logger.error(f"一時ファイルの削除に失敗: {file_location}: {remove_e}")
        raise create_error_response('error_file_save', lang, status.HTTP_500_INTERNAL_SERVER_ERROR)

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

# --- External API Keys ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY or GEMINI_API_KEY == "GeminiAPIkey":
    logger.warning("GEMINI_API_KEY not found. AI endpoint is disabled.")

PIXABAY_API_KEY = os.getenv("PIXABAY_API_KEY")
if not PIXABAY_API_KEY or PIXABAY_API_KEY == "PixabayApiKey":
    logger.warning("PIXABAY_API_KEY not found. Pixabay endpoint will return 503.")

def _normalize_image_to_png_bytes(img_obj: Any) -> bytes:
    """
    入力の画像オブジェクトを完全にメモリ上の PNG バイト列に正規化する。
    - UploadFile / file-like / bytes / PIL.Image いずれにも対応
    """
    # bytes または bytearray の場合は一旦 PIL で開いて PNG に正規化
    if isinstance(img_obj, (bytes, bytearray)):
        bio = io.BytesIO(img_obj)
        with Image.open(bio) as im:
            im.load()
            im2 = im.copy()
        out = io.BytesIO()
        im2.save(out, format="PNG")
        return out.getvalue()

    # PIL.Image の場合
    if isinstance(img_obj, Image.Image):
        # ソースから切り離す
        img_obj.load()
        im2 = img_obj.copy()
        out = io.BytesIO()
        im2.save(out, format="PNG")
        return out.getvalue()

    # UploadFile / file-like 対応（.file を優先）
    fobj = getattr(img_obj, "file", None)
    if fobj is None and hasattr(img_obj, "read"):
        fobj = img_obj
    if fobj is None:
        raise TypeError("Unsupported image input type for normalization")

    # 既にクローズ済み（tempfile）を回避して UploadFile から読み直す
    # Starlette UploadFile には .file の他に .read() がある
    try:
        # まずは安全に bytes を得る
        if hasattr(img_obj, "read"):
            # UploadFile など: ポインタ位置を考慮して先頭に戻して読む
            try:
                if hasattr(img_obj, "seek"):
                    img_obj.seek(0)
            except Exception:
                pass
            data = img_obj.read()
        else:
            # file-like の場合
            try:
                if hasattr(fobj, "seek"):
                    fobj.seek(0)
            except Exception:
                pass
            data = fobj.read()
    finally:
        # img_obj が UploadFile の場合は呼び元がクローズするのでここでは閉じない
        # 一時ファイルなど明示クローズが必要な場合のみクローズを試みる
        try:
            if fobj is not None and fobj is not getattr(img_obj, "file", None):
                fobj.close()
        except Exception:
            pass

    bio = io.BytesIO(data)
    with Image.open(bio) as im:
        im.load()
        im2 = im.copy()
    out = io.BytesIO()
    im2.save(out, format="PNG")
    return out.getvalue()


def reqAI(prompt: str, model_name: str = "gemini-2.5-flash", is_search: bool = False, images: Optional[List[Any]] = None):
    """
    AIモデルにリクエストを送信し、ストリーミングで応答を返すジェネレータ。
    重要: 画像は事前に PNG bytes に正規化し inline_data で渡すことで
        'I/O operation on closed file' を回避する。
    """
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)

        # contents を構築
        content_parts: list[Any] = []
        if prompt:
            content_parts.append(prompt)

        if images:
            for img_obj in images:
                png_bytes = _normalize_image_to_png_bytes(img_obj)
                # google-genai SDK の inline_data で渡す
                content_parts.append(
                    {
                        "inline_data": {
                            "mime_type": "image/png",
                            "data": png_bytes,
                        }
                    }
                )

        config = None
        if is_search:
            config = types.GenerateContentConfig(tools=[{"google_search": {}}])

        response_stream = client.models.generate_content_stream(
            model=model_name,
            contents=content_parts,
            config=config,
        )

        for chunk in response_stream:
            if getattr(chunk, "text", None):
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
    if image:
        try:
            # UploadFile はここで read して bytes を渡す（以降のライフサイクルに依存しない）
            # ポインタを先頭へ
            try:
                await run_in_threadpool(image.seek, 0)
            except Exception:
                pass
            data = await run_in_threadpool(image.read)
            images = [data] if data else None
        except Exception as e:
            logger.error(f"画像ファイルの読み込みに失敗: {e}", exc_info=True)
            raise HTTPException(status_code=400, detail=f"Invalid image file: {str(e)}")

    # 非同期ジェネレータであるreqAIをStreamingResponseに渡す
    return StreamingResponse(reqAI(prompt, is_search=is_search, images=images), media_type="text/event-stream")


# --- Wikipedia Image Endpoint ---
async def get_image_titles(client: httpx.AsyncClient, keyword: str, lang: str):
    """Fetches image titles for a keyword from a specific language Wikipedia."""
    cache_key = _make_titles_cache_key(keyword, lang)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    URL = f"https://{lang}.wikipedia.org/w/api.php"
    params = {
        "action": "query",
        "prop": "images",
        "titles": keyword,
        "format": "json",
        "redirects": 1,
        "normalized": 1,
    }
    try:
        resp = await _retrying_get(client, URL, params=params, max_retries=2, max_backoff_sec=2.0)
        resp.raise_for_status()
        data = resp.json()
        pages = data.get("query", {}).get("pages", {})
        if not pages:
            _cache_set(cache_key, [])
            return []
        page_id = next(iter(pages.keys()))
        if page_id == "-1" or "images" not in pages[page_id]:
            _cache_set(cache_key, [])
            return []
        titles = []
        for img in pages[page_id]["images"]:
            title = img.get("title")
            if title:
                titles.append(title)
        _cache_set(cache_key, titles)
        return titles
    except (httpx.RequestError, httpx.HTTPStatusError, KeyError, IndexError, ValueError):
        return []

async def get_image_urls(client: httpx.AsyncClient, titles: list[str], lang: str):
    """Fetches image URLs for a list of titles from a specific language Wikipedia."""
    if not titles:
        return []
    cache_key = _make_imageinfo_cache_key(titles, lang)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    URL = f"https://{lang}.wikipedia.org/w/api.php"
    params = {
        "action": "query",
        "prop": "imageinfo",
        "iiprop": "url",
        "titles": "|".join(sorted(titles)),
        "format": "json",
    }
    try:
        resp = await _retrying_get(client, URL, params=params, max_retries=2, max_backoff_sec=2.0)
        resp.raise_for_status()
        data = resp.json()
        pages = data.get("query", {}).get("pages", {})
        allowed_exts = (
            ".jpg", ".jpeg", ".jpe", ".jfif", ".pjpeg", ".pjp",
            ".png",
            ".webp",
            ".gif",
            ".heif", ".heic",
            ".ico"
        )
        urls: list[str] = []
        for page in pages.values():
            info = page.get("imageinfo")
            if not info:
                continue
            url = info[0].get("url") if isinstance(info, list) and info else None
            if not url:
                continue
            if url.lower().endswith(allowed_exts):
                urls.append(url)
        _cache_set(cache_key, urls)
        return urls
    except (httpx.RequestError, httpx.HTTPStatusError, KeyError, IndexError, ValueError):
        return []

@app.get("/redirect")
async def safe_redirect(url: str):
    """
    安全なURLなら即時リダイレクトし、危険判定なら警告ページを返してブロックする。
    クエリ: /redirect?url=...
    """
    # ブロックリストのロード/更新
    # 起動時にプリフェッチ済み。TTL(1日)超過時のみ更新を行うため、通常はヒット即判定。
    await _ensure_blocklists_loaded()

    # URLからドメイン抽出
    domain = _extract_domain_from_url(url)
    if not domain:
        # 不正URLはブロック
        html = """
        <!doctype html>
        <html lang="ja">
        <head><meta charset="utf-8"><title>ブロックされました</title></head>
        <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif; padding: 2rem;">
          <h1>安全でない可能性のあるURLです</h1>
          <p>指定されたURLは不正な形式のため、リダイレクトを中止しました。</p>
        </body>
        </html>
        """
        return HTMLResponse(content=html, status_code=400)

    # ブロックチェック
    for source in ("phishing", "urlhaus"):
        for blocked in _blocklist_cache[source]:
            if _domain_matches(blocked, domain):
                # ブロック用の警告ページ
                html = f"""
                <!doctype html>
                <html lang="ja">
                <head><meta charset="utf-8"><title>ブロックされました</title></head>
                <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif; padding: 2rem;">
                  <h1 style="color:#b00020">危険な可能性のあるURLを検出しました</h1>
                  <p>以下のドメインがブロックリスト（{source}）に一致しました。</p>
                  <ul>
                    <li>一致ドメイン: <code>{blocked}</code></li>
                    <li>アクセス先: <code>{url}</code></li>
                  </ul>
                  <p>リダイレクトは中止されました。心当たりがない場合はこのページを閉じてください。</p>
                </body>
                </html>
                """
                return HTMLResponse(content=html, status_code=451)  # 451 Unavailable For Legal Reasons を流用（ブロック表示）

    # 安全と判断 → 302 リダイレクト
    return RedirectResponse(url, status_code=302)

@app.get("/api/images/search")
async def search_images_on_pixabay(
    q: str,
    page: int = 1,
    per_page: int = 20,
    lang: str = "ja",
):
    """
    Pixabay 画像検索プロキシ
    - クエリ: q (必須), page, per_page
    - レスポンス: 必要フィールドのみ抽出
    - 簡易TTLキャッシュ対応（デフォルト _TTL_SECONDS=60）
    """
    if not PIXABAY_API_KEY:
        raise HTTPException(status_code=503, detail="Pixabay service is currently unavailable")

    # ガード
    if not q.strip():
        raise HTTPException(status_code=400, detail="Query 'q' is required")
    page = max(1, min(page, 200))
    per_page = max(3, min(per_page, 200))

    # キャッシュキー生成＆ヒットチェック
    cache_key = _make_pixabay_cache_key(q, page, per_page, lang)
    cached = _cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached)

    params = {
        "key": PIXABAY_API_KEY,
        "q": q,
        "page": page,
        "per_page": per_page,
        "safesearch": "true",
        "image_type": "photo",
        "orientation": "horizontal",
        "lang": lang,
    }
    url = "https://pixabay.com/api/"

    try:
        resp = await _retrying_get(shared_http_client, url, params=params, max_retries=2, max_backoff_sec=2.0)
        resp.raise_for_status()
        data = resp.json()
    except (httpx.RequestError, httpx.HTTPStatusError) as e:
        logger.error(f"Pixabay request failed: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail="Failed to fetch from Pixabay")

    hits = data.get("hits", [])
    results: list[dict[str, Any]] = []
    for h in hits:
        results.append({
            "id": h.get("id"),
            "pageURL": h.get("pageURL"),
            "tags": h.get("tags"),
            "previewURL": h.get("previewURL"),
            "webformatURL": h.get("webformatURL"),
            "largeImageURL": h.get("largeImageURL"),
            "user": h.get("user"),
            "userImageURL": h.get("userImageURL"),
            "imageWidth": h.get("imageWidth"),
            "imageHeight": h.get("imageHeight"),
            "likes": h.get("likes"),
            "downloads": h.get("downloads"),
            "views": h.get("views"),
        })

    response_payload = {
        "total": data.get("total", 0),
        "totalHits": data.get("totalHits", 0),
        "hits": results,
        "page": page,
        "per_page": per_page
    }

    # キャッシュ保存
    _cache_set(cache_key, response_payload)

    return JSONResponse(content=response_payload)


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

        # Combine and deduplicate results, allow only specific image formats
        # User-selected: HEIF/HEIC, extended JPEG family, ICO + existing common formats
        allowed_exts = (
            ".jpg", ".jpeg", ".jpe", ".jfif", ".pjpeg", ".pjp",  # JPEG family
            ".png",                                              # PNG
            ".webp",                                             # WebP
            ".gif",                                              # GIF
            ".heif", ".heic",                                    # HEIF/HEIC
            ".ico"                                               # ICO
        )
        all_urls = set(en_urls) | set(ja_urls)
        filtered_urls = [
            url for url in all_urls
            if url.lower().endswith(allowed_exts)
        ]

        if not filtered_urls:
            raise HTTPException(
                status_code=404,
                detail="No images found for the given keyword."
            )

        return JSONResponse(content={"image_urls": sorted(filtered_urls)})

# --- WebSocket Endpoint ---
@app.websocket("/ws/collaborate/{slide_id}")
async def websocket_collaborate(websocket: WebSocket, slide_id: str, user: Optional[User] = Depends(auth.get_current_user_ws)):
    if user is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication Failed")
        return

    await websocket.accept()
    logger.info(f"User {user.username} connected to WebSocket for slide {slide_id}")
    try:
        while True:
            data = await websocket.receive_text()
            # TODO: Implement actual collaboration logic instead of echo
            await websocket.send_text(f"User {user.username} said: {data} (slide: {slide_id})")
    except Exception as e:
        logger.warning(f"WebSocket connection closed for slide {slide_id}, user {user.username}: {e}")
    finally:
        logger.info(f"User {user.username} disconnected from slide {slide_id}")

app.mount("/", StaticFiles(directory="static"), name="static")

# --- Uvicorn startup ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8000)

