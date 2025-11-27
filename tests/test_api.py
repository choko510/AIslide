from fastapi.testclient import TestClient

def test_read_main(client: TestClient):
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]

def test_register_and_login(client: TestClient):
    # ユーザー登録
    response = client.post(
        "/auth/register",
        json={"username": "testuser", "password": "testpassword"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"
    assert "id" in data

    # ログイン
    response = client.post(
        "/auth/login",
        data={"username": "testuser", "password": "testpassword"},
    )
    assert response.status_code == 200
    token_data = response.json()
    assert "access_token" in token_data
    assert token_data["token_type"] == "bearer"

    token = token_data["access_token"]

    # 認証が必要なエンドポイントへのアクセス
    response = client.get(
        "/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    user_data = response.json()
    assert user_data["username"] == "testuser"

def test_create_slide(client: TestClient):
    # まずユーザーを作成してログイン
    client.post(
        "/auth/register",
        json={"username": "slideuser", "password": "password"},
    )
    login_res = client.post(
        "/auth/login",
        data={"username": "slideuser", "password": "password"},
    )
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # スライド作成
    slide_data = "Title: Test Slide\nContent: This is a test."
    response = client.post(
        "/slides",
        json={"slide_data": slide_data},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["slide_data"] == slide_data
    slide_id = data["id"]

    # 作成したスライドの取得
    response = client.get(f"/slides/{slide_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["slide_data"] == slide_data

    # 自分のスライド一覧
    response = client.get("/users/me/slides", headers=headers)
    assert response.status_code == 200
    slides = response.json()
    assert len(slides) == 1
    assert slides[0]["id"] == slide_id

def test_duplicate_user_registration(client: TestClient):
    client.post(
        "/auth/register",
        json={"username": "dupuser", "password": "password"},
    )
    response = client.post(
        "/auth/register",
        json={"username": "dupuser", "password": "password"},
    )
    assert response.status_code == 400
    assert "既に使用されています" in response.json()["detail"] or "already exists" in response.json()["detail"]
