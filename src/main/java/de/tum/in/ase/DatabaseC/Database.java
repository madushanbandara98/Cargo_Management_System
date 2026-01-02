package de.tum.in.ase.DatabaseC;

import javax.swing.*;
import java.io.File;
import java.sql.*;

public class Database {

    // Application data directory (cross-platform)
    private static final String APP_DIR =
            System.getProperty("user.home") + File.separator + ".acm";

    private static final String DB_URL =
            "jdbc:sqlite:" + APP_DIR + File.separator + "cargo.db";

    static {
        try {
            // Ensure app directory exists
            File dir = new File(APP_DIR);
            if (!dir.exists()) {
                dir.mkdirs();
            }
            createTables();
            createDefaultAdmin();
        } catch (Exception e) {
            e.printStackTrace();
            JOptionPane.showMessageDialog(
                    null,
                    "Failed to initialize database",
                    "Fatal Error",
                    JOptionPane.ERROR_MESSAGE
            );
            System.exit(1);
        }
    }

    public static Connection getConnection() throws SQLException {
        return DriverManager.getConnection(DB_URL);
    }

    private static void createTables() throws SQLException {
        try (Connection conn = getConnection();
             Statement stmt = conn.createStatement()) {

            String sqlUsers = """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL
    )
""";
            stmt.execute(sqlUsers);


            String sqlCustomers = """
                CREATE TABLE IF NOT EXISTS customers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customerRef TEXT UNIQUE,
                    customerName TEXT,
                    customerID TEXT,
                    germanAddress TEXT,
                    sriLankanAddress TEXT,
                    phoneDE TEXT,
                    phoneLK TEXT,
                    totalCubic REAL,
                    totalItems INTEGER,
                    totalAmount REAL,
                    deliveryCharge REAL,
                    specialPrice REAL
                )
            """;
            stmt.execute(sqlCustomers);

            String sqlItems = """
                CREATE TABLE IF NOT EXISTS customer_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customerRef TEXT,
                    height REAL,
                    width REAL,
                    depth REAL,
                    noItems INTEGER,
                    cubicMeter REAL,
                    amount REAL,
                    description TEXT,
                    FOREIGN KEY (customerRef)
                        REFERENCES customers(customerRef)
                        ON DELETE CASCADE
                )
            """;
            stmt.execute(sqlItems);

            System.out.println("Database initialized ✅");
            System.out.println("Database path: " + DB_URL);

        }
    }

    public static void createDefaultAdmin() {
        String checkSql = "SELECT COUNT(*) FROM users";
        String insertSql = "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)";

        try (Connection conn = getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(checkSql)) {

            if (rs.next() && rs.getInt(1) == 0) {
                String adminHash = org.mindrot.jbcrypt.BCrypt
                        .hashpw("admin123", org.mindrot.jbcrypt.BCrypt.gensalt());

                try (PreparedStatement ps = conn.prepareStatement(insertSql)) {
                    ps.setString(1, "admin");
                    ps.setString(2, adminHash);
                    ps.setString(3, "ADMIN");
                    ps.executeUpdate();
                }

                System.out.println("Default admin created (admin / admin123)");
            }

        } catch (Exception e) {
            e.printStackTrace();
        }
    }


    public static void deleteAllCustomers() {
        try (Connection c = getConnection();
             Statement stmt = c.createStatement()) {

            c.setAutoCommit(false);
            stmt.executeUpdate("DELETE FROM customer_items");
            stmt.executeUpdate("DELETE FROM customers");
            c.commit();

        } catch (SQLException e) {
            e.printStackTrace();
            JOptionPane.showMessageDialog(
                    null,
                    "Error deleting all customers: " + e.getMessage(),
                    "DB Error",
                    JOptionPane.ERROR_MESSAGE
            );
        }
    }
}
