// Pruebas unitarias del procesamiento de imágenes con sharp.
// No usan base de datos ni red: todo ocurre en memoria.
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { prepararImagen } = require('../../src/servicios/imagenes');

sharp.cache(false);

async function imagenDePrueba(ancho, alto, formato = 'png') {
  const base = sharp({
    create: { width: ancho, height: alto, channels: 3, background: '#3b6ea5' },
  });
  return formato === 'jpeg' ? base.jpeg().toBuffer() : base.png().toBuffer();
}

test('prepararImagen: convierte PNG a WebP y reduce el ancho a 800 px', async () => {
  const salida = await prepararImagen(await imagenDePrueba(1200, 600));
  const meta = await sharp(salida).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, 800);
  assert.equal(meta.height, 400);
});

test('prepararImagen: no agranda una imagen más pequeña que 800 px', async () => {
  const salida = await prepararImagen(await imagenDePrueba(100, 50));
  const meta = await sharp(salida).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, 100);
  assert.equal(meta.height, 50);
});

test('prepararImagen: en imágenes verticales no agranda ni recorta el alto', async () => {
  const salida = await prepararImagen(await imagenDePrueba(600, 1200));
  const meta = await sharp(salida).metadata();
  assert.equal(meta.width, 600);
  assert.equal(meta.height, 1200);
});

test('prepararImagen: acepta JPEG de entrada', async () => {
  const salida = await prepararImagen(await imagenDePrueba(1000, 500, 'jpeg'));
  const meta = await sharp(salida).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, 800);
});

test('prepararImagen: rechaza texto plano aunque se llame .jpg', async () => {
  await assert.rejects(
    () => prepararImagen(Buffer.from('esto no es una imagen')),
    (err) => err.codigo === 'validacion' && /JPG, PNG o WebP/.test(err.message)
  );
});

test('prepararImagen: rechaza SVG', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');
  await assert.rejects(() => prepararImagen(svg), /JPG, PNG o WebP/);
});

test('prepararImagen: rechaza un archivo con cabecera JPEG pero dañado', async () => {
  const roto = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]),
    Buffer.alloc(512, 0),
  ]);
  await assert.rejects(
    () => prepararImagen(roto),
    (err) => err.codigo === 'validacion' && /dañada|no se pudo procesar/.test(err.message)
  );
});

test('prepararImagen: rechaza un buffer vacío', async () => {
  await assert.rejects(() => prepararImagen(Buffer.alloc(0)), /JPG, PNG o WebP/);
});
