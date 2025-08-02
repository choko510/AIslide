import { ColorPicker } from './ColorPicker.js';

class InspectorManager {
    constructor(app) {
        this.app = app;
        this.colorPickers = {}; // カラーピッカーインスタンスを管理するオブジェクト
    }

    render() {
        try {
            const selectedElement = this.app.state.selectedElementIds.length === 1 ? this.app.getSelectedElement() : null;
            const inspectorTabActive = this.app.elements.sidebarTabs.querySelector('[data-tab="inspector"]')?.classList.contains('active');
            
            this._updateInspectorTabVisibility(selectedElement);
            
            if (selectedElement && inspectorTabActive) {
                this._showInspectorContent(selectedElement);
            } else {
                this._hideInspectorContent(inspectorTabActive);
            }
        } catch (error) {
            ErrorHandler.handle(error, 'render_inspector');
        }
    }

    _updateInspectorTabVisibility(selectedElement) {
        const inspectorTabButton = this.app.elements.sidebarTabs.querySelector('[data-tab="inspector"]');
        const inspectorTabActive = this.app.elements.sidebarTabs.querySelector('[data-tab="inspector"]')?.classList.contains('active');
        
        if (!inspectorTabButton) return;
        
        if (this.app.state.selectedElementIds.length > 0) {
            inspectorTabButton.style.display = 'flex';
        } else {
            inspectorTabButton.style.display = 'none';
            if (inspectorTabActive) {
                const otherTabs = this.app.elements.sidebarTabs.querySelectorAll('[data-tab]:not([data-tab="inspector"])');
                if (otherTabs.length > 0) {
                    this.app.switchToTab(otherTabs[0].dataset.tab);
                }
            }
        }
    }

    _showInspectorContent(selectedElement) {
        this.app.elements.inspector.style.display = 'block';
        this.app.elements.noSelectionMessage.style.display = 'none';
        this.app.elements.sidebarContent.style.display = 'block';
        this.app.elements.leftSidebar.style.width = '340px';

        const inspectorHTML = this._buildInspectorHTML(selectedElement);
        if (window.DOMPurify) {
            this.app.elements.inspector.innerHTML = DOMPurify.sanitize(inspectorHTML, { ADD_ATTR: ['data-prop', 'data-type', 'data-table-row', 'data-table-col'] });
        } else {
            this.app.elements.inspector.innerHTML = inspectorHTML;
        }
        
        this._initializeInspectorComponents(selectedElement);
    }

    _hideInspectorContent(inspectorTabActive) {
        this.app.elements.inspector.style.display = 'none';
        this.app.elements.noSelectionMessage.style.display = 'block';
        
        if (inspectorTabActive) {
            this.app.elements.sidebarContent.style.display = 'none';
            this.app.elements.leftSidebar.style.width = '60px';
        }
    }

