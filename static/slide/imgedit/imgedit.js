// Element References
const fileInput = document.getElementById('imgedit-file-input'), dropZone = document.getElementById('imgedit-drop-zone'),
dropZoneContainer = document.getElementById('imgedit-drop-zone-container'), imageToEdit = document.getElementById('imgedit-image-to-edit'),
imageWorkspace = document.getElementById('imgedit-image-workspace'), editorControls = document.getElementById('imgedit-editor-controls'),
bgRemoveBtn = document.getElementById('imgedit-bg-remove-btn'), cropBtn = document.getElementById('imgedit-crop-btn'),
rotateLeftBtn = document.getElementById('imgedit-rotate-left'), rotateRightBtn = document.getElementById('imgedit-rotate-right'),
flipHBtn = document.getElementById('imgedit-flip-h'), flipVBtn = document.getElementById('imgedit-flip-v'),
resetBtn = document.getElementById('imgedit-reset-btn'), downloadBtn = document.getElementById('imgedit-download-btn'),
filterSliders = document.querySelectorAll('.filter-slider'), loadingOverlay = document.getElementById('imgedit-loading-overlay'),
loadingText = document.getElementById('imgedit-loading-text'), progressBar = document.getElementById('imgedit-progress-bar');

// Paint Element References
const paintCanvas = document.getElementById('imgedit-paint-canvas'),
togglePaintSessionBtn = document.getElementById('imgedit-toggle-paint-session'),
paintToolsPanel = document.getElementById('imgedit-paint-tools-panel'),
paintToolButtons = document.querySelectorAll('.imgedit-tool-btn'),
brushSettings = document.getElementById('imgedit-brush-settings'),
eraserSettings = document.getElementById('imgedit-eraser-settings'),
brushSizeSlider = document.getElementById('imgedit-brush-size'), brushColorInput = document.getElementById('imgedit-brush-color'),
eraserSizeSlider = document.getElementById('imgedit-eraser-size'), clearPaintBtn = document.getElementById('imgedit-clear-paint'),
cancelPaintBtn = document.getElementById('imgedit-cancel-paint');

// Constants
const CONSTANTS = {
    TOOLS: { BRUSH: 'brush', ERASER: 'eraser', LINE: 'line', FILL: 'fill' },
    CSS_CLASSES: { HIDDEN: 'hidden', ACTIVE: 'active', DRAG_OVER: 'drag-over', PRIMARY_BTN: 'btn btn-primary', SECONDARY_BTN: 'btn btn-secondary', SUCCESS_BTN: 'btn btn-success', DANGER_BTN: 'btn btn-danger' }
};

// State Management
const State = {
    cropper: null, originalImageDataURL: '', currentImageDataURL: '', isDrawing: false,
    isPaintSessionActive: false, currentTool: CONSTANTS.TOOLS.BRUSH, historyStack: [],
    paintCanvasSize: { width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 }
};
let paintWorker = null;
let undoBtn = null; // Will be initialized in setupEventListeners

// =================================
// Worker Communication & Events
// =================================
function initPaintWorker() {
    if (paintWorker) return;
    paintWorker = new Worker('imgedit/paint.worker.js');
    paintWorker.onmessage = (e) => {
        const { type, payload } = e.data;
        if (type === 'image_loaded') {
            State.paintCanvasSize.naturalWidth = payload.width;
            State.paintCanvasSize.naturalHeight = payload.height;
            // Canvas size is already set. Just switch visibility.
            imageToEdit.classList.add(CONSTANTS.CSS_CLASSES.HIDDEN);
            paintCanvas.classList.remove(CONSTANTS.CSS_CLASSES.HIDDEN);
            hideLoading();
        } else if (type === 'load_error') {
            alert('ペイント用画像の読み込みに失敗しました。');
            endPaintSession(false);
            hideLoading();
        }
    };
}

