class PresentationManager {
    constructor(app) {
        this.app = app;
        this._presentationClickHandler = null;
        this._externalSession = null;
    }

    async startExternalDisplay() {
        // Presentation APIで外部ディスプレイに表示（ブラウザ差異を吸収）
        try {
            const anyNav = navigator;
            if (!('presentation' in anyNav)) {
                throw new Error('Presentation API not supported');
            }
            const url = new URL(window.location.href);
            url.hash = 'present'; // ビュー側で自動開始

            // Chromeの旧API: presentation.requestStart
            // 一部実装: presentation.requestSession
            // よって両方を条件分岐で試行
            let session = null;
            if (anyNav.presentation && typeof anyNav.presentation.requestStart === 'function') {
                session = await anyNav.presentation.requestStart(url.toString());
            } else if (anyNav.presentation && typeof anyNav.presentation.requestSession === 'function') {
                session = await anyNav.presentation.requestSession(url.toString());
            } else {
                throw new Error('Presentation API entrypoint not available');
            }

            this._externalSession = session;

            // セッションイベント（存在チェックしつつ）
            if (session) {
                if ('onconnect' in session) {
                    session.onconnect = () => {
                        if (window.developmentMode) console.log('Presentation session connected');
                    };
                }
                if ('onterminate' in session) {
                    session.onterminate = () => {
                        if (window.developmentMode) console.log('Presentation session terminated');
                        this._externalSession = null;
                    };
                }
            }
        } catch (e) {
            ErrorHandler.handle(e, 'presentation_external');
            ErrorHandler.showNotification('外部ディスプレイへの表示に失敗しました（ブラウザ未対応の可能性）', 'error');
        }
    }

