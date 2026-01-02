package de.tum.in.ase.Activities;

import com.itextpdf.barcodes.Barcode128;
import com.itextpdf.io.image.ImageData;
import com.itextpdf.io.image.ImageDataFactory;
import com.itextpdf.kernel.colors.ColorConstants;
import com.itextpdf.kernel.events.PdfDocumentEvent;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.pdf.*;
import com.itextpdf.kernel.pdf.canvas.PdfCanvas;
import com.itextpdf.kernel.pdf.extgstate.PdfExtGState;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.borders.Border;
import com.itextpdf.layout.borders.SolidBorder;
import com.itextpdf.layout.element.*;
import com.itextpdf.layout.element.Image;
import com.itextpdf.layout.properties.HorizontalAlignment;
import com.itextpdf.layout.properties.TextAlignment;
import com.itextpdf.layout.properties.UnitValue;
import com.itextpdf.kernel.geom.Rectangle;
import de.tum.in.ase.AppIcon;
import de.tum.in.ase.Barcode.BarcodeGenerator;
import de.tum.in.ase.DatabaseC.CustomerListPage;
import de.tum.in.ase.DatabaseC.Database;
import de.tum.in.ase.MainLogin.MainDashboard;

import javax.swing.*;
import javax.swing.event.DocumentEvent;
import javax.swing.event.DocumentListener;
import javax.swing.table.DefaultTableModel;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.awt.event.FocusAdapter;
import java.awt.event.FocusEvent;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.sql.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;


public class CargoCustomerPage extends JFrame {
    private JTextField tfCustomerRef, tfCustomerName, tfCustomerID, tfGermanAddress, tfSriLankanAddress, tfDePhone, tfLkPhone;
    private JTextField tfHeight, tfWidth, tfDepth, tfNoBox;
    private JTextArea taDescription;
    private JTextField tfSpecialPrice;
    private JTextField tfDeliveryCharge , tfDeliveryChargeTotal;
    private DefaultTableModel tableModel;
    private JTable table;

    private JTextField tfTotalCubic, tfTotalItems, tfTotalAmount;
    private JCheckBox chkAllItemsEntered;

    private static final double DEFAULT_RATE_PER_CUBIC = 530.0;
    private final File containerFile = new File("D:\\Cargo", "container_path.txt");
    private final String activeContainerPath;
    private final String username;
    private int editingRowIndex = -1; // -1 means no row is being edited
    private String editingCustomerRef = null;
    private boolean customerRefChecked = false;


    public CargoCustomerPage(String username) {
        this(null, username);
    }

    public CargoCustomerPage(String containerPath, String username) {
        super("ACM Customer Page");
        AppIcon.setIcon(this);
        setDefaultCloseOperation(DISPOSE_ON_CLOSE);
        setSize(1100, 760);
        setLocationRelativeTo(null);
        this.activeContainerPath = containerPath;
        this.username = username;
        initUI();
    }

    private void initUI() {
        JPanel main = new JPanel(new BorderLayout(10, 10));
        main.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));
        main.setBackground(Color.YELLOW);

        // -------- Header --------
        JPanel header = new JPanel();
        header.setLayout(new BoxLayout(header, BoxLayout.Y_AXIS));
        header.setBackground(Color.YELLOW);

        JLabel lblCompany = new JLabel("Asanka Cargo Service", SwingConstants.CENTER);
        lblCompany.setFont(new Font("Arial", Font.BOLD, 18));

        // Customer Ref Line
        JPanel refLine = new JPanel(new GridBagLayout());
        refLine.setOpaque(false);
        GridBagConstraints gbcRef = new GridBagConstraints();
        gbcRef.insets = new Insets(4, 8, 4, 8);
        gbcRef.anchor = GridBagConstraints.WEST;

        gbcRef.gridx = 0; gbcRef.gridy = 0;
        refLine.add(new JLabel("Customer Reference:"), gbcRef);
        gbcRef.gridx = 1;
        tfCustomerRef = new JTextField(12);
        refLine.add(tfCustomerRef, gbcRef);
// ✅ ENTER key
        tfCustomerRef.addActionListener(e -> checkCustomerRef());

