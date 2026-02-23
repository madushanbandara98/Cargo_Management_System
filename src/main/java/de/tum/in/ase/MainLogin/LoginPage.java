package de.tum.in.ase.MainLogin;

import de.tum.in.ase.AppIcon;
import de.tum.in.ase.DatabaseC.Database;
import de.tum.in.ase.DatabaseC.UserStore;

import javax.swing.*;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.io.File;
import java.io.IOException;

public class LoginPage extends JFrame {

    private JTextField tfUser;
    private JPasswordField pfPass;
    private JLabel logo;
    private ImageIcon logoIcon;

    //private final String baseDir = "D:\\Cargo";

    public LoginPage() {
        super("MCM Login");
        AppIcon.setIcon(this); // your custom icon
        setDefaultCloseOperation(EXIT_ON_CLOSE);

        setExtendedState(JFrame.MAXIMIZED_BOTH);
        setLocationRelativeTo(null);


        ensureAdminUser(); // first-time setup
        Database db = new Database();
        initUI();
    }


    private void makeEnterKeyMoveFocus(JComponent comp, JButton onLastFieldAction) {
        comp.getInputMap(JComponent.WHEN_FOCUSED)
                .put(KeyStroke.getKeyStroke("ENTER"), "moveFocusForward");
        comp.getActionMap().put("moveFocusForward", new AbstractAction() {
            @Override
            public void actionPerformed(ActionEvent e) {
                if (onLastFieldAction != null && comp instanceof JPasswordField) {
                    onLastFieldAction.doClick(); // trigger login on last field
                } else {
                    comp.transferFocus(); // move to next field
                }
            }
        });
    }

    private void ensureAdminUser() {
        if (!UserStore.userExists("admin")) {
            String defaultAdminPass = JOptionPane.showInputDialog(this,
                    "No admin found. Set admin password:",
                    "First-time setup", JOptionPane.PLAIN_MESSAGE);
            if (defaultAdminPass != null && !defaultAdminPass.trim().isEmpty()) {
                boolean created = UserStore.addUserWithRole("admin", defaultAdminPass.trim(), "ADMIN");
                if (created) {
                    JOptionPane.showMessageDialog(this, "Admin user created successfully!", "Success", JOptionPane.INFORMATION_MESSAGE);
                } else {
                    JOptionPane.showMessageDialog(this, "Failed to create admin user.", "Error", JOptionPane.ERROR_MESSAGE);
                    System.exit(0);
                }
            } else {
                JOptionPane.showMessageDialog(this, "Admin password not set. Exiting.", "Error", JOptionPane.ERROR_MESSAGE);
                System.exit(0);
            }
        }
    }


