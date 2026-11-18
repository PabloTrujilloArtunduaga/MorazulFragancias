// Pruebas unitarias del almacenamiento local de imágenes.
// Se fuerza el modo disco (sin token de Blob) para no tocar Vercel ni la red.
process.env.NODE_ENV = 'test';
process.env.BLOB_READ_WRITE_TOKEN = '';
process.env.IMAGENES_BASE_URL = 'https://cdn.test/uploads/';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../../src/config');
const { guardar, eliminar, eliminarSiPuede, url } = require('../../src/servicios/almacenamiento');

const CLAVE = '__pruebas_unitarias__/archivo.txt';
const CARPETA = path.join(config.imagenes.carpeta, '__pruebas_unitarias__');
const CONTENIDO = Buffer.from('contenido de prueba');

test.after(() => {
  fs.rmSync(CARPETA, { recursive: true, force: true });
});

test('url: devuelve null para una clave vacía', () => {
  assert.equal(url(null), null);
  assert.equal(url(''), null);
  assert.equal(url(undefined), null);
});

test('url: respeta una URL completa de Blob', () => {
  const publica = 'https://abc.public.blob.vercel-storage.com/fragancias/x.webp';
  assert.equal(url(publica), publica);
});

test('url: compone la base configurada con la clave relativa', () => {
  assert.equal(url('fragancias/x.webp'), 'https://cdn.test/uploads/fragancias/x.webp');
  assert.equal(url('/fragancias/x.webp'), 'https://cdn.test/uploads/fragancias/x.webp');
});

test('guardar: en modo local escribe en disco y devuelve la clave relativa', async () => {
  const resultado = await guardar(CLAVE, CONTENIDO);
  assert.equal(resultado, CLAVE);
  const destino = path.join(config.imagenes.carpeta, CLAVE);
  assert.ok(fs.existsSync(destino));
  assert.deepEqual(fs.readFileSync(destino), CONTENIDO);
});

test('guardar: crea las carpetas intermedias', async () => {
  const clave = '__pruebas_unitarias__/sub/carpeta/otro.bin';
  await guardar(clave, CONTENIDO);
  assert.ok(fs.existsSync(path.join(config.imagenes.carpeta, clave)));
  await eliminar(clave);
});

test('guardar: rechaza claves que intentan salir de la carpeta', async () => {
  await assert.rejects(() => guardar('../fuera.txt', CONTENIDO), /Clave de archivo no válida/);
  await assert.rejects(() => guardar('__pruebas_unitarias__/../../fuera.txt', CONTENIDO), /Clave de archivo no válida/);
});

test('eliminar: borra el archivo y es idempotente si ya no existe', async () => {
  const destino = path.join(config.imagenes.carpeta, CLAVE);
  await eliminar(CLAVE);
  assert.ok(!fs.existsSync(destino));
  await eliminar(CLAVE);
});

test('eliminar: ignorar una clave vacía no falla', async () => {
  await eliminar(null);
  await eliminar('');
});

test('eliminar: en modo local rechaza una URL remota', async () => {
  await assert.rejects(
    () => eliminar('https://abc.public.blob.vercel-storage.com/fragancias/x.webp'),
    /No se puede eliminar una URL remota/
  );
});

test('eliminarSiPuede: absorbe el error de una URL remota', async () => {
  const original = console.warn;
  let aviso = '';
  console.warn = (mensaje) => {
    aviso = mensaje;
  };
  try {
    await eliminarSiPuede('https://abc.public.blob.vercel-storage.com/fragancias/x.webp');
  } finally {
    console.warn = original;
  }
  assert.match(aviso, /No se pudo borrar el archivo/);
});
