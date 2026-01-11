const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Base de datos
const dbPath = path.join(__dirname, 'fundabenefica.db');
const db = new Database(dbPath);

// Crear tablas
db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT UNIQUE,
    name TEXT,
    email TEXT,
    phone TEXT,
    numbers TEXT,
    qty INTEGER,
    total REAL,
    image TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sold_numbers (
    number TEXT PRIMARY KEY,
    order_id TEXT,
    confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS prize_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_data TEXT,
    position INTEGER
  );
  CREATE TABLE IF NOT EXISTS payment_methods (
    type TEXT PRIMARY KEY,
    data TEXT
  );
  CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Configuración por defecto
const defaultConfig = {
  adminPass: 'admin123',
  prizeTitle: 'Gran Premio',
  prizeDescription: 'Participa en nuestra rifa solidaria',
  prizeDate: '',
  prizeTime: '',
  prizePrice: '10',
  prizeDigits: '4'
};

for (const [key, value] of Object.entries(defaultConfig)) {
  const exists = db.prepare('SELECT 1 FROM config WHERE key = ?').get(key);
  if (!exists) {
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(key, value);
  }
}

// Función para generar ID de orden
function generateOrderId() {
  return 'ORD-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
}

// Función para crear mensaje de WhatsApp
function createWhatsAppMessage(order) {
  const message = `🎉 *¡PAGO CONFIRMADO!*

Hola *${order.name}*, tu compra ha sido verificada.

📋 *Detalles:*
• Orden: ${order.order_id}
• Cantidad: ${order.qty} números
• Total: $${order.total}

🎫 *Tus números son:*
${order.numbers.join(', ')}

¡Buena suerte! 🍀

_FundaBenefica - Rifa Solidaria_`;

  return encodeURIComponent(message);
}

// Función para guardar respaldo local
function saveLocalBackup() {
  try {
    const orders = db.prepare('SELECT * FROM orders').all();
    const soldNumbers = db.prepare('SELECT * FROM sold_numbers').all();
    const config = db.prepare('SELECT * FROM config').all();
    
    const backup = {
      timestamp: new Date().toISOString(),
      orders,
      soldNumbers,
      config
    };
    
    db.prepare('INSERT INTO backups (data) VALUES (?)').run(JSON.stringify(backup));
    db.exec('DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY id DESC LIMIT 50)');
    
    return backup;
  } catch (error) {
    console.error('Error guardando respaldo:', error);
    return null;
  }
}

// ============ RUTAS API ============