function getScaledCoords(e) {
    const rect = paintCanvas.getBoundingClientRect();
    if (!State.paintCanvasSize.naturalWidth || !State.paintCanvasSize.naturalHeight) {
        return { x: 0, y: 0 };
    }
    const scaleX = State.paintCanvasSize.naturalWidth / rect.width;
    const scaleY = State.paintCanvasSize.naturalHeight / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

// =================================
// History (Undo) Management
// =================================
function undo() {
    if (State.historyStack.length === 0) return;
    if (State.cropper) {
        State.cropper.destroy(); State.cropper = null;
        cropBtn.textContent = 'トリミング';
        cropBtn.classList.replace(CONSTANTS.CSS_CLASSES.PRIMARY_BTN, CONSTANTS.CSS_CLASSES.SECONDARY_BTN);
        setControlsDisabled(false);
    }
    if (State.isPaintSessionActive) endPaintSession(false);

    const lastAction = State.historyStack.pop();
    if (lastAction && typeof lastAction.undo === 'function') lastAction.undo();
    
    resetAllSettings();
    updateUndoButton();
}

function updateUndoButton() {
    if (undoBtn) undoBtn.disabled = State.historyStack.length === 0;
}

// =================================
// Initial Setup & Image Loading
// =================================
function setupEventListeners() {
    undoBtn = document.getElementById('imgedit-undo-btn');
    fileInput.addEventListener('change', handleFileSelect);
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add(CONSTANTS.CSS_CLASSES.DRAG_OVER); });
    dropZone.addEventListener('dragleave', e => { e.preventDefault(); dropZone.classList.remove(CONSTANTS.CSS_CLASSES.DRAG_OVER); });
    dropZone.addEventListener('drop', e => {
        e.preventDefault(); dropZone.classList.remove(CONSTANTS.CSS_CLASSES.DRAG_OVER);
        if (e.dataTransfer.files.length) { fileInput.files = e.dataTransfer.files; handleFileSelect({ target: fileInput }); }
    });

    if(undoBtn) undoBtn.addEventListener('click', undo);
    resetBtn.addEventListener('click', resetAll);
    downloadBtn.addEventListener('click', downloadImage);
    bgRemoveBtn.addEventListener('click', handleBackgroundRemoval);
    cropBtn.addEventListener('click', toggleCropper);

    [rotateLeftBtn, rotateRightBtn, flipHBtn, flipVBtn].forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (!State.cropper) return;
            const action = e.currentTarget.id;
            if (action === 'imgedit-rotate-left') State.cropper.rotate(-90);
            if (action === 'imgedit-rotate-right') State.cropper.rotate(90);
            if (action === 'imgedit-flip-h') State.cropper.scaleX(-State.cropper.getData().scaleX || -1);
            if (action === 'imgedit-flip-v') State.cropper.scaleY(-State.cropper.getData().scaleY || -1);
        });
    });

    filterSliders.forEach(slider => {
        slider.addEventListener('input', () => {
            const unit = slider.dataset.unit || '%';
            slider.nextElementSibling.textContent = `${slider.value}${unit}`;
            applyFiltersToImage();
        });
    });

    togglePaintSessionBtn.addEventListener('click', togglePaintSession);
    paintToolButtons.forEach(btn => btn.addEventListener('click', () => selectTool(btn.dataset.tool)));
    [brushSizeSlider, brushColorInput, eraserSizeSlider].forEach(el => el.addEventListener('input', updatePaintSettings));
    clearPaintBtn.addEventListener('click', () => paintWorker?.postMessage({ type: 'clear' }));
    cancelPaintBtn.addEventListener('click', () => endPaintSession(false));

    paintCanvas.addEventListener('mousedown', startDrawing);
    paintCanvas.addEventListener('mousemove', draw);
    paintCanvas.addEventListener('mouseup', stopDrawing);
    paintCanvas.addEventListener('mouseout', stopDrawing);
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => { State.originalImageDataURL = e.target.result; initEditor(); };
    reader.readAsDataURL(file);
}