    startPresentation() {
        // まずはフルスクリーンを試さずに「プレゼンモード」へ入って描画を行う（ポップアップで失敗しやすいため）
        document.body.classList.add('presentation-mode');

        // キーボード操作: Space/Enter/→/↓ 次、←/↑ 前、Esc 終了
        this._keyHandler = (e) => {
            const code = e.code || e.key;
            if (['Space', 'Enter', 'ArrowRight', 'ArrowDown'].includes(code)) {
                e.preventDefault();
                this._pauseAllMedia();
                this.changePresentationSlide(1);
            } else if (['ArrowLeft', 'ArrowUp'].includes(code)) {
                e.preventDefault();
                this._pauseAllMedia();
                this.changePresentationSlide(-1);
            } else if (code === 'Escape' || e.key === 'Esc') {
                e.preventDefault();
                this.stopPresentation();
            }
        };
        document.addEventListener('keydown', this._keyHandler, { capture: true });

        // まずはスライド描画とクリックハンドラを設定
        this.renderPresentationSlide();
        window.addEventListener('resize', this.renderPresentationSlide.bind(this));
        this._presentationClickHandler = (e) => {
            const rect = this.app.elements.presentationView.getBoundingClientRect();
            const x = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
            if (x < rect.left + rect.width / 2) {
                this._pauseAllMedia();
                this.changePresentationSlide(-1);
            } else {
                this._pauseAllMedia();
                this.changePresentationSlide(1);
            }
        };
        this.app.elements.presentationView.addEventListener('click', this._presentationClickHandler);

        // フルスクリーンは「同一ユーザー操作直後」のみ有効なブラウザが多い。
        // 親ウインドウのクリック由来でないポップアップでは拒否されやすいため、
        // 以下のフォールバック: 1) まずは非フルスクリーンで開始 2) 画面上に「全画面にする」ボタンを表示し、ユーザー操作で再試行
        const tryFullscreen = async () => {
            try {
                if (!document.fullscreenElement) {
                    await this.app.elements.presentationView.requestFullscreen();
                }
                // 成功時は案内ボタンを隠す
                const btn = document.getElementById('enter-fullscreen-hint');
                if (btn) btn.remove();
            } catch (e) {
                // 失敗してもプレゼンは継続。エラー通知は出し過ぎないためログのみ
                if (window.developmentMode) console.warn('Fullscreen request rejected in popup:', e);
            }
        };

        // ヒントボタンを動的に用意（存在しなければ作る）
        const ensureHintButton = () => {
            let btn = document.getElementById('enter-fullscreen-hint');
            if (!btn) {
                btn = document.createElement('button');
                btn.id = 'enter-fullscreen-hint';
                btn.textContent = '全画面にする';
                Object.assign(btn.style, {
                    position: 'fixed',
                    right: '16px',
                    top: '16px',
                    zIndex: 99999,
                    padding: '8px 12px'
                });
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    tryFullscreen();
                });
                document.body.appendChild(btn);
            }
        };

        // 親ウインドウ由来の「ユーザー操作直後」であればここで試行、それ以外はヒントボタンを表示してユーザーに委ねる
        // ポップアップ文脈では多くのブラウザで拒否されるため、常にボタンを出す運用に寄せる
        ensureHintButton();
    }

    stopPresentation() {
        document.body.classList.remove('presentation-mode');
        if (document.fullscreenElement) document.exitFullscreen();
        window.removeEventListener('resize', this.renderPresentationSlide.bind(this));
        // クリックイベント解除
        if (this._presentationClickHandler) {
            this.app.elements.presentationView.removeEventListener('click', this._presentationClickHandler);
            this._presentationClickHandler = null;
        }
        // キーボードイベント解除
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler, { capture: true });
            this._keyHandler = null;
        }
        // 念のためメディア停止
        this._pauseAllMedia();
    }

    changePresentationSlide(dir) {
        const { slides } = this.app.state.presentation;
        const curIdx = slides.findIndex(s => s.id === this.app.state.activeSlideId);
        let nextIdx = curIdx + dir;
        if (nextIdx >= 0 && nextIdx < slides.length) {
            this.app.setActiveSlide(slides[nextIdx].id);
            // 新しいスライドに到達後、対象メディアのみ再生（autoplayがtrueの要素）
            this._playAutoplayMedia();
            // 次のスライドを先読み
            this.preloadNextSlide(nextIdx); // 次のスライドを事前に読み込む
        }
    }

    preloadNextSlide(nextIdx) {
        const { slides } = this.app.state.presentation;
        const nextSlide = slides[nextIdx + 1]; // 現在のスライドの次
        if (!nextSlide) return;

        // 一時的なコンテナを作成し、そこに要素を生成
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px'; // 画面外に配置
        document.body.appendChild(tempContainer);

        nextSlide.elements.forEach(elData => {
            // 可能なら動画/音声のロードを開始
            if (elData.type === 'video' || elData.type === 'audio') {
                const media = el.querySelector(elData.type);
                if (media && typeof media.load === 'function') {
                    try { media.load(); } catch (e) { /* ignore */ }
                }
            }
            // アニメーションは事前読み込み時には適用しない
            const originalAnimation = elData.style.animation;
            elData.style.animation = '';
            const el = this.app.createElementDOM(elData);
            tempContainer.appendChild(el);
            elData.style.animation = originalAnimation; // 元に戻す

            // 動画要素の場合、ロードを開始
            if (elData.type === 'video') {
                const videoEl = el.querySelector('video');
                if (videoEl) {
                    videoEl.load(); // 動画のロードを開始
                }
            }
        });

        // 一時的なコンテナを削除 (要素はメモリにキャッシュされる)
        // ただし、DOM要素自体はキャッシュされないため、App.domElementCacheに依存する
        // App.domElementCacheはrenderSlideCanvasで管理されているため、ここではDOMから削除するだけで良い
        document.body.removeChild(tempContainer);
    }

    // 現在のプレゼン表示領域内のすべてのメディアを一時停止する
    _pauseAllMedia() {
        try {
            const container = this.app?.elements?.presentationSlideContainer || document;
            const medias = container.querySelectorAll('video, audio');
            medias.forEach(m => {
                try {
                    if (typeof m.pause === 'function') m.pause();
                    // 停止時に位置は維持（必要なら 0 に戻す場合は次行を有効化）
                    // m.currentTime = 0;
                } catch (_) {}
            });
        } catch (_) {}
    }

    // autoplay 指定のメディアのみ再生する（存在しなければ何もしない）
    _playAutoplayMedia() {
        try {
            const container = this.app?.elements?.presentationSlideContainer || document;
            const medias = container.querySelectorAll('video[autoplay], audio[autoplay]');
            medias.forEach(m => {
                try {
                    // ミュートされていないと自動再生がブロックされる場合があるため条件付きで再生
                    const playPromise = m.play?.();
                    if (playPromise && typeof playPromise.catch === 'function') {
                        playPromise.catch(() => {/* ブロックされても握りつぶし */});
                    }
                } catch (_) {}
            });
        } catch (_) {}
    }

    renderPresentationSlide() {
        const slide = this.app.getActiveSlide();
        if (!slide) return;
        const { presentationSlideContainer } = this.app.elements;
        const { settings } = this.app.state.presentation;
        presentationSlideContainer.innerHTML = '';
        const presW = this.app.elements.presentationView.clientWidth, presH = this.app.elements.presentationView.clientHeight;
        const presRatio = presW / presH, slideRatio = settings.width / settings.height;
        let sW = (presRatio > slideRatio) ? presH * slideRatio : presW;
        let scale = sW / settings.width;
        presentationSlideContainer.style.width = `${settings.width}px`;
        presentationSlideContainer.style.height = `${settings.height}px`;
        presentationSlideContainer.style.transform = `translate(-50%, -50%) scale(${scale})`;
        Object.assign(presentationSlideContainer.style, { position: 'absolute', left: '50%', top: '50%' });
        this.app.applyPageBackground(presentationSlideContainer); // 背景色を適用

        slide.elements.forEach(elData => {
            const el = this.app.createElementDOM(elData);

            // customCssをインラインスタイルとして適用
            if (elData.style.customCss) {
                el.style.cssText += elData.style.customCss;
            }

            // アニメーション付与
            if (elData.style.animation) {
                // CSS animation指定（例: "fadeIn 1s ease-out"）が渡る可能性があるため、
                // classList操作用には最初のトークンのみを使用する
                const animToken = String(elData.style.animation).trim().split(/\s+/)[0];
                el.classList.remove('animate__animated');
                if (animToken) el.classList.remove(animToken);
                void el.offsetWidth; // 強制再描画
                el.classList.add('animate__animated');
                if (animToken) el.classList.add(animToken);
                el.addEventListener('animationend', function handler() {
                    el.classList.remove('animate__animated');
                    if (animToken) el.classList.remove(animToken);
                    el.removeEventListener('animationend', handler);
                });
            }
            presentationSlideContainer.appendChild(el);

            // メディアの制御
            if (elData.type === 'video' || elData.type === 'audio') {
                const selector = elData.type === 'video' ? 'video' : 'audio';
                const mediaEl = el.querySelector(selector);
                if (mediaEl) {
                    // 現スライド描画時点では一旦停止（明示制御）
                    try { mediaEl.pause(); mediaEl.currentTime = mediaEl.currentTime; } catch (e) {}
                    // autoplay指定の要素は後段の _playAutoplayMedia で開始
                }
            }
        });

        // 描画直後にautoplay対象のみ再生
        this._playAutoplayMedia();
    }
}

window.PresentationManager = PresentationManager;