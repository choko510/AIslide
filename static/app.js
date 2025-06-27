document.addEventListener('DOMContentLoaded', () => {
    const loginModal = document.getElementById('loginModal');
    const registerModal = document.getElementById('registerModal');
    const showLoginModalButton = document.getElementById('showLoginModal');
    const showRegisterModalButton = document.getElementById('showRegisterModal');
    const closeButtons = document.querySelectorAll('.close-button');
    const registerButton = document.getElementById('registerButton');
    const loginButton = document.getElementById('loginButton');
    const logoutButton = document.getElementById('logoutButton');
    const registerMessage = document.getElementById('registerMessage');
    const loginMessage = document.getElementById('loginMessage');
    const slideList = document.getElementById('slideList');

    // --- 認証関連のトークン管理 ---
    let authToken = localStorage.getItem('authToken');
    let currentUsername = localStorage.getItem('username');

    function updateAuthUI() {
        if (authToken) {
            showLoginModalButton.style.display = 'none';
            showRegisterModalButton.style.display = 'none';
            logoutButton.style.display = 'inline-block';
            // TODO: ユーザー名などを表示するエリアがあれば更新
            loadUserSlides(); // ログインしていたらスライドを読み込む
        } else {
            showLoginModalButton.style.display = 'inline-block';
            showRegisterModalButton.style.display = 'inline-block';
            logoutButton.style.display = 'none';
            slideList.innerHTML = '<p>ログインするとスライドが表示されます。</p>';
        }
    }

    // --- モーダル表示制御 ---
    showLoginModalButton.onclick = () => loginModal.style.display = 'block';
    showRegisterModalButton.onclick = () => registerModal.style.display = 'block';
    closeButtons.forEach(button => {
        button.onclick = () => {
            document.getElementById(button.dataset.modal).style.display = 'none';
        }
    });
    window.onclick = (event) => {
        if (event.target == loginModal) loginModal.style.display = 'none';
        if (event.target == registerModal) registerModal.style.display = 'none';
    };

    // --- 新規登録処理 ---
    registerButton.onclick = async () => {
        const username = document.getElementById('registerUsername').value;
        const password = document.getElementById('registerPassword').value;
        registerMessage.textContent = '';

        if (!username || !password) {
            registerMessage.textContent = 'ユーザー名とパスワードを入力してください。';
            return;
        }

        try {
            const response = await fetch('/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();
            if (response.ok) {
                registerMessage.textContent = '登録成功！ログインしてください。';
                registerModal.style.display = 'none';
            } else {
                registerMessage.textContent = `登録失敗: ${data.detail || '不明なエラー'}`;
            }
        } catch (error) {
            registerMessage.textContent = `エラー: ${error.message}`;
        }
    };

    // --- ログイン処理 ---
    loginButton.onclick = async () => {
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        loginMessage.textContent = '';

        if (!username || !password) {
            loginMessage.textContent = 'ユーザー名とパスワードを入力してください。';
            return;
        }

        try {
            // FastAPIの /auth/login は UserCreate を期待しているので、それに合わせる
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }) // UserCreateスキーマに合わせて送信
            });
            const data = await response.json(); // 常にJSONレスポンスを期待
            if (response.ok) {
                // 実際のアプリケーションでは、ここでサーバーからトークンを受け取る
                // このサンプルでは簡略化のため、ユーザー名でログイン状態を管理
                authToken = "fake-token"; // ダミートークン
                currentUsername = data.username; // ログイン成功時にユーザー名を取得
                localStorage.setItem('authToken', authToken);
                localStorage.setItem('username', currentUsername);
                loginMessage.textContent = 'ログイン成功！';
                loginModal.style.display = 'none';
                updateAuthUI();
            } else {
                loginMessage.textContent = `ログイン失敗: ${data.detail || 'ユーザー名またはパスワードが違います。'}`;
            }
        } catch (error) {
            loginMessage.textContent = `エラー: ${error.message}`;
        }
    };

    // --- ログアウト処理 ---
    logoutButton.onclick = () => {
        authToken = null;
        currentUsername = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('username');
        updateAuthUI();
        // 必要であれば /auth/logout を呼び出す (サーバーサイドでのセッション無効化など)
        // fetch('/auth/logout', { method: 'POST' });
    };

    // --- スライド一覧表示 ---
    async function loadUserSlides() {
        if (!authToken) { // ログインしていなければ何もしない
            slideList.innerHTML = '<p>ログインしてください。</p>';
            return;
        }
        slideList.innerHTML = '<p>スライドを読み込み中...</p>';
        try {
            // 注: 現在のバックエンドではユーザーに紐づくスライドを取得するエンドポイントが /slides/{user_id} のような形ではないため、
            // ここでは全スライドを取得する /slides を使用し、フロントエンドでフィルタリングするか、
            // バックエンドを修正して認証ユーザーのスライドのみを返すエンドポイントを用意する必要があります。
            // 新しいエンドポイント /users/me/slides を使用してスライドを取得
            const response = await fetch('/users/me/slides', {
                 method: 'GET',
                 headers: {
                    'Authorization': `Bearer ${authToken}`, // 将来的には実際のトークンを使用
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`スライドの読み込みに失敗: ${response.status} ${response.statusText}`);
            }
            const slides = await response.json();

            if (!Array.isArray(slides)) {
                console.error("取得したスライドデータが配列ではありません:", slides);
                slideList.innerHTML = '<p>スライドデータの形式が正しくありません。</p>';
                return;
            }

            if (slides.length === 0) {
                slideList.innerHTML = '<p>あなたのスライドはまだありません。</p>'; // メッセージを調整
                return;
            }

            slideList.innerHTML = ''; // ローディングメッセージをクリア
            slides.forEach(slide => {
                const slideElement = document.createElement('div');
                slideElement.classList.add('slide-item');
                // owner_id も表示してみる（デバッグ用、将来的には不要なら削除）
                slideElement.innerHTML = `
                    <h3>スライドID: ${slide.id} (Owner: ${slide.owner_id})</h3>
                    <p>内容: ${slide.slide_data.substring(0, 100)}${slide.slide_data.length > 100 ? '...' : ''}</p>
                    <button class="view-slide-button" data-slide-id="${slide.id}">表示</button>
                    <button class="delete-slide-button" data-slide-id="${slide.id}">削除</button>
                `;
                slideList.appendChild(slideElement);
            });

            // イベントリスナーを再設定 (スライド表示・削除)
            document.querySelectorAll('.view-slide-button').forEach(button => {
                button.onclick = () => alert(`スライドID: ${button.dataset.slideId} を表示します。(詳細表示機能は未実装)`);
            });
            document.querySelectorAll('.delete-slide-button').forEach(button => {
                button.onclick = () => deleteSlide(button.dataset.slideId);
            });

        } catch (error) {
            slideList.innerHTML = `<p>スライドの読み込みエラー: ${error.message}</p>`;
            console.error("スライド読み込みエラー:", error);
        }
    }

    // --- スライド削除 ---
    async function deleteSlide(slideId) {
        if (!authToken) {
            alert('削除するにはログインが必要です。');
            return;
        }
        if (!confirm(`スライドID: ${slideId} を本当に削除しますか？`)) return;

        try {
            const response = await fetch(`/slides/${slideId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${authToken}` } // 将来的なトークン認証
            });
            if (response.ok) {
                alert('スライドを削除しました。');
                loadUserSlides(); // スライドリストを再読み込み
            } else {
                const data = await response.json().catch(() => ({ detail: "不明なエラー" }));
                alert(`スライドの削除に失敗: ${data.detail}`);
            }
        } catch (error) {
            alert(`エラー: ${error.message}`);
        }
    }


    // --- ファイルアップロード ---
    const imageUploadInput = document.getElementById('imageUpload');
    const uploadImageButton = document.getElementById('uploadImageButton');
    const fontUploadInput = document.getElementById('fontUpload');
    const uploadFontButton = document.getElementById('uploadFontButton');
    const videoUploadInput = document.getElementById('videoUpload');
    const uploadVideoButton = document.getElementById('uploadVideoButton');

    async function uploadFile(fileInput, endpoint) {
        if (!authToken) {
            alert('アップロードするにはログインが必要です。');
            return;
        }
        const file = fileInput.files[0];
        if (!file) {
            alert('ファイルを選択してください。');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` }, // 将来的なトークン認証
                body: formData
            });
            const data = await response.json();
            if (response.ok) {
                alert(`ファイル「${data.filename}」をアップロードしました。`);
                fileInput.value = ''; // 入力をクリア
            } else {
                alert(`アップロード失敗: ${data.detail || '不明なエラー'}`);
            }
        } catch (error) {
            alert(`エラー: ${error.message}`);
        }
    }
    uploadImageButton.onclick = () => uploadFile(imageUploadInput, '/upload/image');
    uploadFontButton.onclick = () => uploadFile(fontUploadInput, '/upload/font');
    uploadVideoButton.onclick = () => uploadFile(videoUploadInput, '/upload/video');

    // --- スライド作成 ---
    const slideDataTextarea = document.getElementById('slideData');
    const createSlideButton = document.getElementById('createSlideButton');

    createSlideButton.onclick = async () => {
        if (!authToken) {
            alert('スライドを作成するにはログインが必要です。');
            return;
        }
        const slide_data = slideDataTextarea.value;
        if (!slide_data.trim()) {
            alert('スライドのコンテンツを入力してください。');
            return;
        }
        try {
            const response = await fetch('/slides', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}` // 将来的なトークン認証
                },
                body: JSON.stringify({ slide_data })
            });
            const data = await response.json();
            if (response.ok) {
                alert(`スライドID: ${data.id} を作成しました。`);
                slideDataTextarea.value = '';
                loadUserSlides(); // スライドリストを再読み込み
            } else {
                alert(`スライド作成失敗: ${data.detail || '不明なエラー'}`);
            }
        } catch (error) {
            alert(`エラー: ${error.message}`);
        }
    };

    // --- AIに質問 ---
    const aiPromptInput = document.getElementById('aiPrompt');
    const askAIButton = document.getElementById('askAIButton');
    const aiResponseDiv = document.getElementById('aiResponse');

    askAIButton.onclick = async () => {
        const prompt = aiPromptInput.value;
        if (!prompt.trim()) {
            alert('AIへの質問を入力してください。');
            return;
        }
        aiResponseDiv.textContent = 'AIが考え中...';
        try {
            // /ai/ask エンドポイントは AIPrompt スキーマを期待するため、JSONで送信
            const response = await fetch('/ai/ask', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}` // 将来的には認証も考慮
                },
                body: JSON.stringify({ prompt: prompt })
            });
            const data = await response.json();
            if (response.ok) {
                aiResponseDiv.textContent = data.response;
            } else {
                aiResponseDiv.textContent = `AI応答エラー: ${data.detail || '不明なエラー'}`;
            }
        } catch (error) {
            aiResponseDiv.textContent = `エラー: ${error.message}`;
        }
    };


    // 初期化処理
    updateAuthUI();

    // バックエンドの /slides がGETリクエストをサポートするように変更する必要があるため、
    // loadUserSlidesの呼び出しは、その修正後に行うか、現状POSTのままであれば
    // 別の方法（例えば、ユーザー登録・ログイン成功時に限定して呼び出すなど）を検討。
    // 現状は、認証状態が変わった時に呼び出すように updateAuthUI 内に配置。
});
