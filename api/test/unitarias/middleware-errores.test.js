// Pruebas unitarias del middleware que traduce errores a respuestas JSON.
// No usan base de datos ni red: se simulan req y res.
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const multer = require('multer');
const { ErrorApi, validacion } = require('../../src/utilidades/errores');
const { manejarErrores, rutaNoEncontrada } = require('../../src/middleware/errores');

function respuestaFalsa() {
  return {
    codigoHttp: null,
    cuerpo: null,
    status(codigo) {
      this.codigoHttp = codigo;
      return this;
    },
    json(cuerpo) {
      this.cuerpo = cuerpo;
      return this;
    },
  };
}

function peticionFalsa(extra = {}) {
  return { method: 'POST', path: '/api/x', originalUrl: '/api/x', ...extra };
}

test('rutaNoEncontrada: produce un 404 con método y ruta', () => {
  let capturado;
  rutaNoEncontrada(peticionFalsa(), null, (err) => {
    capturado = err;
  });
  assert.ok(capturado instanceof ErrorApi);
  assert.equal(capturado.estado, 404);
  assert.equal(capturado.codigo, 'no_encontrado');
  assert.match(capturado.message, /POST \/api\/x/);
});

test('manejarErrores: responde un ErrorApi con su estado y detalles', () => {
  const res = respuestaFalsa();
  manejarErrores(validacion('Datos inválidos', { nombre: 'obligatorio' }), peticionFalsa(), res, () => {});
  assert.equal(res.codigoHttp, 400);
  assert.deepEqual(res.cuerpo, {
    error: { codigo: 'validacion', mensaje: 'Datos inválidos', detalles: { nombre: 'obligatorio' } },
  });
});

test('manejarErrores: no incluye detalles cuando no los hay', () => {
  const res = respuestaFalsa();
  manejarErrores(new ErrorApi(404, 'no_encontrado', 'No está'), peticionFalsa(), res, () => {});
  assert.deepEqual(res.cuerpo, { error: { codigo: 'no_encontrado', mensaje: 'No está' } });
});

test('manejarErrores: multer LIMIT_FILE_SIZE produce 413', () => {
  const res = respuestaFalsa();
  manejarErrores(new multer.MulterError('LIMIT_FILE_SIZE'), peticionFalsa(), res, () => {});
  assert.equal(res.codigoHttp, 413);
  assert.equal(res.cuerpo.error.codigo, 'archivo_muy_grande');
  assert.match(res.cuerpo.error.mensaje, /3 MB/);
});

test('manejarErrores: otros errores de multer producen 400', () => {
  const res = respuestaFalsa();
  manejarErrores(new multer.MulterError('LIMIT_UNEXPECTED_FILE'), peticionFalsa(), res, () => {});
  assert.equal(res.codigoHttp, 400);
  assert.equal(res.cuerpo.error.codigo, 'validacion');
});

test('manejarErrores: JSON mal formado produce 400', () => {
  const res = respuestaFalsa();
  manejarErrores(Object.assign(new Error('parse'), { type: 'entity.parse.failed' }), peticionFalsa(), res, () => {});
  assert.equal(res.codigoHttp, 400);
  assert.match(res.cuerpo.error.mensaje, /JSON válido/);
});

test('manejarErrores: cuerpo demasiado grande produce 413', () => {
  const res = respuestaFalsa();
  manejarErrores(Object.assign(new Error('large'), { type: 'entity.too.large' }), peticionFalsa(), res, () => {});
  assert.equal(res.codigoHttp, 413);
  assert.equal(res.cuerpo.error.codigo, 'cuerpo_muy_grande');
});

test('manejarErrores: violación de unicidad de Sequelize produce 409', () => {
  const res = respuestaFalsa();
  manejarErrores(Object.assign(new Error('unique'), { name: 'SequelizeUniqueConstraintError' }), peticionFalsa(), res, () => {});
  assert.equal(res.codigoHttp, 409);
  assert.equal(res.cuerpo.error.codigo, 'conflicto');
  assert.match(res.cuerpo.error.mensaje, /Ya existe/);
});

test('manejarErrores: violación de llave foránea produce 422', () => {
  const res = respuestaFalsa();
  manejarErrores(Object.assign(new Error('fk'), { name: 'SequelizeForeignKeyConstraintError' }), peticionFalsa(), res, () => {});
  assert.equal(res.codigoHttp, 422);
  assert.equal(res.cuerpo.error.codigo, 'regla_de_negocio');
});

test('manejarErrores: CHECK de PostgreSQL produce 422', () => {
  const res = respuestaFalsa();
  const err = Object.assign(new Error('check'), {
    name: 'SequelizeDatabaseError',
    parent: { code: '23514' },
  });
  manejarErrores(err, peticionFalsa(), res, () => {});
  assert.equal(res.codigoHttp, 422);
  assert.match(res.cuerpo.error.mensaje, /regla del negocio/);
});

test('manejarErrores: otros errores de base de datos caen en 500 genérico', () => {
  const res = respuestaFalsa();
  const original = console.error;
  console.error = () => {};
  try {
    const err = Object.assign(new Error('boom'), { name: 'SequelizeDatabaseError', parent: { code: '42P01' } });
    manejarErrores(err, peticionFalsa(), res, () => {});
  } finally {
    console.error = original;
  }
  assert.equal(res.codigoHttp, 500);
  assert.deepEqual(res.cuerpo, {
    error: { codigo: 'error_interno', mensaje: 'Ocurrió un error inesperado. Intenta de nuevo.' },
  });
});

test('manejarErrores: un error desconocido no filtra detalles internos', () => {
  const res = respuestaFalsa();
  const original = console.error;
  console.error = () => {};
  try {
    manejarErrores(new Error('contraseña de la base: secreto'), peticionFalsa(), res, () => {});
  } finally {
    console.error = original;
  }
  assert.equal(res.codigoHttp, 500);
  assert.ok(!JSON.stringify(res.cuerpo).includes('secreto'));
  assert.ok(!JSON.stringify(res.cuerpo).includes('contraseña'));
});
