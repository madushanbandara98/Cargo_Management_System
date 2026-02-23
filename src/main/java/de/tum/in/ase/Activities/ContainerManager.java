package de.tum.in.ase.Activities;

import java.io.*;
import java.util.ArrayList;
import java.util.List;

/**
 * Simple utility to persist container folder paths.
 * Stores one full path per line in: D:\Cargo\containers.txt
 */
public class ContainerManager {

    private static final String APP_DIR =
            System.getProperty("user.home") + File.separator + ".acm";
    private static final File CONTAINERS_FILE = new File(APP_DIR, "containers.txt");

    public static List<String> loadContainers() {
        List<String> out = new ArrayList<>();
        if (!CONTAINERS_FILE.exists()) return out;
        try (BufferedReader br = new BufferedReader(new FileReader(CONTAINERS_FILE))) {
            String line;
            while ((line = br.readLine()) != null) {
                line = line.trim();
                if (!line.isEmpty()) out.add(line);
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
        return out;
    }

    /**
     * Append a container path to the file (does not deduplicate).
     * Use ensureCargoDirExists() before calling if needed.
     */
    public static void addContainer(String fullPath) {
        try {
            File parent = CONTAINERS_FILE.getParentFile();
            if (!parent.exists()) parent.mkdirs();
            try (FileWriter fw = new FileWriter(CONTAINERS_FILE, true)) {
                fw.write(fullPath + System.lineSeparator());
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    /**
     * Replace the container list with the provided list (useful for delete/cleanup).
     */
    public static void overwriteContainers(List<String> list) {
        try {
            File parent = CONTAINERS_FILE.getParentFile();
            if (!parent.exists()) parent.mkdirs();
            try (FileWriter fw = new FileWriter(CONTAINERS_FILE, false)) {
                for (String s : list) fw.write(s + System.lineSeparator());
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}