    _buildInspectorHTML(selectedElement) {
        const s = selectedElement.style;

        const accordionItem = (title, content, isOpen = true) => `
            <div class="accordion-item">
                <button class="accordion-header" aria-expanded="${isOpen}">
                    ${title}
                    <i class="fas fa-chevron-down"></i>
                </button>
                <div class="accordion-content" ${isOpen ? '' : 'style="display: none;"'}>
                    ${content}
                </div>
            </div>
        `;

        const widthInPx = Utils.percentToPixels(parseFloat(s.width) || 0, CANVAS_WIDTH);
        const heightInPx = Utils.percentToPixels(parseFloat(s.height) || 0, CANVAS_HEIGHT);

        const transformContent = `
            <div class="inspector-group">
                <div class="pos-size-grid">
                    <div><label for="inspector-left">X (%)</label><input id="inspector-left" type="number" data-prop="left" value="${(s.left || 0).toFixed(2)}" step="0.1"></div>
                    <div><label for="inspector-top">Y (%)</label><input id="inspector-top" type="number" data-prop="top" value="${(s.top || 0).toFixed(2)}" step="0.1"></div>
                    <div><label for="inspector-width">幅 (px)</label><input id="inspector-width" type="number" data-prop="width" data-unit="px" value="${widthInPx.toFixed(0)}" min="10" max="500"></div>
                    <div><label for="inspector-height">高さ (px)</label><input id="inspector-height" type="number" data-prop="height" data-unit="px" value="${heightInPx.toFixed(0)}" min="10" max="500" ${!['image', 'video', 'shape'].includes(selectedElement.type) ? 'disabled' : ''}></div>
                </div>
            </div>
            <div class="inspector-group"><label>回転 (deg)</label><input type="number" data-prop="rotation" value="${s.rotation || 0}" step="1"></div>
            <div class="inspector-group"><label>不透明度</label><div class="d-flex align-items-center"><input type="range" data-prop="opacity" value="${s.opacity ?? 1}" min="0" max="1" step="0.01" style="flex-grow: 1;"><span id="opacity-value" style="margin-left: 10px; width: 40px;">${Math.round((s.opacity ?? 1) * 100)}%</span></div></div>
            <div class="inspector-group"><label>重ね順</label><input type="number" data-prop="zIndex" value="${s.zIndex}"></div>
        `;

        const animationContent = `
            <div class="inspector-group">
                <label>アニメーション</label>
                <select data-prop="animation">
                    <option value="">なし</option>
                    <option value="animate__bounce" ${s.animation === 'animate__bounce' ? 'selected' : ''}>バウンス</option>
                    <option value="animate__fadeIn" ${s.animation === 'animate__fadeIn' ? 'selected' : ''}>フェードイン</option>
                    <option value="animate__fadeOut" ${s.animation === 'animate__fadeOut' ? 'selected' : ''}>フェードアウト</option>
                    <option value="animate__zoomIn" ${s.animation === 'animate__zoomIn' ? 'selected' : ''}>ズームイン</option>
                    <option value="animate__zoomOut" ${s.animation === 'animate__zoomOut' ? 'selected' : ''}>ズームアウト</option>
                    <option value="animate__flipInX" ${s.animation === 'animate__flipInX' ? 'selected' : ''}>フリップインX</option>
                    <option value="animate__flipInY" ${s.animation === 'animate__flipInY' ? 'selected' : ''}>フリップインY</option>
                    <option value="animate__rotateIn" ${s.animation === 'animate__rotateIn' ? 'selected' : ''}>回転イン</option>
                    <option value="animate__slideInLeft" ${s.animation === 'animate__slideInLeft' ? 'selected' : ''}>左からスライド</option>
                    <option value="animate__slideInRight" ${s.animation === 'animate__slideInRight' ? 'selected' : ''}>右からスライド</option>
                    <option value="animate__slideInUp" ${s.animation === 'animate__slideInUp' ? 'selected' : ''}>下からスライド</option>
                    <option value="animate__slideInDown" ${s.animation === 'animate__slideInDown' ? 'selected' : ''}>上からスライド</option>
                </select>
            </div>
        `;

        const typeSpecificHTML = this._getTypeSpecificHTML(selectedElement);
        const customCssHTML = this._getCustomCssHTML();


        return `
            <div class="accordion">
                ${accordionItem('配置とサイズ', transformContent)}
                ${typeSpecificHTML}
                ${accordionItem('アニメーション', animationContent)}
                ${accordionItem('詳細設定', customCssHTML, false)}
            </div>
        `;
    }

    _getTypeSpecificHTML(selectedElement) {
        const typeHandlers = {
            'text': () => this._getTextPropertiesHTML(selectedElement),
            'image': () => this._getImagePropertiesHTML(selectedElement),
            'icon': () => this.getIconPropertiesHTML(selectedElement),
            'video': () => this._getVideoPropertiesHTML(selectedElement),
            'chart': () => this._getChartPropertiesHTML(selectedElement),
            'table': () => this._getTablePropertiesHTML(selectedElement),
            'iframe': () => this._getIframePropertiesHTML(selectedElement),
            'shape': () => this._getShapePropertiesHTML(selectedElement)
        };

        const handler = typeHandlers[selectedElement.type];
        return handler ? handler() : '';
    }

    _getTextPropertiesHTML(selectedElement) {
        const s = selectedElement.style;
        const accordionItem = (title, content, isOpen = true) => `
            <div class="accordion-item">
                <button class="accordion-header" aria-expanded="${isOpen}">
                    ${title}
                    <i class="fas fa-chevron-down"></i>
                </button>
                <div class="accordion-content" ${isOpen ? '' : 'style="display: none;"'}>
                    ${content}
                </div>
            </div>
        `;
        const content = `
            <div class="inspector-group">
                <label><input type="checkbox" data-prop="vertical" id="vertical-writing-checkbox" ${s.vertical ? 'checked' : ''}> 縦書き</label>
            </div>
            <div class="inspector-group">
                <label>フォントサイズ (px)</label>
                <input type="number" data-prop="fontSize" value="${s.fontSize || 24}">
            </div>
            <div class="inspector-group">
                <label>フォント</label>
                <select data-prop="fontFamily" id="font-family-select">
                    ${this._getFontOptions(s.fontFamily)}
                </select>
                <input type="file" id="font-upload" accept=".ttf,.otf,.woff,.woff2" style="margin-top:8px;">
                <div id="uploaded-fonts-list" style="margin-top:4px;"></div>
            </div>
            <div class="inspector-group">
                <label>文字色</label>
                <div id="color-picker-text-color"></div>
            </div>
            <div class="inspector-group">
                <label>背景の塗りつぶし</label>
                <div id="color-picker-text-background-color"></div>
            </div>
            <div class="inspector-group">
                <label>枠線</label>
                <input type="text" data-prop="border" value="${s.border || '1px solid #000000'}" placeholder="例: 1px solid #000000">
            </div>
        `;
        return accordionItem('テキストスタイル', content);
    }

