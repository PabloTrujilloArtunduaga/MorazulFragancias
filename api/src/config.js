// Configuración de la API a partir de variables de entorno (.env en la raíz del proyecto).
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const enPruebas = process.env.NODE_ENV === 'test';

// Las pruebas nunca tocan la base real: usan siempre una base aparte.
// Las pruebas utilizan exclusivamente PostgreSQL local.
if (enPruebas) {
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '5432';
  process.env.DB_NAME = 'morazul_test';
  process.env.DB_USER = 'morazul_test_user';
  process.env.DB_SSL = 'false';

  // Usar exclusivamente la contraseña de la base local de pruebas.
  process.env.DB_PASSWORD = process.env.DB_PASSWORD_TEST || '';

  process.env.JWT_SECRET =
    process.env.JWT_SECRET_TEST ||
    'secreto-solo-para-pruebas-0123456789-abcdefghij';
}


const entero = (valor, porDefecto) => {
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) ? n : porDefecto;
};

const puerto = entero(process.env.PORT, 3000);

const config = {
  enPruebas,
  puerto,
  db: {
    host: process.env.DB_HOST || 'localhost',
    puerto: entero(process.env.DB_PORT, 5432),
    nombre: process.env.DB_NAME,
    usuario: process.env.DB_USER,
    clave: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true',
  },
  jwt: {
    secreto: process.env.JWT_SECRET,
    expiraEn: process.env.JWT_EXPIRES_IN || '8h',
  },
  // Costo de bcrypt: 12 en producción; bajo en pruebas para que no tarden.
  bcryptCosto: enPruebas ? 4 : 12,
  corsOrigenes: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  limiteLogin: { ventanaMs: 15 * 60 * 1000, max: enPruebas ? 1000 : 10 },
  imagenes: {
    carpeta: path.join(__dirname, '..', 'uploads'),
    urlBase: process.env.IMAGENES_BASE_URL
      ? process.env.IMAGENES_BASE_URL.replace(/\/+$/, '')
      : process.env.NODE_ENV === 'production'
        ? null
        : `http://localhost:${puerto}/uploads`,
    maxBytes: 3 * 1024 * 1024,
    anchoMax: 800,
  },
  // El negocio solo vende la presentación de 30 ml. Precio con el que nace cada fragancia nueva;
  // el administrador puede cambiarlo después.
  precioInicial30ml: 20000,
  contacto: {
    whatsapp: process.env.CONTACTO_WHATSAPP || '573233278897',
    correo: process.env.CONTACTO_CORREO || 'MorazulFragancias@gmail.com',
    ciudad: process.env.CONTACTO_CIUDAD || 'Neiva, Huila',
    horario: process.env.CONTACTO_HORARIO || null,
    direccion: process.env.CONTACTO_DIRECCION || null,
  },
};

// Falla al arrancar si falta algo imprescindible, en vez de fallar a media operación.
config.validar = () => {
  const faltantes = [];
  if (!config.db.nombre) faltantes.push('DB_NAME');
  if (!config.db.usuario) faltantes.push('DB_USER');
  if (!config.db.clave) faltantes.push('DB_PASSWORD');
  if (!config.jwt.secreto) faltantes.push('JWT_SECRET');
  if (faltantes.length) {
    throw new Error(`Faltan variables en el archivo .env: ${faltantes.join(', ')}`);
  }
  if (config.jwt.secreto.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Falta BLOB_READ_WRITE_TOKEN: el almacenamiento persistente de imágenes es obligatorio en producción');
  }
};

module.exports = config;
