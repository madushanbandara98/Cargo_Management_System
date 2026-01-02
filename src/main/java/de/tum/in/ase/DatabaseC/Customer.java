package de.tum.in.ase.DatabaseC;

/**
 * Simple model class for customer info.
 */

public class Customer {
    private String referenceNumber;
    private String name;
    private String germanAddress;
    private String sriLankanAddress;
    private String phoneDE;
    private String phoneLK;

    public Customer(String referenceNumber, String name, String germanAddress, String sriLankanAddress,
                    String phoneDE, String phoneLK) {
        this.referenceNumber = referenceNumber;
        this.name = name;
        this.germanAddress = germanAddress;
        this.sriLankanAddress = sriLankanAddress;
        this.phoneDE = phoneDE;
        this.phoneLK = phoneLK;
    }

    public String getReferenceNumber() { return referenceNumber; }
    public String getName() { return name; }
    public String getGermanAddress() { return germanAddress; }
    public String getSriLankanAddress() { return sriLankanAddress; }
    public String getPhoneDE() { return phoneDE; }
    public String getPhoneLK() { return phoneLK; }
}