function initEditor() {
    if (State.isPaintSessionActive) endPaintSession(false);
    if (State.cropper) stopCropper();

    State.currentImageDataURL = State.originalImageDataURL;
    State.historyStack = [];
    updateUndoButton();

    imageToEdit.onerror = () => {
        alert('画像の読み込みに失敗しました。');
        dropZoneContainer.classList.remove(CONSTANTS.CSS_CLASSES.HIDDEN);
        imageWorkspace.classList.add(CONSTANTS.CSS_CLASSES.HIDDEN);
        editorControls.classList.add(CONSTANTS.CSS_CLASSES.HIDDEN);
    };

    imageToEdit.onload = () => {
        resetAllSettings();
        dropZoneContainer.classList.add(CONSTANTS.CSS_CLASSES.HIDDEN);
        imageWorkspace.classList.remove(CONSTANTS.CSS_CLASSES.HIDDEN);
        editorControls.classList.remove(CONSTANTS.CSS_CLASSES.HIDDEN);
    };
    imageToEdit.src = State.currentImageDataURL;
    if (imageToEdit.complete) imageToEdit.onload();
}

// =================================
// Edit Functions
// =================================
async function handleBackgroundRemoval() {
    if (!State.currentImageDataURL) return;
    const oldImageDataURL = State.currentImageDataURL;
    showLoading('背景を削除中...', true);
    try {
        const { removeBackground } = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.6.0/+esm');
        const blob = await removeBackground(State.currentImageDataURL, {
            publicPath: 'https://staticimgly.com/@imgly/background-removal-data/1.6.0/dist/',
            onProgress: (p, t) => { const pct = Math.round(p/t*100); progressBar.style.width = `${pct}%`; loadingText.textContent = `モデルをDL中... ${pct}%`; if (pct === 100) loadingText.textContent = '画像を処理中...'; },
        });
        State.currentImageDataURL = URL.createObjectURL(blob);
        imageToEdit.src = State.currentImageDataURL;
        State.historyStack.push({ type: 'bg-remove', undo: () => { State.currentImageDataURL = oldImageDataURL; imageToEdit.src = oldImageDataURL; }});
        updateUndoButton();
        resetAllSettings();
    } catch (error) {
        console.error('Background removal failed:', error);
        alert(`背景の削除に失敗しました: ${error.message}`);
        imageToEdit.src = oldImageDataURL;
    } finally {
        hideLoading();
    }
}

function getFilterString() {
    return Array.from(filterSliders).map(s => `${s.id.replace('imgedit-', '')}(${s.value}${s.dataset.unit})`).join(' ');
}

function applyFiltersToImage() { imageToEdit.style.filter = getFilterString(); }

function toggleCropper() { if (State.cropper) stopCropper(); else startCropper(); }

async function startCropper() {
  if (State.cropper || State.isPaintSessionActive) return;
  if (!window.Cropper) await import('https://cdn.jsdelivr.net/npm/cropperjs@2.0.0/dist/cropper.min.js');
  State.cropper = new window.Cropper(imageToEdit, { viewMode: 1, autoCropArea: 0.9, background: false, responsive: true });
  cropBtn.textContent = 'トリミング適用';
  cropBtn.classList.replace(CONSTANTS.CSS_CLASSES.SECONDARY_BTN, CONSTANTS.CSS_CLASSES.PRIMARY_BTN);
  setControlsDisabled(true, ['imgedit-crop-btn', 'imgedit-rotate-left', 'imgedit-rotate-right', 'imgedit-flip-h', 'imgedit-flip-v', 'imgedit-reset-btn', 'imgedit-download-btn']);
}