    _getImagePropertiesHTML(selectedElement) {
        const s = selectedElement.style;
        const accordionItem = (title, content, isOpen = true) => `
            <div class="accordion-item">
                <button class="accordion-header" aria-expanded="${isOpen}">
                    ${title}
                    <i class="fas fa-chevron-down"></i>
                </button>
                <div class="accordion-content" ${isOpen ? '' : 'style="display: none;"'}>
                    ${content}
                </div>
            </div>
        `;
        const content = `
            <div class="inspector-group">
                <label>角の丸み (px)</label>
                <input type="number" data-prop="borderRadius" value="${s.borderRadius || 0}" min="0">
            </div>
        `;
        return accordionItem('画像スタイル', content);
    }

    _getFontOptions(currentFont) {
        const fonts = [
            { value: 'sans-serif', name: 'モダン (Sans-serif)', style: 'sans-serif' },
            { value: 'serif', name: 'クラシック (Serif)', style: 'serif' },
            { value: '游ゴシック体,YuGothic,\'Yu Gothic\',sans-serif', name: '游ゴシック' },
            { value: 'メイリオ,Meiryo,sans-serif', name: 'メイリオ' },
            { value: 'Roboto, sans-serif', name: 'Roboto' },
            { value: 'Montserrat, sans-serif', name: 'Montserrat' },
            { value: '\'M PLUS Rounded 1c\', sans-serif', name: 'M PLUS Rounded 1c' }
        ];

        return fonts.map(font =>
            `<option style="font-family: ${font.style || font.value}" value="${font.value}" ${currentFont === font.value ? 'selected' : ''}>${font.name}</option>`
        ).join('');
    }

    _getVideoPropertiesHTML(selectedElement) {
        const v = selectedElement.content;
        const accordionItem = (title, content, isOpen = true) => `
            <div class="accordion-item">
                <button class="accordion-header" aria-expanded="${isOpen}">
                    ${title}
                    <i class="fas fa-chevron-down"></i>
                </button>
                <div class="accordion-content" ${isOpen ? '' : 'style="display: none;"'}>
                    ${content}
                </div>
            </div>
        `;
        const content = `
            <div class="inspector-group">
                <label>動画URL</label>
                <input type="text" id="video-url" value="${v.url || ''}" style="width:100%;">
            </div>
            <div class="inspector-group">
                <label><input type="checkbox" id="video-autoplay" ${v.autoplay ? 'checked' : ''}> 自動再生</label>
            </div>
            <div class="inspector-group">
                <label><input type="checkbox" id="video-loop" ${v.loop ? 'checked' : ''}> ループ再生</label>
            </div>
            <div class="inspector-group">
                <label><input type="checkbox" id="video-controls" ${v.controls !== false ? 'checked' : ''}> コントロール表示</label>
            </div>
            <button id="update-video-btn" style="margin-top:10px;width:100%;padding:8px;">動画設定を反映</button>
        `;
        return accordionItem('動画設定', content);
    }

    _getChartPropertiesHTML(selectedElement) {
        const chartData = selectedElement.content.data;
        // chartData.datasets が存在しない場合や空の場合に備えて安全なアクセスを行う
        const datasetLabel = chartData?.datasets?.[0]?.label || '';
        const labels = chartData?.labels || [];
        const dataValues = chartData?.datasets?.[0]?.data || [];

        let tableRows = '';
        for (let i = 0; i < labels.length; i++) {
            const label = labels[i];
            const value = dataValues[i];
            tableRows += `
                <tr>
                    <td style="padding: 4px;"><input type="text" data-type="label" value="${label}" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;"></td>
                    <td style="padding: 4px;"><input type="number" data-type="value" value="${value}" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;"></td>
                    <td style="text-align: center;"><button type="button" class="delete-chart-row-btn" style="background:none; border:none; color: #dc3545; cursor:pointer; font-size: 16px;">&times;</button></td>
                </tr>
            `;
        }

        const accordionItem = (title, content, isOpen = true) => `
            <div class="accordion-item">
                <button class="accordion-header" aria-expanded="${isOpen}">
                    ${title}
                    <i class="fas fa-chevron-down"></i>
                </button>
                <div class="accordion-content" ${isOpen ? '' : 'style="display: none;"'}>
                    ${content}
                </div>
            </div>
        `;
        const content = `
            <div class="inspector-group">
                <label>グラフデータ編集</label>
                <div style="margin-top: 10px;">
                    <label>データセット名</label>
                    <input type="text" id="chart-dataset-label-inspector" value="${datasetLabel}" style="width: 100%;">
                </div>
                <div id="chart-data-spreadsheet-inspector" style="margin-top: 10px; max-height: 200px; overflow-y: auto; border: 1px solid #ced4da; border-radius: 6px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead style="position: sticky; top: 0; background: #f8f9fa;">
                            <tr>
                                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ced4da;">ラベル</th>
                                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ced4da;">値</th>
                                <th style="width: 40px; border-bottom: 1px solid #ced4da;"></th>
                            </tr>
                        </thead>
                        <tbody id="chart-data-tbody-inspector">
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                    <button type="button" id="add-chart-row-btn-inspector" class="sidebar-add-btn" style="flex-grow: 1;">行を追加</button>
                </div>
            </div>
        `;
        return accordionItem('グラフデータ', content);
    }

