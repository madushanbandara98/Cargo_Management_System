package de.tum.in.ase.Barcode;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.RandomAccessRead;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;

import java.awt.image.BufferedImage;

public class PdfRendererHelper {
    public static BufferedImage renderPdfToImage(byte[] pdfBytes, int pageIndex) throws Exception {
        RandomAccessRead rar = new RandomAccessReadBuffer(pdfBytes);
        try (PDDocument document = Loader.loadPDF(rar)) {
            PDFRenderer renderer = new PDFRenderer(document);
            return renderer.renderImageWithDPI(pageIndex, 150);
        }
    }
}