function stopCropper() {
    if (!State.cropper) return;
    const oldImageDataURL = State.currentImageDataURL;
    const croppedCanvas = State.cropper.getCroppedCanvas();
    if (croppedCanvas) {
        State.currentImageDataURL = croppedCanvas.toDataURL('image/png');
        State.historyStack.push({ type: 'crop', undo: () => { State.currentImageDataURL = oldImageDataURL; imageToEdit.src = oldImageDataURL; }});
        updateUndoButton();
        imageToEdit.src = State.currentImageDataURL;
    }
    State.cropper.destroy(); State.cropper = null;
    imageToEdit.style.filter = '';
    resetAllSettings();
    cropBtn.textContent = 'トリミング';
    cropBtn.classList.replace(CONSTANTS.CSS_CLASSES.PRIMARY_BTN, CONSTANTS.CSS_CLASSES.SECONDARY_BTN);
    setControlsDisabled(false);
}

// =================================
// Paint Mode Logic
// =================================
function togglePaintSession() { if (State.isPaintSessionActive) endPaintSession(true); else startPaintSession(); }

function startPaintSession() {
    if (State.cropper) stopCropper();
    showLoading('描画モードを準備中...', false);
    State.isPaintSessionActive = true;
    
    initPaintWorker();

    // Set canvas size on main thread BEFORE transferring control
    const displayRect = imageToEdit.getBoundingClientRect();
    paintCanvas.width = displayRect.width;
    paintCanvas.height = displayRect.height;
    State.paintCanvasSize.width = displayRect.width;
    State.paintCanvasSize.height = displayRect.height;

    const offscreen = paintCanvas.transferControlToOffscreen();
    paintWorker.postMessage({ type: 'init', payload: { canvas: offscreen } }, [offscreen]);
    
    const imageURLToLoad = State.currentImageDataURL;
    paintWorker.postMessage({ type: 'load_image', payload: { imageUrl: imageURLToLoad, filter: getFilterString() } });

    document.body.classList.add('imgedit-paint-session-active');
    togglePaintSessionBtn.textContent = '描画を完了';
    togglePaintSessionBtn.classList.replace(CONSTANTS.CSS_CLASSES.PRIMARY_BTN, CONSTANTS.CSS_CLASSES.SUCCESS_BTN);
    paintToolsPanel.classList.remove(CONSTANTS.CSS_CLASSES.HIDDEN);
    selectTool(CONSTANTS.TOOLS.BRUSH);
}

async function endPaintSession(saveChanges) {
    if (!State.isPaintSessionActive) return;

    if (saveChanges) {
        showLoading('描画を保存中...', false);
        const oldImageDataURL = State.currentImageDataURL;
        
        const blob = await new Promise(resolve => {
            const listener = (e) => {
                if (e.data.type === 'generated_blob') {
                    paintWorker.removeEventListener('message', listener);
                    resolve(e.data.payload);
                }
            };
            paintWorker.addEventListener('message', listener);
            paintWorker.postMessage({ type: 'get_blob' });
        });

        if (blob) {
            State.currentImageDataURL = URL.createObjectURL(blob);
            State.historyStack.push({ type: 'paint', undo: () => { State.currentImageDataURL = oldImageDataURL; imageToEdit.src = oldImageDataURL; }});
            updateUndoButton();
            resetFilters();
        }
        hideLoading();
    }
    imageToEdit.src = State.currentImageDataURL;

    State.isPaintSessionActive = false;
    document.body.classList.remove('imgedit-paint-session-active');
    togglePaintSessionBtn.textContent = '描画を開始';
    togglePaintSessionBtn.classList.replace(CONSTANTS.CSS_CLASSES.SUCCESS_BTN, CONSTANTS.CSS_CLASSES.PRIMARY_BTN);
    paintToolsPanel.classList.add(CONSTANTS.CSS_CLASSES.HIDDEN);

    paintCanvas.classList.add(CONSTANTS.CSS_CLASSES.HIDDEN);
    imageToEdit.classList.remove(CONSTANTS.CSS_CLASSES.HIDDEN);
    // When using OffscreenCanvas, the main context is no longer used for clearing.
}

