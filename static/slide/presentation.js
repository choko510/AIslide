class PresentationManager {
    constructor(app) {
        this.app = app;
        this._presentationClickHandler = null;
    }

    startPresentation() {
        document.body.classList.add('presentation-mode');
        this.app.elements.presentationView.requestFullscreen().catch(() => {
            alert('フルスクリーンモードの開始に失敗しました。');
            this.stopPresentation();
        });
        this.renderPresentationSlide();
        window.addEventListener('resize', this.renderPresentationSlide.bind(this));
        // クリックで次のスライド
        this._presentationClickHandler = (e) => {
            const rect = this.app.elements.presentationView.getBoundingClientRect();
            const x = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
            if (x < rect.left + rect.width / 2) {
                this.changePresentationSlide(-1);
            } else {
                this.changePresentationSlide(1);
            }
        };
        this.app.elements.presentationView.addEventListener('click', this._presentationClickHandler);
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
    }

    changePresentationSlide(dir) {
        const { slides } = this.app.state.presentation;
        const curIdx = slides.findIndex(s => s.id === this.app.state.activeSlideId);
        let nextIdx = curIdx + dir;
        if (nextIdx >= 0 && nextIdx < slides.length) {
            this.app.setActiveSlide(slides[nextIdx].id);
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
                el.classList.remove('animate__animated', elData.style.animation);
                void el.offsetWidth; // 強制再描画
                el.classList.add('animate__animated', elData.style.animation);
                el.addEventListener('animationend', function handler() {
                    el.classList.remove('animate__animated', elData.style.animation);
                    el.removeEventListener('animationend', handler);
                });
            }
            presentationSlideContainer.appendChild(el);

            // 動画要素の場合、再生を開始
            if (elData.type === 'video') {
                const videoEl = el.querySelector('video');
                if (videoEl && elData.content.autoplay) { // autoplayがtrueの場合のみ再生
                    videoEl.play().catch(error => {
                        console.warn('動画の自動再生に失敗しました:', error);
                        // ユーザー操作なしで自動再生がブロックされた場合、再生ボタンを表示するなどの代替手段を検討
                    });
                }
            }
        });
    }
}

window.PresentationManager = PresentationManager;