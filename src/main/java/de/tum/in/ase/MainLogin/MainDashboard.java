package de.tum.in.ase.MainLogin;

import de.tum.in.ase.AppIcon;
import de.tum.in.ase.Barcode.ScanCustomerFrame;
import de.tum.in.ase.Activities.CargoCustomerPage;
import de.tum.in.ase.Activities.ContainerManager;
import de.tum.in.ase.Registrations.CreateContainerPage;
import de.tum.in.ase.DatabaseC.UserManagementDialog;

import javax.swing.*;
import java.awt.*;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.List;


/**
 * Main dashboard with sidebar.
 * Top profile panel (client logo + username)
 * Admin-only: "Manage Users" button
 */
public class MainDashboard extends JFrame {
    private JPanel contentPanel;
    private final String username;
    private static String currentUsername;



    public MainDashboard(String username) {
        super("ACM Dashboard");
        this.username = username;
        currentUsername = username;

        AppIcon.setIcon(this);
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setSize(900, 500);
        setLocationRelativeTo(null);
        setLayout(new BorderLayout());

        // -----------------------------
        // Sidebar
        // -----------------------------
        JPanel sidebar = new JPanel();
        sidebar.setBackground(new Color(238, 210, 2));
        sidebar.setPreferredSize(new Dimension(200, getHeight()));
        sidebar.setLayout(new BoxLayout(sidebar, BoxLayout.Y_AXIS));
        sidebar.setBorder(BorderFactory.createEmptyBorder(10,10,10,10));

        // --------- Top profile panel (logo + username) ----------
        JPanel profilePanel = new JPanel();
        profilePanel.setBackground(new Color(238, 210, 2));
        profilePanel.setLayout(new BoxLayout(profilePanel, BoxLayout.Y_AXIS));
        profilePanel.setBorder(BorderFactory.createEmptyBorder(20,10,20,10));

        ImageIcon userIcon = new ImageIcon(getClass().getResource("/client_logo.png")); // head+upper body image
        Image img = userIcon.getImage().getScaledInstance(80, 80, Image.SCALE_SMOOTH);
        JLabel lblLogo = new JLabel(new ImageIcon(img));
        lblLogo.setAlignmentX(Component.CENTER_ALIGNMENT);

        JLabel lblUsername = new JLabel(username);
        lblUsername.setAlignmentX(Component.CENTER_ALIGNMENT);
        lblUsername.setFont(new Font("Arial", Font.BOLD, 14));

        profilePanel.add(lblLogo);
        profilePanel.add(Box.createVerticalStrut(10));
        profilePanel.add(lblUsername);
        profilePanel.add(Box.createVerticalStrut(20));

        sidebar.add(profilePanel);

        // --------- Menu buttons ----------
        JButton btnCurrent = createSidebarButton("Ongoing Shipment");
        JButton btnNewContainer = createSidebarButton("New Shipment");
        JButton btnScanBarcode = createSidebarButton("Scan Barcode / QR");
        JButton btnSettings = createSidebarButton("Settings");
        JButton btnExit = createSidebarButton("Exit");

        sidebar.add(btnCurrent);
        sidebar.add(Box.createVerticalStrut(10));
        sidebar.add(btnNewContainer);
        sidebar.add(Box.createVerticalStrut(10));
        sidebar.add(btnScanBarcode);
        sidebar.add(Box.createVerticalStrut(10));
        sidebar.add(btnSettings);

        // Admin-only "Manage Users" button
        if ("admin".equals(username)) {
            JButton btnManageUsers = createSidebarButton("Manage Users");
            sidebar.add(Box.createVerticalStrut(10));
            sidebar.add(btnManageUsers);
            btnManageUsers.addActionListener(e -> openUserManagement());
        }

        sidebar.add(Box.createVerticalGlue());
        sidebar.add(btnExit);

        // --------- Content Panel ----------
        contentPanel = new JPanel(new BorderLayout());
        contentPanel.setBackground(Color.WHITE);
        showWelcomePanel();

        add(sidebar, BorderLayout.WEST);
        add(contentPanel, BorderLayout.CENTER);

        // --------- Actions ----------
        btnNewContainer.addActionListener(e -> {
            CreateContainerPage dlg = new CreateContainerPage(this);
            dlg.setVisible(true);
            refreshCurrentContainerPanelIfVisible();
        });

        btnCurrent.addActionListener(e -> showCurrentContainerPanel());
        btnScanBarcode.addActionListener(e -> openScanWindow());
        btnSettings.addActionListener(e -> showSettingsPanel());
        btnExit.addActionListener(e -> System.exit(0));
    }

    private void openScanWindow() {
        new ScanCustomerFrame().setVisible(true);
    }


