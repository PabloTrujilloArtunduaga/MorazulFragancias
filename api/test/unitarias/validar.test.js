// Pruebas unitarias de los validadores de entrada. No usan base de datos ni red.
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../../src/utilidades/validar');

const codigo = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err.codigo;
  }
};

test('texto: recorta espacios y devuelve el valor limpio', () => {
  assert.equal(v.texto('  Morazul  ', 'nombre'), 'Morazul');
});

test('texto: exige el campo cuando es requerido', () => {
  assert.equal(codigo(() => v.texto(undefined, 'nombre')), 'validacion');
  assert.throws(() => v.texto(undefined, 'nombre'), /nombre es obligatorio/);
  assert.throws(() => v.texto('', 'nombre'), /nombre es obligatorio/);
  assert.throws(() => v.texto('   ', 'nombre'), /nombre es obligatorio/);
});

test('texto: permite omitir o anular cuando se indica', () => {
  assert.equal(v.texto(undefined, 'nombre', { requerido: false }), undefined);
  assert.equal(v.texto(null, 'nombre', { nulable: true }), null);
  assert.equal(v.texto('', 'nombre', { nulable: true }), null);
});

test('texto: rechaza tipos que no son texto', () => {
  assert.throws(() => v.texto(123, 'nombre'), /debe ser texto/);
  assert.throws(() => v.texto({}, 'nombre'), /debe ser texto/);
});

test('texto: respeta el largo máximo', () => {
  assert.throws(() => v.texto('abc', 'nombre', { max: 2 }), /no puede superar 2 caracteres/);
  assert.equal(v.texto('ab', 'nombre', { max: 2 }), 'ab');
});

test('entero: acepta números y cadenas de dígitos', () => {
  assert.equal(v.entero(7, 'cantidad'), 7);
  assert.equal(v.entero(' 12 ', 'cantidad'), 12);
  assert.equal(v.entero('-3', 'cantidad'), -3);
});

test('entero: rechaza decimales y texto', () => {
  assert.throws(() => v.entero(1.5, 'cantidad'), /número entero/);
  assert.throws(() => v.entero('1.5', 'cantidad'), /número entero/);
  assert.throws(() => v.entero('abc', 'cantidad'), /número entero/);
});

test('entero: valida el rango y el campo obligatorio', () => {
  assert.throws(() => v.entero(0, 'cantidad', { min: 1 }), /entre 1 y/);
  assert.throws(() => v.entero(11, 'cantidad', { max: 10 }), /entre .* y 10/);
  assert.throws(() => v.entero(undefined, 'cantidad'), /obligatorio/);
  assert.equal(v.entero(undefined, 'cantidad', { requerido: false }), undefined);
});

test('booleano: acepta booleanos y sus cadenas', () => {
  assert.equal(v.booleano(true, 'activo'), true);
  assert.equal(v.booleano(false, 'activo'), false);
  assert.equal(v.booleano('true', 'activo'), true);
  assert.equal(v.booleano('false', 'activo'), false);
});

test('booleano: rechaza otros valores', () => {
  assert.throws(() => v.booleano('si', 'activo'), /verdadero o falso/);
  assert.throws(() => v.booleano(1, 'activo'), /verdadero o falso/);
  assert.throws(() => v.booleano(undefined, 'activo'), /obligatorio/);
});

test('opcion: acepta solo valores de la lista', () => {
  assert.equal(v.opcion('admin', 'rol', ['admin', 'vendedor']), 'admin');
  assert.throws(() => v.opcion('dueno', 'rol', ['admin', 'vendedor']), /debe ser uno de: admin, vendedor/);
  assert.throws(() => v.opcion(undefined, 'rol', ['admin']), /obligatorio/);
});

test('opcion: admite null cuando es nulable', () => {
  assert.equal(v.opcion(null, 'rol', ['admin'], { nulable: true }), null);
  assert.throws(() => v.opcion(null, 'rol', ['admin']), /debe ser uno de/);
});

test('precio: acepta enteros y dos decimales', () => {
  assert.equal(v.precio(20000, 'precio'), 20000);
  assert.equal(v.precio('1500.50', 'precio'), 1500.5);
  assert.equal(v.precio(0.01, 'precio'), 0.01);
});