    _getTablePropertiesHTML(selectedElement) {
        const t = selectedElement.content;
        let rowsInputs = '';
        
        for (let r = 0; r < t.rows; r++) {
            let row = '<tr>';
            for (let c = 0; c < t.cols; c++) {
                const val = Utils.sanitizeHtml(t.data?.[r]?.[c] ?? '');
                row += `<td><input type="text" data-table-row="${r}" data-table-col="${c}" value="${val}" style="width:60px;"></td>`;
            }
            row += '</tr>';
            rowsInputs += row;
        }
        
        const accordionItem = (title, content, isOpen = true) => `
            <div class="accordion-item">
                <button class="accordion-header" aria-expanded="${isOpen}">
                    ${title}
                    <i class="fas fa-chevron-down"></i>
                </button>
                <div class="accordion-content" ${isOpen ? '' : 'style="display: none;"'}>
                    ${content}
                </div>
            </div>
        `;
        const content = `
            <div class="inspector-group">
                <label>行数 <input type="number" id="table-rows" value="${t.rows}" min="1" max="20" style="width:50px;"></label>
                <label>列数 <input type="number" id="table-cols" value="${t.cols}" min="1" max="20" style="width:50px;"></label>
            </div>
            <div class="inspector-group">
                <label>セル内容</label>
                <table style="border-collapse:collapse;">${rowsInputs}</table>
            </div>
        `;
        return accordionItem('テーブルデータ', content);
    }

    _getIframePropertiesHTML(selectedElement) {
        const accordionItem = (title, content, isOpen = true) => `
            <div class="accordion-item">
                <button class="accordion-header" aria-expanded="${isOpen}">
                    ${title}
                    <i class="fas fa-chevron-down"></i>
                </button>
                <div class="accordion-content" ${isOpen ? '' : 'style="display: none;"'}>
                    ${content}
                </div>
            </div>
        `;
        const content = `
            <div class="inspector-group">
                <label>iframe URL</label>
                <input type="text" data-prop="url" value="${selectedElement.content.url || ''}" id="iframe-url-input" style="width:100%;">
            </div>
            <div class="inspector-group">
                <label>Sandbox属性 (スペース区切り)</label>
                <input type="text" data-prop="sandbox" value="${selectedElement.content.sandbox || ''}" id="iframe-sandbox-input" style="width:100%;">
                <small style="font-size:10px;color:#666;">例: allow-scripts allow-same-origin allow-popups</small>
            </div>
            <button id="update-iframe-btn" style="margin-top:10px;width:100%;padding:8px;">埋め込み設定を反映</button>
        `;
        return accordionItem('埋め込み設定', content);
    }

    _getShapePropertiesHTML(selectedElement) {
        const s = selectedElement.style;
        const isLine = selectedElement.content.shapeType === 'line';
        const accordionItem = (title, content, isOpen = true) => `
            <div class="accordion-item">
                <button class="accordion-header" aria-expanded="${isOpen}">
                    ${title}
                    <i class="fas fa-chevron-down"></i>
                </button>
                <div class="accordion-content" ${isOpen ? '' : 'style="display: none;"'}>
                    ${content}
                </div>
            </div>
        `;
        const content = `
            <div class="inspector-group">
                <label>塗りつぶし色</label>
                <div id="color-picker-shape-fill" data-disabled="${isLine}"></div>
            </div>
            <div class="inspector-group">
                <label>線の色</label>
                <div id="color-picker-shape-stroke"></div>
            </div>
            <div class="inspector-group">
                <label>線の太さ (px)</label>
                <input type="number" data-prop="strokeWidth" value="${s.strokeWidth != null ? s.strokeWidth : 2}" min="0">
            </div>
            <div class="inspector-group">
                <label>角の丸み (px)</label>
                <input type="number" data-prop="borderRadius" value="${s.borderRadius || 0}" min="0">
            </div>
        `;
        return accordionItem('塗りつぶしと枠線', content);
    }

    _getCustomCssHTML() {
        return `
            <div class="inspector-group">
                <label>カスタムCSS</label>
                <div id="element-css-editor-container" style="border: 1px solid var(--border-color); border-radius: var(--border-radius);"></div>
            </div>
            <div class="inspector-group" style="margin-top: 20px;">
                <button id="delete-element-btn">要素を削除</button>
            </div>
        `;
    }

