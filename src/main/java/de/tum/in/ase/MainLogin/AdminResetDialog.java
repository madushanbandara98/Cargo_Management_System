package de.tum.in.ase.MainLogin;

import de.tum.in.ase.DatabaseC.UserStore;

import javax.swing.*;
import java.awt.*;

public class AdminResetDialog extends JDialog {

    private JPasswordField pfAdmin;
    private JTextField tfUsername;
    private JPasswordField pfNew;
    private JPasswordField pfConfirm;

    public AdminResetDialog(JFrame parent) {
        super(parent, "Admin Reset Password", true);
        setSize(350, 300);
        setLocationRelativeTo(parent);

        JPanel panel = new JPanel(new GridBagLayout());
        GridBagConstraints gbc = new GridBagConstraints();

        gbc.insets = new Insets(5, 5, 5, 5);
        gbc.anchor = GridBagConstraints.WEST;
        gbc.fill = GridBagConstraints.HORIZONTAL;

        gbc.gridx = 0; gbc.gridy = 0;
        panel.add(new JLabel("Admin Password:"), gbc);
        gbc.gridy++;
        pfAdmin = new JPasswordField(15);
        panel.add(pfAdmin, gbc);

        gbc.gridy++;
        panel.add(new JLabel("Username to reset:"), gbc);
        gbc.gridy++;
        tfUsername = new JTextField(15);
        panel.add(tfUsername, gbc);

        gbc.gridy++;
        panel.add(new JLabel("New Password:"), gbc);
        gbc.gridy++;
        pfNew = new JPasswordField(15);
        panel.add(pfNew, gbc);

        gbc.gridy++;
        panel.add(new JLabel("Confirm New Password:"), gbc);
        gbc.gridy++;
        pfConfirm = new JPasswordField(15);
        panel.add(pfConfirm, gbc);

        gbc.gridy++;
        JButton btnReset = new JButton("Reset Password");
        btnReset.addActionListener(e -> doReset());
        panel.add(btnReset, gbc);

        add(panel);
    }

    private void doReset() {
        String adminPass = new String(pfAdmin.getPassword()).trim();
        String username = tfUsername.getText().trim();
        String newPass = new String(pfNew.getPassword()).trim();
        String confirmPass = new String(pfConfirm.getPassword()).trim();

        if (adminPass.isEmpty() || username.isEmpty() || newPass.isEmpty() || confirmPass.isEmpty()) {
            JOptionPane.showMessageDialog(this, "Fill all fields!", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        // Validate admin password
        if (!UserStore.validate("admin", adminPass)) {
            JOptionPane.showMessageDialog(this, "Invalid admin password!", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        // Confirm new password matches
        if (!newPass.equals(confirmPass)) {
            JOptionPane.showMessageDialog(this, "Passwords do not match!", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        // Reset the password
        boolean ok = UserStore.resetPassword(username, newPass);
        if (ok) {
            JOptionPane.showMessageDialog(this, "Password successfully reset!", "Success", JOptionPane.INFORMATION_MESSAGE);
            dispose();
        } else {
            JOptionPane.showMessageDialog(this, "Username not found.", "Error", JOptionPane.ERROR_MESSAGE);
        }
    }
}
