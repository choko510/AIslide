import os
import sys
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from unittest.mock import AsyncMock, patch
import asyncio

# テスト実行用の環境変数を設定 (main, module.authなどのインポート前に設定する必要がある)
os.environ["SECRET_KEY"] = "testsecretkeyforpytestonly12345678"
os.environ["GEMINI_API_KEY"] = "test_gemini_key"
os.environ["PIXABAY_API_KEY"] = "test_pixabay_key"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

# アプリケーションのパスを通す
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
from module.database import Base, get_db

# インメモリSQLite用の設定
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db_session():
    # テーブル作成
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        # テーブル削除（次のテストのため）
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="session", autouse=True)
def mock_blocklist_loader():
    # 外部通信を行う _ensure_blocklists_loaded をモック化
    with patch("main._ensure_blocklists_loaded", new_callable=AsyncMock) as mock:
        yield mock

@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    # HTTP通信エラーを回避するために、shared_http_client をモックに置き換えるか、
    # lifespan イベントでエラーにならないように調整する。
    # ここでは、TestClient作成時の lifespan イベントによる外部通信エラーを回避するため、
    # 既にモックした _ensure_blocklists_loaded が効いているはず。

    app.dependency_overrides[get_db] = override_get_db
    # TestClient を使う際に lifespan=True (デフォルト) だと startup/shutdown が走る
    # shared_http_client の close 問題を回避するため、lifespan を無効にするか
    # main.py 側で再利用可能な実装にする必要があるが、
    # ここでは、TestClient ごとにアプリのインスタンスが使い捨てられるわけではないので注意。

    # しかし、TestClient(app) はリクエストごとにアプリを起動するわけではなく、
    # コンテキストマネージャとして使うと起動・終了する。

    # 複数のテストで shared_http_client が閉じられてしまう問題を回避するため、
    # 各テスト実行前に shared_http_client を再生成するか、
    # lifespan を無効化する。
    # TestClient(app, raise_server_exceptions=True) だけで lifespan を実行しないオプションはない。
    # しかし、FastAPIアプリ自体には lifespan 引数がある。

    # 解決策: httpx.AsyncClient をモックするか、再作成する。
    # main.shared_http_client はモジュールレベル変数なので書き換え可能。

    import main
    import httpx
    # 再作成
    if main.shared_http_client.is_closed:
         client_timeout = httpx.Timeout(connect=1.0, read=5.0, write=5.0, pool=2.0)
         main.shared_http_client = httpx.AsyncClient(http2=True, timeout=client_timeout, headers={"Accept-Encoding": "gzip, deflate"})

    # さらに、lifespan shutdown で close されないようにモックする手もあるが、
    # 一番簡単なのは、テストごとに client が close されても次のテストで新しい client を使うこと。
    # しかし main.py の lifespan は global 変数を close してしまう。

    # よって、lifespan 自体をモックして何もしないようにするのが安全。
    # ただし、FastAPI の `app.router.lifespan_context` を差し替えるのは難しい。

    # 代替案: TestClient の使用方法を変える。
    # with TestClient(app) as c: ...
    # これをやると毎回 shutdown が呼ばれて global client が死ぬ。

    # 対策: app.router.lifespan_context を無効化する (FastAPI < 0.93? no)
    #
    # 最も確実な方法: main.lifespan をパッチする

    with patch("main.lifespan", new_callable=AsyncMock) as mock_lifespan:
        # 非同期ジェネレータを返すように設定するのは面倒なので、
        # アプリの router.lifespan_context を空のコンテキストマネージャに置き換える

        from contextlib import asynccontextmanager
        @asynccontextmanager
        async def dummy_lifespan(app):
            yield

        original_lifespan = app.router.lifespan_context
        app.router.lifespan_context = dummy_lifespan

        with TestClient(app) as c:
            yield c

        # 戻す
        app.router.lifespan_context = original_lifespan
