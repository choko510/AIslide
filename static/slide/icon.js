class IconManager {
    constructor(app) {
        this.app = app;
        this.faIconFuse = null;
        this.miIconFuse = null;

        // 検索パフォーマンス最適化用の状態
        this._faFuseReady = false;
        this._miFuseReady = false;
        this._faCache = new Map(); // key: `${term}::${category}`
        this._miCache = new Map();

        // リスト仮想化/段階表示
        this._renderLimit = 100;      // 初回表示件数
        this._renderStep = 100;       // 追加表示件数
        this._faLastState = { term: '', category: 'すべて', items: [], offset: 0 };
        this._miLastState = { term: '', category: 'すべて', items: [], offset: 0 };
    }

    async loadIconData() {
        try {
            const response = await fetch('/static/slide/icons.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            this.app.config.fontAwesomeIcons = data.fontAwesomeIcons || [];
            this.app.config.materialIcons = data.materialIcons || [];

            // alias 付与（検索キー縮小に合わせる）
            this.app.config.fontAwesomeIcons.forEach(icon => {
                const cls = icon.class.split(' ')[1] || '';
                icon.alias = cls.replace('fa-', '');
            });
            this.app.config.materialIcons.forEach(icon => {
                icon.alias = (icon.name || '').toLowerCase().replace(/ /g, '_');
            });

            // Fuse は遅延構築（初回検索時に作成/再利用）
            this._faFuseReady = false;
            this._miFuseReady = false;

        } catch (error) {
            console.error("Failed to load icon data:", error);
            // エラー発生時のフォールバックとして空の配列を設定
            this.app.config.fontAwesomeIcons = [];
            this.app.config.materialIcons = [];
        }
    }

    bindEvents() {
        // Font Awesome / Material Icons切り替え
        this._bindIconToggleButtons();
        
        // アイコンサイドバーイベント
        this._bindIconSidebarEvents('fa');
        this._bindIconSidebarEvents('mi');

        // 統一検索欄と統一カテゴリのバインド
        this._bindUnifiedIconControls();

        // 初期状態: トグルは見た目としてアクティブに（将来的にフィルタ用途に流用可）
        const faToggleButton = document.getElementById('fa-toggle-btn');
        const miToggleButton = document.getElementById('mi-toggle-btn');
        if (faToggleButton) faToggleButton.classList.add('active');
        if (miToggleButton) miToggleButton.classList.add('active');

        // 統一カテゴリ生成（ドロップダウン）と初期描画
        this.initUnifiedCategorySelect();
        this._bindFilterPanelToggle();
        const term = '';
        const category = 'すべて';
        this.renderUnifiedIconList(term, category, { reset: true });
    }

    _bindIconToggleButtons() {
        const faToggleButton = document.getElementById('fa-toggle-btn');
        const miToggleButton = document.getElementById('mi-toggle-btn');
        const fontAwesomeSection = document.getElementById('font-awesome-section');
        const materialIconsSection = document.getElementById('material-icons-section');

        if (faToggleButton && miToggleButton && fontAwesomeSection && materialIconsSection) {
            faToggleButton.addEventListener('click', () => {
                faToggleButton.classList.add('active');
                miToggleButton.classList.remove('active');
                fontAwesomeSection.style.display = 'block';
                materialIconsSection.style.display = 'none';
                this.initCategoryFilters('fa');
                this.renderIconList('fa');
            });

            miToggleButton.addEventListener('click', () => {
                miToggleButton.classList.add('active');
                faToggleButton.classList.remove('active');
                materialIconsSection.style.display = 'block';
                fontAwesomeSection.style.display = 'none';
                this.initCategoryFilters('mi');
                this.renderIconList('mi');
            });
        }
    }

    _bindIconSidebarEvents(iconType) {
        // 統一検索・統一カテゴリに依存するため、ここではスタイルセレクトとクリックのみ個別設定
        // 統一セレクタを参照
        const styleSelect = document.getElementById(iconType === 'fa' ? 'fa-style-select-unified' : 'mi-style-select-unified');
        const listContainer = this.app.elements[`${iconType}IconListContainer`];

        if (styleSelect) {
            styleSelect.addEventListener('change', () => {
                const select = document.getElementById('icon-category-select');
                const category = select?.value || 'すべて';
                const term = document.getElementById('icon-search-input')?.value || '';
                this.renderUnifiedIconList(term, category, { reset: true });
            });
        }

        if (listContainer) {
            listContainer.addEventListener('click', e => {
                const iconDiv = e.target.closest('.icon-item');
                if (iconDiv && iconDiv.dataset.iconClass) {
                    // MI の場合は miContent(実アイコン名)も保持しているので渡す
                    const iconClass = iconDiv.dataset.iconClass;
                    const miContent = iconDiv.dataset.miContent; // undefined for FA
                    this.addIconElement(iconType, iconClass, { miContent });
                }
            });
        }
    }

    // 既存の個別カテゴリ初期化は使用しない（後方互換で残すが未使用）
    initCategoryFilters(iconType) {
        // no-op: 統一カテゴリを使用
        return;
    }

    initUnifiedCategorySelect() {
        const select = document.getElementById('icon-category-select');
        if (!select) return;

        const faCats = new Set(this.app.config.fontAwesomeIcons.map(icon => icon.category).filter(Boolean));
        const miCats = new Set(this.app.config.materialIcons.map(icon => icon.category).filter(Boolean));
        const categoriesSet = new Set(['すべて', ...faCats, ...miCats]);
        const categories = Array.from(categoriesSet);
        const others = categories.filter(c => c !== 'すべて').sort((a,b)=> a.localeCompare(b,'ja'));
        const finalCats = ['すべて', ...others];

        select.innerHTML = '';
        finalCats.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            select.appendChild(opt);
        });

        select.addEventListener('change', () => {
            const term = document.getElementById('icon-search-input')?.value || '';
            const category = select.value || 'すべて';
            this.renderUnifiedIconList(term, category, { reset: true });
        });
    }

    _bindUnifiedIconControls() {
        const searchInput = document.getElementById('icon-search-input');
        const select = document.getElementById('icon-category-select');
        const providerFa = document.getElementById('provider-fa');
        const providerMi = document.getElementById('provider-mi');

        // デバウンス
        const debounce = (fn, delay = 300) => {
            let t;
            return (...args) => {
                clearTimeout(t);
                t = setTimeout(() => fn.apply(this, args), delay);
            };
        };

        const trigger = () => {
            const value = searchInput?.value || '';
            const category = select?.value || 'すべて';
            this.renderUnifiedIconList(value, category, { reset: true });
        };

        if (searchInput) {
            const handler = debounce(() => trigger(), 300);
            searchInput.addEventListener('input', handler);
        }
        if (providerFa) providerFa.addEventListener('change', trigger);
        if (providerMi) providerMi.addEventListener('change', trigger);
    }

    // 検索キー縮小版の Fuse オプション
    _getFuseOptions() {
        return {
            keys: ['name', 'alias', 'keywords'],
            threshold: 0.35,
            ignoreLocation: true
        };
    }

    async _ensureFuse(iconType, pool) {
        if (iconType === 'fa') {
            if (!this._faFuseReady) {
                this.faIconFuse = new Fuse(pool, this._getFuseOptions());
                this._faFuseReady = true;
            }
        } else {
            if (!this._miFuseReady) {
                this.miIconFuse = new Fuse(pool, this._getFuseOptions());
                this._miFuseReady = true;
            }
        }
    }

    renderIconList(iconType, searchTerm = '', category = 'すべて', options = { reset: false, target: null }) {
        let icons;
        let iconListContainer;
        let fuseInstance;
        let cache;
        let state;

        if (iconType === 'fa') {
            icons = this.app.config.fontAwesomeIcons;
            iconListContainer = options.target || document.getElementById('icon-list-container');
            fuseInstance = this.faIconFuse;
            cache = this._faCache;
            state = this._faLastState;
        } else if (iconType === 'mi') {
            icons = this.app.config.materialIcons;
            iconListContainer = options.target || document.getElementById('icon-list-container');
            fuseInstance = this.miIconFuse;
            cache = this._miCache;
            state = this._miLastState;
        } else {
            return;
        }

        if (!iconListContainer) return;

        // カテゴリ先フィルタ
        let pool = category === 'すべて' ? icons : icons.filter(i => i.category === category);

        // 検索なしなら Fuse 不使用
        let result = pool;
        const cacheKey = `${searchTerm}::${category}`;
        if (searchTerm && searchTerm.trim()) {
            // キャッシュ確認
            if (cache.has(cacheKey)) {
                result = cache.get(cacheKey);
            } else {
                // 遅延構築（初回のみ）
                if (!fuseInstance) {
                    this._ensureFuse(iconType, pool);
                    fuseInstance = iconType === 'fa' ? this.faIconFuse : this.miIconFuse;
                } else {
                    // データ本体は変わらない前提。カテゴリで事前絞り込みのため createIndex せず直接検索対象を pool にする
                    // Fuse は初期配列で構築されるため、別カテゴリでは精度が下がる可能性がある。
                    // シンプル化のため、カテゴリ変化時は再構築する。
                    const lastCategory = (iconType === 'fa' ? this._faLastState.category : this._miLastState.category);
                    if (lastCategory !== category) {
                        this._ensureFuse(iconType, pool);
                        fuseInstance = iconType === 'fa' ? this.faIconFuse : this.miIconFuse;
                    }
                }
                result = fuseInstance.search(searchTerm).map(r => r.item);
                cache.set(cacheKey, result);
            }
        }

        // ステート更新（offset リセット or 継続）
        if (options && options.reset) {
            state.term = searchTerm;
            state.category = category;
            state.items = result;
            state.offset = 0;
        } else {
            // カテゴリ/検索語が変わっていればリセット
            if (state.term !== searchTerm || state.category !== category) {
                state.term = searchTerm;
                state.category = category;
                state.items = result;
                state.offset = 0;
            } else {
                state.items = result;
            }
        }

        // 描画
        const start = 0;
        const end = Math.min(state.items.length, (state.offset || 0) + this._renderLimit);
        const slice = state.items.slice(start, end);

        // 統合描画のときは、FA描画のタイミングでクリアし、MI描画では追記する
        if (!options || options.reset || iconType === 'fa') {
            iconListContainer.innerHTML = '';
        }

        const frag = document.createDocumentFragment();

        // サイドバー幅に応じた動的グリッド算出
        const computeGrid = () => {
            const containerWidth = iconListContainer.clientWidth || 320;
            const minItem = 64;   // アイテム最小幅
            const maxItem = 120;  // アイテム最大幅
            const gap = 8;

            let columns = Math.max(1, Math.floor(containerWidth / minItem));
            // 列数が少なすぎてアイテム幅が大きくなりすぎる場合は列数を増やす
            while (columns < 12 && (containerWidth / columns) > maxItem) {
                columns++;
            }
            const itemWidth = Math.floor((containerWidth - (gap * (columns - 1))) / columns);
            return { columns, itemWidth, gap };
        };

        const grid = computeGrid();

        // コンテナをフレックス化（wrap + gap）。中央寄せ/行末余白を解消
        iconListContainer.style.display = 'flex';
        iconListContainer.style.flexWrap = 'wrap';
        iconListContainer.style.alignItems = 'stretch';
        iconListContainer.style.justifyContent = 'flex-start';
        iconListContainer.style.columnGap = grid.gap + 'px';
        iconListContainer.style.rowGap = grid.gap + 'px';

        slice.forEach(icon => {
            const iconDiv = document.createElement('div');
            iconDiv.className = 'icon-item';
            iconDiv.dataset.iconClass = icon.class;
            iconDiv.dataset.iconType = iconType;

            // ベースの見た目
            iconDiv.style.padding = '10px';
            iconDiv.style.border = '1px solid var(--border-color)';
            iconDiv.style.borderRadius = 'var(--border-radius)';
            iconDiv.style.cursor = 'pointer';
            iconDiv.style.textAlign = 'center';
            iconDiv.style.boxSizing = 'border-box';

            // Flex 子要素としての幅指定
            iconDiv.style.flex = `0 1 ${grid.itemWidth}px`;
            iconDiv.style.maxWidth = grid.itemWidth + 'px';
            iconDiv.style.minWidth = Math.max(56, Math.min(grid.itemWidth, 140)) + 'px';

            if (iconType === 'fa') {
                let stylePrefix = 'fas';
                const styleSelect = document.getElementById('fa-style-select-unified');
                if (styleSelect) stylePrefix = styleSelect.value;
                const faClass = icon.class.replace(/^(fas|far|fal|fat)\s/, stylePrefix + ' ');
                const iTag = document.createElement('i');
                iTag.className = `${faClass}`;
                // アイテム幅に応じてフォントサイズをスケール（Flex幅で再計算）
                const widthPx = grid.itemWidth;
                const scaleEm = Math.max(1.2, Math.min(2.0, (widthPx / 80) * 2));
                iTag.style.fontSize = `${scaleEm}em`;
                iTag.style.pointerEvents = 'none';
                iconDiv.appendChild(iTag);
            } else if (iconType === 'mi') {
                // style class は content、アイコン名は miContent として dataset に格納
                let stylePrefix = 'material-icons';
                const styleSelect = document.getElementById('mi-style-select-unified');
                if (styleSelect) stylePrefix = styleSelect.value;
                const spanTag = document.createElement('span');
                spanTag.className = `${stylePrefix}`;
                spanTag.textContent = icon.class; // ここは実アイコン名（miContent）
                iconDiv.dataset.miContent = icon.class;
                const widthPx = grid.itemWidth;
                const px = Math.max(20, Math.min(34, Math.floor(widthPx * 0.34)));
                spanTag.style.fontSize = `${px}px`;
                spanTag.style.pointerEvents = 'none';
                iconDiv.appendChild(spanTag);
            }
            frag.appendChild(iconDiv);
        });

        // Flex 化のためそのまま追加
        iconListContainer.appendChild(frag);

        // もっと見るボタン（統合表示で1つだけ）
        if (iconType === 'mi') {
            const faEnd = Math.min(this._faLastState.items.length, (this._faLastState.offset || 0) + this._renderLimit);
            const miEnd = Math.min(this._miLastState.items.length, (this._miLastState.offset || 0) + this._renderLimit);
            const total = this._faLastState.items.length + this._miLastState.items.length;
            const shown = faEnd + miEnd;
            if (shown < total) {
                const moreBtn = document.createElement('button');
                moreBtn.textContent = `さらに表示 (${Math.min(this._renderStep, total - shown)}件)`;
                moreBtn.className = 'icon-more-btn';
                moreBtn.addEventListener('click', () => {
                    this._faLastState.offset = faEnd;
                    this._miLastState.offset = miEnd;
                    this._renderLimit += this._renderStep;
                    this.renderUnifiedIconList(state.term, state.category, { reset: false });
                });
                iconListContainer.appendChild(moreBtn);
            } else {
                this._renderLimit = 100;
            }
        }

        // サイドバー幅変化に応じて再レイアウト（統合描画を再実行）
        if (!this._iconResizeObserver) {
            this._iconResizeScheduled = false;
            this._iconResizeInRender = false;
            this._lastIconContainerSize = { w: iconListContainer.clientWidth, h: iconListContainer.clientHeight };

            this._iconResizeObserver = new ResizeObserver(() => {
                const curW = iconListContainer.clientWidth;
                const curH = iconListContainer.clientHeight;
                // 直近と同一サイズならスキップ（自身のDOM更新での振動を止める）
                if (this._lastIconContainerSize &&
                    this._lastIconContainerSize.w === curW &&
                    this._lastIconContainerSize.h === curH) {
                    return;
                }
                if (this._iconResizeInRender) return; // 再描画中の自己再起を抑止
                if (this._iconResizeScheduled) return;

                this._iconResizeScheduled = true;
                this._iconResizeRAF = requestAnimationFrame(() => {
                    this._iconResizeScheduled = false;
                    // 再描画直前に最新サイズを記録
                    this._lastIconContainerSize = { w: iconListContainer.clientWidth, h: iconListContainer.clientHeight };
                    const term = document.getElementById('icon-search-input')?.value || '';
                    const select = document.getElementById('icon-category-select');
                    const category = select?.value || 'すべて';

                    // 再描画中フラグON
                    this._iconResizeInRender = true;
                    try {
                        // 一時的に監視解除してから再描画（無駄な発火を避ける）
                        try { this._iconResizeObserver.unobserve(iconListContainer); } catch(e) {}
                        this.renderUnifiedIconList(term, category, { reset: false });
                    } finally {
                        // 再監視
                        try { this._iconResizeObserver.observe(iconListContainer); } catch(e) {}
                        this._iconResizeInRender = false;
                        // 再描画後の実サイズを保存（この値と一致する限り以降は発火しない）
                        this._lastIconContainerSize = { w: iconListContainer.clientWidth, h: iconListContainer.clientHeight };
                    }
                });
            });
        } else {
            // 既存rAFが残っていればキャンセルして最新イベントで上書き
            if (this._iconResizeRAF) {
                cancelAnimationFrame(this._iconResizeRAF);
                this._iconResizeRAF = null;
            }
        }
        // 重複 observe を避けるため一旦 unobserve してから observe
        try { this._iconResizeObserver.unobserve(iconListContainer); } catch(e) {}
        this._iconResizeObserver.observe(iconListContainer);
    }

    addIconElement(iconType, iconClass, style = {}) {
        // iconClass: FA -> "fas fa-xxx" 等, MI -> 実アイコン名（例: "home"）
        const slide = this.app.getActiveSlide();
        if (!slide) return;

        if (iconType === 'mi') {
            // Material Icons は content=スタイルクラス, miContent=実アイコン名 で保存する
            const miStyleSelect = document.getElementById('mi-style-select-unified');
            const contentClass = miStyleSelect ? miStyleSelect.value : 'material-icons';
            const miName = style?.miContent || iconClass; // 実アイコン名
            const normalizedStyle = { ...style, miContent: miName };
            // 既に style.miContent に入っている場合でも保持し、第二引数には contentClass（クラス）を渡す
            this.app.addIconElement('mi', contentClass, normalizedStyle);
            return;
        }
        // Font Awesome はそのままクラス文字列を渡す
        this.app.addIconElement('fa', iconClass, style);
    }
    
    updateIconStyle(element, newStylePrefix) {
        if (element.iconType === 'fa') {
            // Font Awesomeの場合、クラス名を更新
            element.content = element.content.replace(/^(fas|far|fal|fat)\s/, newStylePrefix + ' ');
        } else if (element.iconType === 'mi') {
            // Material Iconsの場合、クラス名を更新 (miContentはそのまま)
            element.content = newStylePrefix;
        }
        this.app.saveState();
        this.app.render();
    }
    // 統合描画のためのヘルパー
    renderUnifiedIconList(searchTerm = '', category = 'すべて', options = { reset: true }) {
        const container = document.getElementById('icon-list-container');
        if (!container) return;

        // プロバイダフィルタ
        const useFa = document.getElementById('provider-fa')?.checked !== false;
        const useMi = document.getElementById('provider-mi')?.checked !== false;

        // 選択状況に応じて描画
        if (useFa && useMi) {
            this.renderIconList('fa', searchTerm, category, { reset: true, target: container });
            this.renderIconList('mi', searchTerm, category, { reset: false, target: container });
        } else if (useFa) {
            this.renderIconList('fa', searchTerm, category, { reset: true, target: container });
        } else if (useMi) {
            this.renderIconList('mi', searchTerm, category, { reset: true, target: container });
        } else {
            container.innerHTML = '';
        }
    }
    _bindFilterPanelToggle() {
        const toggleBtn = document.getElementById('icon-filter-toggle');
        const panel = document.getElementById('icon-filter-panel');
        if (!toggleBtn || !panel) return;

        toggleBtn.addEventListener('click', () => {
            const open = panel.style.display !== 'none';
            panel.style.display = open ? 'none' : 'block';
            toggleBtn.setAttribute('aria-expanded', String(!open));
        });
    }
}
window.IconManager = IconManager;