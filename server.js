const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Crear carpeta uploads
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// Configurar multer para subida de archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ============ BASE DE DATOS ============
const db = new Database('fundabenefica.db');

// Crear tablas
db.exec(`
    -- Configuración general
    CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT
    );

    -- Pedidos
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT UNIQUE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        numbers TEXT NOT NULL,
        qty INTEGER NOT NULL,
        total REAL NOT NULL,
        image TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Números vendidos
    CREATE TABLE IF NOT EXISTS sold_numbers (
        number TEXT PRIMARY KEY,
        order_id TEXT,
        confirmed_at DATETIME
    );

    -- Imágenes del premio
    CREATE TABLE IF NOT EXISTS prize_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image_data TEXT,
        position INTEGER
    );

    -- Métodos de pago
    CREATE TABLE IF NOT EXISTS payment_methods (
        id TEXT PRIMARY KEY,
        data TEXT
    );
`);

// Configuración por defecto
const defaultConfig = {
    adminPass: 'admin123',
    prizeTitle: 'Gran Premio',
    prizeDescription: 'Participa en nuestra rifa solidaria.',
    prizeDate: '',
    prizeTime: '',
    prizePrice: '10',
    prizeDigits: '4'
};

// Insertar config por defecto si no existe
const insertConfig = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
Object.entries(defaultConfig).forEach(([k, v]) => insertConfig.run(k, v));

// Métodos de pago por defecto
const defaultPayments = {
    zelle: JSON.stringify({ email: 'pagos@fundabenefica.com', phone: '+1 555 123-4567', name: 'FundaBenefica' }),
    bank: JSON.stringify({ name: 'Bank of America', account: '1234567890', routing: '026009593', beneficiary: 'FundaBenefica' }),
    paypal: JSON.stringify({ email: 'paypal@fundabenefica.com', link: 'paypal.me/fundabenefica' })
};
const insertPayment = db.prepare('INSERT OR IGNORE INTO payment_methods (id, data) VALUES (?, ?)');
Object.entries(defaultPayments).forEach(([k, v]) => insertPayment.run(k, v));

// ============ HELPERS ============
const getConfig = (key) => {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
    return row ? row.value : null;
};

const setConfig = (key, value) => {
    db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value);
};

const getAllConfig = () => {
    const rows = db.prepare('SELECT * FROM config').all();
    const config = {};
    rows.forEach(r => config[r.key] = r.value);
    return config;
};

// ============ RUTAS API ============