test('precio: rechaza cero, negativos y tres decimales', () => {
  assert.throws(() => v.precio(0, 'precio'), /mayor que cero/);
  assert.throws(() => v.precio(-10, 'precio'), /mayor que cero/);
  assert.throws(() => v.precio(10.001, 'precio'), /dos decimales/);
});

test('precio: rechaza valores no numéricos e infinitos', () => {
  assert.throws(() => v.precio('abc', 'precio'), /debe ser un número/);
  assert.throws(() => v.precio(Infinity, 'precio'), /debe ser un número/);
  assert.throws(() => v.precio(100000000, 'precio'), /demasiado grande/);
});

test('precio: aplica requerido y nulable', () => {
  assert.throws(() => v.precio(undefined, 'precio'), /obligatorio/);
  assert.equal(v.precio(undefined, 'precio', { requerido: false }), undefined);
  assert.equal(v.precio(null, 'precio', { nulable: true }), null);
});

test('dinero: permite cero por defecto', () => {
  assert.equal(v.dinero(0, 'monto'), 0);
  assert.equal(v.dinero('1500.75', 'monto'), 1500.75);
});

test('dinero: puede exigir mayor que cero y rechaza negativos', () => {
  assert.throws(() => v.dinero(0, 'monto', { permiteCero: false }), /mayor que cero/);
  assert.throws(() => v.dinero(-1, 'monto'), /cero o mayor/);
  assert.throws(() => v.dinero(1.234, 'monto'), /dos decimales/);
});

test('fecha: acepta fechas reales en formato AAAA-MM-DD', () => {
  assert.equal(v.fecha('2026-11-16', 'fecha'), '2026-11-16');
  assert.equal(v.fecha('2024-02-29', 'fecha'), '2024-02-29');
});

test('fecha: rechaza formatos y días inexistentes', () => {
  assert.throws(() => v.fecha('16/11/2026', 'fecha'), /formato AAAA-MM-DD/);
  assert.throws(() => v.fecha('2026-2-3', 'fecha'), /formato AAAA-MM-DD/);
  assert.throws(() => v.fecha('2026-02-30', 'fecha'), /no es una fecha válida/);
  assert.throws(() => v.fecha('2025-02-29', 'fecha'), /no es una fecha válida/);
});

test('cuerpo: solo acepta objetos JSON', () => {
  assert.deepEqual(v.cuerpo({ body: { a: 1 } }), { a: 1 });
  assert.throws(() => v.cuerpo({ body: null }), /objeto JSON/);
  assert.throws(() => v.cuerpo({ body: [] }), /objeto JSON/);
  assert.throws(() => v.cuerpo({ body: 'texto' }), /objeto JSON/);
});

test('paginacion: aplica valores por defecto y calcula el desplazamiento', () => {
  assert.deepEqual(v.paginacion({}), { pagina: 1, limite: 24, desplazamiento: 0 });
  assert.deepEqual(v.paginacion({ pagina: '3', limite: '10' }), { pagina: 3, limite: 10, desplazamiento: 20 });
});

test('paginacion: respeta límites y parámetros personalizados', () => {
  assert.deepEqual(v.paginacion({}, { limitePorDefecto: 5 }), { pagina: 1, limite: 5, desplazamiento: 0 });
  assert.throws(() => v.paginacion({ limite: '61' }), /entre 1 y 60/);
  assert.throws(() => v.paginacion({ pagina: '0' }), /entre 1 y/);
});

test('patronBusqueda: escapa comodines de ILIKE', () => {
  assert.equal(v.patronBusqueda('rosa'), '%rosa%');
  assert.equal(v.patronBusqueda('50%'), '%50\\%%');
  assert.equal(v.patronBusqueda('a_b'), '%a\\_b%');
  assert.equal(v.patronBusqueda('a\\b'), '%a\\\\b%');
});

test('patronBusqueda: rechaza búsquedas vacías o demasiado largas', () => {
  assert.throws(() => v.patronBusqueda('   '), /obligatorio/);
  assert.throws(() => v.patronBusqueda('x'.repeat(81)), /no puede superar 80 caracteres/);
});
