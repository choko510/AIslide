// paint.worker.js

let canvas, ctx;
let isDrawing = false, lastX = 0, lastY = 0, startX = 0, startY = 0;
let currentTool, brushColor, brushSize, eraserSize;
let currentLinePreview = null;
let imageForPaint = null; // Store the initial image data for clearing

// Utility function to convert hex color to RGB
function hexToRgb(hex) {
    if (!hex) return { r: 0, g: 0, b: 0 };
    const bigint = parseInt(hex.slice(1), 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

self.onmessage = (e) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'init':
            canvas = payload.canvas;
            ctx = canvas.getContext('2d', { willReadFrequently: true });
            break;
        case 'load_image':
            loadImage(payload.imageUrl, payload.filter);
            break;
        case 'draw_start':
            handleDrawStart(payload);
            break;
        case 'draw_move':
            handleDrawMove(payload);
            break;
        case 'draw_end':
            handleDrawEnd(payload);
            break;
        case 'update_settings':
            updateSettings(payload);
            break;
        case 'clear':
            clearCanvas();
            break;
        case 'get_blob':
            generateBlob();
            break;
    }
};

function generateBlob() {
    canvas.toBlob(blob => {
        self.postMessage({ type: 'generated_blob', payload: blob });
    }, 'image/png');
}


function updateSettings(settings) {
    currentTool = settings.tool;
    brushColor = settings.brushColor;
    brushSize = settings.brushSize;
    eraserSize = settings.eraserSize;
}

function loadImage(imageUrl, filter) {
    fetch(imageUrl)
        .then(res => res.blob())
        .then(blob => createImageBitmap(blob))
        .then(imgBitmap => {
            canvas.width = imgBitmap.width;
            canvas.height = imgBitmap.height;
            ctx.filter = filter;
            ctx.drawImage(imgBitmap, 0, 0);
            ctx.filter = 'none'; 
            imageForPaint = ctx.getImageData(0, 0, canvas.width, canvas.height);
            self.postMessage({ type: 'image_loaded', payload: { width: canvas.width, height: canvas.height } });
        }).catch(err => {
            console.error("Worker: Image load failed", err);
            self.postMessage({ type: 'load_error' });
        });
}

function clearCanvas() {
    if (imageForPaint) {
        ctx.putImageData(imageForPaint, 0, 0);
    }
}

function handleDrawStart(data) {
    isDrawing = true;
    [startX, startY] = [data.x, data.y];
    [lastX, lastY] = [startX, startY];

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (currentTool === 'brush' || currentTool === 'line') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = brushColor;
        ctx.lineWidth = brushSize;
    } else if (currentTool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = eraserSize;
    }

    if (currentTool === 'line') {
        currentLinePreview = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } else if (currentTool === 'fill') {
        floodFill(Math.floor(data.x), Math.floor(data.y), hexToRgb(brushColor));
        isDrawing = false;
    }
}

function handleDrawMove(data) {
    if (!isDrawing) return;
    const [currentX, currentY] = [data.x, data.y];

    if (currentTool === 'brush' || currentTool === 'eraser') {
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(currentX, currentY);
        ctx.stroke();
        [lastX, lastY] = [currentX, currentY];
    } else if (currentTool === 'line') {
        if (!currentLinePreview) return;
        ctx.putImageData(currentLinePreview, 0, 0);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(currentX, currentY);
        ctx.stroke();
    }
}

function handleDrawEnd(data) {
    if (!isDrawing) return;
    if (currentTool === 'line') {
        if (!currentLinePreview) return;
        ctx.putImageData(currentLinePreview, 0, 0);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(data.x, data.y);
        ctx.stroke();
    }
    isDrawing = false;
    currentLinePreview = null;
}

function floodFill(x, y, newColor) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;
    const stack = [[x, y]];
    const startIndex = (y * canvas.width + x) * 4;
    const startColor = [data[startIndex], data[startIndex + 1], data[startIndex + 2], data[startIndex + 3]];

    if (newColor.r === startColor[0] && newColor.g === startColor[1] && newColor.b === startColor[2] && startColor[3] === 255) {
        return;
    }
    
    const isTransparent = startColor[3] === 0;
    const visited = new Uint8Array(imageData.width * imageData.height);

    while (stack.length) {
        const [curX, curY] = stack.pop();

        if (curX < 0 || curX >= canvas.width || curY < 0 || curY >= canvas.height) {
            continue;
        }
        
        const visitedIndex = curY * canvas.width + curX;
        if(visited[visitedIndex]) {
            continue;
        }

        const currentIndex = visitedIndex * 4;
        const currentColor = [data[currentIndex], data[currentIndex + 1], data[currentIndex + 2], data[currentIndex + 3]];

        let colorMatch;
        if (isTransparent) {
            colorMatch = currentColor[3] === 0;
        } else {
            const tolerance = 10;
            colorMatch = Math.abs(currentColor[0] - startColor[0]) <= tolerance &&
                         Math.abs(currentColor[1] - startColor[1]) <= tolerance &&
                         Math.abs(currentColor[2] - startColor[2]) <= tolerance &&
                         Math.abs(currentColor[3] - startColor[3]) <= tolerance;
        }

        if (colorMatch) {
            data[currentIndex] = newColor.r;
            data[currentIndex + 1] = newColor.g;
            data[currentIndex + 2] = newColor.b;
            data[currentIndex + 3] = 255;
            
            visited[visitedIndex] = 1;

            stack.push([curX + 1, curY]);
            stack.push([curX - 1, curY]);
            stack.push([curX, curY + 1]);
            stack.push([curX, curY - 1]);
        }
    }
    ctx.putImageData(imageData, 0, 0);
}