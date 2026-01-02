package de.tum.in.ase;

import de.tum.in.ase.MainLogin.LoginPage;

import javax.swing.SwingUtilities;

public class Main {
    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> new LoginPage().setVisible(true));
    }
}
