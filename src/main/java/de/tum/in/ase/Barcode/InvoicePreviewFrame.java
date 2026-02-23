package de.tum.in.ase.Barcode;

import com.itextpdf.barcodes.Barcode128;
import com.itextpdf.kernel.colors.ColorConstants;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.element.*;
import com.itextpdf.layout.properties.TextAlignment;
import de.tum.in.ase.DatabaseC.Customer;
import de.tum.in.ase.Barcode.Item;

import javax.swing.*;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.List;

public class InvoicePreviewFrame extends JFrame {

    public InvoicePreviewFrame(Customer customer, List<Item> items) {
        setTitle("Invoice Preview - " + customer.getReferenceNumber());
        setSize(950, 700);
        setLocationRelativeTo(null);
        setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);

        try {
            // --- Generate PDF in memory ---
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            PdfWriter writer = new PdfWriter(baos);
            PdfDocument pdf = new PdfDocument(writer);
            Document document = new Document(pdf, PageSize.A4);
            document.setMargins(30, 30, 30, 30);

            // --- Header ---
            Paragraph header = new Paragraph()
                    .add(new Text("Madushan Cargo Service\n").setBold().setFontSize(18))
                    .add(new Text("Transport goods from Germany to Sri Lanka\n").setFontSize(14))
                    .add(new Text("TP: +4912345678 / +94123456789\n").setFontSize(12))
                    .setTextAlignment(TextAlignment.CENTER);
            document.add(header);

            // --- Customer Info Table ---
            float[] colWidths = {1f, 1f};
            Table customerTable = new Table(colWidths).useAllAvailableWidth();

            customerTable.addCell(new Cell().add(new Paragraph("Customer Ref: " + customer.getReferenceNumber())).setBackgroundColor(ColorConstants.WHITE));
            customerTable.addCell(new Cell().add(new Paragraph("Customer Name: " + customer.getName())).setBackgroundColor(ColorConstants.WHITE));
            customerTable.addCell(new Cell().add(new Paragraph("German Address: " + customer.getGermanAddress())).setBackgroundColor(ColorConstants.WHITE));
            customerTable.addCell(new Cell().add(new Paragraph("Sri Lankan Address: " + customer.getSriLankanAddress())).setBackgroundColor(ColorConstants.WHITE));
            customerTable.addCell(new Cell().add(new Paragraph("Phone DE: " + customer.getPhoneDE())).setBackgroundColor(ColorConstants.WHITE));
            customerTable.addCell(new Cell().add(new Paragraph("Phone LK: " + customer.getPhoneLK())).setBackgroundColor(ColorConstants.WHITE));

            document.add(customerTable);
            document.add(new Paragraph("\n"));

            // --- Items Table ---
            Table itemsTable = new Table(new float[]{80, 60, 60, 60, 60, 80, 80}).useAllAvailableWidth();

            // Header row

            itemsTable.addCell("Height");
            itemsTable.addCell("Width");
            itemsTable.addCell("Depth");
            itemsTable.addCell("No Items");
            itemsTable.addCell("Cubic Meter");
            itemsTable.addCell("Amount (€)");
            itemsTable.addCell("Description");

            // Data rows
            for (Item it : items) {
                itemsTable.addCell(String.valueOf(it.getHeight()));
                itemsTable.addCell(String.valueOf(it.getWidth()));
                itemsTable.addCell(String.valueOf(it.getDepth()));
                itemsTable.addCell(String.valueOf(it.getNoItems()));
                itemsTable.addCell(String.format("%.3f", it.getCubicMeter()));
                itemsTable.addCell(String.format("%.2f", it.getAmount()));
                itemsTable.addCell(it.getDescription());
            }

            document.add(itemsTable);
            document.add(new Paragraph("\n"));

            // --- Totals ---
            double totalCubic = items.stream().mapToDouble(Item::getCubicMeter).sum();
            double totalAmount = items.stream().mapToDouble(Item::getAmount).sum();
            int totalItems = items.stream().mapToInt(Item::getNoItems).sum();

            Table totalTable = new Table(new float[]{1f, 1f, 1f}).useAllAvailableWidth();
            totalTable.addCell(new Cell().add(new Paragraph("Total Cubic Meter: " + String.format("%.3f", totalCubic))).setTextAlignment(TextAlignment.CENTER));
            totalTable.addCell(new Cell().add(new Paragraph("Total Items: " + totalItems)).setTextAlignment(TextAlignment.CENTER));
            totalTable.addCell(new Cell().add(new Paragraph("Total Amount: €" + String.format("%.2f", totalAmount))).setTextAlignment(TextAlignment.CENTER));

            document.add(totalTable);

            document.close();

            // --- Render first PDF page as image for preview ---
            BufferedImage img = PdfRendererHelper.renderPdfToImage(baos.toByteArray(), 0);
            JLabel lbl = new JLabel(new ImageIcon(img));
            JScrollPane scroll = new JScrollPane(lbl);
            add(scroll, BorderLayout.CENTER);

        } catch (Exception e) {
            e.printStackTrace();
            JOptionPane.showMessageDialog(this, "Error generating preview: " + e.getMessage(),
                    "Error", JOptionPane.ERROR_MESSAGE);
        }

        setVisible(true);
    }
}