// Obtener configuración
app.get('/api/config', (req, res) => {
  try {
    const configRows = db.prepare('SELECT * FROM config').all();
    const config = {};
    configRows.forEach(row => config[row.key] = row.value);
    
    const paymentRows = db.prepare('SELECT * FROM payment_methods').all();
    const payments = {};
    paymentRows.forEach(row => payments[row.type] = JSON.parse(row.data));
    
    const imageRows = db.prepare('SELECT * FROM prize_images ORDER BY position').all();
    const images = [];
    imageRows.forEach(row => images[row.position] = row.image_data);
    
    const soldCount = db.prepare('SELECT COUNT(*) as count FROM sold_numbers').get().count;
    
    res.json({ success: true, config, payments, images: images.filter(Boolean), soldCount });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Guardar configuración del premio
app.post('/api/config/prize', (req, res) => {
  try {
    const { title, description, date, time, price, digits } = req.body;
    
    const currentDigits = db.prepare('SELECT value FROM config WHERE key = ?').get('prizeDigits')?.value;
    
    if (digits && digits !== currentDigits) {
      db.exec('DELETE FROM sold_numbers');
      db.exec('DELETE FROM orders');
    }
    
    if (title !== undefined) db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run('prizeTitle', title);
    if (description !== undefined) db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run('prizeDescription', description);
    if (date !== undefined) db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run('prizeDate', date);
    if (time !== undefined) db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run('prizeTime', time);
    if (price !== undefined) db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run('prizePrice', price);
    if (digits !== undefined) db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run('prizeDigits', digits);
    
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Guardar método de pago
app.post('/api/config/payment/:type', (req, res) => {
  try {
    const { type } = req.params;
    db.prepare('INSERT OR REPLACE INTO payment_methods (type, data) VALUES (?, ?)').run(type, JSON.stringify(req.body));
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Cambiar contraseña
app.post('/api/config/password', (req, res) => {
  try {
    const { password } = req.body;
    if (password && password.length >= 4) {
      db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run('adminPass', password);
      res.json({ success: true });
    } else {
      res.json({ success: false, error: 'Contraseña muy corta' });
    }
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Verificar contraseña
app.post('/api/auth', (req, res) => {
  try {
    const { password } = req.body;
    const adminPass = db.prepare('SELECT value FROM config WHERE key = ?').get('adminPass')?.value || 'admin123';
    res.json({ success: password === adminPass });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Subir imagen
app.post('/api/images', (req, res) => {
  try {
    const { image, position } = req.body;
    db.prepare('DELETE FROM prize_images WHERE position = ?').run(position);
    db.prepare('INSERT INTO prize_images (image_data, position) VALUES (?, ?)').run(image, position);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Eliminar imagen
app.delete('/api/images/:position', (req, res) => {
  try {
    db.prepare('DELETE FROM prize_images WHERE position = ?').run(parseInt(req.params.position));
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Obtener números vendidos
app.get('/api/sold', (req, res) => {
  try {
    const rows = db.prepare('SELECT number FROM sold_numbers').all();
    res.json({ success: true, numbers: rows.map(r => r.number) });
  } catch (error) {
    res.json({ success: false, numbers: [] });
  }
});

// Crear pedido
app.post('/api/orders', (req, res) => {
  try {
    const { name, email, phone, numbers, qty, total, image } = req.body;
    const order_id = generateOrderId();
    
    db.prepare(`
      INSERT INTO orders (order_id, name, email, phone, numbers, qty, total, image, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(order_id, name, email, phone, JSON.stringify(numbers), qty, total, image);
    
    saveLocalBackup();
    
    res.json({ success: true, order_id });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Obtener pedidos pendientes
app.get('/api/orders/pending', (req, res) => {
  try {
    const orders = db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC').all('pending');
    orders.forEach(o => o.numbers = JSON.parse(o.numbers));
    res.json({ success: true, orders });
  } catch (error) {
    res.json({ success: false, orders: [] });
  }
});

// Obtener pedidos confirmados
app.get('/api/orders/confirmed', (req, res) => {
  try {
    const orders = db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC').all('confirmed');
    orders.forEach(o => o.numbers = JSON.parse(o.numbers));
    res.json({ success: true, orders });
  } catch (error) {
    res.json({ success: false, orders: [] });
  }
});

// Confirmar pedido
app.post('/api/orders/:id/confirm', (req, res) => {
  try {
    const { id } = req.params;
    const order = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(id);
    
    if (!order) {
      return res.json({ success: false, error: 'Pedido no encontrado' });
    }
    
    const numbers = JSON.parse(order.numbers);
    
    // Marcar como confirmado
    db.prepare('UPDATE orders SET status = ? WHERE order_id = ?').run('confirmed', id);
    
    // Agregar números vendidos
    const insertSold = db.prepare('INSERT OR IGNORE INTO sold_numbers (number, order_id) VALUES (?, ?)');
    numbers.forEach(num => insertSold.run(num, id));
    
    // Guardar respaldo
    saveLocalBackup();
    
    // Crear link de WhatsApp
    const whatsappMessage = createWhatsAppMessage({
      name: order.name,
      order_id: order.order_id,
      qty: order.qty,
      total: order.total,
      numbers
    });
    
    // Limpiar número de teléfono
    const cleanPhone = order.phone.replace(/[^0-9]/g, '');
    const whatsappLink = `https://wa.me/${cleanPhone}?text=${whatsappMessage}`;
    
    res.json({ 
      success: true, 
      whatsappLink,
      message: 'Pedido confirmado'
    });
  } catch (error) {
    console.error('Error confirmando pedido:', error);
    res.json({ success: false, error: error.message });
  }
});

// Rechazar pedido
app.post('/api/orders/:id/reject', (req, res) => {
  try {
    db.prepare('DELETE FROM orders WHERE order_id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Buscar ganador
app.get('/api/winner/:number', (req, res) => {
  try {
    const { number } = req.params;
    const sold = db.prepare('SELECT * FROM sold_numbers WHERE number = ?').get(number);
    
    if (sold) {
      const order = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(sold.order_id);
      if (order) {
        order.numbers = JSON.parse(order.numbers);
        return res.json({ success: true, found: true, status: 'confirmed', order });
      }
    }
    
    const pending = db.prepare('SELECT * FROM orders WHERE status = ? AND numbers LIKE ?').get('pending', `%${number}%`);
    if (pending) {
      return res.json({ success: true, found: true, status: 'pending' });
    }
    
    res.json({ success: true, found: false, status: 'available' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Descargar respaldo
app.get('/api/backup/download', (req, res) => {
  try {
    const orders = db.prepare('SELECT * FROM orders').all();
    orders.forEach(o => o.numbers = JSON.parse(o.numbers));
    
    const soldNumbers = db.prepare('SELECT * FROM sold_numbers').all();
    const configRows = db.prepare('SELECT * FROM config').all();
    const config = {};
    configRows.forEach(row => config[row.key] = row.value);
    
    const backup = {
      exportDate: new Date().toISOString(),
      totalOrders: orders.length,
      confirmedOrders: orders.filter(o => o.status === 'confirmed').length,
      pendingOrders: orders.filter(o => o.status === 'pending').length,
      totalSoldNumbers: soldNumbers.length,
      config,
      orders,
      soldNumbers
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=respaldo-fundabenefica-${Date.now()}.json`);
    res.json(backup);
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Estadísticas
app.get('/api/stats', (req, res) => {
  try {
    const soldCount = db.prepare('SELECT COUNT(*) as count FROM sold_numbers').get().count;
    const pendingCount = db.prepare('SELECT COUNT(*) as count FROM orders WHERE status = ?').get('pending').count;
    const confirmedCount = db.prepare('SELECT COUNT(*) as count FROM orders WHERE status = ?').get('confirmed').count;
    const totalRevenue = db.prepare('SELECT SUM(total) as total FROM orders WHERE status = ?').get('confirmed').total || 0;
    
    res.json({ success: true, soldCount, pendingCount, confirmedCount, totalRevenue });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Reiniciar rifa
app.post('/api/reset', (req, res) => {
  try {
    saveLocalBackup();
    db.exec('DELETE FROM orders');
    db.exec('DELETE FROM sold_numbers');
    db.exec('DELETE FROM prize_images');
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  🎁 FundaBenefica - Servidor Iniciado      ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log(`║  🌐 Puerto: ${PORT}                            ║`);
  console.log('║  🗄️  Base de datos: fundabenefica.db       ║');
  console.log('║  🔑 Contraseña admin: admin123             ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log('');
});