    _initializeInspectorComponents(selectedElement) {
        const customCss = selectedElement.style.customCss || '';
        this.app.initElementCssEditor(customCss);

        const colorConfigs = {
            'color-picker-text-color': {
                title: '文字色',
                initialColor: selectedElement.style.color || '#212529FF',
                callback: (color) => this._updateElementStyle(selectedElement, 'color', color),
                paletteKey: 'textColorPalette'
            },
            'color-picker-text-background-color': {
                title: '背景色',
                initialColor: selectedElement.style.backgroundColor || '#FFFFFFFF',
                callback: (color) => this._updateElementStyle(selectedElement, 'backgroundColor', color),
                paletteKey: 'textBgColorPalette'
            },
            'color-picker-shape-fill': {
                title: '塗りつぶし色',
                initialColor: selectedElement.style.fill || '#CCCCCCFF',
                callback: (color) => this._updateElementStyle(selectedElement, 'fill', color),
                paletteKey: 'shapeFillPalette',
                disabled: selectedElement.content.shapeType === 'line'
            },
            'color-picker-shape-stroke': {
                title: '線の色',
                initialColor: selectedElement.style.stroke || '#000000FF',
                callback: (color) => this._updateElementStyle(selectedElement, 'stroke', color),
                paletteKey: 'shapeStrokePalette'
            },
            'color-picker-icon-color': {
                title: 'アイコンの色',
                initialColor: selectedElement.style.color || '#212529FF',
                callback: (color) => this._updateElementStyle(selectedElement, 'color', color),
                paletteKey: 'iconColorPalette'
            },
        };

        for (const id in colorConfigs) {
            this._setupColorPickerTrigger(id, colorConfigs[id]);
        }

        this._bindBasicInspectorEvents(selectedElement);
        this._bindAccordionEvents();
        this._bindTypeSpecificEvents(selectedElement);
    }

    _setupColorPickerTrigger(containerId, config) {
        const container = document.getElementById(containerId);
        this.app._setupColorPickerTrigger(container, config);
    }

    _updateElementStyle(selectedElement, prop, value) {
        const slideIndex = this.app.getActiveSlideIndex();
        const elementIndex = this.app.getElementIndex(selectedElement.id);
        const stylePath = `presentation.slides.${slideIndex}.elements.${elementIndex}.style.${prop}`;
        this.app.updateState(stylePath, value);
        this.app.saveState();
        this.app.render(); // 変更を即座に反映
    }

    _bindBasicInspectorEvents(selectedElement) {
        const deleteBtn = document.getElementById('delete-element-btn');
        if (deleteBtn) {
            deleteBtn.onclick = () => this.app.deleteSelectedElements();
        }
    }

    _bindAccordionEvents() {
        const inspector = document.getElementById('inspector');
        if (!inspector) return;

        inspector.querySelectorAll('.accordion-header').forEach(button => {
            button.onclick = () => {
                const content = button.nextElementSibling;
                const isExpanded = button.getAttribute('aria-expanded') === 'true';
                
                button.setAttribute('aria-expanded', !isExpanded);
                content.style.display = isExpanded ? 'none' : 'block';
                
                const icon = button.querySelector('i');
                if (icon) {
                    icon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
                }
            };
        });
    }

    _bindTypeSpecificEvents(selectedElement) {
        const eventHandlers = {
            'chart': () => this._bindChartEvents(selectedElement),
            'video': () => this._bindVideoEvents(selectedElement),
            'table': () => this._bindTableEvents(selectedElement),
            'iframe': () => this._bindIframeEvents(selectedElement),
            'text': () => this._bindTextEvents(selectedElement),
            'icon': () => this.bindIconInspectorEvents(selectedElement),
            'shape': () => this._bindShapeEvents(selectedElement)
        };

        const handler = eventHandlers[selectedElement.type];
        if (handler) {
            handler();
        }
    }

