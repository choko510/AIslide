// Web Worker for exporting slides to PDF, and editable PPTX
self.importScripts(
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    'https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.min.js'
);

self.onmessage = async (event) => {
    const { type, settings, slides, dataUrls } = event.data;

    try {
        if (type === 'pptx') {
            const pptx = new PptxGenJS();
            const layoutWidthInches = settings.width / 96;
            const layoutHeightInches = settings.height / 96;

            pptx.defineLayout({ name: 'CUSTOM_LAYOUT', width: layoutWidthInches, height: layoutHeightInches });
            pptx.layout = 'CUSTOM_LAYOUT';

            for (const slideData of slides) {
                const { slideData: slide, dataUrl } = slideData;
                const presSlide = pptx.addSlide();

                presSlide.addImage({ data: dataUrl, x: 0, y: 0, w: '100%', h: '100%' });

                for (const element of slide.elements) {
                    if (element.type !== 'text' && element.type !== 'shape') continue;

                    const options = {
                        x: (element.style.left / 100) * layoutWidthInches,
                        y: (element.style.top / 100) * layoutHeightInches,
                        w: (element.style.width / 100) * layoutWidthInches,
                        h: (element.style.height / 100) * layoutHeightInches,
                        rotate: element.style.rotation || 0,
                    };
                    
                    const cleanColor = (color) => color ? color.substring(0, 7) : '000000';

                    if (element.type === 'text') {
                        Object.assign(options, {
                            color: cleanColor(element.style.color),
                            fontFace: element.style.fontFamily || 'Arial',
                            fontSize: element.style.fontSize || 18,
                            align: element.style.textAlign || 'left',
                            valign: 'middle',
                            fill: { color: cleanColor(element.style.backgroundColor) || 'FFFFFF' },
                            autoFit: true,
                        });

                        options.vert = element.style.vertical ? 'eaVert' : 'horz';
                        
                        const sanitizeContent = (input) => {
                            let previous;
                            do {
                                previous = input;
                                input = input.replace(/<[^>]*>/g, '');
                            } while (input !== previous);
                            return input;
                        };
                        const textContent = sanitizeContent(element.content);
                        presSlide.addText(textContent, options);
                    
                    } else if (element.type === 'shape') {
                        const shapeTypeMap = {
                            rectangle: pptx.shapes.RECTANGLE,
                            circle: pptx.shapes.OVAL,
                            triangle: pptx.shapes.ISOSCELES_TRIANGLE,
                        };
                        const pptxShape = shapeTypeMap[element.content.shapeType];
                        
                        if (pptxShape) {
                            Object.assign(options, {
                                fill: { color: cleanColor(element.style.fill), transparency: 20 },
                                line: { color: cleanColor(element.style.stroke), width: element.style.strokeWidth || 0 },
                            });
                            presSlide.addShape(pptxShape, options);
                        }
                    }
                }
            }
            const pptxData = await pptx.write('arraybuffer');
            self.postMessage({ success: true, type: 'pptx', data: pptxData }, [pptxData]);

        } else if (type === 'pdf') {
            const { jsPDF } = self.jspdf;
            const pdf = new jsPDF({
                orientation: settings.width > settings.height ? 'l' : 'p',
                unit: 'px',
                format: [settings.width, settings.height]
            });
            dataUrls.forEach((dataUrl, index) => {
                if (index > 0) pdf.addPage();
                pdf.addImage(dataUrl, 'PNG', 0, 0, settings.width, settings.height);
            });
            const pdfData = pdf.output('arraybuffer');
            self.postMessage({ success: true, type: 'pdf', data: pdfData }, [pdfData]);

        } else if (type === 'png-all') {
            const zip = new JSZip();
            slides.forEach(slide => {
                const base64Data = slide.dataUrl.split(',')[1];
                zip.file(`slide-${slide.id}.png`, base64Data, { base64: true });
            });
            const zipData = await zip.generateAsync({ type: 'arraybuffer' });
            self.postMessage({ success: true, type: 'png-all', data: zipData }, [zipData]);
        }
    } catch (error) {
        console.error('Export worker error:', error.name, error.message, error.stack);
        self.postMessage({ success: false, error: `${error.name}: ${error.message}` });
    }
};