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
const paintCanvas = document.getElementById('imgedit-paint-canvas'), paintCtx = paintCanvas.getContext('2d'),
togglePaintSessionBtn = document.getElementById('imgedit-toggle-paint-session'),
paintToolsPanel = document.getElementById('imgedit-paint-tools-panel'),
paintToolButtons = document.querySelectorAll('.imgedit-tool-btn'),
brushSettings = document.getElementById('imgedit-brush-settings'),
eraserSettings = document.getElementById('imgedit-eraser-settings'),
brushSizeSlider = document.getElementById('imgedit-brush-size'), brushColorInput = document.getElementById('imgedit-brush-color'),
eraserSizeSlider = document.getElementById('imgedit-eraser-size'), clearPaintBtn = document.getElementById('imgedit-clear-paint'),
cancelPaintBtn = document.getElementById('imgedit-cancel-paint');

// State Variables
let cropper = null;
let originalImageDataURL = '', currentImageDataURL = '', imageBeforePaintURL = '';
let isDrawing = false, lastX = 0, lastY = 0, startX = 0, startY = 0;
let isPaintSessionActive = false;
let currentTool = 'brush'; // 'brush', 'eraser', 'line', 'fill'
let currentLinePreview = null;

// =================================
// Initial Setup & Image Loading
// =================================
function setupEventListeners() {
fileInput.addEventListener('change', handleFileSelect);
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); });
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        handleFileSelect({ target: fileInput });
    }
});

resetBtn.addEventListener('click', resetAll);
downloadBtn.addEventListener('click', downloadImage);
bgRemoveBtn.addEventListener('click', handleBackgroundRemoval);
cropBtn.addEventListener('click', toggleCropper);

[rotateLeftBtn, rotateRightBtn, flipHBtn, flipVBtn].forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (!cropper) return;
        const action = e.currentTarget.id;
        if (action === 'imgedit-rotate-left') cropper.rotate(-90);
        if (action === 'imgedit-rotate-right') cropper.rotate(90);
        if (action === 'imgedit-flip-h') cropper.scaleX(-cropper.getData().scaleX || -1);
        if (action === 'imgedit-flip-v') cropper.scaleY(-cropper.getData().scaleY || -1);
    });
});

filterSliders.forEach(slider => {
    slider.addEventListener('input', () => {
        const unit = slider.dataset.unit || '%';
        slider.nextElementSibling.textContent = `${slider.value}${unit}`;
        applyFiltersToImage();
    });
});

// Paint Listeners
togglePaintSessionBtn.addEventListener('click', togglePaintSession);
paintToolButtons.forEach(btn => btn.addEventListener('click', () => selectTool(btn.dataset.tool)));
[brushSizeSlider, eraserSizeSlider].forEach(slider => {
    slider.addEventListener('input', () => {
        slider.nextElementSibling.textContent = `${slider.value}${slider.dataset.unit}`;
    });
});
clearPaintBtn.addEventListener('click', clearPaint);
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
reader.onload = e => {
    originalImageDataURL = e.target.result;
    initEditor();
};
reader.readAsDataURL(file);
}

function initEditor() {
if (isPaintSessionActive) endPaintSession(false);
if (cropper) stopCropper();

currentImageDataURL = originalImageDataURL;
imageToEdit.src = currentImageDataURL;
imageToEdit.onload = () => {
    resetAllSettings();
    dropZoneContainer.classList.add('hidden');
    imageWorkspace.classList.remove('hidden');
    editorControls.classList.remove('hidden');
};
if (imageToEdit.complete) imageToEdit.onload();
}

// =================================
// Edit Functions (BG Remove, Filter, Crop)
// =================================
async function handleBackgroundRemoval() {
if (!currentImageDataURL) return;
showLoading('背景を削除中...', true);
try {
    const { removeBackground } = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.6.0/+esm');
    const blob = await removeBackground(currentImageDataURL, {
        publicPath: 'https://staticimgly.com/@imgly/background-removal-data/1.6.0/dist/',
        onProgress: (progress) => {
            const percent = Math.round(progress * 100);
            progressBar.style.width = `${percent}%`;
            loadingText.textContent = `モデルをDL中... ${percent}%`;
            if (percent === 100) loadingText.textContent = '画像を処理中...';
        },
    });
    currentImageDataURL = URL.createObjectURL(blob);
    imageToEdit.src = currentImageDataURL;
    resetAllSettings();
} catch (error) {
    console.error('Background removal failed:', error);
    alert(`背景の削除に失敗しました: ${error.message}`);
} finally {
    hideLoading();
}
}

function getFilterString() {
return Array.from(filterSliders).map(s => `${s.id.replace('imgedit-', '')}(${s.value}${s.dataset.unit})`).join(' ');
}

