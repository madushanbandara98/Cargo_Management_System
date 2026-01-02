package de.tum.in.ase.DatabaseC;

import javax.swing.*;
import java.awt.*;
import java.util.Map;

public class UserManagementDialog extends JDialog {
    private DefaultListModel<String> userListModel;
    private JList<String> userList;

    public UserManagementDialog(JFrame parent) {
        super(parent, "Manage Users", true);
        setSize(400, 400);
        setLocationRelativeTo(parent);
        setLayout(new BorderLayout());

        userListModel = new DefaultListModel<>();
        userList = new JList<>(userListModel);
        loadUsers();

        JScrollPane scroll = new JScrollPane(userList);
        add(scroll, BorderLayout.CENTER);

        JPanel btnPanel = new JPanel();
        JButton btnAdd = new JButton("Add User");
        JButton btnDelete = new JButton("Delete User");
        JButton btnReset = new JButton("Reset Password");
        JButton btnClose = new JButton("Close");

        btnPanel.add(btnAdd);
        btnPanel.add(btnDelete);
        btnPanel.add(btnReset);
        btnPanel.add(btnClose);

        add(btnPanel, BorderLayout.SOUTH);

        // -------- Actions --------
        btnAdd.addActionListener(e -> addUser());
        btnDelete.addActionListener(e -> deleteUser());
        btnReset.addActionListener(e -> resetPassword());
        btnClose.addActionListener(e -> dispose());
    }

    private void loadUsers() {
        userListModel.clear();
        Map<String, String> users = UserStore.getAllUsers();
        for (String u : users.keySet()) {
            if (!"admin".equals(u)) { // hide admin from list
                userListModel.addElement(u);
            }
        }
    }

    private void addUser() {
        JTextField tfUser = new JTextField();
        JPasswordField pfPass = new JPasswordField();
        Object[] msg = {"Username:", tfUser, "Password:", pfPass};
        int option = JOptionPane.showConfirmDialog(this, msg, "Add New User", JOptionPane.OK_CANCEL_OPTION);
        if (option == JOptionPane.OK_OPTION) {
            String user = tfUser.getText().trim();
            String pass = new String(pfPass.getPassword()).trim();
            if (user.isEmpty() || pass.isEmpty()) return;

            if (UserStore.userExists(user)) {
                JOptionPane.showMessageDialog(this, "User already exists!", "Error", JOptionPane.ERROR_MESSAGE);
                return;
            }

            boolean added = UserStore.addUser(user, pass);
            if (added) {
                JOptionPane.showMessageDialog(this, "User added successfully!", "Success", JOptionPane.INFORMATION_MESSAGE);
                loadUsers();
            } else {
                JOptionPane.showMessageDialog(this, "Failed to add user!", "Error", JOptionPane.ERROR_MESSAGE);
            }
        }
    }

    private void deleteUser() {
        String selected = userList.getSelectedValue();
        if (selected == null) return;

        int confirm = JOptionPane.showConfirmDialog(this, "Delete user: " + selected + "?", "Confirm", JOptionPane.YES_NO_OPTION);
        if (confirm == JOptionPane.YES_OPTION) {
            boolean success = UserStore.deleteUser(selected);
            if (success) {
                JOptionPane.showMessageDialog(this, "User deleted successfully!", "Success", JOptionPane.INFORMATION_MESSAGE);
                loadUsers();
            } else {
                JOptionPane.showMessageDialog(this, "Failed to delete user!", "Error", JOptionPane.ERROR_MESSAGE);
            }
        }
    }

    private void resetPassword() {
        String selected = userList.getSelectedValue();
        if (selected == null) return;

        JPasswordField pfPass = new JPasswordField();
        Object[] msg = {"New password for " + selected + ":", pfPass};
        int option = JOptionPane.showConfirmDialog(this, msg, "Reset Password", JOptionPane.OK_CANCEL_OPTION);
        if (option == JOptionPane.OK_OPTION) {
            String newPass = new String(pfPass.getPassword()).trim();
            if (newPass.isEmpty()) return;

            boolean success = UserStore.resetPassword(selected, newPass);
            if (success) {
                JOptionPane.showMessageDialog(this, "Password reset successfully!", "Success", JOptionPane.INFORMATION_MESSAGE);
            } else {
                JOptionPane.showMessageDialog(this, "Failed to reset password!", "Error", JOptionPane.ERROR_MESSAGE);
            }
        }
    }
}