    _bindChartEvents(selectedElement) {
        const inspector = document.getElementById('inspector');

        const updateChartData = () => {
            const tableBody = inspector.querySelector('#chart-data-tbody-inspector');
            if (!tableBody) return;
            
            const rows = tableBody.querySelectorAll('tr');
            const labels = Array.from(rows).map(row => row.querySelector('input[data-type="label"]').value);
            const dataValues = Array.from(rows).map(row => parseFloat(row.querySelector('input[data-type="value"]').value) || 0);
            const datasetLabel = inspector.querySelector('#chart-dataset-label-inspector').value;

            const slideIndex = this.app.getActiveSlideIndex();
            const elementIndex = this.app.getElementIndex(selectedElement.id);
            const updates = {
                [`presentation.slides.${slideIndex}.elements.${elementIndex}.content.data.labels`]: labels,
                [`presentation.slides.${slideIndex}.elements.${elementIndex}.content.data.datasets.0.label`]: datasetLabel,
                [`presentation.slides.${slideIndex}.elements.${elementIndex}.content.data.datasets.0.data`]: dataValues
            };
            this.app.batchUpdateState(updates);
            this.app.saveState();
            this.app.render();
        };

        const addRowBtn = inspector.querySelector('#add-chart-row-btn-inspector');
        if (addRowBtn) {
            addRowBtn.onclick = () => {
                const tableBody = inspector.querySelector('#chart-data-tbody-inspector');
                const newRow = this._createInspectorChartRow();
                tableBody.appendChild(newRow);
                this._bindInspectorChartRowEvents(newRow, updateChartData);
                updateChartData();
            };
        }
        
        const tableBody = inspector.querySelector('#chart-data-tbody-inspector');
        if(tableBody) {
            tableBody.querySelectorAll('tr').forEach(row => {
                this._bindInspectorChartRowEvents(row, updateChartData);
            });
        }
        
        const datasetLabelInput = inspector.querySelector('#chart-dataset-label-inspector');
        if(datasetLabelInput) {
            datasetLabelInput.addEventListener('input', updateChartData);
        }
    }

