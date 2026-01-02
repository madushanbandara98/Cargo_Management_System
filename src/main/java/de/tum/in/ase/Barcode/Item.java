package de.tum.in.ase.Barcode;

public class Item {
    private String description;
    private double height, width, depth, cubicMeter, amount;
    private int noItems;

    public Item(String description, double height, double width, double depth,
                int noItems, double cubicMeter, double amount) {
        this.description = description;
        this.height = height;
        this.width = width;
        this.depth = depth;
        this.noItems = noItems;
        this.cubicMeter = cubicMeter;
        this.amount = amount;
    }

    public String getDescription() { return description; }
    public double getHeight() { return height; }
    public double getWidth() { return width; }
    public double getDepth() { return depth; }
    public int getNoItems() { return noItems; }
    public double getCubicMeter() { return cubicMeter; }
    public double getAmount() { return amount; }
}
