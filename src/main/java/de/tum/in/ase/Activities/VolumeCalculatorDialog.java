package de.tum.in.ase.Activities;

import javax.swing.*;
import java.awt.*;

public class VolumeCalculatorDialog extends JDialog {

    private CargoCustomerPage parent;

    public VolumeCalculatorDialog(CargoCustomerPage parent) {

        super(parent, "Volume & Dimension Calculator", false); // FALSE = floating
        this.parent = parent;

        setSize(580, 560);
        setLocationRelativeTo(parent);
        setAlwaysOnTop(true);

        // Brand colors
        Color yellowBg = new Color(255, 230, 140);
        Color panelBg = new Color(255, 245, 200);
        Color buttonColor = new Color(255, 193, 7);
        Color textColor = new Color(60, 60, 60);

        Font titleFont = new Font("Segoe UI", Font.BOLD, 20);
        Font labelFont = new Font("Segoe UI", Font.PLAIN, 14);
        Font fieldFont = new Font("Segoe UI", Font.PLAIN, 14);
        Font buttonFont = new Font("Segoe UI", Font.BOLD, 16);

        JPanel root = new JPanel(new GridBagLayout());
        root.setBackground(yellowBg);

        JPanel panel = new JPanel(new GridBagLayout());
        panel.setBackground(panelBg);
        panel.setBorder(BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(new Color(220, 200, 120)),
                BorderFactory.createEmptyBorder(20, 25, 20, 25)
        ));

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(8, 8, 8, 8);
        gbc.fill = GridBagConstraints.HORIZONTAL;

        // TITLE
        JLabel title = new JLabel("Volume Calculator");
        title.setFont(titleFont);
        title.setForeground(textColor);
        title.setHorizontalAlignment(SwingConstants.CENTER);
        gbc.gridx = 0; gbc.gridy = 0; gbc.gridwidth = 2;
        panel.add(title, gbc);
        gbc.gridwidth = 1;

        // Fields
        JTextField priceField = new JTextField();
        JTextField ppmField = new JTextField();
        JComboBox<String> shapeBox = new JComboBox<>(new String[]{"Cube", "Rectangular Box"});
        JTextField hField = new JTextField();
        JTextField wField = new JTextField();
        JTextField dField = new JTextField();
        dField.setEditable(false);
        dField.setBackground(new Color(240,240,240));

        addRow(panel, gbc, "Total Price (€)", priceField, labelFont, fieldFont, 1);
        addRow(panel, gbc, "Price per m³ (€)", ppmField, labelFont, fieldFont, 2);
        addRow(panel, gbc, "Shape", shapeBox, labelFont, fieldFont, 3);
        addRow(panel, gbc, "Height (cm)", hField, labelFont, fieldFont, 4);
        addRow(panel, gbc, "Width (cm)", wField, labelFont, fieldFont, 5);
        addRow(panel, gbc, "Depth (cm)", dField, labelFont, fieldFont, 6);

        // Buttons
        JButton calculateBtn = new JButton("CALCULATE");
        JButton sendBtn = new JButton("SEND TO PAGE");

        calculateBtn.setFont(buttonFont);
        calculateBtn.setBackground(buttonColor);

        sendBtn.setFont(buttonFont);
        sendBtn.setBackground(new Color(100,180,100));

        gbc.gridx = 0; gbc.gridy = 7;
        panel.add(calculateBtn, gbc);

        gbc.gridx = 1;
        panel.add(sendBtn, gbc);

        // LOGIC
        calculateBtn.addActionListener(e -> {
            try {
                double price = Double.parseDouble(priceField.getText());
                double pricePerM3 = Double.parseDouble(ppmField.getText());
                double volumeCm3 = (price / pricePerM3) * 1_000_000;

                if (shapeBox.getSelectedItem().equals("Cube")) {
                    double side = Math.cbrt(volumeCm3);
                    hField.setText(String.format("%.2f", side));
                    wField.setText(String.format("%.2f", side));
                    dField.setText(String.format("%.2f", side));
                } else {
                    double h = Double.parseDouble(hField.getText());
                    double w = Double.parseDouble(wField.getText());
                    double d = volumeCm3 / (h * w);
                    dField.setText(String.format("%.2f", d));
                }
            } catch (Exception ex) {
                JOptionPane.showMessageDialog(this, "Invalid values");
            }
        });

        // SEND TO CARGO
        sendBtn.addActionListener(e -> {
            parent.setDimensionsFromCalculator(
                    hField.getText(),
                    wField.getText(),
                    dField.getText()
            );
            dispose();
        });

        root.add(panel);
        setContentPane(root);
    }

    private void addRow(JPanel panel, GridBagConstraints gbc,
                        String label, JComponent field,
                        Font labelFont, Font fieldFont, int y) {

        gbc.gridx = 0; gbc.gridy = y;
        JLabel lbl = new JLabel(label);
        lbl.setFont(labelFont);
        panel.add(lbl, gbc);

        gbc.gridx = 1;
        field.setFont(fieldFont);
        panel.add(field, gbc);
    }
}