// ✅ Click away / TAB
        tfCustomerRef.addFocusListener(new FocusAdapter() {
            @Override
            public void focusLost(FocusEvent e) {
                checkCustomerRef();
            }
        });

        // ✅ Document listener (reset flag when text changes)
        tfCustomerRef.getDocument().addDocumentListener(new DocumentListener() {
            public void insertUpdate(DocumentEvent e) { customerRefChecked = false; }
            public void removeUpdate(DocumentEvent e) { customerRefChecked = false; }
            public void changedUpdate(DocumentEvent e) { customerRefChecked = false; }
        });

        gbcRef.gridx = 2;
        refLine.add(new JLabel("Customer Name:"), gbcRef);
        gbcRef.gridx = 3;
        tfCustomerName = new JTextField(18);
        refLine.add(tfCustomerName, gbcRef);

        gbcRef.gridx = 4;
        refLine.add(new JLabel("Customer ID:"), gbcRef);
        gbcRef.gridx = 5;
        tfCustomerID = new JTextField(12);
        refLine.add(tfCustomerID, gbcRef);

        // Address Line
        JPanel addrLine = new JPanel(new GridBagLayout());
        addrLine.setOpaque(false);
        GridBagConstraints gbcAddr = new GridBagConstraints();
        gbcAddr.insets = new Insets(6, 6, 6, 6);
        gbcAddr.anchor = GridBagConstraints.WEST;

        gbcAddr.gridx = 0; gbcAddr.gridy = 0;
        addrLine.add(new JLabel("German Address:"), gbcAddr);
        gbcAddr.gridx = 1; gbcAddr.fill = GridBagConstraints.HORIZONTAL; gbcAddr.weightx = 0.7;
        tfGermanAddress = new JTextField(20);
        addrLine.add(tfGermanAddress, gbcAddr);

        gbcAddr.gridx = 2; gbcAddr.fill = GridBagConstraints.NONE; gbcAddr.weightx = 0;
        addrLine.add(new JLabel("Phone (DE):"), gbcAddr);
        gbcAddr.gridx = 3; gbcAddr.fill = GridBagConstraints.HORIZONTAL; gbcAddr.weightx = 0.3;
        tfDePhone = new JTextField(12);
        addrLine.add(tfDePhone, gbcAddr);

        gbcAddr.gridx = 0; gbcAddr.gridy = 1; gbcAddr.fill = GridBagConstraints.NONE; gbcAddr.weightx = 0;
        addrLine.add(new JLabel("Sri Lankan Address:"), gbcAddr);
        gbcAddr.gridx = 1; gbcAddr.fill = GridBagConstraints.HORIZONTAL; gbcAddr.weightx = 0.7;
        tfSriLankanAddress = new JTextField(20);
        addrLine.add(tfSriLankanAddress, gbcAddr);

        gbcAddr.gridx = 2; gbcAddr.fill = GridBagConstraints.NONE; gbcAddr.weightx = 0;
        addrLine.add(new JLabel("Phone (LK):"), gbcAddr);
        gbcAddr.gridx = 3; gbcAddr.fill = GridBagConstraints.HORIZONTAL; gbcAddr.weightx = 0.3;
        tfLkPhone = new JTextField(12);
        addrLine.add(tfLkPhone, gbcAddr);

        gbcRef.gridx = 0; gbcRef.gridy = 2;
        addrLine.add(new JLabel("Special Price per m³ (€):"), gbcRef);
        gbcRef.gridx = 1;
        tfSpecialPrice = new JTextField(20);
        addrLine.add(tfSpecialPrice, gbcRef);


        gbcRef.gridx = 0; gbcRef.gridy = 3;
        addrLine.add(new JLabel("Delivery Charge:"), gbcRef);

        gbcRef.gridx = 1;
        tfDeliveryCharge = new JTextField(20);
        addrLine.add(tfDeliveryCharge, gbcRef);

        tfDeliveryCharge.getDocument().addDocumentListener(new DocumentListener() {
            public void insertUpdate(DocumentEvent e) { syncDelivery(); }
            public void removeUpdate(DocumentEvent e) { syncDelivery(); }
            public void changedUpdate(DocumentEvent e) { syncDelivery(); }
        });


        header.add(lblCompany);
        header.add(Box.createVerticalStrut(6));
        header.add(refLine);

        header.add(lblCompany);
        header.add(Box.createVerticalStrut(6));
        header.add(refLine);
        header.add(Box.createVerticalStrut(6));
        header.add(addrLine);

        // -------- Input Panel --------
        JPanel inputPanel = new JPanel(new GridBagLayout());
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(6, 6, 6, 6);
        gbc.anchor = GridBagConstraints.WEST;

        gbc.gridx = 0; gbc.gridy = 0;
        inputPanel.add(new JLabel("Height (cm):"), gbc);
        gbc.gridx = 1;
        tfHeight = new JTextField(6);
        inputPanel.add(tfHeight, gbc);

        gbc.gridx = 2;
        inputPanel.add(new JLabel("Width (cm):"), gbc);
        gbc.gridx = 3;
        tfWidth = new JTextField(6);
        inputPanel.add(tfWidth, gbc);

        gbc.gridx = 4;
        inputPanel.add(new JLabel("Depth (cm):"), gbc);
        gbc.gridx = 5;
        tfDepth = new JTextField(6);
        inputPanel.add(tfDepth, gbc);

        gbc.gridx = 6;
        inputPanel.add(new JLabel("No.Items:"), gbc);
        gbc.gridx = 7;
        tfNoBox = new JTextField(5);
        inputPanel.add(tfNoBox, gbc);

        gbc.gridx = 8;
        inputPanel.add(new JLabel("Description:"), gbc);
        gbc.gridx = 9;
        taDescription = new JTextArea(1, 18);
        taDescription.setLineWrap(true);
        inputPanel.add(taDescription, gbc);

        // Row Buttons
        gbc.gridy = 1; gbc.gridx = 0; gbc.gridwidth = 10;
        JPanel rowButtons = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 2));
        JButton btnSaveRow = new JButton("Save");
        JButton btnEditRow = new JButton("Edit");
        JButton btnDeleteRow = new JButton("Delete");
        rowButtons.add(btnSaveRow);
        rowButtons.add(btnEditRow);
        rowButtons.add(btnDeleteRow);
        inputPanel.add(rowButtons, gbc);

        // Table
        String[] cols = {"No.", "Height", "Width", "Depth", "No.Item", "Cubic Meter (m³)", "Amount (€)", "Description"};
        tableModel = new DefaultTableModel(cols, 0);
        table = new JTable(tableModel);
        table.setRowHeight(26);
        JScrollPane scroll = new JScrollPane(table);
        scroll.setPreferredSize(new Dimension(1050, 320));

        // Checkbox
        chkAllItemsEntered = new JCheckBox("All items are entered");
        chkAllItemsEntered.setFont(new Font("Arial", Font.PLAIN, 12));
        chkAllItemsEntered.setBackground(Color.YELLOW);
        JPanel checkboxPanel = new JPanel(new FlowLayout(FlowLayout.LEFT));
        checkboxPanel.setOpaque(false);
        checkboxPanel.add(chkAllItemsEntered);

        // Totals
        JPanel totalsPanel = new JPanel(new FlowLayout(FlowLayout.CENTER, 18, 8));
        tfTotalCubic = new JTextField(12); tfTotalCubic.setEditable(false); tfTotalCubic.setHorizontalAlignment(JTextField.RIGHT);
        tfTotalItems = new JTextField(10); tfTotalItems.setEditable(false); tfTotalItems.setHorizontalAlignment(JTextField.RIGHT);
        tfTotalAmount = new JTextField(12); tfTotalAmount.setEditable(false); tfTotalAmount.setHorizontalAlignment(JTextField.RIGHT);
        tfDeliveryChargeTotal = new JTextField(10); tfDeliveryChargeTotal.setEditable(false); tfDeliveryChargeTotal.setHorizontalAlignment(JTextField.RIGHT);

        totalsPanel.add(boxedPanel("Total Cubic (m³)", tfTotalCubic));
        totalsPanel.add(boxedPanel("Total Items", tfTotalItems));
        totalsPanel.add(boxedPanel("Total (€)", tfTotalAmount));
        totalsPanel.add(boxedPanel("Delivery Charge (€)", tfDeliveryChargeTotal));


        // Bottom buttons
        JPanel bottom = new JPanel(new FlowLayout(FlowLayout.RIGHT, 10, 8));
        bottom.setOpaque(false);
        JButton btnSaveCustomer = new JButton("Save Customer");
        JButton btnNewCustomer = new JButton("New Customer");JButton btnLoadCustomer = new JButton("Load Customer");
        JButton btnClose = new JButton("Close");
        bottom.add(btnSaveCustomer); bottom.add(btnNewCustomer); bottom.add(btnLoadCustomer); bottom.add(btnClose);

        // Center panel
        JPanel center = new JPanel();
        center.setLayout(new BoxLayout(center, BoxLayout.Y_AXIS));
        center.add(inputPanel);
        center.add(Box.createVerticalStrut(8));
        center.add(scroll);
        center.add(Box.createVerticalStrut(4));
        center.add(checkboxPanel);
        center.add(Box.createVerticalStrut(8));
        center.add(totalsPanel);

        main.add(header, BorderLayout.NORTH);
        main.add(center, BorderLayout.CENTER);
        main.add(bottom, BorderLayout.SOUTH);

        setContentPane(main);

        // ---------------- Actions ----------------
        btnSaveRow.addActionListener(e -> addRow());
        btnEditRow.addActionListener(e -> fillInputsFromSelectedRow());
        btnDeleteRow.addActionListener(e -> deleteSelectedRow());

        btnSaveCustomer.addActionListener(e -> {
            if (!chkAllItemsEntered.isSelected()) {
                JOptionPane.showMessageDialog(this,
                        "Please ensure all items are entered before saving.",
                        "Check Items",
                        JOptionPane.WARNING_MESSAGE);
                return;
            }
            savePDF();
        });
        btnNewCustomer.addActionListener(e -> startNewCustomer());
        btnClose.addActionListener(e -> {
            dispose();
            new MainDashboard(username).setVisible(true);

        });

        btnLoadCustomer.addActionListener(e -> openCustomerListPage());

        // ---------------- Enter-key navigation ----------------
        setupEnterNavigation();
    }

    private void setupEnterNavigation() {
        // Customer Fields navigation
        JComponent[] customerFields = {tfCustomerRef, tfCustomerName, tfCustomerID, tfGermanAddress, tfDePhone, tfSriLankanAddress, tfLkPhone, tfSpecialPrice};
        for (int i = 0; i < customerFields.length; i++) {
            final int index = i;
            JComponent comp = customerFields[i];
            comp.getInputMap(JComponent.WHEN_FOCUSED).put(KeyStroke.getKeyStroke("ENTER"), "moveFocusForward");
            comp.getActionMap().put("moveFocusForward", new AbstractAction() {
                @Override
                public void actionPerformed(ActionEvent e) {
                    if (index == customerFields.length - 1) {
                        tfHeight.requestFocus();
                        tfHeight.selectAll();
                    } else {
                        customerFields[index + 1].requestFocus();
                        if (customerFields[index + 1] instanceof JTextField) {
                            ((JTextField) customerFields[index + 1]).selectAll();
                        }
                    }
                }
            });
        }

        // Row Fields navigation
        JComponent[] rowFields = {tfHeight, tfWidth, tfDepth, tfNoBox, taDescription};
        for (int i = 0; i < rowFields.length; i++) {
            final int index = i;
            JComponent comp = rowFields[i];
            comp.getInputMap(JComponent.WHEN_FOCUSED).put(KeyStroke.getKeyStroke("ENTER"), "moveFocusForward");
            comp.getActionMap().put("moveFocusForward", new AbstractAction() {
                @Override
                public void actionPerformed(ActionEvent e) {
                    if (index == rowFields.length - 1) { // Description
                        addRow();
                        tfHeight.requestFocus();
                        tfHeight.selectAll();
                    } else {
                        rowFields[index + 1].requestFocus();
                        if (rowFields[index + 1] instanceof JTextField) {
                            ((JTextField) rowFields[index + 1]).selectAll();
                        }
                    }
                }
            });
        }
    }

    private JPanel boxedPanel(String label, JTextField field) {
        JPanel p = new JPanel(new BorderLayout());
        JLabel l = new JLabel(label, SwingConstants.CENTER);
        l.setFont(l.getFont().deriveFont(Font.BOLD));
        p.add(l, BorderLayout.NORTH);
        p.add(field, BorderLayout.CENTER);
        p.setBorder(BorderFactory.createLineBorder(Color.GRAY, 1));
        p.setPreferredSize(new Dimension(260, 60));
        return p;
    }



    private void addRow() {
        try {
            double height = Double.parseDouble(tfHeight.getText());
            double width = Double.parseDouble(tfWidth.getText());
            double depth = Double.parseDouble(tfDepth.getText());
            int noBox = Integer.parseInt(tfNoBox.getText());
            String desc = taDescription.getText();

            double cubic = height * width * depth / 1000000.0; // cm³ to m³
            double rate = tfSpecialPrice.getText().isEmpty() ? DEFAULT_RATE_PER_CUBIC : Double.parseDouble(tfSpecialPrice.getText());
            double amount = cubic * noBox * rate;

            Object[] rowData = {
                    editingRowIndex == -1 ? tableModel.getRowCount() + 1 : editingRowIndex + 1,
                    height, width, depth, noBox,
                    String.format("%.3f", cubic),
                    String.format("%.2f", amount),
                    desc
            };

            if (editingRowIndex == -1) {
                tableModel.addRow(rowData);

                int lastRow = table.getRowCount() - 1;
                table.scrollRectToVisible(table.getCellRect(lastRow, 0, true));

            } else {
                // update the existing row in place
                for (int i = 0; i < rowData.length; i++) {
                    tableModel.setValueAt(rowData[i], editingRowIndex, i);
                }
                editingRowIndex = -1; // reset
            }

            clearInputs();
            updateTotals();

        } catch (NumberFormatException ex) {
            JOptionPane.showMessageDialog(this, "Please enter valid numeric values.", "Invalid Input", JOptionPane.ERROR_MESSAGE);
        }
    }


    private void fillInputsFromSelectedRow() {
        int selectedRow = table.getSelectedRow();
        if (selectedRow == -1) {
            JOptionPane.showMessageDialog(this, "Please select a row to edit.", "No Selection", JOptionPane.WARNING_MESSAGE);
            return;
        }

        editingRowIndex = selectedRow; // track which row is being edited

        tfHeight.setText(tableModel.getValueAt(selectedRow, 1).toString());
        tfWidth.setText(tableModel.getValueAt(selectedRow, 2).toString());
        tfDepth.setText(tableModel.getValueAt(selectedRow, 3).toString());
        tfNoBox.setText(tableModel.getValueAt(selectedRow, 4).toString());
        taDescription.setText(tableModel.getValueAt(selectedRow, 7).toString());
    }


    private void deleteSelectedRow() {
        int sel = table.getSelectedRow();
        if (sel == -1) {
            JOptionPane.showMessageDialog(this, "Select a row to delete.", "Info", JOptionPane.INFORMATION_MESSAGE);
            return;
        }
        tableModel.removeRow(sel);
        updateRowNumbers();
        updateTotals();
    }

    private void updateRowNumbers() {
        for (int i = 0; i < tableModel.getRowCount(); i++) {
            tableModel.setValueAt(String.format("%02d", i + 1), i, 0);
        }
    }

    private void updateTotals() {
        double totalCubic = 0;
        int totalItems = 0;
        double totalAmount = 0;

        for (int i = 0; i < tableModel.getRowCount(); i++) {
            totalCubic += Double.parseDouble(tableModel.getValueAt(i, 5).toString());
            totalItems += Integer.parseInt(tableModel.getValueAt(i, 4).toString());
            totalAmount += Double.parseDouble(tableModel.getValueAt(i, 6).toString());
        }

        tfTotalCubic.setText(String.format("%.3f", totalCubic));
        tfTotalItems.setText(String.valueOf(totalItems));
        tfTotalAmount.setText(String.format("%.2f", totalAmount));
    }



    private void clearInputs() {
        tfHeight.setText(""); tfWidth.setText(""); tfDepth.setText(""); tfNoBox.setText("");
        taDescription.setText("");
    }

    public void startNewCustomer() {
        tableModel.setRowCount(0);
        tfCustomerName.setText(""); tfCustomerID.setText(""); tfGermanAddress.setText(""); tfSriLankanAddress.setText("");
        tfDePhone.setText(""); tfLkPhone.setText(""); tfCustomerRef.setText("");
        tfHeight.setText(""); tfWidth.setText(""); tfDepth.setText(""); tfNoBox.setText(""); taDescription.setText("");
        tfTotalAmount.setText(""); tfTotalCubic.setText(""); tfTotalItems.setText("");
        tfSpecialPrice.setText(""); tfDeliveryCharge.setText(""); tfDeliveryChargeTotal.setText("");
        chkAllItemsEntered.setSelected(false);
        editingCustomerRef = null;
    }

    // ----------------- PDF saving methods (keep your original code) -----------------
    private boolean isDuplicateReference(String customerRef) {
        String folderPath;
        if (activeContainerPath != null && !activeContainerPath.isEmpty()) folderPath = activeContainerPath;
        else {
            if (!containerFile.exists()) return false;
            try { folderPath = new String(Files.readAllBytes(containerFile.toPath())).trim(); }
            catch (IOException e) { e.printStackTrace(); return false; }
        }
        if (folderPath.isEmpty()) return false;
        File customerFile = new File(folderPath, "Customer_" + customerRef + ".pdf");
        return customerFile.exists();
    }


    private void savePDF() {
        if (tableModel.getRowCount() == 0) {
            JOptionPane.showMessageDialog(this, "No data to save", "Warning", JOptionPane.WARNING_MESSAGE);
            return;
        }

        try {
            String folderPath;

            // Prefer constructor-supplied path, otherwise fallback to container_path.txt
            if (activeContainerPath != null && !activeContainerPath.isEmpty()) {
                folderPath = activeContainerPath;
            } else {
                if (!containerFile.exists()) {
                    JOptionPane.showMessageDialog(this, "No container selected. Create a container first.", "Error", JOptionPane.ERROR_MESSAGE);
                    return;
                }
                folderPath = new String(Files.readAllBytes(containerFile.toPath())).trim();
            }

            if (folderPath.isEmpty()) {
                JOptionPane.showMessageDialog(this, "Container path invalid. Create a container first.", "Error", JOptionPane.ERROR_MESSAGE);
                return;
            }

            String customerRef = tfCustomerRef.getText().trim();
            String customerID = tfCustomerID.getText().trim();
            String customerName = tfCustomerName.getText().trim();
            String germanAddress = tfGermanAddress.getText().trim();
            String sriLankanAddress = tfSriLankanAddress.getText().trim();
            String DEphone = tfDePhone.getText().trim();
            String LKphone = tfLkPhone.getText().trim();
            if (customerRef.isEmpty()) customerRef = "Unknown";

            // Check for duplicate reference
            if (isDuplicateReference(customerRef)) {
                JOptionPane.showMessageDialog(this,
                        "A customer with reference '" + customerRef + "' already exists.\nPlease use a unique reference.",
                        "Duplicate Reference",
                        JOptionPane.WARNING_MESSAGE);
                return; // block saving
            }

            String filePath = folderPath + File.separator + "Customer_" + customerRef + ".pdf";

            PdfWriter writer = new PdfWriter(filePath);
            PdfDocument pdf = new PdfDocument(writer);
            pdf.addEventHandler(PdfDocumentEvent.END_PAGE, new PageBorderEventHandler());
            Document document = new Document(pdf, PageSize.A4);
            document.setMargins(30, 30, 30, 30);

            // -------- Add watermark logo behind content --------
            java.net.URL logoURL = AppIcon.class.getResource("/MyLogo.png");
            if (logoURL != null) {
                ImageData imageData = ImageDataFactory.create(logoURL);
                float pageWidth = pdf.getDefaultPageSize().getWidth();
                float pageHeight = pdf.getDefaultPageSize().getHeight();
                float targetWidth = pageWidth / 2;
                float targetHeight = pageHeight / 2;
                float x = (pageWidth - targetWidth) / 2;
                float y = (pageHeight - targetHeight) / 2;

                PdfCanvas canvas = new PdfCanvas(pdf.addNewPage());
                canvas.saveState();
                PdfExtGState gs = new PdfExtGState();
                gs.setFillOpacity(0.15f);
                canvas.setExtGState(gs);
                canvas.addImageFittedIntoRectangle(imageData, new Rectangle(x, y, targetWidth, targetHeight), false);
                canvas.restoreState();
            }

            // ----------- Header & Date/Time -------------
            Paragraph header = new Paragraph()
                    .add(new com.itextpdf.layout.element.Text("Asanka Cargo Service\n").setBold().setFontSize(18))
                    .add(new com.itextpdf.layout.element.Text("Transport goods from Germany to Sri Lanka\n").setFontSize(14))
                    .add(new com.itextpdf.layout.element.Text("TP:+491726998031/+94760265106\n").setFontSize(12))
                    .setTextAlignment(TextAlignment.CENTER);
            document.add(header);
            // ----------- Small barcode in header (left) -------------
            Barcode128 smallBarcode = new Barcode128(pdf);
            smallBarcode.setCode(customerRef);
            smallBarcode.setCodeType(Barcode128.CODE128);
            smallBarcode.setBarHeight(30f); // smaller than page barcodes

            Image barcodeImage = new Image(smallBarcode.createFormXObject(pdf));
            // Scale width to desired size
            barcodeImage.scaleToFit(100f, 30f); // max width 100, max height 30
            barcodeImage.setHorizontalAlignment(HorizontalAlignment.LEFT);
            document.add(barcodeImage);

            document.add(new Paragraph("\n"));

            // Current date and time
            LocalDateTime now = LocalDateTime.now();
            DateTimeFormatter dateFormat = DateTimeFormatter.ofPattern("yyyy-MM-dd");
            DateTimeFormatter timeFormat = DateTimeFormatter.ofPattern("HH:mm:ss");
            // ----------- Customer Reference + Date/Time Row -------------
            Table refDateTable = new Table(UnitValue.createPercentArray(new float[]{1, 1}))
                    .useAllAvailableWidth();

// Left: Customer Reference
            refDateTable.addCell(new Cell()
                    .add(new Paragraph("Customer Reference: " + customerRef)
                            .setFontSize(14)
                            .setBold())
                    .setTextAlignment(TextAlignment.LEFT)
                    .setBorder(Border.NO_BORDER));

// Right: Date & Time
            refDateTable.addCell(new Cell()
                    .add(new Paragraph(
                            "Date: " + dateFormat.format(now) + "\n" +
                                    "Time: " + timeFormat.format(now))
                            .setFontSize(10))
                    .setTextAlignment(TextAlignment.RIGHT)
                    .setBorder(Border.NO_BORDER));

            document.add(refDateTable);
            document.add(new Paragraph("\n"));


            // ----------- Customer Info Table -------------
            float[] colWidths = {1f, 1f};
            Table customerTable = new Table(colWidths).useAllAvailableWidth();
            com.itextpdf.kernel.colors.Color shading = ColorConstants.WHITE;

            customerTable.addCell(new Cell()
                    .add(new Paragraph("Name: " + customerName))
                    .setFontSize(11)
                    .setTextAlignment(TextAlignment.LEFT)
                    .setBorder(new SolidBorder(1))
                    .setBackgroundColor(shading));

            customerTable.addCell(new Cell()
                    .add(new Paragraph("Customer ID: " + customerID))
                    .setFontSize(11)
                    .setTextAlignment(TextAlignment.RIGHT)
                    .setBorder(new SolidBorder(1))
                    .setBackgroundColor(shading));

            customerTable.addCell(new Cell()
                    .add(new Paragraph("German Address: " + germanAddress))
                    .setFontSize(11)
                    .setTextAlignment(TextAlignment.LEFT)
                    .setBorder(new SolidBorder(1))
                    .setBackgroundColor(shading));

            customerTable.addCell(new Cell()
                    .add(new Paragraph("Sri Lankan Address: " + sriLankanAddress))
                    .setFontSize(11)
                    .setTextAlignment(TextAlignment.RIGHT)
                    .setBorder(new SolidBorder(1))
                    .setBackgroundColor(shading));

            customerTable.addCell(new Cell()
                    .add(new Paragraph("German TP: " + DEphone))
                    .setFontSize(11)
                    .setTextAlignment(TextAlignment.LEFT)
                    .setBorder(new SolidBorder(1))
                    .setBackgroundColor(shading));

            customerTable.addCell(new Cell()
                    .add(new Paragraph("Sri Lankan TP: " + LKphone))
                    .setFontSize(11)
                    .setTextAlignment(TextAlignment.RIGHT)
                    .setBorder(new SolidBorder(1))
                    .setBackgroundColor(shading));


            document.add(customerTable);
            document.add(new Paragraph("\n"));

            // ----------- Items Table -------------
            Table pdfTable = new Table(UnitValue.createPercentArray(tableModel.getColumnCount()));
            pdfTable.setWidth(UnitValue.createPercentValue(100));

            for (int i = 0; i < tableModel.getColumnCount(); i++) {
                pdfTable.addHeaderCell(new Cell()
                        .add(new Paragraph(tableModel.getColumnName(i)).setBold())
                        .setBackgroundColor(ColorConstants.LIGHT_GRAY)
                        .setTextAlignment(TextAlignment.CENTER));
            }

            for (int r = 0; r < tableModel.getRowCount(); r++) {
                for (int c = 0; c < tableModel.getColumnCount(); c++) {
                    pdfTable.addCell(new Cell()
                            .add(new Paragraph(tableModel.getValueAt(r, c).toString()))
                            .setTextAlignment(TextAlignment.CENTER));
                }
            }

            document.add(pdfTable);
            document.add(new Paragraph("\n"));

            // ----------- Totals Table -------------
            double totalCubic = 0;
            double totalAmount = 0;
            int totalItems = 0;
            double deliveryCharge = 0.0;

            for (int i = 0; i < tableModel.getRowCount(); i++) {
                totalCubic += Double.parseDouble(tableModel.getValueAt(i, 5).toString());
                totalAmount += Double.parseDouble(tableModel.getValueAt(i, 6).toString());
                totalItems += Integer.parseInt(tableModel.getValueAt(i, 4).toString());
            }

            try {
                if (!tfDeliveryCharge.getText().trim().isEmpty()) {
                    deliveryCharge = Double.parseDouble(tfDeliveryCharge.getText().trim());
                }
            } catch (NumberFormatException e) {
                deliveryCharge = 0.0;
            }

            double finalTotal = totalAmount + deliveryCharge;

            Table totalBox = new Table(UnitValue.createPercentArray(new float[]{1, 1}))
                    .useAllAvailableWidth();

// Row 1
            totalBox.addCell(new Cell()
                    .add(new Paragraph("Total Cubic Meter: " + String.format("%.3f", totalCubic)))
                    .setTextAlignment(TextAlignment.LEFT)
                    .setBorder(new SolidBorder(1)));

            totalBox.addCell(new Cell()
                    .add(new Paragraph("Total Items: " + totalItems))
                    .setTextAlignment(TextAlignment.LEFT)
                    .setBorder(new SolidBorder(1)));

// Row 2
            totalBox.addCell(new Cell()
                    .add(new Paragraph("Total Cost (€): " + String.format("%.2f", totalAmount)))
                    .setTextAlignment(TextAlignment.LEFT)
                    .setBorder(new SolidBorder(1)));

            totalBox.addCell(new Cell()
                    .add(new Paragraph("Delivery Charge in Sri Lanka(€): " + String.format("%.2f", deliveryCharge)))
                    .setTextAlignment(TextAlignment.LEFT)
                    .setBorder(new SolidBorder(1)));

// Row 3 — FINAL TOTAL (CENTER, FULL WIDTH)
            totalBox.addCell(new Cell(1, 2)   // 🔥 colspan = 2
                    .add(new Paragraph("Final Total (€): " + String.format("%.2f", finalTotal)))
                    .setTextAlignment(TextAlignment.CENTER)
                    .setBold()
                    .setBorder(new SolidBorder(1)));


            document.add(totalBox);
            document.add(new Paragraph("\n\nThank you for choosing us!").setTextAlignment(TextAlignment.CENTER).setItalic().setFontSize(12));

            // -------- Generate box barcodes (multiple per page) --------
            BarcodeGenerator.generateMultipleBarcodes(pdf, customerRef, totalItems, 2, 8, 60f);

            document.close();

            double parsedSpecialPrice = 0.0;
            try {
                if (!tfSpecialPrice.getText().trim().isEmpty()) parsedSpecialPrice = Double.parseDouble(tfSpecialPrice.getText().trim());
            } catch (NumberFormatException nfe) {
                parsedSpecialPrice = 0.0;
            }

            saveOrUpdateCustomerToDB(customerRef, customerName, customerID, germanAddress, sriLankanAddress,
                    DEphone, LKphone, totalCubic, totalItems, totalAmount, deliveryCharge, parsedSpecialPrice);
            // reset editing state after saving (you may prefer to keep it; adjust as needed)
            editingCustomerRef = null;

            JOptionPane.showMessageDialog(this, "PDF saved to:\n" + filePath, "Saved", JOptionPane.INFORMATION_MESSAGE);

        } catch (IOException ex) {
            ex.printStackTrace();
            JOptionPane.showMessageDialog(this, "Error saving PDF: " + ex.getMessage(), "Error", JOptionPane.ERROR_MESSAGE);
        }
    }

    private void saveOrUpdateCustomerToDB(String ref, String name, String id, String germanAddr, String slAddr,
                                          String phoneDE, String phoneLK, double totalCubic,
                                          int totalItems, double totalAmount, double deliveryCharge, Double specialPrice) {
        try (Connection c = Database.getConnection()) {
            if (specialPrice <= 0) {
                specialPrice = 530.0; // default
            }
            c.setAutoCommit(false);

            // 1️⃣ Upsert customer info
            String upsertCustomer = """
            INSERT INTO customers (customerRef, customerName, customerID, germanAddress, sriLankanAddress, 
                                   phoneDE, phoneLK, totalCubic, totalItems, totalAmount, deliveryCharge, specialPrice)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(customerRef) DO UPDATE SET
                customerName=excluded.customerName,
                customerID=excluded.customerID,
                germanAddress=excluded.germanAddress,
                sriLankanAddress=excluded.sriLankanAddress,
                phoneDE=excluded.phoneDE,
                phoneLK=excluded.phoneLK,
                totalCubic=excluded.totalCubic,
                totalItems=excluded.totalItems,
                totalAmount=excluded.totalAmount,
                deliveryCharge=excluded.deliveryCharge,
                specialPrice=excluded.specialPrice
        """;

            try (PreparedStatement ps = c.prepareStatement(upsertCustomer)) {
                ps.setString(1, ref);
                ps.setString(2, name);
                ps.setString(3, id);
                ps.setString(4, germanAddr);
                ps.setString(5, slAddr);
                ps.setString(6, phoneDE);
                ps.setString(7, phoneLK);
                ps.setDouble(8, totalCubic);
                ps.setInt(9, totalItems);
                ps.setDouble(10, totalAmount);
                ps.setDouble(11, deliveryCharge);
                if (specialPrice == null) {
                    ps.setNull(12, Types.DOUBLE);
                } else {
                    ps.setDouble(12, specialPrice);
                }
                ps.executeUpdate();
            }

            // 2️⃣ Delete old table items for this customer
            try (PreparedStatement psDel = c.prepareStatement("DELETE FROM customer_items WHERE customerRef = ?")) {
                psDel.setString(1, ref);
                psDel.executeUpdate();
            }

            // 3️⃣ Insert table items
            String insertItem = "INSERT INTO customer_items (customerRef, height, width, depth, noItems, cubicMeter, amount, description) VALUES (?,?,?,?,?,?,?,?)";
            try (PreparedStatement psItem = c.prepareStatement(insertItem)) {
                for (int i = 0; i < tableModel.getRowCount(); i++) {
                    psItem.setString(1, ref);
                    psItem.setDouble(2, Double.parseDouble(tableModel.getValueAt(i, 1).toString()));
                    psItem.setDouble(3, Double.parseDouble(tableModel.getValueAt(i, 2).toString()));
                    psItem.setDouble(4, Double.parseDouble(tableModel.getValueAt(i, 3).toString()));
                    psItem.setInt(5, Integer.parseInt(tableModel.getValueAt(i, 4).toString()));
                    psItem.setDouble(6, Double.parseDouble(tableModel.getValueAt(i, 5).toString()));
                    psItem.setDouble(7, Double.parseDouble(tableModel.getValueAt(i, 6).toString()));
                    psItem.setString(8, tableModel.getValueAt(i, 7).toString());
                    psItem.addBatch();
                }
                psItem.executeBatch();
            }

            c.commit();
            JOptionPane.showMessageDialog(this, "Customer saved successfully!");

        } catch (SQLException ex) {
            ex.printStackTrace();
            JOptionPane.showMessageDialog(this, "DB Save Error: " + ex.getMessage(), "DB Error", JOptionPane.ERROR_MESSAGE);
        }
    }



    private void openCustomerListPage() {
        CustomerListPage listPage = new CustomerListPage(this);
        listPage.setVisible(true);
    }

    public void fillCustomerFormFromDB(String customerRef, String customerName, String customerID,
                                       String germanAddress, String sriLankanAddress, String phoneDE,
                                       String phoneLK, double totalCubic, int totalItems, double totalAmount, double deliveryCharge, Double specialPrice) {

        // --- 1️⃣ Fill customer details ---
        tfCustomerRef.setText(customerRef);
        tfCustomerName.setText(customerName);
        tfCustomerID.setText(customerID);
        tfGermanAddress.setText(germanAddress);
        tfSriLankanAddress.setText(sriLankanAddress);
        tfDePhone.setText(phoneDE);
        tfLkPhone.setText(phoneLK);
        tfTotalCubic.setText(String.format("%.3f", totalCubic));
        tfTotalItems.setText(String.valueOf(totalItems));
        tfTotalAmount.setText(String.format("%.2f", totalAmount));
        tfDeliveryCharge.setText(String.format("%.2f", deliveryCharge));
        double priceToShow = (specialPrice == null || specialPrice == 0.0)
                ? 530.0
                : specialPrice;

        tfSpecialPrice.setText(String.format("%.2f", priceToShow));

        // --- 2️⃣ Load table items from DB ---
        tableModel.setRowCount(0); // clear previous rows
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT * FROM customer_items WHERE customerRef = ?")) {
            ps.setString(1, customerRef);
            ResultSet rs = ps.executeQuery();
            while (rs.next()) {
                Object[] row = new Object[]{
                        tableModel.getRowCount() + 1,       // row number
                        rs.getDouble("height"),
                        rs.getDouble("width"),
                        rs.getDouble("depth"),
                        rs.getInt("noItems"),
                        rs.getDouble("cubicMeter"),
                        rs.getDouble("amount"),
                        rs.getString("description")
                };
                tableModel.addRow(row);
            }
        } catch (SQLException e) {
            e.printStackTrace();
            JOptionPane.showMessageDialog(this, "Error loading table items: " + e.getMessage(), "DB Error", JOptionPane.ERROR_MESSAGE);
        }

        // --- 3️⃣ Recalculate totals ---
        updateTotals();

        // --- 4️⃣ Set editing state ---
        editingCustomerRef = customerRef;
    }

    private void checkCustomerRef() {
        if (customerRefChecked) return;

        String ref = tfCustomerRef.getText().trim();
        if (!ref.isEmpty()) {
            loadCustomerPersonalDetailsByRef(ref);
            customerRefChecked = true;
        }
    }


    private void loadCustomerPersonalDetailsByRef(String customerRef) {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT customerName, customerID, germanAddress, sriLankanAddress, phoneDE, phoneLK " +
                             "FROM customers WHERE customerRef = ?")) {

            ps.setString(1, customerRef);
            ResultSet rs = ps.executeQuery();

            if (rs.next()) {
                // ✅ Existing customer found
                tfCustomerName.setText(rs.getString("customerName"));
                tfCustomerID.setText(rs.getString("customerID"));
                tfGermanAddress.setText(rs.getString("germanAddress"));
                tfSriLankanAddress.setText(rs.getString("sriLankanAddress"));
                tfDePhone.setText(rs.getString("phoneDE"));
                tfLkPhone.setText(rs.getString("phoneLK"));

                // New shipment → clear old shipment data
                tableModel.setRowCount(0);
                tfTotalCubic.setText("");
                tfTotalItems.setText("");
                tfTotalAmount.setText("");

                editingCustomerRef = null;

            } else {
                // ❌ Customer NOT found
                JOptionPane.showMessageDialog(this,
                        "No customer found with reference:\n" + customerRef +
                                "\n\nYou can continue by entering new customer details.",
                        "Customer Not Found",
                        JOptionPane.INFORMATION_MESSAGE);

                editingCustomerRef = null;
            }

        } catch (SQLException ex) {
            ex.printStackTrace();
            JOptionPane.showMessageDialog(this,
                    "Error checking customer reference: " + ex.getMessage(),
                    "DB Error",
                    JOptionPane.ERROR_MESSAGE);
        }
    }



    private void ensureSpecialPriceColumn() {
        try (Connection c = Database.getConnection()) {
            // check columns
            boolean found = false;
            String pragma = "PRAGMA table_info(customers)";
            try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(pragma)) {
                while (rs.next()) {
                    String col = rs.getString("name");
                    if ("specialPrice".equalsIgnoreCase(col)) {
                        found = true;
                        break;
                    }
                }
            }
            if (!found) {
                // add column
                try (Statement st = c.createStatement()) {
                    st.execute("ALTER TABLE customers ADD COLUMN specialPrice REAL");
                } catch (SQLException ex) {
                    // some SQLite versions may throw on duplicate; ignore
                }
            }
        } catch (SQLException e) {
            e.printStackTrace();
        }
    }

    private void syncDelivery() {
        String val = tfDeliveryCharge.getText().trim();
        tfDeliveryChargeTotal.setText(val);
    }


}
