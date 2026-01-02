package de.tum.in.ase.Barcode;


import de.tum.in.ase.DatabaseC.Customer;

import javax.swing.*;
import java.awt.*;
import java.util.List;
import java.io.File;
import javax.sound.sampled.*;

public class ScanCustomerFrame extends JFrame {

    private JTextField tfBarcode;
    private JButton btnLoad;

    public ScanCustomerFrame() {
        setTitle("Scan Customer");
        setSize(500, 150);
        setLocationRelativeTo(null);
        setLayout(new FlowLayout());
        setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);

        tfBarcode = new JTextField(20);
        btnLoad = new JButton("Load Customer");

        add(new JLabel("Scan Customer Barcode / Ref:"));
        add(tfBarcode);
        add(btnLoad);

        btnLoad.addActionListener(e -> loadCustomer());
        tfBarcode.addActionListener(e -> loadCustomer());

        setVisible(true);
    }

    private void loadCustomer() {
        String ref = tfBarcode.getText().trim();
        if (ref.isEmpty()) {
            JOptionPane.showMessageDialog(this, "Please scan barcode!", "Warning", JOptionPane.WARNING_MESSAGE);
            return;
        }

        Customer customer = CustomerDAO.getCustomerByRef(ref);
        if (customer == null) {
            JOptionPane.showMessageDialog(this, "Customer not found!", "Error", JOptionPane.ERROR_MESSAGE);
            playSound("/sounds/error.wav");
            return;
        }

        List<Item> items = CustomerDAO.getItemsByCustomerRef(ref);

        // Play confirmation sound
        playSound("/sounds/scan_success.wav");

        // Open Invoice Preview
        new InvoicePreviewFrame(customer, items);
    }

    private void playSound(String path) {
        try {
            File soundFile = new File(getClass().getResource(path).toURI());
            AudioInputStream audioIn = AudioSystem.getAudioInputStream(soundFile);
            Clip clip = AudioSystem.getClip();
            clip.open(audioIn);
            clip.start();
        } catch (Exception ex) {
            ex.printStackTrace();
        }
    }
}