function selectTool(tool) {
    State.currentTool = tool;
    paintToolButtons.forEach(btn => btn.classList.toggle(CONSTANTS.CSS_CLASSES.ACTIVE, btn.dataset.tool === tool));
    paintCanvas.className = `cursor-${tool}`;
    brushSettings.classList.toggle(CONSTANTS.CSS_CLASSES.HIDDEN, tool === CONSTANTS.TOOLS.ERASER);
    eraserSettings.classList.toggle(CONSTANTS.CSS_CLASSES.HIDDEN, tool !== CONSTANTS.TOOLS.ERASER);
    updatePaintSettings();
}

function updatePaintSettings() {
    if (!paintWorker) return;
    paintWorker.postMessage({ type: 'update_settings', payload: {
        tool: State.currentTool,
        brushColor: brushColorInput.value,
        brushSize: brushSizeSlider.value,
        eraserSize: eraserSizeSlider.value
    }});
}

function startDrawing(e) {
    if (!State.isPaintSessionActive) return;
    State.isDrawing = true;
    const coords = getScaledCoords(e);
    paintWorker.postMessage({ type: 'draw_start', payload: coords });
}

function draw(e) {
    if (!State.isDrawing) return;
    const coords = getScaledCoords(e);
    paintWorker.postMessage({ type: 'draw_move', payload: coords });
}

function stopDrawing(e) {
    if (!State.isDrawing) return;
    State.isDrawing = false;
    const coords = getScaledCoords(e);
    paintWorker.postMessage({ type: 'draw_end', payload: coords });
}

// =================================
// Main Actions & Helpers
// =================================
function resetAll() {
    if (State.isPaintSessionActive) endPaintSession(false);
    if (State.cropper) { State.cropper.destroy(); State.cropper = null; }
    State.currentImageDataURL = State.originalImageDataURL;
    imageToEdit.src = State.currentImageDataURL;
    State.historyStack = [];
    updateUndoButton();
    resetAllSettings();
}

function resetAllSettings() { resetFilters(); applyFiltersToImage(); }

function resetFilters() {
    filterSliders.forEach(slider => {
        const defaultValue = ['imgedit-brightness', 'imgedit-contrast', 'imgedit-saturate'].includes(slider.id) ? '100' : '0';
        slider.value = defaultValue;
        const unit = slider.dataset.unit || '%';
        slider.nextElementSibling.textContent = `${defaultValue}${unit}`;
    });
}

function downloadImage() {
    showLoading('画像を生成中...', false);
    const finalCanvas = document.createElement('canvas');
    const finalCtx = finalCanvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
        finalCanvas.width = img.naturalWidth;
        finalCanvas.height = img.naturalHeight;
        finalCtx.filter = getFilterString();
        finalCtx.drawImage(img, 0, 0);

        if (window.overrideImageDownload) {
            window.overrideImageDownload(finalCanvas.toDataURL('image/png'));
        } else {
            const link = document.createElement('a');
            link.download = `edited-image_${Date.now()}.png`;
            link.href = finalCanvas.toDataURL('image/png');
            link.click();
        }
        hideLoading();
    };
    img.onerror = () => { alert('画像の書き出しに失敗しました。'); hideLoading(); }
    img.src = State.currentImageDataURL;
}

function showLoading(text, showProgress) {
    loadingText.textContent = text;
    progressBar.style.width = '0%';
    progressBar.parentElement.style.display = showProgress ? 'block' : 'none';
    loadingOverlay.classList.remove(CONSTANTS.CSS_CLASSES.HIDDEN);
}

function hideLoading() { loadingOverlay.classList.add(CONSTANTS.CSS_CLASSES.HIDDEN); }

function setControlsDisabled(disabled, whitelist = []) {
    editorControls.querySelectorAll('button, input').forEach(el => {
        if (el.id === 'imgedit-undo-btn') return;
        el.disabled = whitelist.includes(el.id) ? false : disabled;
    });
}

// Initialize
setupEventListeners();
updateUndoButton();