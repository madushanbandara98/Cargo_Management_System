package de.tum.in.ase.Barcode;

import com.itextpdf.barcodes.Barcode128;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.canvas.PdfCanvas;
import com.itextpdf.layout.element.Image;

public class BarcodeGenerator {

    /**
     * Generate a small barcode for the invoice page (e.g., header)
     * @param pdf PdfDocument
     * @param customerRef Customer reference
     * @param barHeight Height of the barcode bars
     * @return Image element to add to document
     */
    public static Image generateSmallBarcode(PdfDocument pdf, String customerRef, float barHeight) {
        Barcode128 barcode = new Barcode128(pdf);
        barcode.setCode(customerRef);
        barcode.setCodeType(Barcode128.CODE128);
        barcode.setBarHeight(barHeight);

        Image barcodeImage = new Image(barcode.createFormXObject(pdf));
        barcodeImage.scaleToFit(150f, barHeight); // width x height
        return barcodeImage;
    }

    /**
     * Generate multiple barcodes for boxes (long horizontal) with margins
     * @param pdf PdfDocument
     * @param customerRef Customer reference
     * @param totalItems Number of barcodes to generate
     * @param barcodesPerRow Columns per page
     * @param barcodesPerColumn Rows per page
     * @param barHeight Height of each barcode
     */
    public static void generateMultipleBarcodes(PdfDocument pdf, String customerRef, int totalItems,
                                                int barcodesPerRow, int barcodesPerColumn, float barHeight) {

        float marginX = 30f; // left/right page margin
        float marginY = 30f; // top/bottom page margin

        int barcodesPerPage = barcodesPerRow * barcodesPerColumn;
        int barcodeCounter = 0;

        for (int i = 0; i < totalItems; i++) {

            if (barcodeCounter % barcodesPerPage == 0) {
                pdf.addNewPage();
            }

            float pageWidth = pdf.getDefaultPageSize().getWidth();
            float pageHeight = pdf.getDefaultPageSize().getHeight();

            int positionInPage = barcodeCounter % barcodesPerPage;
            int row = positionInPage / barcodesPerRow;
            int col = positionInPage % barcodesPerRow;

            float cellWidth = (pageWidth - 2 * marginX) / barcodesPerRow;
            float cellHeight = (pageHeight - 2 * marginY) / barcodesPerColumn;

            Barcode128 barcode = new Barcode128(pdf);
            barcode.setCode(customerRef);
            barcode.setCodeType(Barcode128.CODE128);
            barcode.setBarHeight(barHeight);   // vertical bar height
            barcode.setX(2f);

            Image barcodeImage = new Image(barcode.createFormXObject(pdf));
            barcodeImage.scaleToFit(cellWidth * 0.95f, barHeight); // long horizontal barcode

            float x = marginX + col * cellWidth + (cellWidth - barcodeImage.getImageScaledWidth()) / 2;
            float y = pageHeight - marginY - (row + 1) * cellHeight + (cellHeight - barcodeImage.getImageScaledHeight()) / 2;

            new PdfCanvas(pdf.getLastPage()).addXObjectAt(barcode.createFormXObject(pdf), x, y);

            barcodeCounter++;
        }
    }
}
