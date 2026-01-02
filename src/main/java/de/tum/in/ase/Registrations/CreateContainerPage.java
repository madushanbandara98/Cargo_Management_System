package de.tum.in.ase.Registrations;

import de.tum.in.ase.Activities.CargoCustomerPage;
import de.tum.in.ase.Activities.ContainerManager;

import javax.swing.*;
import java.awt.*;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;

/**
 * Modal dialog to create a new container folder.
 * On success:
 *  - creates the folder at the chosen location
 *  - writes the path to D:\Cargo\container_path.txt (active)
 *  - calls ContainerManager.addContainer(...) to persist in containers.txt
 *  - opens CargoCustomerPage for that container path
 */
public class CreateContainerPage extends JDialog {
    private final Frame owner;
    private JTextField tfFolderName;
    private JTextField tfContainerName;
    private JLabel lblPath;
    private String selectedPath;

    private final File activeContainerFile = new File("D:\\Cargo", "container_path.txt");

    public CreateContainerPage(Frame owner) {
        super(owner, "Create New Container", true);
        this.owner = owner;
        ImageIcon icon = new ImageIcon(getClass().getResource("/MyLogo.png"));
        setIconImage(icon.getImage());
        setSize(600, 250);
        setLocationRelativeTo(owner);
        setResizable(false);
        initUI();
    }

    private void initUI() {
        JPanel p = new JPanel(new GridBagLayout());
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(8,8,8,8);
        gbc.fill = GridBagConstraints.HORIZONTAL;

        // Folder Name
        gbc.gridx=0; gbc.gridy=0;
        p.add(new JLabel("Folder Name:"), gbc);
        gbc.gridx=1;
        tfFolderName = new JTextField(25);
        p.add(tfFolderName, gbc);

        // Container Name
        gbc.gridx=0; gbc.gridy=1;
        p.add(new JLabel("Container Name:"), gbc);
        gbc.gridx=1;
        tfContainerName = new JTextField(25);
        p.add(tfContainerName, gbc);

        // Select location
        gbc.gridx=0; gbc.gridy=2;
        p.add(new JLabel("Select Location:"), gbc);
        gbc.gridx=1;
        lblPath = new JLabel("No folder selected");
        p.add(lblPath, gbc);
        JButton btnBrowse = new JButton("Browse");
        gbc.gridx=2;
        p.add(btnBrowse, gbc);

        // Buttons
        JPanel btnRow = new JPanel();
        JButton btnCreate = new JButton("Create");
        JButton btnCancel = new JButton("Cancel");
        btnRow.add(btnCreate); btnRow.add(btnCancel);
        gbc.gridx=0; gbc.gridy=3; gbc.gridwidth=3;
        p.add(btnRow, gbc);

        add(p);

        btnBrowse.addActionListener(e -> {
            JFileChooser chooser = new JFileChooser();
            chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
            if (chooser.showOpenDialog(this) == JFileChooser.APPROVE_OPTION) {
                selectedPath = chooser.getSelectedFile().getAbsolutePath();
                lblPath.setText(selectedPath);
            }
        });

        btnCreate.addActionListener(e -> createFolder());
        btnCancel.addActionListener(e -> dispose());
    }

    private void createFolder() {
        String folder = tfFolderName.getText().trim();
        String container = tfContainerName.getText().trim();

        if (folder.isEmpty() || container.isEmpty() || selectedPath == null || selectedPath.isEmpty()) {
            JOptionPane.showMessageDialog(this, "Fill all fields and select location", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        // sanitize and build folder
        folder = folder.replaceAll("[\\\\/:*?\"<>|]", "_");
        container = container.replaceAll("[\\\\/:*?\"<>|]", "_");

        File parent = new File(selectedPath);
        if (!parent.exists() || !parent.isDirectory()) {
            JOptionPane.showMessageDialog(this, "Selected location is invalid", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        File newFolder = new File(parent, folder + "_" + container);
        if (newFolder.exists()) {
            JOptionPane.showMessageDialog(this, "Folder already exists:\n" + newFolder.getAbsolutePath(), "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        if (!newFolder.mkdirs()) {
            JOptionPane.showMessageDialog(this, "Failed to create folder. Check permissions.", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        // Save active container path (for backwards compatibility)
        try {
            if (!activeContainerFile.getParentFile().exists()) activeContainerFile.getParentFile().mkdirs();
            try (FileWriter fw = new FileWriter(activeContainerFile, false)) {
                fw.write(newFolder.getAbsolutePath());
            }
        } catch (IOException ex) {
            ex.printStackTrace();
            JOptionPane.showMessageDialog(this, "Could not save active container path: " + ex.getMessage(), "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        // Add to containers.txt via ContainerManager
        ContainerManager.addContainer(newFolder.getAbsolutePath());

        JOptionPane.showMessageDialog(this, "Folder created successfully:\n" + newFolder.getAbsolutePath());

        // Open CargoCustomerPage for this container
        dispose(); // close dialog first
        CargoCustomerPage page = new CargoCustomerPage(newFolder.getAbsolutePath());
        page.setVisible(true);

        // Close owner (main dashboard) if present to match your current UX
        if (owner != null) owner.dispose();
    }
}
