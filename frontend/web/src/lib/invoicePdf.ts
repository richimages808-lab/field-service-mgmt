import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Invoice } from '../types';

/**
 * Generates a professional PDF for a given invoice and triggers a browser download.
 */
export function downloadInvoicePDF(invoice: Invoice): void {
    const doc = new jsPDF();

    const invoiceNumber = `INV-${invoice.id.slice(0, 6).toUpperCase()}`;
    const invoiceDate = invoice.createdAt?.toDate
        ? invoice.createdAt.toDate().toLocaleDateString()
        : 'N/A';
    const dueDate = (invoice as any).dueDate?.toDate
        ? (invoice as any).dueDate.toDate().toLocaleDateString()
        : 'Upon Receipt';

    // ── Header ──────────────────────────────────────────────
    doc.setFontSize(28);
    doc.setTextColor(31, 41, 55); // gray-800
    doc.text('INVOICE', 14, 25);

    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128); // gray-500
    doc.text(invoiceNumber, 14, 33);

    // Status badge
    const statusColors: Record<string, [number, number, number]> = {
        paid: [22, 163, 74],      // green-600
        sent: [37, 99, 235],      // blue-600
        draft: [202, 138, 4],     // yellow-600
        void: [220, 38, 38],      // red-600
        partial: [234, 88, 12],   // orange-600
        overdue: [220, 38, 38],   // red-600
    };
    const statusColor = statusColors[invoice.status?.toLowerCase() || 'draft'] || [107, 114, 128];
    doc.setTextColor(...statusColor);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text((invoice.status || 'draft').toUpperCase(), 196, 25, { align: 'right' });

    // ── Amount Due ──────────────────────────────────────────
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.setFont('helvetica', 'normal');
    doc.text('Amount Due', 196, 33, { align: 'right' });

    doc.setFontSize(20);
    doc.setTextColor(31, 41, 55);
    doc.setFont('helvetica', 'bold');
    doc.text(`$${(invoice.balance_due ?? invoice.total ?? 0).toFixed(2)}`, 196, 42, { align: 'right' });

    // ── Divider ─────────────────────────────────────────────
    doc.setDrawColor(229, 231, 235); // gray-200
    doc.line(14, 48, 196, 48);

    // ── Bill To & Details ───────────────────────────────────
    const startY = 56;

    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.setFont('helvetica', 'bold');
    doc.text('BILL TO', 14, startY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(31, 41, 55);
    doc.text(invoice.customer?.name || 'Customer', 14, startY + 7);

    if (invoice.customer?.address) {
        doc.setFontSize(9);
        doc.setTextColor(107, 114, 128);
        const addressLines = doc.splitTextToSize(invoice.customer.address, 80);
        doc.text(addressLines, 14, startY + 14);
    }

    // Right side details
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.setFont('helvetica', 'bold');
    doc.text('DETAILS', 130, startY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text('Invoice Date:', 130, startY + 7);
    doc.setTextColor(31, 41, 55);
    doc.text(invoiceDate, 196, startY + 7, { align: 'right' });

    doc.setTextColor(107, 114, 128);
    doc.text('Due Date:', 130, startY + 14);
    doc.setTextColor(31, 41, 55);
    doc.text(dueDate, 196, startY + 14, { align: 'right' });

    if (invoice.payments_applied && invoice.payments_applied > 0) {
        doc.setTextColor(107, 114, 128);
        doc.text('Payments Applied:', 130, startY + 21);
        doc.setTextColor(22, 163, 74);
        doc.text(`$${invoice.payments_applied.toFixed(2)}`, 196, startY + 21, { align: 'right' });
    }

    // ── Line Items Table ────────────────────────────────────
    const items = invoice.items || [];
    const tableBody = items.map((item: any) => {
        const qty = item.quantity || 1;
        const unitPrice = item.unit_price || item.amount || 0;
        const total = item.total || item.amount || (qty * unitPrice);
        return [
            item.description || 'Item',
            qty.toString(),
            `$${unitPrice.toFixed(2)}`,
            `$${total.toFixed(2)}`
        ];
    });

    autoTable(doc, {
        startY: startY + 30,
        head: [['Description', 'Qty', 'Unit Price', 'Amount']],
        body: tableBody,
        theme: 'plain',
        headStyles: {
            fillColor: [249, 250, 251],    // gray-50
            textColor: [107, 114, 128],    // gray-500
            fontStyle: 'bold',
            fontSize: 8,
            cellPadding: 4,
        },
        bodyStyles: {
            textColor: [31, 41, 55],       // gray-800
            fontSize: 9,
            cellPadding: 4,
        },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { halign: 'right', cellWidth: 25 },
            2: { halign: 'right', cellWidth: 30 },
            3: { halign: 'right', cellWidth: 30 },
        },
        alternateRowStyles: {
            fillColor: [249, 250, 251],
        },
        margin: { left: 14, right: 14 },
    });

    // ── Totals Section ──────────────────────────────────────
    const finalY = (doc as any).lastAutoTable?.finalY || 180;

    const totalsStartY = finalY + 10;
    const totalsX = 130;

    // Subtotal
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text('Subtotal:', totalsX, totalsStartY);
    doc.setTextColor(31, 41, 55);
    doc.text(`$${(invoice.subtotal || invoice.total || 0).toFixed(2)}`, 196, totalsStartY, { align: 'right' });

    // Tax
    if ((invoice as any).tax_amount && (invoice as any).tax_amount > 0) {
        doc.setTextColor(107, 114, 128);
        doc.text('Tax:', totalsX, totalsStartY + 7);
        doc.setTextColor(31, 41, 55);
        doc.text(`$${(invoice as any).tax_amount.toFixed(2)}`, 196, totalsStartY + 7, { align: 'right' });
    }

    // Total
    doc.setDrawColor(229, 231, 235);
    doc.line(totalsX, totalsStartY + 11, 196, totalsStartY + 11);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(31, 41, 55);
    doc.text('Total:', totalsX, totalsStartY + 19);
    doc.text(`$${(invoice.total || 0).toFixed(2)}`, 196, totalsStartY + 19, { align: 'right' });

    // Balance Due (if partial payments exist)
    if (invoice.payments_applied && invoice.payments_applied > 0) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(22, 163, 74); // green
        doc.text(`Paid: $${invoice.payments_applied.toFixed(2)}`, totalsX, totalsStartY + 27);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(220, 38, 38); // red
        doc.text('Balance Due:', totalsX, totalsStartY + 35);
        doc.text(`$${(invoice.balance_due ?? 0).toFixed(2)}`, 196, totalsStartY + 35, { align: 'right' });
    }

    // ── Footer ──────────────────────────────────────────────
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175); // gray-400
    doc.text('Thank you for your business.', 105, 280, { align: 'center' });
    doc.text(`Generated ${new Date().toLocaleDateString()}`, 105, 285, { align: 'center' });

    // ── Save ────────────────────────────────────────────────
    doc.save(`${invoiceNumber}.pdf`);
}
