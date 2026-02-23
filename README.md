ABC Cargo Management System (ACM) 🚛



📖 Overview



ABC Cargo Management System (ACM) is a desktop logistics management application for efficiently managing cargo containers, customers, and shipment records. It ensures data consistency, security, and offline functionality.



Originally developed for Windows, it is now being prepared for Android migration using SQLite / Room.



🚀 Features



🔐 Authentication \& Security



* Username/password login system
* Passwords securely hashed using BCrypt
* Admin-controlled password reset
* Separate Admin Dashboard for user management



🗂 Container Management



* Create, view, and manage cargo containers
* Store container paths locally
* Select active container for operations



👤 Customer Management



* Register customers with reference number, name, ID, addresses (DE \& LK), phone numbers
* Auto-load customer details using reference number
* Prevent duplicate entries \& repetitive data entry



📦 Box \& Shipment Tracking



* Record box dimensions (height, width, depth)
* Automatic cubic meter calculation
* Pricing: fixed per cubic meter + optional special pricing, delivery charge
* Track total items, cubic volume, and shipment cost



📄 PDF Invoice Generation



* Professional A4 invoice layout
* Watermark logo support
* Auto-save PDFs in container-specific folders
* Prevent duplicate invoices per customer



🔐 Barcode System



* Generate Code 128 barcodes per box
* Print barcodes below reference or on separate A4 pages
* Scan barcodes to auto-load customer \& shipment details (Feature under development)



🗄 Database Architecture



* Database Type: SQLite (lightweight, embedded, serverless)
* Customers: Stores permanent customer records
* Customer Items (Boxes): Tracks box dimensions, quantity, cubic meters, and costs
* Users: Manages login credentials (hashed passwords) and roles (ADMIN / USER)



🖥 Windows Desktop Version



1. Technology Stack:



* Java Swing – GUI \& event handling
* SQLite (JDBC) – Database
* iText PDF \& PDFBox – PDF generation \& preview
* Gson – JSON persistence
* BCrypt – Password security



2\. Requirements:



* Windows OS
* Java JDK 11+



3\. Run Application:



* java -jar ACM\_System.jar



🏗 Skills Demonstrated



* Java Swing: Complex desktop UI \& event-driven programming
* Database Design: SQLite, referential integrity, SQL queries
* Security: BCrypt password hashing, admin-controlled access
* PDF Generation: Invoice automation (iText \& PDFBox)
* Barcode Handling: Code 128 generation \& scanning
* Software Architecture: Modular, scalable, offline-first
* Problem-Solving: Efficient logistics and shipment data handling
* Professional Practices: Clean code, object-oriented design, modular structure



📌 Future Enhancements



* Android version using Room / SQLite
* Barcode scanning on mobile devices
* Optional cloud synchronization
* Advanced analytics \& reporting dashboard



📂 Repository Structure

ACM/

├─ src/

│  ├─ de.tum.in.ase.DatabaseC/   # Database \& User management

│  ├─ de.tum.in.ase.MainLogin/   # Login, ForgotPassword, AdminReset

│  ├─ de.tum.in.ase.Registrations/ # User Registration

│  ├─ de.tum.in.ase.Activities/  # Customer \& Container management

├─ resources/                     # Images, icons, PDFs

├─ ACM\_System.jar                 # Compiled executable

└─ README.md
