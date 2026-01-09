# 🎁 FundaBenefica - Rifa Solidaria con Base de Datos

Sistema completo de rifa con backend Node.js y base de datos SQLite.

## 📦 Instalación

```bash
# 1. Entrar a la carpeta
cd FundaBenefica-DB

# 2. Instalar dependencias
npm install

# 3. Iniciar servidor
npm start
```

## 🌐 Acceso

- **URL:** http://localhost:3000
- **Admin:** Click en 🔐 (esquina inferior derecha)
- **Contraseña:** `admin123`

## 🗄️ Base de Datos

El sistema usa **SQLite** (archivo `fundabenefica.db`).

### Tablas:
- `config` - Configuración general
- `orders` - Pedidos (pendientes y confirmados)
- `sold_numbers` - Números vendidos
- `prize_images` - Imágenes del premio
- `payment_methods` - Métodos de pago

## 🔌 API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/config | Obtener configuración |
| POST | /api/config/prize | Guardar premio |
| POST | /api/config/payment/:type | Guardar método de pago |
| POST | /api/config/password | Cambiar contraseña |
| POST | /api/auth | Verificar contraseña |
| GET | /api/sold | Números vendidos |
| POST | /api/orders | Crear pedido |
| GET | /api/orders/pending | Pedidos pendientes |
| GET | /api/orders/confirmed | Pedidos confirmados |
| POST | /api/orders/:id/confirm | Confirmar pedido |
| POST | /api/orders/:id/reject | Rechazar pedido |
| GET | /api/winner/:number | Buscar ganador |
| POST | /api/images | Subir imagen |
| DELETE | /api/images/:position | Eliminar imagen |
| POST | /api/reset | Reiniciar rifa |

## ⚙️ Características

✅ Base de datos SQLite persistente
✅ 2 a 8 cifras configurables
✅ Métodos de pago: Zelle, Banco, PayPal
✅ Galería de 5 imágenes
✅ Búsqueda de ganador
✅ Panel de administración completo
✅ Diseño responsive (PC y móvil)

## 📁 Estructura

```
FundaBenefica-DB/
├── server.js          # Backend Node.js
├── package.json       # Dependencias
├── public/
│   └── index.html     # Frontend
├── uploads/           # Archivos subidos
└── fundabenefica.db   # Base de datos (se crea automáticamente)
```

## 🚀 Deploy

Para producción, puedes usar:
- **Railway** (gratis)
- **Render** (gratis)
- **Heroku**
- **VPS propio**

---
**Responsables:** Danis Eliseo Diaz Diaz & Eliane Elizabeth Diaz Diaz