    private JButton createSidebarButton(String text) {
        JButton btn = new JButton(text);
        btn.setAlignmentX(Component.CENTER_ALIGNMENT);
        btn.setMaximumSize(new Dimension(300,40));
        btn.setFocusPainted(false);
        btn.setBackground(new Color(60,63,65));
        btn.setForeground(Color.WHITE);
        btn.setFont(new Font("Arial", Font.PLAIN, 14));
        btn.setCursor(new Cursor(Cursor.HAND_CURSOR));
        btn.addMouseListener(new java.awt.event.MouseAdapter() {
            public void mouseEntered(java.awt.event.MouseEvent evt) { btn.setBackground(new Color(80,83,85)); }
            public void mouseExited(java.awt.event.MouseEvent evt) { btn.setBackground(new Color(60,63,65)); }
        });
        return btn;
    }

    private void showWelcomePanel() {
        JLabel label = new JLabel("<html><h2>Welcome to ABC Cargo Management</h2>"
                + "<p>Select an option from the left menu.</p></html>", SwingConstants.CENTER);
        contentPanel.removeAll();
        contentPanel.add(label, BorderLayout.CENTER);
        contentPanel.revalidate();
        contentPanel.repaint();
    }

    private void showCurrentContainerPanel() {
        List<String> containers = ContainerManager.loadContainers();

        JPanel panel = new JPanel(new BorderLayout());
        panel.setName("currentContainerPanel");
        panel.setBorder(BorderFactory.createEmptyBorder(12,12,12,12));

        JLabel label = new JLabel("Current Shipments:");
        label.setFont(new Font("Arial", Font.BOLD, 16));
        panel.add(label, BorderLayout.NORTH);

        JPanel listHolder = new JPanel();
        listHolder.setLayout(new BoxLayout(listHolder, BoxLayout.Y_AXIS));
        JScrollPane scroller = new JScrollPane(listHolder);
        scroller.setPreferredSize(new Dimension(600, 300));
        panel.add(scroller, BorderLayout.CENTER);

        if (containers.isEmpty()) {
            JLabel none = new JLabel("No containers found.", SwingConstants.CENTER);
            none.setBorder(BorderFactory.createEmptyBorder(10,10,10,10));
            listHolder.add(none);
        } else {
            for (String fullPath : containers) {
                String displayName = new File(fullPath).getName() + "  —  " + fullPath;
                JButton btn = new JButton(displayName);
                btn.setAlignmentX(Component.LEFT_ALIGNMENT);
                btn.setMaximumSize(new Dimension(Integer.MAX_VALUE, 36));
                btn.addActionListener(ev -> {
                    File active = new File("D:\\Cargo", "container_path.txt");
                    try {
                        File parent = active.getParentFile();
                        if (!parent.exists()) parent.mkdirs();
                        try (FileWriter fw = new FileWriter(active, false)) {
                            fw.write(fullPath);
                        }
                    } catch (IOException ex) { ex.printStackTrace(); }

                    CargoCustomerPage page = new CargoCustomerPage(fullPath, this.username);
                    page.setVisible(true);
                    dispose();
                });

                // Right-click menu: delete container
                JPopupMenu popup = new JPopupMenu();
                JMenuItem miDelete = new JMenuItem("Remove from list");
                miDelete.addActionListener(ae -> {
                    List<String> list = ContainerManager.loadContainers();
                    list.removeIf(s -> s.equals(fullPath));
                    ContainerManager.overwriteContainers(list);
                    showCurrentContainerPanel();
                });
                popup.add(miDelete);
                btn.setComponentPopupMenu(popup);

                listHolder.add(btn);
                listHolder.add(Box.createVerticalStrut(6));
            }
        }

        contentPanel.removeAll();
        contentPanel.add(panel, BorderLayout.CENTER);
        contentPanel.revalidate();
        contentPanel.repaint();
    }

    private void refreshCurrentContainerPanelIfVisible() {
        Component comp = contentPanel.getComponentCount() > 0 ? contentPanel.getComponent(0) : null;
        if (comp != null && comp.getName() != null && comp.getName().equals("currentContainerPanel")) {
            showCurrentContainerPanel();
        }
    }

    private void showSettingsPanel() {
        JLabel label = new JLabel("Settings Panel (Under development)", SwingConstants.CENTER);
        contentPanel.removeAll();
        contentPanel.add(label, BorderLayout.CENTER);
        contentPanel.revalidate();
        contentPanel.repaint();
    }

    // -----------------------------
    // Admin-only: open User Management Dialog
    // -----------------------------
    private void openUserManagement() {
        UserManagementDialog dlg = new UserManagementDialog(this);
        dlg.setVisible(true);
    }

    public static String getCurrentUsername() {
        return currentUsername;
    }
}
