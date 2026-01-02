package de.tum.in.ase.MainLogin;

import de.tum.in.ase.DatabaseC.UserStore;

import javax.swing.*;
import java.awt.*;

/**
 * Simple dialog to reset a user's password.
 */
public class ForgotPasswordDialog extends JDialog {
    private JTextField tfUser;
    private JPasswordField pfNewPass;
    private JPasswordField pfConfirm;

    public ForgotPasswordDialog(JFrame parent) {
        super(parent, "Reset Password", true);
        ImageIcon icon = new ImageIcon(getClass().getResource("/MyLogo.png"));
        setIconImage(icon.getImage());
        setSize(350,200);
        setLocationRelativeTo(parent);

        JPanel p = new JPanel(new GridBagLayout());
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(5,5,5,5);
        gbc.anchor = GridBagConstraints.WEST;

        gbc.gridx=0; gbc.gridy=0;
        p.add(new JLabel("Username:"), gbc);
        gbc.gridx=1;
        tfUser = new JTextField(15);
        p.add(tfUser, gbc);

        gbc.gridx=0; gbc.gridy=1;
        p.add(new JLabel("New Password:"), gbc);
        gbc.gridx=1;
        pfNewPass = new JPasswordField(15);
        p.add(pfNewPass, gbc);

        gbc.gridx=0; gbc.gridy=2;
        p.add(new JLabel("Confirm Password:"), gbc);
        gbc.gridx=1;
        pfConfirm = new JPasswordField(15);
        p.add(pfConfirm, gbc);

        JButton btnReset = new JButton("Reset");
        JButton btnCancel = new JButton("Cancel");
        JPanel btnPanel = new JPanel();
        btnPanel.add(btnReset);
        btnPanel.add(btnCancel);

        gbc.gridx=0; gbc.gridy=3; gbc.gridwidth=2;
        p.add(btnPanel, gbc);

        add(p);

        btnReset.addActionListener(e -> resetPassword());
        btnCancel.addActionListener(e -> dispose());
    }

    private void resetPassword() {
        String user = tfUser.getText().trim();
        String newPass = new String(pfNewPass.getPassword()).trim();
        String confirm = new String(pfConfirm.getPassword()).trim();

        if (user.isEmpty() || newPass.isEmpty() || confirm.isEmpty()) {
            JOptionPane.showMessageDialog(this, "Fill all fields.", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }
        if (!newPass.equals(confirm)) {
            JOptionPane.showMessageDialog(this, "Passwords do not match.", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        boolean success = UserStore.updatePassword(user, newPass);
        if (success) {
            JOptionPane.showMessageDialog(this, "Password updated successfully.", "Success", JOptionPane.INFORMATION_MESSAGE);
            dispose();
        } else {
            JOptionPane.showMessageDialog(this, "User not found or update failed.", "Error", JOptionPane.ERROR_MESSAGE);
        }
    }
}
