const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database(path.join(__dirname, 'cafe.db'));

// Jalankan semua query secara berurutan
db.serialize(() => {
  // Buat tabel categories
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    icon TEXT
  )`);

  // Buat tabel menu_items
  db.run(`CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price INTEGER,
    description TEXT,
    image TEXT,
    category_id INTEGER,
    is_available BOOLEAN DEFAULT 1,
    FOREIGN KEY(category_id) REFERENCES categories(id)
  )`);

  // Buat tabel users
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, () => {
    // Setelah tabel users dibuat, cek dan buat admin user
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
      if (!err && row && row.count === 0) {
        console.log("🔐 Membuat user admin default...");
        const hashedPassword = bcrypt.hashSync("admin123", 10);
        db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
          ["admin", hashedPassword, "admin"]);
        console.log("✅ User admin dibuat: username=admin, password=admin123");
      }
    });
  });

  // Buat tabel transactions (untuk menyimpan transaksi penjualan)
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE,
    items TEXT,
    total INTEGER,
    payment_method TEXT,
    status TEXT,
    created_at DATETIME
  )`, (err) => {
    if (err) {
      console.error("Error creating transactions table:", err);
    } else {
      console.log("✅ Transactions table ready");
    }
  });

  // Insert data categories jika kosong
  db.get("SELECT COUNT(*) as count FROM categories", (err, row) => {
    if (!err && row && row.count === 0) {
      const categories = [
        ['Makanan', '🍔'],
        ['Minuman', '🥤'],
        ['Snack', '🍟'],
        ['Dessert', '🍰']
      ];
      categories.forEach(([name, icon]) => {
        db.run("INSERT INTO categories (name, icon) VALUES (?, ?)", [name, icon]);
      });
      console.log("✅ Data categories ditambahkan");
    }
  });

  // Insert data menu jika kosong
  db.get("SELECT COUNT(*) as count FROM menu_items", (err, row) => {
    if (!err && row && row.count === 0) {
      const menu = [
        ['Nasi Goreng', 25000, 'Nasi goreng spesial dengan telur', 'nasi_goreng.jpg', 1],
        ['Mie Goreng', 22000, 'Mie goreng dengan ayam', 'mie_goreng.jpg', 1],
        ['Es Teh Manis', 5000, 'Teh dingin manis segar', 'es_teh.jpg', 2],
        ['Kopi Hitam', 12000, 'Kopi arabika asli', 'kopi.jpg', 2],
        ['Kentang Goreng', 15000, 'Kentang crispy dengan saus', 'kentang.jpg', 3],
        ['Pisang Goreng', 12000, 'Pisang goreng madu', 'pisang.jpg', 3],
        ['Ice Cream', 10000, 'Vanilla ice cream', 'icecream.jpg', 4],
        ['Puding Coklat', 8000, 'Puding dengan topping coklat', 'puding.jpg', 4]
      ];
      menu.forEach(([name, price, desc, img, catId]) => {
        db.run("INSERT INTO menu_items (name, price, description, image, category_id) VALUES (?, ?, ?, ?, ?)",
          [name, price, desc, img, catId]);
      });
      console.log("✅ Data menu ditambahkan");
    }
  });
});

module.exports = db;