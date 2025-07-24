// ColorPicker.js
// カスタムカラーピッカーコンポーネント

export class ColorPicker {
    constructor(containerOrId, initialColor, onChangeCallback, options = {}) {
        this.isInline = typeof containerOrId !== 'string';
        
        if (this.isInline) {
            this.container = containerOrId;
            // インラインモードの場合、コンテナは空にしておく
            this.container.innerHTML = '';
            this.id = `color-picker-${Date.now()}`;
        } else {
            this.container = null;
            this.id = containerOrId;
        }

        this.onChangeCallback = onChangeCallback;
        this.options = {
            showEyedropper: options.showEyedropper !== false,
            showPalette: options.showPalette !== false,
            showReset: options.showReset !== false,
            defaultColor: options.defaultColor || '#000000FF',
            paletteKey: options.paletteKey || 'defaultColorPalette',
            title: options.title || 'カラーピッカー'
        };

        this.elements = {};
        this.isDragging = false;
        this.isHueDragging = false;
        this.isAlphaDragging = false;
        this.isWindowDragging = false;
        this.dragStartPos = { x: 0, y: 0 };

        this.colorMode = 'solid'; // 'solid' or 'gradient'
        this.gradient = {
            type: 'linear',
            angle: 90,
            stops: [
                { color: { r: 0, g: 0, b: 0, a: 1 }, position: 0 },
                { color: { r: 255, g: 255, b: 255, a: 1 }, position: 100 }
            ]
        };
        this.activeStopIndex = 0;

        this._parseInitialColor(initialColor);
        this.currentColor = this.gradient.stops[this.activeStopIndex].color;
        
        this.palette = this._loadPalette();

        // ウィンドウが既に存在するか確認
        const existingElement = document.getElementById(this.id);
        if (!existingElement || this.isInline) {
            this._render();
            this._bindEvents();
        } else {
            this.elements.window = existingElement;
            this._queryElements();
            this._bindEvents();
        }
        
        this._updateUI();
    }
    
    _parseInitialColor(colorString) {
        if (typeof colorString === 'string' && colorString.includes('gradient')) {
            this.colorMode = 'gradient';
            // グラデーション文字列のパースは後で実装
        } else {
            this.colorMode = 'solid';
            const solidColor = this._parseColor(colorString || this.options.defaultColor);
            this.gradient.stops = [
                { color: { ...solidColor }, position: 0 },
                { color: { r: 255, g: 255, b: 255, a: 1 }, position: 100 }
            ];
        }
        this.activeStopIndex = 0;
        this.currentColor = this.gradient.stops[0].color;
    }

    _parseColor(colorString) {
        if (typeof colorString !== 'string') return { r: 0, g: 0, b: 0, a: 1 };
        // HEX to RGBA
        if (colorString.startsWith('#')) {
            let hex = colorString.slice(1);
            if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1;
            return { r, g, b, a };
        }
        // RGBA string to RGBA object
        const rgbaMatch = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (rgbaMatch) {
            return {
                r: parseInt(rgbaMatch[1]),
                g: parseInt(rgbaMatch[2]),
                b: parseInt(rgbaMatch[3]),
                a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1
            };
        }
        // Fallback to black
        return { r: 0, g: 0, b: 0, a: 1 };
    }

    _toRgbaString(color) {
        return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
    }

