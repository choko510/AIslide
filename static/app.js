document.addEventListener('DOMContentLoaded', () => {
    const authArea = document.getElementById('auth-area');
    const loginModal = document.getElementById('login-modal');
    const registerModal = document.getElementById('register-modal');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterModalBtn = document.getElementById('show-register-modal');
    const showLoginModalBtn = document.getElementById('show-login-modal');
    const createNewSlideBtn = document.getElementById('create-new-slide-btn');
    const slideListContainer = document.getElementById('slide-list');

    const API_BASE_URL = ''; // FastAPIが同じオリジンで提供されるため空文字列

    // --- モーダル制御 ---
    function openModal(modal) {
        modal.classList.add('is-open');
    }

    function closeModal(modal) {
        modal.classList.remove('is-open');
    }

    loginModal.addEventListener('click', (e) => {
        if (e.target === loginModal) closeModal(loginModal);
    });
    registerModal.addEventListener('click', (e) => {
        if (e.target === registerModal) closeModal(registerModal);
    });

    showRegisterModalBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal(loginModal);
        openModal(registerModal);
    });

    showLoginModalBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal(registerModal);
        openModal(loginModal);
    });

    // --- 認証関連 ---
    function getToken() {
        return localStorage.getItem('access_token');
    }

    function setToken(token) {
        localStorage.setItem('access_token', token);
    }

    function removeToken() {
        localStorage.removeItem('access_token');
    }

    async function checkAuthAndRenderUI() {
        const token = getToken();
        if (token) {
            try {
                const response = await fetch(`${API_BASE_URL}/users/me`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                if (response.ok) {
                    const user = await response.json();
                    renderLoggedInUI(user.username);
                    fetchAndRenderSlides();
                } else {
                    removeToken();
                    renderLoggedOutUI();
                }
            } catch (error) {
                console.error('認証チェックエラー:', error);
                removeToken();
                renderLoggedOutUI();
            }
        } else {
            renderLoggedOutUI();
        }
    }

    function renderLoggedInUI(username) {
        authArea.innerHTML = `
            <div class="user-info">
                <span>ようこそ、${username}さん！</span>
                <button id="logout-btn">ログアウト</button>
            </div>
        `;
        document.getElementById('logout-btn').addEventListener('click', handleLogout);
    }

    function renderLoggedOutUI() {
        authArea.innerHTML = `
            <div class="auth-buttons">
                <button id="show-login-btn">ログイン</button>
                <button id="show-register-btn">新規登録</button>
            </div>
        `;
        document.getElementById('show-login-btn').addEventListener('click', () => openModal(loginModal));
        document.getElementById('show-register-btn').addEventListener('click', () => openModal(registerModal));
    }

    async function handleLogin(event) {
        event.preventDefault();
        const username = loginForm.elements['login-username'].value;
        const password = loginForm.elements['login-password'].value;

        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                const data = await response.json();
                setToken(data.access_token);
                closeModal(loginModal);
                checkAuthAndRenderUI(); // UI更新とスライド取得
            } else {
                const errorData = await response.json();
                alert(`ログイン失敗: ${errorData.detail}`);
            }
        } catch (error) {
            console.error('ログインエラー:', error);
            alert('ログイン中にエラーが発生しました。');
        }
    }

    async function handleRegister(event) {
        event.preventDefault();
        const username = registerForm.elements['register-username'].value;
        const password = registerForm.elements['register-password'].value;

        try {
            const response = await fetch(`${API_BASE_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                alert('新規登録が完了しました。ログインしてください。');
                closeModal(registerModal);
                openModal(loginModal);
            } else {
                const errorData = await response.json();
                alert(`新規登録失敗: ${errorData.detail}`);
            }
        } catch (error) {
            console.error('新規登録エラー:', error);
            alert('新規登録中にエラーが発生しました。');
        }
    }

    function handleLogout() {
        removeToken();
        renderLoggedOutUI();
        slideListContainer.innerHTML = ''; // スライドリストをクリア
        alert('ログアウトしました。');
    }

    // --- スライド関連 ---
    async function fetchAndRenderSlides() {
        const token = getToken();
        if (!token) {
            slideListContainer.innerHTML = '<p>ログインしてスライドを表示</p>';
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/users/me/slides`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const slides = await response.json();
                renderSlides(slides);
            } else {
                const errorData = await response.json();
                console.error('スライド取得失敗:', errorData.detail);
                slideListContainer.innerHTML = `<p>スライドの取得に失敗しました: ${errorData.detail}</p>`;
                if (response.status === 401) { // トークン切れなどで認証エラーの場合
                    removeToken();
                    renderLoggedOutUI();
                }
            }
        } catch (error) {
            console.error('スライド取得エラー:', error);
            slideListContainer.innerHTML = '<p>スライドの取得中にエラーが発生しました。</p>';
        }
    }

    function renderSlides(slides) {
        slideListContainer.innerHTML = ''; // 既存のスライドをクリア
        if (slides.length === 0) {
            slideListContainer.innerHTML = '<p>まだスライドがありません。「新しいプレゼンテーション」ボタンから作成しましょう！</p>';
            return;
        }

        slides.forEach(slide => {
            const slideCard = document.createElement('div');
            slideCard.className = 'slide-card';
            // サムネイルのプレースホルダー。将来的には実際のサムネイル画像を生成して表示
            slideCard.innerHTML = `
                <div class="slide-thumbnail-placeholder">
                    <i class="fas fa-file-powerpoint fa-4x"></i>
                </div>
                <div class="slide-info">
                    <div class="slide-title">スライド #${slide.id}</div>
                    <div class="slide-actions">
                        <button class="edit-btn" data-slide-id="${slide.id}">編集</button>
                        <button class="delete-btn" data-slide-id="${slide.id}">削除</button>
                    </div>
                </div>
            `;
            slideListContainer.appendChild(slideCard);

            slideCard.querySelector('.edit-btn').addEventListener('click', () => handleEditSlide(slide.id));
            slideCard.querySelector('.delete-btn').addEventListener('click', () => handleDeleteSlide(slide.id));
        });
    }

    async function handleCreateNewSlide() {
        const token = getToken();
        if (!token) {
            alert('新しいスライドを作成するにはログインが必要です。');
            openModal(loginModal);
            return;
        }

        try {
            // FastAPIのSlideCreateスキーマに合わせて空のslide_dataを送信
            const response = await fetch(`${API_BASE_URL}/slides`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ slide_data: "{}" }) // 空のJSONオブジェクトを送信
            });

            if (response.ok) {
                const newSlide = await response.json();
                window.location.href = `/slide.html?slide_id=${newSlide.id}`;
            } else {
                const errorData = await response.json();
                alert(`スライド作成失敗: ${errorData.detail}`);
            }
        } catch (error) {
            console.error('スライド作成エラー:', error);
            alert('スライドの作成中にエラーが発生しました。');
        }
    }

    function handleEditSlide(slideId) {
        window.location.href = `/slide.html?slide_id=${slideId}`;
    }

    async function handleDeleteSlide(slideId) {
        if (!confirm('このスライドを削除してもよろしいですか？')) {
            return;
        }

        const token = getToken();
        if (!token) {
            alert('スライドを削除するにはログインが必要です。');
            openModal(loginModal);
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/slides/${slideId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                alert('スライドが削除されました。');
                alert('スライドが削除されました。');
                fetchAndRenderSlides(); // リストを再読み込み
            } else {
                const errorData = await response.json();
                alert(`スライド削除失敗: ${errorData.detail}`);
            }
        } catch (error) {
            console.error('スライド削除エラー:', error);
            alert('スライドの削除中にエラーが発生しました。');
        }
    }

    // --- イベントリスナー登録 ---
    loginForm.addEventListener('submit', handleLogin);
    registerForm.addEventListener('submit', handleRegister);
    createNewSlideBtn.addEventListener('click', handleCreateNewSlide);

    // 初期UIのレンダリング
    checkAuthAndRenderUI();
});
