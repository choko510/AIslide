class IconManager {
    constructor(app) {
        this.app = app;
        this.faIconFuse = null;
        this.miIconFuse = null;
    }

    async loadIconData() {
        try {
            const response = await fetch('icons.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            this.app.config.fontAwesomeIcons = data.fontAwesomeIcons;
            this.app.config.materialIcons = data.materialIcons;

            // アイコンに英語名(クラス名から)をaliasプロパティとして追加
            this.app.config.fontAwesomeIcons.forEach(icon => {
                const cls = icon.class.split(' ')[1] || '';
                icon.alias = cls.replace('fa-', '');
            });
            this.app.config.materialIcons.forEach(icon => {
                icon.alias = icon.name.toLowerCase().replace(/ /g, '_');
            });
            // Fuse.js を使ったアイコンのあいまい検索インスタンス
            this.faIconFuse = new Fuse(this.app.config.fontAwesomeIcons, {
                keys: ['name', 'category', 'class', 'alias', 'keywords'],
                threshold: 0.4,
                ignoreLocation: true
            });
            this.miIconFuse = new Fuse(this.app.config.materialIcons, {
                keys: ['name', 'category', 'class', 'alias', 'keywords'],
                threshold: 0.4,
                ignoreLocation: true
            });

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
        const searchInput = this.app.elements[`${iconType}IconSearchInput`];
        const categoryFilter = this.app.elements[`${iconType}IconCategoryFilter`];
        const styleSelect = document.getElementById(`${iconType}-style-select`);
        const listContainer = this.app.elements[`${iconType}IconListContainer`];

        if (searchInput) {
            searchInput.addEventListener('input', e => {
                const activeCategoryButton = categoryFilter.querySelector('button.active');
                const category = activeCategoryButton ? activeCategoryButton.dataset.category : 'すべて';
                this.renderIconList(iconType, e.target.value, category);
            });
        }

        if (styleSelect) {
            styleSelect.addEventListener('change', () => {
                const activeCategoryButton = categoryFilter.querySelector('button.active');
                const category = activeCategoryButton ? activeCategoryButton.dataset.category : 'すべて';
                this.renderIconList(iconType, searchInput.value, category);
            });
        }

        if (categoryFilter) {
            this.initCategoryFilters(iconType);
        }

        if (listContainer) {
            listContainer.addEventListener('click', e => {
                const iconDiv = e.target.closest('.icon-item');
                if (iconDiv && iconDiv.dataset.iconClass) {
                    this.addIconElement(iconType, iconDiv.dataset.iconClass);
                }
            });
        }
    }

    initCategoryFilters(iconType) {
        let categories;
        let filterContainer;
        let activeElements;

        if (iconType === 'fa') {
            categories = ['すべて', ...new Set(this.app.config.fontAwesomeIcons.map(icon => icon.category))];
            filterContainer = this.app.elements.faIconCategoryFilter;
            activeElements = this.app.elements.faIconSearchInput;
        } else if (iconType === 'mi') {
            categories = ['すべて', ...new Set(this.app.config.materialIcons.map(icon => icon.category))];
            filterContainer = this.app.elements.miIconCategoryFilter;
            activeElements = this.app.elements.miIconSearchInput;
        } else {
            return; // 未知のアイコンタイプ
        }

        filterContainer.innerHTML = '';

        categories.forEach(category => {
            const button = document.createElement('button');
            button.textContent = category;
            button.dataset.category = category;
            Object.assign(button.style, {
                padding: '4px 10px',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: '12px'
            });

            if (category === 'すべて') {
                button.classList.add('active');
                button.style.backgroundColor = 'var(--primary-color)';
                button.style.color = 'white';
                button.style.borderColor = 'var(--primary-color)';
            }

            button.addEventListener('click', () => {
                filterContainer.querySelectorAll('button').forEach(btn => {
                    btn.classList.remove('active');
                    btn.style.backgroundColor = 'transparent';
                    btn.style.color = 'inherit';
                    btn.style.borderColor = 'var(--border-color)';
                });
                button.classList.add('active');
                button.style.backgroundColor = 'var(--primary-color)';
                button.style.color = 'white';
                button.style.borderColor = 'var(--primary-color)';

                activeElements.value = ''; // カテゴリ変更時に検索をクリア
                this.renderIconList(iconType, '', category);
            });
            filterContainer.appendChild(button);
        });
    }

    renderIconList(iconType, searchTerm = '', category = 'すべて') {
        let icons;
        let iconListContainer;
        let fuseInstance;

        if (iconType === 'fa') {
            icons = this.app.config.fontAwesomeIcons;
            iconListContainer = this.app.elements.faIconListContainer;
            fuseInstance = this.faIconFuse;
        } else if (iconType === 'mi') {
            icons = this.app.config.materialIcons;
            iconListContainer = this.app.elements.miIconListContainer;
            fuseInstance = this.miIconFuse;
        } else {
            return;
        }

        if (!iconListContainer) return;
        iconListContainer.innerHTML = '';

        let filteredIcons = icons;
        if (searchTerm) {
            filteredIcons = fuseInstance.search(searchTerm).map(r => r.item);
        }

        // カテゴリフィルタリングを適用
        filteredIcons = filteredIcons.filter(icon => {
            return category === 'すべて' || icon.category === category;
        });

        filteredIcons.forEach(icon => {
            const iconDiv = document.createElement('div');
            iconDiv.className = 'icon-item';
            iconDiv.dataset.iconClass = icon.class;
            iconDiv.dataset.iconType = iconType;
            iconDiv.style.padding = '10px';
            iconDiv.style.border = '1px solid var(--border-color)';
            iconDiv.style.borderRadius = 'var(--border-radius)';
            iconDiv.style.cursor = 'pointer';
            iconDiv.style.textAlign = 'center';
            iconDiv.style.minWidth = '60px';

            if (iconType === 'fa') {
                let stylePrefix = 'fas';
                const styleSelect = document.getElementById('fa-style-select');
                if (styleSelect) stylePrefix = styleSelect.value;
                const faClass = icon.class.replace(/^(fas|far|fal|fat)\s/, stylePrefix + ' ');
                const iTag = document.createElement('i');
                iTag.className = `${faClass} fa-2x`;
                iTag.style.pointerEvents = 'none';
                iconDiv.appendChild(iTag);
            } else if (iconType === 'mi') {
                let stylePrefix = 'material-icons';
                const styleSelect = document.getElementById('mi-style-select');
                if (styleSelect) stylePrefix = styleSelect.value;
                const spanTag = document.createElement('span');
                spanTag.className = `${stylePrefix}`;
                spanTag.textContent = icon.class; // Material Icons uses the class name as text content
                spanTag.style.fontSize = '2em'; // Adjust size for visibility
                spanTag.style.pointerEvents = 'none';
                iconDiv.appendChild(spanTag);
            }
            iconListContainer.appendChild(iconDiv);
        });
    }

    addIconElement(iconType, iconClass, style = {}) {
        const slide = this.app.getActiveSlide();
        if (!slide) return;

        const defaultFontSize = 48;
        const fontSize = style.fontSize || defaultFontSize;
        const canvasWidth = this.app.state.presentation.settings.width || CANVAS_WIDTH;
        const canvasHeight = this.app.state.presentation.settings.height || CANVAS_HEIGHT;

        const newEl = {
            id: this.app.generateId('el'),
            type: 'icon',
            iconType: iconType, // Store icon type (fa or mi)
            content: iconClass, // Class string for FA, class name for MI
            style: {
                top: 20,
                left: 20,
                width: (fontSize / canvasWidth) * 100,
                height: (fontSize / canvasHeight) * 100,
                rotation: 0,
                color: '#212529',
                fontSize: fontSize,
                animation: '',
                ...style // 渡されたスタイルで上書き
            }
        };

        if (iconType === 'mi') {
            // For Material Icons, also store the actual icon name (content for span tag)
            newEl.miContent = iconClass;
            // Material Iconsのスタイルを適用
            const miStyleSelect = document.getElementById('mi-style-select');
            if (miStyleSelect) {
                newEl.content = miStyleSelect.value; // e.g., "material-icons-outlined"
            }
        }

        this.app.addIconElement(iconType, iconClass, style);
        // App.addIconElement 内で selectedElementIds の更新、saveState、render が行われる
    }
    
    updateIconStyle(element, newStylePrefix) {
        this.app.stateManager._saveToHistory();
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
}
window.IconManager = IconManager;