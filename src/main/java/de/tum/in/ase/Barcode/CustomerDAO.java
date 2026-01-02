package de.tum.in.ase.Barcode;


import de.tum.in.ase.DatabaseC.Customer;
import de.tum.in.ase.DatabaseC.Database;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

public class CustomerDAO {

    public static Customer getCustomerByRef(String ref) {
        try (Connection conn = Database.getConnection()) {
            String sql = "SELECT * FROM customers WHERE customerRef = ?";
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, ref);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        return new Customer(
                                rs.getString("customerRef"),
                                rs.getString("customerName"),
                                rs.getString("germanAddress"),
                                rs.getString("sriLankanAddress"),
                                rs.getString("phoneDE"),
                                rs.getString("phoneLK")
                        );
                    }
                }
            }
        } catch (SQLException e) {
            e.printStackTrace();
        }
        return null;
    }

    public static List<Item> getItemsByCustomerRef(String ref) {
        List<Item> items = new ArrayList<>();
        try (Connection conn = Database.getConnection()) {
            String sql = "SELECT * FROM customer_items WHERE customerRef = ?";
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, ref);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        items.add(new Item(
                                rs.getString("description"),
                                rs.getDouble("height"),
                                rs.getDouble("width"),
                                rs.getDouble("depth"),
                                rs.getInt("noItems"),
                                rs.getDouble("cubicMeter"),
                                rs.getDouble("amount")
                        ));
                    }
                }
            }
        } catch (SQLException e) {
            e.printStackTrace();
        }
        return items;
    }
}
