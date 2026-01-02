package de.tum.in.ase.DatabaseC;

import org.mindrot.jbcrypt.BCrypt;

import java.sql.*;
import java.util.HashMap;
import java.util.Map;

/**
 * UserStore now fully uses the SQLite Database.
 * Drop-in replacement for the old file-based version.
 */
public class UserStore {

    // -----------------------------
    // CHECK IF USER EXISTS
    // -----------------------------
    public static boolean userExists(String username) {
        String sql = "SELECT COUNT(*) FROM users WHERE username = ?";
        try (Connection conn = Database.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, username);
            ResultSet rs = ps.executeQuery();
            return rs.next() && rs.getInt(1) > 0;
        } catch (SQLException e) {
            e.printStackTrace();
            return false;
        }
    }

    // -----------------------------
    // VALIDATE LOGIN
    // -----------------------------
    public static boolean validate(String username, String password) {
        String sql = "SELECT password_hash FROM users WHERE username = ?";
        try (Connection conn = Database.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, username);
            ResultSet rs = ps.executeQuery();
            if (rs.next()) {
                String hash = rs.getString("password_hash");
                return BCrypt.checkpw(password, hash);
            }
        } catch (SQLException e) {
            e.printStackTrace();
        }
        return false;
    }

    // -----------------------------
    // RESET PASSWORD (ADMIN)
    // -----------------------------
    public static boolean resetPassword(String username, String newPassword) {
        if (!userExists(username)) return false;
        return updatePassword(username, newPassword);
    }

    // -----------------------------
    // UPDATE PASSWORD (SELF)
    // -----------------------------
    public static boolean updatePassword(String username, String newPassword) {
        String hashed = BCrypt.hashpw(newPassword, BCrypt.gensalt());
        String sql = "UPDATE users SET password_hash = ? WHERE username = ?";
        try (Connection conn = Database.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, hashed);
            ps.setString(2, username);
            int updated = ps.executeUpdate();
            return updated > 0;
        } catch (SQLException e) {
            e.printStackTrace();
            return false;
        }
    }

    // -----------------------------
    // ADD NEW USER (default role USER)
    // -----------------------------
    public static boolean addUser(String username, String password) {
        return addUserWithRole(username, password, "USER");
    }

    // -----------------------------
    // ADD NEW USER WITH ROLE
    // -----------------------------
    public static boolean addUserWithRole(String username, String password, String role) {
        if (userExists(username)) return false;

        String hashed = BCrypt.hashpw(password, BCrypt.gensalt());
        String sql = "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)";
        try (Connection conn = Database.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, username);
            ps.setString(2, hashed);
            ps.setString(3, role);
            ps.executeUpdate();
            return true;
        } catch (SQLException e) {
            e.printStackTrace();
            return false;
        }
    }

    // -----------------------------
    // GET ALL USERS
    // -----------------------------
    public static Map<String, String> getAllUsers() {
        Map<String, String> users = new HashMap<>();
        String sql = "SELECT username, password_hash FROM users";
        try (Connection conn = Database.getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {
            while (rs.next()) {
                users.put(rs.getString("username"), rs.getString("password_hash"));
            }
        } catch (SQLException e) {
            e.printStackTrace();
        }
        return users;
    }

    // -----------------------------
    // GET ROLE OF A USER
    // -----------------------------
    public static String getRole(String username) {
        String sql = "SELECT role FROM users WHERE username = ?";
        try (Connection conn = Database.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, username);
            ResultSet rs = ps.executeQuery();
            if (rs.next()) {
                return rs.getString("role");
            }
        } catch (SQLException e) {
            e.printStackTrace();
        }
        return null;
    }

    // -----------------------------
// DELETE USER
// -----------------------------
    public static boolean deleteUser(String username) {
        if (!userExists(username)) return false; // user does not exist
        String sql = "DELETE FROM users WHERE username = ?";
        try (Connection conn = Database.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, username);
            int deleted = ps.executeUpdate();
            return deleted > 0;
        } catch (SQLException e) {
            e.printStackTrace();
            return false;
        }
    }

}
