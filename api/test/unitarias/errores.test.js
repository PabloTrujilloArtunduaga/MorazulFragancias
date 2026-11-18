// Pruebas unitarias de los errores de la API. No usan base de datos ni red.
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ErrorApi,
  noAutenticado,
  prohibido,
  noEncontrado,
  conflicto,
  reglaDeNegocio,
  validacion,
} = require('../../src/utilidades/errores');

test('ErrorApi: conserva estado, código, mensaje y detalles', () => {
  const err = new ErrorApi(418, 'te_pot', 'Soy una tetera', { campo: 'x' });
  assert.ok(err instanceof Error);
  assert.ok(err instanceof ErrorApi);
  assert.equal(err.estado, 418);
  assert.equal(err.codigo, 'te_pot');
  assert.equal(err.message, 'Soy una tetera');
  assert.deepEqual(err.detalles, { campo: 'x' });
});

test('ErrorApi: los detalles son opcionales', () => {
  const err = new ErrorApi(500, 'interno', 'falló');
  assert.equal(err.detalles, undefined);
});

test('noAutenticado: 401 con mensaje por defecto y personalizado', () => {
  const porDefecto = noAutenticado();
  assert.equal(porDefecto.estado, 401);
  assert.equal(porDefecto.codigo, 'no_autenticado');
  assert.equal(porDefecto.message, 'Debes iniciar sesión');
  assert.equal(noAutenticado('Token vencido').message, 'Token vencido');
});

test('prohibido: 403 con mensaje por defecto y personalizado', () => {
  const porDefecto = prohibido();
  assert.equal(porDefecto.estado, 403);
  assert.equal(porDefecto.codigo, 'prohibido');
  assert.equal(porDefecto.message, 'No tienes permiso para esta acción');
  assert.equal(prohibido('Solo administradores').message, 'Solo administradores');
});

test('noEncontrado: 404 con mensaje por defecto y personalizado', () => {
  const porDefecto = noEncontrado();
  assert.equal(porDefecto.estado, 404);
  assert.equal(porDefecto.codigo, 'no_encontrado');
  assert.equal(porDefecto.message, 'No se encontró el recurso');
  assert.equal(noEncontrado('Fragancia inexistente').message, 'Fragancia inexistente');
});

test('conflicto: 409', () => {
  const err = conflicto('Ya existe una fragancia con ese código');
  assert.equal(err.estado, 409);
  assert.equal(err.codigo, 'conflicto');
  assert.equal(err.message, 'Ya existe una fragancia con ese código');
});

test('reglaDeNegocio: 422', () => {
  const err = reglaDeNegocio('No hay existencias suficientes');
  assert.equal(err.estado, 422);
  assert.equal(err.codigo, 'regla_de_negocio');
  assert.equal(err.message, 'No hay existencias suficientes');
});

test('validacion: 400 y acepta detalles', () => {
  const err = validacion('Datos inválidos', { nombre: 'es obligatorio' });
  assert.equal(err.estado, 400);
  assert.equal(err.codigo, 'validacion');
  assert.equal(err.message, 'Datos inválidos');
  assert.deepEqual(err.detalles, { nombre: 'es obligatorio' });
});
