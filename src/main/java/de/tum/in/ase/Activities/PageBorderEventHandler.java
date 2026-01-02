package de.tum.in.ase.Activities;

import com.itextpdf.kernel.events.IEventHandler;
import com.itextpdf.kernel.events.Event;
import com.itextpdf.kernel.events.PdfDocumentEvent;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfPage;
import com.itextpdf.kernel.pdf.canvas.PdfCanvas;
import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.kernel.colors.ColorConstants;

public class PageBorderEventHandler implements IEventHandler {

    @Override
    public void handleEvent(Event event) {
        PdfDocumentEvent docEvent = (PdfDocumentEvent) event;
        PdfDocument pdf = docEvent.getDocument();
        PdfPage page = docEvent.getPage();

        // Draw the border BEFORE the actual content
        PdfCanvas canvas = new PdfCanvas(page.newContentStreamBefore(), page.getResources(), pdf);

        Rectangle rect = page.getPageSize();

        float margin = 20f; // Distance from page edge

        canvas.setLineWidth(1f);
        canvas.setStrokeColor(ColorConstants.BLACK);

        // Draw a rectangle border
        canvas.rectangle(
                rect.getLeft() + margin,
                rect.getBottom() + margin,
                rect.getWidth() - 2 * margin,
                rect.getHeight() - 2 * margin
        );

        canvas.stroke();
        canvas.release();
    }
}
