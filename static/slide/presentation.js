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
        }
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
        });
    }
}
window.PresentationManager = PresentationManager;