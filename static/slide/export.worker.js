// Web Worker for exporting slides to PNG and PDF
// Import necessary scripts
self.importScripts(
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
);

self.onmessage = async (event) => {
    const { type, slideHTML, settings, slideId } = event.data;

    // Create a detached element to render the slide for export
    const container = self.document.createElement('div');
    container.style.width = `${settings.width}px`;
    container.style.height = `${settings.height}px`;
    container.style.position = 'absolute';
    container.style.left = '-9999px'; // Position off-screen
    container.innerHTML = slideHTML;
    self.document.body.appendChild(container);

    try {
        if (type === 'png') {
            const canvas = await html2canvas(container, {
                backgroundColor: "#fff",
                scale: 2,
                useCORS: true,
                logging: false
            });
            const dataUrl = canvas.toDataURL('image/png');
            self.postMessage({ success: true, type: 'png', dataUrl: dataUrl, slideId: slideId });

        } else if (type === 'pdf') {
            const { jsPDF } = self.jspdf;
            const pdf = new jsPDF({
                orientation: settings.width > settings.height ? 'l' : 'p',
                unit: 'px',
                format: [settings.width, settings.height]
            });
            
            const canvas = await html2canvas(container, {
                scale: 2,
                backgroundColor: "#fff",
                useCORS: true,
                logging: false
            });
            
            const imgData = canvas.toDataURL('image/png');
            pdf.addImage(imgData, 'PNG', 0, 0, settings.width, settings.height);
            const pdfData = pdf.output('arraybuffer'); // 'blob'の代わりに'arraybuffer'
            
            self.postMessage({ success: true, type: 'pdf', data: pdfData, slideId: slideId }, [pdfData]); // 第2引数で所有権を移譲
        }
    } catch (error) {
        console.error('Export worker error:', error);
        self.postMessage({ success: false, error: error.message, stack: error.stack });
    } finally {
        // Clean up the detached element
        self.document.body.removeChild(container);
    }
};