// Obtener configuración completa
app.get('/api/config', (req, res) => {
    try {
        const config = getAllConfig();
        const payments = {};
        db.prepare('SELECT * FROM payment_methods').all().forEach(p => {
            payments[p.id] = JSON.parse(p.data);
        });
        const images = db.prepare('SELECT * FROM prize_images ORDER BY position').all();
        const soldCount = db.prepare('SELECT COUNT(*) as count FROM sold_numbers').get().count;
        
        res.json({
            success: true,
            config,
            payments,
            images: images.map(i => i.image_data),
            soldCount
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Guardar configuración del premio
app.post('/api/config/prize', (req, res) => {
    try {
        const { title, description, date, time, price, digits } = req.body;
        const oldDigits = getConfig('prizeDigits');
        
        // Si cambian las cifras, limpiar números vendidos
        if (digits && digits !== oldDigits) {
            db.prepare('DELETE FROM sold_numbers').run();
            db.prepare('DELETE FROM orders').run();
        }
        
        if (title !== undefined) setConfig('prizeTitle', title);
        if (description !== undefined) setConfig('prizeDescription', description);
        if (date !== undefined) setConfig('prizeDate', date);
        if (time !== undefined) setConfig('prizeTime', time);
        if (price !== undefined) setConfig('prizePrice', price.toString());
        if (digits !== undefined) setConfig('prizeDigits', digits.toString());
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Guardar método de pago
app.post('/api/config/payment/:type', (req, res) => {
    try {
        const { type } = req.params;
        db.prepare('INSERT OR REPLACE INTO payment_methods (id, data) VALUES (?, ?)').run(type, JSON.stringify(req.body));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Cambiar contraseña admin
app.post('/api/config/password', (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 4) {
            return res.status(400).json({ success: false, error: 'Mínimo 4 caracteres' });
        }
        setConfig('adminPass', password);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Verificar contraseña admin
app.post('/api/auth', (req, res) => {
    try {
        const { password } = req.body;
        const adminPass = getConfig('adminPass');
        res.json({ success: password === adminPass });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Subir imagen del premio
app.post('/api/images', (req, res) => {
    try {
        const { image, position } = req.body;
        db.prepare('INSERT INTO prize_images (image_data, position) VALUES (?, ?)').run(image, position);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Eliminar imagen del premio
app.delete('/api/images/:position', (req, res) => {
    try {
        const { position } = req.params;
        db.prepare('DELETE FROM prize_images WHERE position = ?').run(position);
        // Reordenar posiciones
        const images = db.prepare('SELECT * FROM prize_images ORDER BY position').all();
        db.prepare('DELETE FROM prize_images').run();
        images.forEach((img, idx) => {
            db.prepare('INSERT INTO prize_images (image_data, position) VALUES (?, ?)').run(img.image_data, idx);
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Obtener números vendidos
app.get('/api/sold', (req, res) => {
    try {
        const numbers = db.prepare('SELECT number FROM sold_numbers').all().map(r => r.number);
        res.json({ success: true, numbers });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Crear pedido
app.post('/api/orders', (req, res) => {
    try {
        const { name, email, phone, numbers, qty, total, image } = req.body;
        const orderId = 'ORD-' + Date.now();
        
        db.prepare(`
            INSERT INTO orders (order_id, name, email, phone, numbers, qty, total, image, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `).run(orderId, name, email, phone, JSON.stringify(numbers), qty, total, image);
        
        res.json({ success: true, orderId });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Obtener pedidos pendientes
app.get('/api/orders/pending', (req, res) => {
    try {
        const orders = db.prepare("SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC").all();
        orders.forEach(o => o.numbers = JSON.parse(o.numbers));
        res.json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Obtener pedidos confirmados
app.get('/api/orders/confirmed', (req, res) => {
    try {
        const orders = db.prepare("SELECT * FROM orders WHERE status = 'confirmed' ORDER BY created_at DESC").all();
        orders.forEach(o => o.numbers = JSON.parse(o.numbers));
        res.json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Confirmar pedido
app.post('/api/orders/:id/confirm', (req, res) => {
    try {
        const { id } = req.params;
        const order = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(id);
        
        if (!order) {
            return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
        }
        
        const numbers = JSON.parse(order.numbers);
        const insertSold = db.prepare('INSERT OR IGNORE INTO sold_numbers (number, order_id, confirmed_at) VALUES (?, ?, datetime("now"))');
        numbers.forEach(n => insertSold.run(n, id));
        
        db.prepare("UPDATE orders SET status = 'confirmed' WHERE order_id = ?").run(id);
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Rechazar pedido
app.post('/api/orders/:id/reject', (req, res) => {
    try {
        const { id } = req.params;
        db.prepare('DELETE FROM orders WHERE order_id = ?').run(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Buscar ganador
app.get('/api/winner/:number', (req, res) => {
    try {
        const { number } = req.params;
        
        // Buscar en confirmados
        const orders = db.prepare("SELECT * FROM orders WHERE status = 'confirmed'").all();
        for (const order of orders) {
            const numbers = JSON.parse(order.numbers);
            if (numbers.includes(number)) {
                order.numbers = numbers;
                return res.json({ success: true, found: true, status: 'confirmed', order });
            }
        }
        
        // Buscar en pendientes
        const pending = db.prepare("SELECT * FROM orders WHERE status = 'pending'").all();
        for (const order of pending) {
            const numbers = JSON.parse(order.numbers);
            if (numbers.includes(number)) {
                order.numbers = numbers;
                return res.json({ success: true, found: true, status: 'pending', order });
            }
        }
        
        // Verificar si está vendido
        const sold = db.prepare('SELECT * FROM sold_numbers WHERE number = ?').get(number);
        if (sold) {
            return res.json({ success: true, found: true, status: 'sold_no_info' });
        }
        
        res.json({ success: true, found: false, status: 'available' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Reiniciar rifa
app.post('/api/reset', (req, res) => {
    try {
        db.prepare('DELETE FROM orders').run();
        db.prepare('DELETE FROM sold_numbers').run();
        db.prepare('DELETE FROM prize_images').run();
        setConfig('prizeTitle', '');
        setConfig('prizeDescription', '');
        setConfig('prizeDate', '');
        setConfig('prizeTime', '');
        setConfig('prizePrice', '10');
        setConfig('prizeDigits', '4');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Estadísticas
app.get('/api/stats', (req, res) => {
    try {
        const soldCount = db.prepare('SELECT COUNT(*) as count FROM sold_numbers').get().count;
        const pendingCount = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").get().count;
        const confirmedCount = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'confirmed'").get().count;
        const totalRevenue = db.prepare("SELECT SUM(total) as total FROM orders WHERE status = 'confirmed'").get().total || 0;
        
        res.json({
            success: true,
            stats: { soldCount, pendingCount, confirmedCount, totalRevenue }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Servir frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🎁 FundaBenefica - Servidor Iniciado                     ║
║                                                            ║
║   📍 URL: http://localhost:${PORT}                           ║
║   🗄️  Base de datos: fundabenefica.db                      ║
║                                                            ║
║   🔐 Contraseña admin por defecto: admin123                ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    `);
});
