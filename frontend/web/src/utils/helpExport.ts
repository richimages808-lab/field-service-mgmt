/**
 * Help Article Export Utilities
 * Generates PDF and PNG exports of help articles with screenshots and steps.
 */
import type { HelpArticle, HelpStep } from '../lib/helpContent';

/**
 * Export a help article as a branded PDF with steps and screenshots
 */
export async function exportHelpArticlePDF(article: HelpArticle): Promise<void> {
    const { default: jsPDF } = await import('jspdf');

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    // ── Brand header ──
    pdf.setFillColor(30, 64, 175); // blue-800
    pdf.rect(0, 0, pageWidth, 28, 'F');
    pdf.setFillColor(180, 130, 50); // amber accent stripe
    pdf.rect(0, 28, pageWidth, 2, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.setTextColor(255, 255, 255);
    pdf.text('DispatchBox', margin, 14);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Help Center', margin, 22);

    y = 38;

    // ── Article title ──
    pdf.setTextColor(17, 24, 39); // gray-900
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    const titleLines = pdf.splitTextToSize(article.title, contentWidth);
    pdf.text(titleLines, margin, y);
    y += titleLines.length * 8 + 2;

    // ── Metadata line ──
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(107, 114, 128); // gray-500
    pdf.text(`Last updated: ${article.lastUpdated}`, margin, y);
    y += 8;

    // ── Divider ──
    pdf.setDrawColor(229, 231, 235); // gray-200
    pdf.setLineWidth(0.5);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 6;

    // Helper: check if we need a new page
    const ensureSpace = (needed: number) => {
        if (y + needed > pageHeight - margin) {
            pdf.addPage();
            y = margin;
        }
    };

    if (article.steps && article.steps.length > 0) {
        // ── Render steps ──
        for (const step of article.steps) {
            ensureSpace(45);

            // Step number badge
            pdf.setFillColor(30, 64, 175); // blue-800
            pdf.circle(margin + 5, y + 3, 5, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.setTextColor(255, 255, 255);
            pdf.text(String(step.stepNumber), margin + 5 - (String(step.stepNumber).length > 1 ? 3 : 1.5), y + 5.5);

            // Step title
            pdf.setTextColor(17, 24, 39);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(13);
            pdf.text(step.title, margin + 14, y + 5.5);
            y += 14;

            // Step description
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(10);
            pdf.setTextColor(55, 65, 81); // gray-700
            const descLines = pdf.splitTextToSize(step.description, contentWidth - 14);
            for (const line of descLines) {
                ensureSpace(6);
                pdf.text(line, margin + 14, y);
                y += 5;
            }
            y += 2;

            // Screenshot
            if (step.screenshotUrl) {
                try {
                    const img = await loadImage(step.screenshotUrl);
                    const imgWidth = contentWidth - 14;
                    const aspectRatio = img.height / img.width;
                    const imgHeight = Math.min(imgWidth * aspectRatio, 90);
                    ensureSpace(imgHeight + 8);

                    // Shadow effect
                    pdf.setFillColor(240, 240, 240);
                    pdf.roundedRect(margin + 15, y + 1, imgWidth - 2, imgHeight + 2, 2, 2, 'F');

                    pdf.addImage(img, 'PNG', margin + 14, y, imgWidth, imgHeight);
                    // Border
                    pdf.setDrawColor(209, 213, 219); // gray-300
                    pdf.setLineWidth(0.3);
                    pdf.roundedRect(margin + 14, y, imgWidth, imgHeight, 1, 1, 'S');
                    y += imgHeight + 6;
                } catch {
                    // Skip screenshot if it fails to load
                    pdf.setFontSize(8);
                    pdf.setTextColor(156, 163, 175);
                    pdf.text('[Screenshot not available]', margin + 14, y);
                    y += 6;
                }
            }

            // Pro tip
            if (step.tip) {
                ensureSpace(16);
                pdf.setFillColor(254, 252, 232); // yellow-50
                const tipLines = pdf.splitTextToSize(`💡 Tip: ${step.tip}`, contentWidth - 20);
                const tipHeight = tipLines.length * 5 + 6;
                pdf.roundedRect(margin + 14, y - 2, contentWidth - 14, tipHeight, 2, 2, 'F');
                pdf.setDrawColor(234, 179, 8); // yellow-500
                pdf.setLineWidth(0.5);
                pdf.line(margin + 14, y - 2, margin + 14, y - 2 + tipHeight);

                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(9);
                pdf.setTextColor(113, 63, 18); // yellow-900
                for (const line of tipLines) {
                    pdf.text(line, margin + 18, y + 2);
                    y += 5;
                }
                y += 4;
            }

            y += 4; // spacing between steps
        }
    } else {
        // ── Render plain content ──
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(55, 65, 81);
        const contentText = article.content
            .replace(/\\n/g, '\n')
            .replace(/\*\*(.*?)\*\*/g, '$1'); // strip bold markers for PDF
        const lines = pdf.splitTextToSize(contentText, contentWidth);
        for (const line of lines) {
            ensureSpace(6);
            pdf.text(line, margin, y);
            y += 5;
        }
    }

    // ── Footer on every page ──
    const totalPages = pdf.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(156, 163, 175);
        pdf.text(
            `DispatchBox Help Center  •  ${article.title}  •  Page ${i} of ${totalPages}`,
            margin,
            pageHeight - 8
        );
    }

    // Save
    const filename = `DispatchBox-Help-${article.id}.pdf`;
    pdf.save(filename);
}

/**
 * Export the currently rendered help article view as a PNG image
 */
export async function exportHelpArticleImage(elementId: string, articleTitle: string): Promise<void> {
    const { default: html2canvas } = await import('html2canvas');
    const element = document.getElementById(elementId);
    if (!element) {
        console.error('Help article element not found for export:', elementId);
        return;
    }

    const canvas = await html2canvas(element, {
        scale: 2,                   // retina quality
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        windowWidth: 1200,          // consistent width
    });

    // Convert to blob and download
    canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `DispatchBox-Help-${articleTitle.replace(/[^a-zA-Z0-9]/g, '-')}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 'image/png');
}

/**
 * Helper: load an image from URL and return an HTMLImageElement
 */
function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}
