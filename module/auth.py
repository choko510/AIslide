import os
from datetime import datetime, timedelta, timezone
from typing import Optional, Annotated

from fastapi import Depends, HTTPException, status, WebSocket, Query
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
import bcrypt
from pydantic import BaseModel
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from module.models import User
from module.database import get_db

load_dotenv()

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY")

# 開発環境やテスト環境での利便性のため、環境変数が設定されていない場合のデフォルト値を許可するか、
# 明示的にエラーにするかはプロジェクトの方針による。
# ここではセキュリティを重視し、環境変数が設定されていない場合はエラーとするが、
# 既存コードとの互換性(デフォルト値 "SeceretKey" のチェックなど)を考慮する。
if not SECRET_KEY:
    # テスト実行時など、コンテキストによってはここでエラーになる可能性があるため注意。
    # conftest.pyで設定していれば問題ない。
    raise ValueError("SECRET_KEY not found in environment variables")

if SECRET_KEY == "SeceretKey":
     # 警告を出すか、エラーにするべきだが、既存ロジックに合わせてエラーとする
     raise ValueError("SECRET_KEY must be changed from the default value")

if len(SECRET_KEY) < 8:
    raise ValueError("SECRET_KEY must be at least 8 characters long")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login") # tokenUrl should match your login path

class TokenData(BaseModel):
    username: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    パスワードを検証する。bcryptを使用。
    """
    if isinstance(plain_password, str):
        plain_password = plain_password.encode('utf-8')
    if isinstance(hashed_password, str):
        hashed_password = hashed_password.encode('utf-8')
    return bcrypt.checkpw(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """
    パスワードをハッシュ化する。bcryptを使用。
    """
    if isinstance(password, str):
        password = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password, salt).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_user(db: Session, username: str) -> Optional[User]:
    return db.query(User).filter(User.username == username).first()

async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: Optional[str] = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        raise credentials_exception

    user = await get_user(db, username=token_data.username) if token_data.username else None
    if user is None:
        raise credentials_exception
    return user

async def get_current_user_ws(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
) -> Optional[User]:
    if token is None:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: Optional[str] = payload.get("sub")
        if username is None:
            return None
        user = await get_user(db, username=username)
        return user
    except JWTError:
        return None

async def get_current_active_user(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    # If we add an "is_active" flag to the User model, we can check it here.
    # For now, just returns the user if authenticated.
    # if not current_user.is_active:
    #     raise HTTPException(status_code=400, detail="Inactive user")
    return current_user