    _toHexString(color, includeAlpha = true) {
        const toHex = (c) => {
            const hex = Math.round(c).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        let hex = `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
        if (includeAlpha && color.a !== 1) {
            hex += toHex(color.a * 255);
        }
        return hex.toUpperCase();
    }
    
    _toGradientString() {
        const stopsString = this.gradient.stops
            .map(stop => `${this._toRgbaString(stop.color)} ${stop.position}%`)
            .join(', ');
        return `linear-gradient(${this.gradient.angle}deg, ${stopsString})`;
    }

    _hsvToRgb(h, s, v) {
        let r, g, b;
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);

        switch (i % 6) {
            case 0: r = v, g = t, b = p; break;
            case 1: r = q, g = v, b = p; break;
            case 2: r = p, g = v, b = t; break;
            case 3: r = p, g = q, b = v; break;
            case 4: r = t, g = p, b = v; break;
            case 5: r = v, g = p, b = q; break;
        }
        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    }

    _rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, v = max;

        const d = max - min;
        s = max === 0 ? 0 : d / max;

        if (max === min) {
            h = 0; // achromatic
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h, s, v };
    }

    _render() {
        const windowClass = this.isInline ? 'color-picker-inline' : 'color-picker-window';
        const windowStyle = this.isInline ? '' : 'style="display: none;"';
        const headerHTML = this.isInline ? '' : `
            <div class="color-picker-header">
                <span class="color-picker-title">${this.options.title}</span>
                <button class="color-picker-close-btn">&times;</button>
            </div>`;

        const windowHTML = `
            <div class="${windowClass}" id="${this.id}" ${windowStyle}>
                ${headerHTML}
                <div class="color-picker-content">
                    <div class="color-picker-tabs">
                        <button class="color-picker-tab active" data-mode="solid">単色</button>
                        <button class="color-picker-tab" data-mode="gradient" style="display:none;">グラデーション</button>
                    </div>

                    <div class="color-picker-panel" data-panel="solid">
                         <div class="color-picker-display">
                            <div class="color-box"></div>
                            <input type="text" class="color-hex-input">
                        </div>
                        <div class="color-map-container">
                            <div class="color-map">
                                <div class="color-map-overlay-saturation"></div>
                                <div class="color-map-overlay-brightness"></div>
                                <div class="color-map-handle"></div>
                            </div>
                        </div>
                    </div>

                    <div class="color-picker-panel" data-panel="gradient" style="display: none;">
                        <div class="gradient-preview"></div>
                        <div class="gradient-stops-container"></div>
                        <div class="gradient-controls">
                            <label>角度: <span class="gradient-angle-value">90</span>°</label>
                            <input type="range" class="gradient-angle-slider" min="0" max="360" value="90">
                        </div>
                    </div>
                    
                    <div class="color-sliders">
                        <div class="hue-slider-container">
                            <div class="hue-slider">
                                <div class="slider-handle"></div>
                            </div>
                        </div>
                        <div class="alpha-slider-container">
                            <div class="alpha-slider">
                                <div class="slider-handle"></div>
                            </div>
                        </div>
                    </div>

                    <div class="color-inputs">
                        <input type="text" class="color-input-hex" placeholder="HEX">
                        <input type="text" class="color-input-rgba" placeholder="RGBA">
                    </div>
                    <div class="color-palette-section">
                        <div class="palette-grid"></div>
                        <button class="add-to-palette-btn"><i class="fas fa-plus"></i> パレットに追加</button>
                    </div>
                    <div class="color-actions">
                        ${this.options.showEyedropper ? '<button class="eyedropper-btn"><i class="fas fa-eye-dropper"></i> スポイト</button>' : ''}
                        ${this.options.showReset ? '<button class="reset-color-btn"><i class="fas fa-undo"></i> リセット</button>' : ''}
                    </div>
                </div>
            </div>
        `;
        
        if (this.isInline) {
            this.container.innerHTML = windowHTML;
        } else {
            document.body.insertAdjacentHTML('beforeend', windowHTML);
        }
        this._queryElements();
    }
    
    _queryElements() {
        const w = document.getElementById(this.id);
        this.elements = {
            window: w,
            header: w.querySelector('.color-picker-header'),
            closeBtn: w.querySelector('.color-picker-close-btn'),
            tabs: w.querySelectorAll('.color-picker-tab'),
            solidPanel: w.querySelector('[data-panel="solid"]'),
            gradientPanel: w.querySelector('[data-panel="gradient"]'),
            colorBox: w.querySelector('.color-box'),
            hexInputDisplay: w.querySelector('.color-hex-input'),
            colorMap: w.querySelector('.color-map'),
            colorMapHandle: w.querySelector('.color-map-handle'),
            hueSlider: w.querySelector('.hue-slider'),
            hueHandle: w.querySelector('.hue-slider .slider-handle'),
            alphaSlider: w.querySelector('.alpha-slider'),
            alphaHandle: w.querySelector('.alpha-slider .slider-handle'),
            gradientPreview: w.querySelector('.gradient-preview'),
            gradientStopsContainer: w.querySelector('.gradient-stops-container'),
            gradientAngleSlider: w.querySelector('.gradient-angle-slider'),
            gradientAngleValue: w.querySelector('.gradient-angle-value'),
            hexInput: w.querySelector('.color-input-hex'),
            rgbaInput: w.querySelector('.color-input-rgba'),
            paletteGrid: w.querySelector('.palette-grid'),
            addToPaletteBtn: w.querySelector('.add-to-palette-btn'),
            eyedropperBtn: w.querySelector('.eyedropper-btn'),
            resetColorBtn: w.querySelector('.reset-color-btn'),
        };

        if (!this.options.showPalette) {
            w.querySelector('.color-palette-section').style.display = 'none';
        }
    }

    _bindEvents() {
        if (!this.isInline) {
            this.elements.closeBtn.addEventListener('click', () => this.hide());
            this.elements.header.addEventListener('mousedown', this._startWindowDrag.bind(this));
        }

        this.elements.tabs.forEach(tab => {
            tab.addEventListener('click', () => this._switchMode(tab.dataset.mode));
        });

        this.elements.hexInputDisplay.addEventListener('input', (e) => this._handleHexInput(e.target.value));

        this.elements.colorMap.addEventListener('mousedown', this._startColorMapDrag.bind(this));
        this.elements.hueSlider.addEventListener('mousedown', this._startHueDrag.bind(this));
        this.elements.alphaSlider.addEventListener('mousedown', this._startAlphaDrag.bind(this));

        this.elements.hexInput.addEventListener('input', (e) => this._handleHexInput(e.target.value));
        this.elements.rgbaInput.addEventListener('input', (e) => this._handleRgbaInput(e.target.value));

        this.elements.addToPaletteBtn.addEventListener('click', () => this._addToPalette());
        this.elements.paletteGrid.addEventListener('click', (e) => {
            if (e.target.classList.contains('palette-color-box')) {
                this._applyPaletteColor(e.target.dataset.color);
            } else if (e.target.classList.contains('delete-palette-color')) {
                this._deletePaletteColor(e.target.closest('.palette-color-item').dataset.color);
            }
        });

        if (this.options.showEyedropper && this.elements.eyedropperBtn) {
            this.elements.eyedropperBtn.addEventListener('click', () => this._useEyedropper());
        }
        if (this.options.showReset && this.elements.resetColorBtn) {
            this.elements.resetColorBtn.addEventListener('click', () => this._resetColor());
        }

        document.addEventListener('mousemove', this._handleDrag.bind(this));
        document.addEventListener('mouseup', this._stopDrag.bind(this));
    }
    
    _switchMode(mode) {
        this.colorMode = mode;
        this.elements.tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.mode === mode);
        });
        
        this.elements.solidPanel.style.display = mode === 'solid' ? 'block' : 'none';
        this.elements.gradientPanel.style.display = mode === 'gradient' ? 'block' : 'none';
        
        this._updateUI();
        this._triggerChange();
    }

    show(x, y) {
        this.elements.window.style.display = 'block';
        // ウィンドウのサイズを取得
        const windowWidth = this.elements.window.offsetWidth;
        const windowHeight = this.elements.window.offsetHeight;

        // 画面のサイズを取得
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let newX = x;
        let newY = y;

        // 右端が画面外に出る場合
        if (x + windowWidth > viewportWidth) {
            newX = viewportWidth - windowWidth - 10; // 10pxの余白
        }
        // 左端が画面外に出る場合 (通常は発生しないが念のため)
        if (newX < 0) {
            newX = 10; // 10pxの余白
        }

        // 下端が画面外に出る場合
        if (y + windowHeight > viewportHeight) {
            newY = viewportHeight - windowHeight - 10; // 10pxの余白
        }
        // 上端が画面外に出る場合 (通常は発生しないが念のため)
        if (newY < 0) {
            newY = 10; // 10pxの余白
        }

        if (x !== undefined && y !== undefined) {
            this.elements.window.style.left = `${newX}px`;
            this.elements.window.style.top = `${newY}px`;
        }
    }

    hide() {
        if (this.isInline) {
            this.elements.window.style.display = 'none';
            return;
        }
        this.elements.window.style.display = 'none';
    }

    _startWindowDrag(e) {
        this.isWindowDragging = true;
        this.dragStartPos.x = e.clientX - this.elements.window.offsetLeft;
        this.dragStartPos.y = e.clientY - this.elements.window.offsetTop;
    }

    _startColorMapDrag(e) {
        this.isDragging = true;
        this._updateColorFromMap(e);
    }

    _startHueDrag(e) {
        this.isHueDragging = true;
        this._updateColorFromHue(e);
    }

    _startAlphaDrag(e) {
        this.isAlphaDragging = true;
        this._updateColorFromAlpha(e);
    }

    _handleDrag(e) {
        if (this.isWindowDragging) {
            const x = e.clientX - this.dragStartPos.x;
            const y = e.clientY - this.dragStartPos.y;
            this.elements.window.style.left = `${x}px`;
            this.elements.window.style.top = `${y}px`;
        } else if (this.isDragging) {
            this._updateColorFromMap(e);
        } else if (this.isHueDragging) {
            this._updateColorFromHue(e);
        } else if (this.isAlphaDragging) {
            this._updateColorFromAlpha(e);
        }
    }

    _stopDrag() {
        this.isDragging = false;
        this.isHueDragging = false;
        this.isAlphaDragging = false;
        this.isWindowDragging = false;
    }

    _updateColorFromMap(e) {
        const rect = this.elements.colorMap.getBoundingClientRect();
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;

        x = Math.max(0, Math.min(x, rect.width));
        y = Math.max(0, Math.min(y, rect.height));

        const s = x / rect.width;
        const v = 1 - (y / rect.height);

        const hsv = this._rgbToHsv(this.currentColor.r, this.currentColor.g, this.currentColor.b);
        const newRgb = this._hsvToRgb(hsv.h, s, v);
        this.currentColor.r = newRgb.r;
        this.currentColor.g = newRgb.g;
        this.currentColor.b = newRgb.b;

        this._updateUI();
        this._triggerChange();
    }

    _updateColorFromHue(e) {
        const rect = this.elements.hueSlider.getBoundingClientRect();
        let y = e.clientY - rect.top;
        y = Math.max(0, Math.min(y, rect.height));
        const h = 1 - (y / rect.height);

        const hsv = this._rgbToHsv(this.currentColor.r, this.currentColor.g, this.currentColor.b);
        const newRgb = this._hsvToRgb(h, hsv.s, hsv.v);
        this.currentColor.r = newRgb.r;
        this.currentColor.g = newRgb.g;
        this.currentColor.b = newRgb.b;

        this._updateUI();
        this._triggerChange();
    }

    _updateColorFromAlpha(e) {
        const rect = this.elements.alphaSlider.getBoundingClientRect();
        let x = e.clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));
        const a = x / rect.width;

        this.currentColor.a = parseFloat(a.toFixed(2));

        this._updateUI();
        this._triggerChange();
    }

    _handleHexInput(hex) {
        const rgba = this._parseColor(hex);
        if (rgba) {
            this.currentColor = { ...rgba };
            this._updateUI();
            this._triggerChange();
        }
    }

    _handleRgbaInput(rgbaString) {
        const rgba = this._parseColor(rgbaString);
        if (rgba) {
            this.currentColor = { ...rgba };
            this._updateUI();
            this._triggerChange();
        }
    }
    
    _triggerChange() {
        if (this.colorMode === 'solid') {
            this.onChangeCallback(this._toRgbaString(this.currentColor));
        } else {
            this.onChangeCallback(this._toGradientString());
        }
    }

    _updateUI() {
        // currentColorを更新するロジックをcolorModeに応じて調整
        if (this.colorMode === 'solid') {
            // 単色モードの場合、currentColorはグラデーションの最初のストップの色に設定される
            // ただし、これは_parseInitialColorで設定されるため、ここでは不要かもしれない
            // this.currentColor = this.gradient.stops[this.activeStopIndex].color;
        }
    
        const { r, g, b, a } = this.currentColor;
        const hsv = this._rgbToHsv(r, g, b);

        // Update color box
        if (this.colorMode === 'solid') {
            this.elements.colorBox.style.background = this._toRgbaString(this.currentColor);
        } else {
            this.elements.colorBox.style.background = this._toGradientString();
        }
        this.elements.hexInputDisplay.value = this._toHexString(this.currentColor);

        // Update color map background
        const hueRgb = this._hsvToRgb(hsv.h, 1, 1);
        this.elements.colorMap.style.backgroundColor = this._toRgbaString({ ...hueRgb, a: 1 });

        // Update color map handle position
        const mapRect = this.elements.colorMap.getBoundingClientRect();
        this.elements.colorMapHandle.style.left = `${hsv.s * mapRect.width}px`;
        this.elements.colorMapHandle.style.top = `${(1 - hsv.v) * mapRect.height}px`;
        this.elements.colorMapHandle.style.backgroundColor = this._toRgbaString(this.currentColor);

        // Update hue slider handle position
        const hueRect = this.elements.hueSlider.getBoundingClientRect();
        this.elements.hueHandle.style.top = `${(1 - hsv.h) * hueRect.height}px`;

        // Update alpha slider handle position
        const alphaRect = this.elements.alphaSlider.getBoundingClientRect();
        this.elements.alphaHandle.style.left = `${a * alphaRect.width}px`;
        this.elements.alphaSlider.style.background = `linear-gradient(to right, rgba(${r},${g},${b},0), rgba(${r},${g},${b},1))`;

        // Update text inputs
        this.elements.hexInput.value = this._toHexString(this.currentColor);
        this.elements.rgbaInput.value = this._toRgbaString(this.currentColor);
        
        // Update gradient UI
        this.elements.gradientPreview.style.background = this._toGradientString();

        this._renderPalette();
    }

    _loadPalette() {
        try {
            const storedPalette = localStorage.getItem(this.options.paletteKey);
            return storedPalette ? JSON.parse(storedPalette) : [];
        } catch (e) {
            console.error("Failed to load color palette from localStorage", e);
            return [];
        }
    }

    _savePalette() {
        try {
            localStorage.setItem(this.options.paletteKey, JSON.stringify(this.palette));
        } catch (e) {
            console.error("Failed to save color palette to localStorage", e);
        }
    }

    _renderPalette() {
        if (!this.options.showPalette) return;
        this.elements.paletteGrid.innerHTML = '';
        this.palette.forEach(colorString => {
            const item = document.createElement('div');
            item.className = 'palette-color-item';
            item.dataset.color = colorString;
            item.innerHTML = `
                <div class="palette-color-box" style="background: ${colorString};" data-color="${colorString}"></div>
                <button class="delete-palette-color"><i class="fas fa-times"></i></button>
            `;
            this.elements.paletteGrid.appendChild(item);
        });
    }

    _addToPalette() {
        const colorString = this.colorMode === 'solid' ? this._toRgbaString(this.currentColor) : this._toGradientString();
        if (!this.palette.includes(colorString)) {
            this.palette.push(colorString);
            this._savePalette();
            this._renderPalette();
        }
    }

    _applyPaletteColor(colorString) {
        this.setColor(colorString);
        this._triggerChange();
    }

    _deletePaletteColor(colorString) {
        this.palette = this.palette.filter(c => c !== colorString);
        this._savePalette();
        this._renderPalette();
    }

    async _useEyedropper() {
        this.hide();
        await new Promise(resolve => setTimeout(resolve, 100));

        if (!window.EyeDropper) {
            alert('お使いのブラウザはスポイトツールをサポートしていません。');
            this.show();
            return;
        }
        try {
            const eyeDropper = new EyeDropper();
            const { sRGBHex } = await eyeDropper.open();
            this.currentColor = this._parseColor(sRGBHex);
            this._updateUI();
            this._triggerChange();
        } catch (e) {
            console.error('スポイトツールの使用中にエラーが発生しました:', e);
        } finally {
            this.show();
        }
    }

    _resetColor() {
        this._parseInitialColor(this.options.defaultColor);
        this._updateUI();
        this._triggerChange();
    }

    setColor(colorString) {
        this._parseInitialColor(colorString);
        this._updateUI();
    }
}