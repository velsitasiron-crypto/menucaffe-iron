const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'cafe_menu_secret_key_2024';

// ============ KONFIGURASI UPLOAD GAMBAR ============
// Buat folder uploads jika belum ada
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Konfigurasi storage multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: timestamp-randomnumber-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'menu-' + uniqueSuffix + ext);
  }
});

// Filter file type (hanya gambar)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Hanya file gambar yang diperbolehkan (jpeg, jpg, png, gif, webp)'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Maks 5MB
  fileFilter: fileFilter
});

// ============ PWA HEADERS ============
// Middleware untuk PWA headers (diletakkan sebelum route lainnya)
app.use((req, res, next) => {
    // Cache control untuk service worker
    if (req.url === '/sw.js') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Service-Worker-Allowed', '/');
    }
    next();
});

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Serving static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve icons folder (jika ada file icon fisik)
app.use('/icons', express.static(path.join(__dirname, 'public/icons')));

// ============ ROUTE UNTUK ICON DEFAULT PWA ============
// Generate PWA icons dynamically (tanpa file gambar)
app.get('/icons/:size.png', (req, res) => {
    const size = parseInt(req.params.size) || 192;
    res.set('Content-Type', 'image/svg+xml');
    res.send(`
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
            <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
                </linearGradient>
            </defs>
            <rect width="100" height="100" rx="20" fill="url(#grad)"/>
            <text x="50" y="68" font-size="55" text-anchor="middle" fill="white" font-family="Arial, sans-serif">☕</text>
        </svg>
    `);
});

// ============ MIDDLEWARE AUTHENTICATION ============
function authenticateToken(req, res, next) {
  const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid token' });
  }
}

// ============ API AUTHENTICATION ============
// Login endpoint
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password diperlukan' });
  }
  
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!user) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }
    
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'strict'
    });
    
    res.json({
      message: 'Login berhasil',
      token: token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  });
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logout berhasil' });
});

// Check auth status
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    authenticated: true,
    user: req.user
  });
});

// ============ API MENU ============
// Get all categories (public)
app.get('/api/categories', (req, res) => {
  db.all("SELECT * FROM categories", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get menu items (public)
app.get('/api/menu', (req, res) => {
  const { category } = req.query;
  let query = `
    SELECT m.*, c.name as category_name 
    FROM menu_items m
    JOIN categories c ON m.category_id = c.id
    WHERE m.is_available = 1
  `;
  let params = [];
  
  if (category) {
    query += " AND c.name = ?";
    params.push(category);
  }
  
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get all menu items for admin
app.get('/api/admin/menu', authenticateToken, (req, res) => {
  db.all(`
    SELECT m.*, c.name as category_name 
    FROM menu_items m
    JOIN categories c ON m.category_id = c.id
    ORDER BY m.id DESC
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Add new menu item WITH IMAGE UPLOAD
app.post('/api/menu', authenticateToken, upload.single('image'), (req, res) => {
  const { name, price, description, category_id } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;
  
  if (!name || !price || !category_id) {
    // Hapus file yang sudah diupload jika data tidak lengkap
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(400).json({ error: 'Data tidak lengkap' });
  }
  
  db.run(
    "INSERT INTO menu_items (name, price, description, image, category_id, is_available) VALUES (?, ?, ?, ?, ?, 1)",
    [name, price, description, image, category_id],
    function(err) {
      if (err) {
        // Hapus file jika error
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, message: "Menu berhasil ditambahkan!", image: image });
    }
  );
});

// Update menu item WITH IMAGE UPLOAD
app.put('/api/menu/:id', authenticateToken, upload.single('image'), (req, res) => {
  const { name, price, description, category_id, is_available } = req.body;
  const id = req.params.id;
  
  // First, get current image to delete if needed
  db.get("SELECT image FROM menu_items WHERE id = ?", [id], (err, currentItem) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    let image = currentItem ? currentItem.image : null;
    
    // If new image uploaded, delete old image and use new one
    if (req.file) {
      // Delete old image if exists
      if (image) {
        const oldImagePath = path.join(__dirname, 'public', image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      image = `/uploads/${req.file.filename}`;
    }
    
    db.run(
      `UPDATE menu_items 
       SET name = ?, price = ?, description = ?, category_id = ?, is_available = ?, image = ?
       WHERE id = ?`,
      [name, price, description, category_id, is_available, image, id],
      function(err) {
        if (err) {
          // Hapus file baru jika error
          if (req.file) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Menu tidak ditemukan' });
        }
        res.json({ message: "Menu berhasil diupdate!", image: image });
      }
    );
  });
});

// Delete menu item (dan file gambarnya)
app.delete('/api/menu/:id', authenticateToken, (req, res) => {
  const id = req.params.id;
  
  // Get image filename first
  db.get("SELECT image FROM menu_items WHERE id = ?", [id], (err, item) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    db.run("DELETE FROM menu_items WHERE id = ?", [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Menu tidak ditemukan' });
      }
      
      // Delete image file if exists
      if (item && item.image) {
        const imagePath = path.join(__dirname, 'public', item.image);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
      
      res.json({ message: "Menu berhasil dihapus!" });
    });
  });
});

// Toggle availability
app.put('/api/menu/:id/toggle', authenticateToken, (req, res) => {
  db.run(
    "UPDATE menu_items SET is_available = CASE WHEN is_available = 1 THEN 0 ELSE 1 END WHERE id = ?",
    [req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Status ketersediaan diupdate" });
    }
  );
});

// ============ API TRANSAKSI ============
// Get cart items (untuk mengecek stok)
app.post('/api/checkout', authenticateToken, (req, res) => {
  const { items, total, paymentMethod } = req.body;
  
  if (!items || !items.length) {
    return res.status(400).json({ error: 'Tidak ada item dalam pesanan' });
  }
  
  // Generate invoice number
  const invoiceNumber = 'INV-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  
  // Simpan transaksi
  const query = `
    INSERT INTO transactions (invoice_number, items, total, payment_method, status, created_at)
    VALUES (?, ?, ?, ?, 'completed', datetime('now'))
  `;
  
  db.run(query, [invoiceNumber, JSON.stringify(items), total, paymentMethod], function(err) {
    if (err) {
      console.error('Error saving transaction:', err);
      return res.status(500).json({ error: err.message });
    }
    
    res.json({
      success: true,
      invoice: {
        number: invoiceNumber,
        items: items,
        total: total,
        paymentMethod: paymentMethod,
        date: new Date().toLocaleString('id-ID')
      }
    });
  });
});

// Get transaction history
app.get('/api/transactions', authenticateToken, (req, res) => {
  db.all("SELECT * FROM transactions ORDER BY created_at DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Route untuk homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route untuk admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
  console.log(`📝 Buka browser dan akses: http://localhost:${PORT}`);
  console.log(`🔐 Login admin: username: admin, password: admin123`);
  console.log(`📸 Upload folder: ${uploadDir}`);
  console.log(`🎨 PWA Icon tersedia di: http://localhost:${PORT}/icons/192.png`);
  console.log(`📱 PWA Service Worker: http://localhost:${PORT}/sw.js`);
});