    private void initUI() {
        // Left panel (yellow)
        JPanel leftPanel = new JPanel() {
            @Override
            protected void paintComponent(Graphics g) {
                super.paintComponent(g);
                if (logoIcon != null) {
                    int w = Math.min(getWidth() - 40, logoIcon.getIconWidth());
                    int h = Math.min(getHeight() / 2, logoIcon.getIconHeight());
                    Image scaled = logoIcon.getImage().getScaledInstance(w, h, Image.SCALE_SMOOTH);
                    logo.setIcon(new ImageIcon(scaled));
                }
            }
        };
        leftPanel.setBackground(new Color(238, 210, 2));
        leftPanel.setLayout(new BoxLayout(leftPanel, BoxLayout.Y_AXIS));

        JLabel welcome = new JLabel("Welcome!", SwingConstants.CENTER);
        welcome.setAlignmentX(Component.CENTER_ALIGNMENT);
        welcome.setFont(new Font("Arial", Font.BOLD, 24));

        logo = new JLabel();
        logo.setAlignmentX(Component.CENTER_ALIGNMENT);
        logoIcon = new ImageIcon(getClass().getResource(""));

        leftPanel.add(Box.createVerticalGlue());
        leftPanel.add(welcome);
        leftPanel.add(Box.createVerticalStrut(20));
        leftPanel.add(logo);
        leftPanel.add(Box.createVerticalGlue());

        // Right panel
        JPanel rightPanel = new JPanel(new GridBagLayout());
        rightPanel.setBackground(Color.WHITE);
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(6, 6, 6, 6);
        gbc.anchor = GridBagConstraints.WEST;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.gridx = 0; gbc.gridy = 0;

        rightPanel.add(new JLabel("Username:"), gbc);
        gbc.gridy++;
        tfUser = new JTextField(16);
        rightPanel.add(tfUser, gbc);

        gbc.gridy++;
        rightPanel.add(new JLabel("Password:"), gbc);
        gbc.gridy++;
        pfPass = new JPasswordField(16);
        rightPanel.add(pfPass, gbc);

        gbc.gridy++;
        JButton btnLogin = new JButton("Login");
        JButton btnForgot = new JButton("Forgot password?");
        btnForgot.setBorderPainted(false);
        btnForgot.setContentAreaFilled(false);
        btnForgot.setForeground(Color.BLUE);
        btnForgot.setCursor(new Cursor(Cursor.HAND_CURSOR));

        // HIDE FORGOT BUTTON FOR ALL USERS EXCEPT ADMIN
        btnForgot.setVisible(false);

        // Username listener → show/hide Forgot button
        tfUser.getDocument().addDocumentListener(new javax.swing.event.DocumentListener() {
            private void check() {
                String name = tfUser.getText().trim();
                btnForgot.setVisible(name.equalsIgnoreCase("admin"));
            }
            @Override public void insertUpdate(javax.swing.event.DocumentEvent e) { check(); }
            @Override public void removeUpdate(javax.swing.event.DocumentEvent e) { check(); }
            @Override public void changedUpdate(javax.swing.event.DocumentEvent e) { check(); }
        });

        JPanel btnPanel = new JPanel();
        btnPanel.add(btnLogin);
        btnPanel.add(btnForgot);
        rightPanel.add(btnPanel, gbc);

        makeEnterKeyMoveFocus(tfUser, null);
        makeEnterKeyMoveFocus(pfPass, btnLogin);

        JSplitPane split = new JSplitPane(JSplitPane.HORIZONTAL_SPLIT, leftPanel, rightPanel);
        split.setDividerLocation(0.66);
        split.setResizeWeight(0.66);
        split.setDividerSize(0);
        add(split, BorderLayout.CENTER);

        btnLogin.addActionListener(e -> doLogin());
        btnForgot.addActionListener(e -> forgotPassword());
    }

    private void doLogin() {
        String user = tfUser.getText().trim();
        String pass = new String(pfPass.getPassword()).trim();

        if (user.isEmpty() || pass.isEmpty()) {
            JOptionPane.showMessageDialog(this, "Fill both fields.", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        boolean ok = UserStore.validate(user, pass);
        if (ok) {
            dispose();
            MainDashboard dashboard = new MainDashboard(user); // pass username
            dashboard.setVisible(true);
        } else {
            JOptionPane.showMessageDialog(this, "Invalid credentials.", "Error", JOptionPane.ERROR_MESSAGE);
        }
    }


    private void forgotPassword() {
        String user = tfUser.getText().trim();
        if (user.isEmpty()) {
            JOptionPane.showMessageDialog(this, "Enter username first.", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        if (!UserStore.userExists(user)) {
            JOptionPane.showMessageDialog(this, "User does not exist.", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        String newPass = JOptionPane.showInputDialog(this, "Enter new password for user: " + user);
        if (newPass == null || newPass.trim().isEmpty()) {
            JOptionPane.showMessageDialog(this, "Password cannot be empty.", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        // Check if current login is admin
        String adminPass = JOptionPane.showInputDialog(this, "Enter admin password to confirm:");
        if (adminPass == null || adminPass.trim().isEmpty()) return;

        if (!UserStore.validate("admin", adminPass)) {
            JOptionPane.showMessageDialog(this, "Admin authentication failed.", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        boolean reset = UserStore.resetPassword(user, newPass.trim());
        if (reset) {
            JOptionPane.showMessageDialog(this, "Password reset successfully for user: " + user);
        } else {
            JOptionPane.showMessageDialog(this, "Failed to reset password.", "Error", JOptionPane.ERROR_MESSAGE);
        }
    }



}