function applyFiltersToImage() {
imageToEdit.style.filter = getFilterString();
}

function toggleCropper() {
if (cropper) stopCropper(); else startCropper();
}

function startCropper() {
if (cropper || isPaintSessionActive) return;
cropper = new Cropper(imageToEdit, { viewMode: 1, autoCropArea: 0.9, background: false, responsive: true });
cropBtn.textContent = 'トリミング適用';
cropBtn.classList.replace('imgedit-secondary-btn', 'imgedit-primary-btn');
setControlsDisabled(true, ['imgedit-crop-btn', 'imgedit-rotate-left', 'imgedit-rotate-right', 'imgedit-flip-h', 'imgedit-flip-v', 'imgedit-reset-btn', 'imgedit-download-btn']);
}

function stopCropper() {
if (!cropper) return;
const croppedCanvas = cropper.getCroppedCanvas();
if (croppedCanvas) {
    currentImageDataURL = croppedCanvas.toDataURL('image/png');
    imageToEdit.src = currentImageDataURL;
}
cropper.destroy();
cropper = null;
imageToEdit.style.filter = ''; // Reset CSS filter after cropping
resetAllSettings();
cropBtn.textContent = 'トリミング';
cropBtn.classList.replace('imgedit-primary-btn', 'imgedit-secondary-btn');
setControlsDisabled(false);
}

// =================================
// Paint Mode Logic
// =================================
function togglePaintSession() {
if (isPaintSessionActive) endPaintSession(true); else startPaintSession();
}

function startPaintSession() {
if (cropper) stopCropper();
isPaintSessionActive = true;
imageBeforePaintURL = currentImageDataURL;

document.body.classList.add('imgedit-paint-session-active');
togglePaintSessionBtn.textContent = '描画を完了';
togglePaintSessionBtn.classList.replace('imgedit-primary-btn', 'imgedit-success-btn');
paintToolsPanel.classList.remove('hidden');
selectTool('brush'); // Default to brush

// Prepare canvas with filtered image
const img = new Image();
img.onload = () => {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = img.naturalWidth;
    tempCanvas.height = img.naturalHeight;
    tempCtx.filter = getFilterString();
    tempCtx.drawImage(img, 0, 0);

    const displayRect = imageToEdit.getBoundingClientRect();
    paintCanvas.width = displayRect.width;
    paintCanvas.height = displayRect.height;
    paintCtx.drawImage(tempCanvas, 0, 0, paintCanvas.width, paintCanvas.height);

    imageToEdit.classList.add('hidden');
    paintCanvas.classList.remove('hidden');
};
img.src = currentImageDataURL;
}

function endPaintSession(saveChanges) {
if (!isPaintSessionActive) return;
isPaintSessionActive = false;

if (saveChanges) {
    currentImageDataURL = paintCanvas.toDataURL('image/png');
    resetFilters();
}
imageToEdit.src = currentImageDataURL;

document.body.classList.remove('imgedit-paint-session-active');
togglePaintSessionBtn.textContent = '描画を開始';
togglePaintSessionBtn.classList.replace('imgedit-success-btn', 'imgedit-primary-btn');
paintToolsPanel.classList.add('hidden');

paintCanvas.classList.add('hidden');
imageToEdit.classList.remove('hidden');
paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
}

function selectTool(tool) {
currentTool = tool;
paintToolButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tool === tool));
paintCanvas.className = `cursor-${tool}`;
brushSettings.classList.toggle('hidden', tool === 'eraser');
eraserSettings.classList.toggle('hidden', tool !== 'eraser');
}

function clearPaint() {
// Re-draw the initial state of the paint session
startPaintSession();
}

// --- Drawing Handlers ---
function startDrawing(e) {
if (!isPaintSessionActive) return;
isDrawing = true;
const rect = paintCanvas.getBoundingClientRect();
[startX, startY] = [e.clientX - rect.left, e.clientY - rect.top];
[lastX, lastY] = [startX, startY];

paintCtx.lineJoin = 'round';
paintCtx.lineCap = 'round';

if (currentTool === 'brush' || currentTool === 'line') {
    paintCtx.globalCompositeOperation = 'source-over';
    paintCtx.strokeStyle = brushColorInput.value;
    paintCtx.lineWidth = brushSizeSlider.value;
} else if (currentTool === 'eraser') {
    paintCtx.globalCompositeOperation = 'destination-out';
    paintCtx.lineWidth = eraserSizeSlider.value;
}

if (currentTool === 'line') {
    currentLinePreview = paintCtx.getImageData(0, 0, paintCanvas.width, paintCanvas.height);
} else if (currentTool === 'fill') {
    floodFill(Math.floor(e.clientX - rect.left), Math.floor(e.clientY - rect.top), hexToRgb(brushColorInput.value));
    isDrawing = false;
}
}