    _createInspectorChartRow(label = '', value = '') {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding: 4px;"><input type="text" data-type="label" value="${label}" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;"></td>
            <td style="padding: 4px;"><input type="number" data-type="value" value="${value}" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;"></td>
            <td style="text-align: center;"><button type="button" class="delete-chart-row-btn" style="background:none; border:none; color: #dc3545; cursor:pointer; font-size: 16px;">&times;</button></td>
        `;
        return tr;
    }

    _bindInspectorChartRowEvents(row, updateCallback) {
        row.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', updateCallback);
        });
        const deleteBtn = row.querySelector('.delete-chart-row-btn');
        if(deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                row.remove();
                updateCallback();
            });
        }
    }

    _bindVideoEvents(selectedElement) {
        const updateBtn = document.getElementById('update-video-btn');
        if (updateBtn) {
            updateBtn.onclick = () => {
                const slideIndex = this.app.getActiveSlideIndex();
                const elementIndex = this.app.getElementIndex(selectedElement.id);
                const updates = {
                    [`presentation.slides.${slideIndex}.elements.${elementIndex}.content.url`]: document.getElementById('video-url').value,
                    [`presentation.slides.${slideIndex}.elements.${elementIndex}.content.autoplay`]: document.getElementById('video-autoplay').checked,
                    [`presentation.slides.${slideIndex}.elements.${elementIndex}.content.loop`]: document.getElementById('video-loop').checked,
                    [`presentation.slides.${slideIndex}.elements.${elementIndex}.content.controls`]: document.getElementById('video-controls').checked
                };
                this.app.batchUpdateState(updates);
                this.app.saveState();
                this.app.render();
            };
        }
    }

    _bindTableEvents(selectedElement) {
        const cellInputs = document.querySelectorAll('input[data-table-row][data-table-col]');
        cellInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const r = parseInt(input.dataset.tableRow);
                const c = parseInt(input.dataset.tableCol);
                const slideIndex = this.app.getActiveSlideIndex();
                const elementIndex = this.app.getElementIndex(selectedElement.id);
                
                // immer を使用して状態を更新
                const updatedSlides = produce(this.app.state.presentation.slides, draftSlides => {
                    const slide = draftSlides[slideIndex];
                    const element = slide.elements[elementIndex];
                    if (!element.content.data) element.content.data = [];
                    if (!element.content.data[r]) element.content.data[r] = [];
                    element.content.data[r][c] = input.value;
                });
                this.app.updateState('presentation.slides', updatedSlides, { silent: true }); // silent:true でレンダリングを抑制

                if (this._saveTableTimeout) clearTimeout(this._saveTableTimeout);
                this._saveTableTimeout = setTimeout(() => {
                    this.app.saveState();
                    this.app.render();
                    this._saveTableTimeout = null;
                }, 300);
            });
        });

        const rowInput = document.getElementById('table-rows');
        const colInput = document.getElementById('table-cols');
        const updateRowsCols = () => {
            const newRows = parseInt(rowInput.value);
            const newCols = parseInt(colInput.value);
            const slideIndex = this.app.getActiveSlideIndex();
            const elementIndex = this.app.getElementIndex(selectedElement.id);

            const updates = {
                [`presentation.slides.${slideIndex}.elements.${elementIndex}.content.rows`]: newRows,
                [`presentation.slides.${slideIndex}.elements.${elementIndex}.content.cols`]: newCols
            };
            this.app.batchUpdateState(updates);

            if (this._saveTableTimeout) clearTimeout(this._saveTableTimeout);
            this._saveTableTimeout = setTimeout(() => {
                this.app.saveState();
                this.app.render();
                this._saveTableTimeout = null;
            }, 300);
        };
        if (rowInput) rowInput.addEventListener('input', updateRowsCols);
        if (colInput) colInput.addEventListener('input', updateRowsCols);
    }

    _bindIframeEvents(selectedElement) {
        const updateBtn = document.getElementById('update-iframe-btn');
        if (updateBtn) {
            updateBtn.onclick = () => {
                const slideIndex = this.app.getActiveSlideIndex();
                const elementIndex = this.app.getElementIndex(selectedElement.id);
                const updates = {
                    [`presentation.slides.${slideIndex}.elements.${elementIndex}.content.url`]: document.getElementById('iframe-url-input').value,
                    [`presentation.slides.${slideIndex}.elements.${elementIndex}.content.sandbox`]: document.getElementById('iframe-sandbox-input').value
                };
                this.app.batchUpdateState(updates);
                this.app.saveState();
                this.app.render();
            };
        }
    }

    _bindTextEvents(selectedElement) {
        this._setupCustomFontUpload(selectedElement);
    }

    getIconPropertiesHTML(selectedElement) {
        const s = selectedElement.style;
        const accordionItem = (title, content, isOpen = true) => `
            <div class="accordion-item">
                <button class="accordion-header" aria-expanded="${isOpen}">
                    ${title}
                    <i class="fas fa-chevron-down"></i>
                </button>
                <div class="accordion-content" ${isOpen ? '' : 'style="display: none;"'}>
                    ${content}
                </div>
            </div>
        `;

        let styleOptions = '';
        if (selectedElement.iconType === 'fa') {
            styleOptions = this._getFontAwesomeStyleOptions(selectedElement);
        } else if (selectedElement.iconType === 'mi') {
            styleOptions = this._getMaterialIconStyleOptions(selectedElement);
        }

        const content = `
            <div class="inspector-group">
                <label>フォントサイズ (px)</label>
                <input type="number" data-prop="fontSize" value="${s.fontSize || 48}">
            </div>
            <div class="inspector-group">
                <label>色</label>
                <div id="color-picker-icon-color"></div>
            </div>
            ${styleOptions}
        `;
        return accordionItem('アイコンスタイル', content);
    }

    _getFontAwesomeStyleOptions(selectedElement) {
        const currentStyle = selectedElement.content.split(' ')[0];
        const options = [
            { value: 'fas', name: 'Solid' },
            { value: 'far', name: 'Regular' },
            { value: 'fal', name: 'Light' },
            { value: 'fat', name: 'Thin' }
        ];
        return `
            <div class="inspector-group">
                <label>スタイル</label>
                <select id="icon-style-select">
                    ${options.map(opt => `<option value="${opt.value}" ${currentStyle === opt.value ? 'selected' : ''}>${opt.name}</option>`).join('')}
                </select>
            </div>
        `;
    }

    _getMaterialIconStyleOptions(selectedElement) {
        const currentStyle = selectedElement.content;
        const options = [
            { value: 'material-icons', name: 'Filled' },
            { value: 'material-icons-outlined', name: 'Outlined' },
            { value: 'material-icons-round', name: 'Round' },
            { value: 'material-icons-sharp', name: 'Sharp' },
            { value: 'material-icons-two-tone', name: 'Two Tone' }
        ];
        return `
            <div class="inspector-group">
                <label>スタイル</label>
                <select id="icon-style-select">
                    ${options.map(opt => `<option value="${opt.value}" ${currentStyle === opt.value ? 'selected' : ''}>${opt.name}</option>`).join('')}
                </select>
            </div>
        `;
    }

    bindIconInspectorEvents(selectedElement) {
        const styleSelect = document.getElementById('icon-style-select');
        if (styleSelect) {
            styleSelect.addEventListener('change', () => {
                this.app.iconManager.updateIconStyle(selectedElement, styleSelect.value);
            });
        }
    }

    _bindShapeEvents(selectedElement) {
        // This is a placeholder. Actual logic is handled by the generic 'input' event
    }

    _setupCustomFontUpload(selectedElement) {
        const s = selectedElement.style;
        window._customFonts = window._customFonts || [];
        const fontSelect = document.getElementById('font-family-select');
        const fontsListDiv = document.getElementById('uploaded-fonts-list');
        
        if (!fontSelect || !fontsListDiv) return;
        
        window._customFonts.forEach(f => {
            if (!fontSelect.querySelector(`option[value="${f.family}"]`)) {
                const opt = document.createElement('option');
                opt.value = f.family;
                opt.textContent = f.family + ' (アップロード)';
                if (s.fontFamily === f.family) opt.selected = true;
                fontSelect.appendChild(opt);
            }
        });
        
        fontsListDiv.innerHTML = window._customFonts.map(f =>
            `<span style="font-family:'${f.family}';font-size:14px;">${f.family}</span>`
        ).join('<br>');
        
        const fontUpload = document.getElementById('font-upload');
        if (fontUpload) {
            fontUpload.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const fontFamily = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_\-]/g, '_');
                    const style = document.createElement('style');
                    style.innerHTML = `
                        @font-face {
                            font-family: '${fontFamily}';
                            src: url('${ev.target.result}');
                        }
                    `;
                    document.head.appendChild(style);
                    window._customFonts.push({ family: fontFamily, data: ev.target.result });
                    
                    const opt = document.createElement('option');
                    opt.value = fontFamily;
                    opt.textContent = fontFamily + ' (アップロード)';
                    fontSelect.appendChild(opt);
                    fontSelect.value = fontFamily;
                    
                    const slideIndex = this.app.getActiveSlideIndex();
                    const elementIndex = this.app.getElementIndex(selectedElement.id);
                    this.app.updateState(`presentation.slides.${slideIndex}.elements.${elementIndex}.style.fontFamily`, fontFamily);
                    
                    this.app.saveState();
                    this.app.render();
                };
                reader.readAsDataURL(file);
            });
        }
        
        if (window._customFonts.length > 0) {
            fontsListDiv.innerHTML += '<div style="color:#dc3545;font-size:12px;">ページ再読込後は再アップロードが必要です</div>';
        }
    }

    handleInput(e) {
        e.stopPropagation();
        const el = this.app.getSelectedElement();
        if (!el) return;

        const prop = e.target.dataset.prop;
        if (!prop || prop === 'customCss' || prop === 'color' || prop === 'backgroundColor' || prop === 'fill' || prop === 'stroke') return;

        if (!this._inspectorInputTimeout) {
            this.app.stateManager._saveToHistory();
        }
        if (this._inspectorInputTimeout) {
            clearTimeout(this._inspectorInputTimeout);
        }

        let value;
        const unit = e.target.dataset.unit;
        if (e.target.type === 'checkbox') {
            value = e.target.checked;
        } else if (e.target.type === 'number') {
            value = parseFloat(e.target.value);
        } else {
            value = e.target.value;
        }

        const slideIndex = this.app.getActiveSlideIndex();
        const elementIndex = this.app.getElementIndex(el.id);
        const stylePath = `presentation.slides.${slideIndex}.elements.${elementIndex}.style.${prop}`;

        if (unit === 'px' && (prop === 'width' || prop === 'height')) {
            if (prop === 'width') {
                this.app.updateState(stylePath, Utils.pixelsToPercent(value, CANVAS_WIDTH));
            } else if (prop === 'height') {
                this.app.updateState(stylePath, Utils.pixelsToPercent(value, CANVAS_HEIGHT));
            }
        } else {
            this.app.updateState(stylePath, value);
        }

        const updatedElData = this.app.getSelectedElement();
        const domEl = this.app.elements.slideCanvas.querySelector(`[data-id="${el.id}"]`);

        if (domEl) {
            this.app.applyStyles(domEl, updatedElData.style);

            if (updatedElData.type === 'shape') {
                const shapeSvg = domEl.querySelector('svg > *:not(defs)');
                if (shapeSvg) {
                    // fillとstrokeはColorPickerのコールバックで処理されるため、ここではborderRadiusとstrokeWidthのみ
                    if (prop === 'strokeWidth') shapeSvg.setAttribute('stroke-width', value);
                    if (prop === 'borderRadius') {
                        const elWidthPx = window.Utils.percentToPixels(updatedElData.style.width, window.CANVAS_WIDTH);
                        const elHeightPx = window.Utils.percentToPixels(updatedElData.style.height, window.CANVAS_HEIGHT);
                        if (elWidthPx > 0 && elHeightPx > 0) {
                            const rx = (value / elWidthPx) * 100;
                            const ry = (value / elHeightPx) * 100;
                            shapeSvg.setAttribute('rx', ry);
                            shapeSvg.setAttribute('ry', ry);
                        }
                    }
                }
            } else if (updatedElData.type === 'icon' && prop === 'color') {
                // ColorPickerのコールバックで処理されるため、ここでは何もしない
            }
        }

        if (prop === 'opacity') {
            const opacityValue = document.getElementById('opacity-value');
            if (opacityValue) opacityValue.textContent = `${Math.round(value * 100)}%`;
        }

        if (prop === 'animation' && domEl) {
            const oldAnimation = Object.values(domEl.classList).find(c => c.startsWith('animate__') && c !== value);
            if (oldAnimation) domEl.classList.remove('animate__animated', oldAnimation);
            if (value) {
                domEl.classList.add('animate__animated', value);
                domEl.addEventListener('animationend', () => domEl.classList.remove('animate__animated', value), { once: true });
            }
        }

        this._inspectorInputTimeout = setTimeout(() => {
            this.app.saveState();
            this._inspectorInputTimeout = null;
        }, 300);
    }
}

window.InspectorManager = InspectorManager;