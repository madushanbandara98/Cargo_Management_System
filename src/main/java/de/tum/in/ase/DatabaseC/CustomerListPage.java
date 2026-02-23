package de.tum.in.ase.DatabaseC;

import de.tum.in.ase.Activities.CargoCustomerPage;
import de.tum.in.ase.AppIcon;
import de.tum.in.ase.MainLogin.MainDashboard;

import javax.swing.*;
import javax.swing.event.DocumentEvent;
import javax.swing.event.DocumentListener;
import javax.swing.table.DefaultTableModel;
import javax.swing.table.TableRowSorter;
import java.awt.*;
import java.io.IOException;
import java.sql.*;
import java.util.ArrayList;
import java.util.List;

public class CustomerListPage extends JFrame {
    private CargoCustomerPage parent;
    private DefaultTableModel model;
    private JTable table;
    private JTextField tfSearch;
    private TableRowSorter<DefaultTableModel> rowSorter;

    public CustomerListPage(CargoCustomerPage parent) {
        super("Customer Manager");
        this.parent = parent;
        setSize(900, 500);
        setLocationRelativeTo(null);
        initUI();
        loadCustomers();
        AppIcon.setIcon(this);
    }

    private void initUI() {
        JPanel top = new JPanel(new BorderLayout(8, 8));
        tfSearch = new JTextField();
        top.add(new JLabel("Search: "), BorderLayout.WEST);
        top.add(tfSearch, BorderLayout.CENTER);

        // ✅ Updated columns to include Delivery Charge and Special Price
        String[] cols = {"Ref", "Name", "ID", "DE Phone", "LK Phone", "Total Cubic", "Total Items", "Total Amount", "Delivery Charge", "Special Price"};
        model = new DefaultTableModel(cols, 0) {
            @Override
            public boolean isCellEditable(int row, int column) {
                return false;
            }
        };

        table = new JTable(model);
        table.setSelectionMode(ListSelectionModel.SINGLE_SELECTION);
        rowSorter = new TableRowSorter<>(model);
        table.setRowSorter(rowSorter);

        JScrollPane sc = new JScrollPane(table);

        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.RIGHT));
        JButton btnEdit = new JButton("Edit Selected");
        JButton btnDelete = new JButton("Delete Selected");
        JButton btnRefresh = new JButton("Refresh");
        JButton btnDeleteAll = new JButton("Delete All");
        buttons.add(btnEdit);
        buttons.add(btnDelete);
        buttons.add(btnRefresh);
        buttons.add(btnDeleteAll);

        getContentPane().setLayout(new BorderLayout(8, 8));
        getContentPane().add(top, BorderLayout.NORTH);
        getContentPane().add(sc, BorderLayout.CENTER);
        getContentPane().add(buttons, BorderLayout.SOUTH);

        // search filter
        tfSearch.getDocument().addDocumentListener(new DocumentListener() {
            void filter() {
                String txt = tfSearch.getText();
                if (txt.trim().length() == 0) {
                    rowSorter.setRowFilter(null);
                } else {
                    rowSorter.setRowFilter(RowFilter.regexFilter("(?i)" + txt));
                }
            }
            @Override public void insertUpdate(DocumentEvent e) { filter(); }
            @Override public void removeUpdate(DocumentEvent e) { filter(); }
            @Override public void changedUpdate(DocumentEvent e) { filter(); }
        });

        btnEdit.addActionListener(e -> editSelected());
        btnDelete.addActionListener(e -> deleteSelected());
        btnRefresh.addActionListener(e -> loadCustomers());

        btnDeleteAll.setBackground(Color.RED);
        btnDeleteAll.setForeground(Color.WHITE);
        btnDeleteAll.setFocusPainted(false);
        btnDeleteAll.addActionListener(e -> deleteAllCustomers());
    }


    private void loadCustomers() {
        model.setRowCount(0); // clear previous rows
        List<Record> list = fetchAllCustomersFromDB();
        for (Record r : list) {
            model.addRow(new Object[]{
                    r.customerRef,
                    r.customerName,
                    r.customerID,
                    r.phoneDE,
                    r.phoneLK,
                    String.format("%.3f", r.totalCubic),
                    r.totalItems,
                    String.format("%.2f", r.totalAmount),
                    String.format("%.2f", r.deliveryCharge),
                    r.specialPrice == null ? "" : String.format("%.2f", r.specialPrice)
            });
        }
    }


    private void editSelected() {
        int sel = table.getSelectedRow();
        if (sel == -1) {
            JOptionPane.showMessageDialog(this, "Select a customer to edit.", "Info", JOptionPane.INFORMATION_MESSAGE);
            return;
        }
        // convert view row to model row
        int modelRow = table.convertRowIndexToModel(sel);
        String ref = model.getValueAt(modelRow, 0).toString();

        // fetch full record
        Record r = fetchCustomerByRef(ref);
        if (r != null) {
            parent.fillCustomerFormFromDB(r.customerRef, r.customerName, r.customerID, r.germanAddress, r.sriLankanAddress, r.phoneDE, r.phoneLK, r.totalCubic, r.totalItems, r.totalAmount,r.deliveryCharge,r.specialPrice);
            this.dispose();
        } else {
            JOptionPane.showMessageDialog(this, "Unable to load customer data.", "Error", JOptionPane.ERROR_MESSAGE);
        }
    }

    private void deleteSelected() {
        int sel = table.getSelectedRow();
        if (sel == -1) {
            JOptionPane.showMessageDialog(this, "Select a customer to delete.", "Info", JOptionPane.INFORMATION_MESSAGE);
            return;
        }
        int modelRow = table.convertRowIndexToModel(sel);
        String ref = model.getValueAt(modelRow, 0).toString();

        int confirm = JOptionPane.showConfirmDialog(this, "Delete customer '" + ref + "' ?", "Confirm", JOptionPane.YES_NO_OPTION);
        if (confirm != JOptionPane.YES_OPTION) return;

        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("DELETE FROM customers WHERE customerRef = ?")) {
            ps.setString(1, ref);
            ps.executeUpdate();
            JOptionPane.showMessageDialog(this, "Deleted.");
            loadCustomers();
        } catch (SQLException ex) {
            ex.printStackTrace();
            JOptionPane.showMessageDialog(this, "DB Error: " + ex.getMessage(), "Error", JOptionPane.ERROR_MESSAGE);
        }
    }



    private void deleteAllCustomers() {
        String password = JOptionPane.showInputDialog(this,
                "Enter your password to confirm deletion:");
        if (password == null || password.trim().isEmpty()) return;

        // Find the currently logged-in user from DB based on session or default admin
        String currentUser = MainDashboard.getCurrentUsername();
        if (currentUser == null || currentUser.isEmpty()) {
            // fallback to default admin
            currentUser = "admin";
        }

        // Validate password
        if (!UserStore.validate(currentUser, password)) {
            JOptionPane.showMessageDialog(this,
                    "Wrong password! Action cancelled.",
                    "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        int confirm = JOptionPane.showConfirmDialog(this,
                "Are you sure you want to delete ALL customers?",
                "Confirm Delete All",
                JOptionPane.YES_NO_OPTION);
        if (confirm != JOptionPane.YES_OPTION) return;

        Database.deleteAllCustomers();

        JOptionPane.showMessageDialog(this, "All customers deleted successfully!");
        loadCustomers(); // refresh table
    }





    // fetch all customers (basic list)
    private List<Record> fetchAllCustomersFromDB() {
        List<Record> list = new ArrayList<>();
        try (Connection c = Database.getConnection();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT customerRef, customerName, customerID, germanAddress, sriLankanAddress, phoneDE, phoneLK, totalCubic, totalItems, totalAmount, deliveryCharge, specialPrice FROM customers ORDER BY id DESC")) {

            while (rs.next()) {
                Record r = new Record();
                r.customerRef = rs.getString("customerRef");
                r.customerName = rs.getString("customerName");
                r.customerID = rs.getString("customerID");
                r.germanAddress = rs.getString("germanAddress");
                r.sriLankanAddress = rs.getString("sriLankanAddress");
                r.phoneDE = rs.getString("phoneDE");
                r.phoneLK = rs.getString("phoneLK");
                r.totalCubic = rs.getDouble("totalCubic");
                r.totalItems = rs.getInt("totalItems");
                r.totalAmount = rs.getDouble("totalAmount");
                r.deliveryCharge = rs.getDouble("deliveryCharge");
                try { r.specialPrice = rs.getDouble("specialPrice"); if (rs.wasNull()) r.specialPrice = null; } catch (SQLException ex) { r.specialPrice = null; }
                list.add(r);
            }

        } catch (SQLException ex) {
            ex.printStackTrace();
            JOptionPane.showMessageDialog(this, "DB Error loading customers: " + ex.getMessage(), "Error", JOptionPane.ERROR_MESSAGE);
        }
        return list;
    }

    private Record fetchCustomerByRef(String ref) {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT customerRef, customerName, customerID, germanAddress, sriLankanAddress, phoneDE, phoneLK, totalCubic, totalItems, totalAmount, deliveryCharge, specialPrice FROM customers WHERE customerRef = ?")) {
            ps.setString(1, ref);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    Record r = new Record();
                    r.customerRef = rs.getString("customerRef");
                    r.customerName = rs.getString("customerName");
                    r.customerID = rs.getString("customerID");
                    r.germanAddress = rs.getString("germanAddress");
                    r.sriLankanAddress = rs.getString("sriLankanAddress");
                    r.phoneDE = rs.getString("phoneDE");
                    r.phoneLK = rs.getString("phoneLK");
                    r.totalCubic = rs.getDouble("totalCubic");
                    r.totalItems = rs.getInt("totalItems");
                    r.totalAmount = rs.getDouble("totalAmount");
                    r.deliveryCharge = rs.getDouble("deliveryCharge");
                    try { double sp = rs.getDouble("specialPrice"); if (rs.wasNull()) r.specialPrice = null; else r.specialPrice = sp; } catch (SQLException ex) { r.specialPrice = null; }
                    return r;
                }
            }
        } catch (SQLException ex) {
            ex.printStackTrace();
        }
        return null;
    }

    // simple record holder
    static class Record {
        String customerRef;
        String customerName;
        String customerID;
        String germanAddress;
        String sriLankanAddress;
        String phoneDE;
        String phoneLK;
        double totalCubic;
        int totalItems;
        double totalAmount;
        Double specialPrice;
        double deliveryCharge;
    }
}