function draw(e) {
if (!isDrawing) return;
const rect = paintCanvas.getBoundingClientRect();
const [currentX, currentY] = [e.clientX - rect.left, e.clientY - rect.top];

if (currentTool === 'brush' || currentTool === 'eraser') {
    paintCtx.beginPath();
    paintCtx.moveTo(lastX, lastY);
    paintCtx.lineTo(currentX, currentY);
    paintCtx.stroke();
    [lastX, lastY] = [currentX, currentY];
} else if (currentTool === 'line') {
    paintCtx.putImageData(currentLinePreview, 0, 0);
    paintCtx.beginPath();
    paintCtx.moveTo(startX, startY);
    paintCtx.lineTo(currentX, currentY);
    paintCtx.stroke();
}
}

function stopDrawing(e) {
if (!isDrawing) return;
if (currentTool === 'line') {
    paintCtx.putImageData(currentLinePreview, 0, 0);
    paintCtx.beginPath();
    const rect = paintCanvas.getBoundingClientRect();
    paintCtx.moveTo(startX, startY);
    paintCtx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    paintCtx.stroke();
}
isDrawing = false;
currentLinePreview = null;
}

// --- Fill Algorithm ---
function floodFill(x, y, newColor) {
// Flood fill logic remains complex, providing a simplified but effective version
const imageData = paintCtx.getImageData(0, 0, paintCanvas.width, paintCanvas.height);
const { data } = imageData;
const stack = [[x, y]];
const startIdx = (y * paintCanvas.width + x) * 4;
const startColor = [data[startIdx], data[startIdx + 1], data[startIdx + 2], data[startIdx + 3]];

if (newColor.r === startColor[0] && newColor.g === startColor[1] && newColor.b === startColor[2]) return;

while (stack.length) {
    const [curX, curY] = stack.pop();
    if (curX < 0 || curX >= paintCanvas.width || curY < 0 || curY >= paintCanvas.height) continue;

    const idx = (curY * paintCanvas.width + curX) * 4;
    if (data[idx] === startColor[0] && data[idx + 1] === startColor[1] &&
        data[idx + 2] === startColor[2] && data[idx + 3] === startColor[3]) {

        data[idx] = newColor.r; data[idx + 1] = newColor.g;
        data[idx + 2] = newColor.b; data[idx + 3] = 255;

        stack.push([curX + 1, curY], [curX - 1, curY], [curX, curY + 1], [curX, curY - 1]);
    }
}
paintCtx.putImageData(imageData, 0, 0);
}
function hexToRgb(hex) {
const bigint = parseInt(hex.slice(1), 16);
return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

// =================================
// Main Actions & Helpers
// =================================
function resetAll() {
if (isPaintSessionActive) endPaintSession(false);
if (cropper) stopCropper();
currentImageDataURL = originalImageDataURL;
imageToEdit.src = currentImageDataURL;
resetAllSettings();
}

function resetAllSettings() {
resetFilters();
applyFiltersToImage();
}

function resetFilters() {
filterSliders.forEach(slider => {
    const defaultValue = ['imgedit-brightness', 'imgedit-contrast', 'imgedit-saturate'].includes(slider.id) ? '100' : '0';
    slider.value = defaultValue;
    slider.nextElementSibling.textContent = `${defaultValue}${slider.dataset.unit}`;
});
}

function downloadImage() {
showLoading('画像を生成中...', false);
const finalCanvas = document.createElement('canvas');
const finalCtx = finalCanvas.getContext('2d');
const img = new Image();
img.onload = () => {
    finalCanvas.width = img.naturalWidth;
    finalCanvas.height = img.naturalHeight;
    finalCtx.filter = isPaintSessionActive ? 'none' : getFilterString();
    finalCtx.drawImage(img, 0, 0);

    // overrideImageDownload 関数を呼び出す
    if (window.overrideImageDownload) {
        window.overrideImageDownload(finalCanvas.toDataURL('image/png'));
    } else {
        // フォールバックとしてダウンロード
        const link = document.createElement('a');
        link.download = `edited-image_${Date.now()}.png`;
        link.href = finalCanvas.toDataURL('image/png');
        link.click();
    }
    hideLoading();
};
img.src = currentImageDataURL;
}

function showLoading(text, showProgress) {
loadingText.textContent = text;
progressBar.style.width = '0%';
progressBar.parentElement.style.display = showProgress ? 'block' : 'none';
loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
loadingOverlay.classList.add('hidden');
}

function setControlsDisabled(disabled, whitelist = []) {
editorControls.querySelectorAll('button, input').forEach(el => {
    el.disabled = whitelist.includes(el.id) ? false : disabled;
});
}

// Initialize the application
setupEventListeners();