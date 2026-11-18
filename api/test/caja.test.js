const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { request, sequelize, preparar, conSesion, cerrar } = require('./ayudas');

let ctx;
let api;

before(async () => {
  ctx = await preparar();
  api = conSesion(ctx);
});
after(cerrar);

test('sin abrir, "hoy" no tiene caja y sugiere el saldo de apertura', async () => {
  const r = await api.get('/api/caja/hoy');
  assert.equal(r.status, 200);
  assert.equal(r.body.caja, null);
  assert.equal(r.body.saldo_apertura_sugerido, 0);
  assert.equal(r.body.caja_pendiente_de_cerrar, null);
  assert.match(r.body.fecha, /^\d{4}-\d{2}-\d{2}$/);
});

test('no se puede mover caja ni cerrarla si no se ha abierto', async () => {
  const mov = await api.post('/api/caja/hoy/movimientos').send({ tipo: 'ingreso', concepto: 'Aporte inicial', valor: 1000 });
  assert.equal(mov.status, 422);
  assert.equal((await api.post('/api/caja/hoy/cerrar').send({ saldo_cierre: 0 })).status, 422);
});

test('abre la caja con su saldo inicial y deja auditoría', async () => {
  const r = await api.post('/api/caja/abrir').send({ saldo_apertura: 50000 });
  assert.equal(r.status, 201);
  assert.equal(r.body.caja.estado, 'abierta');
  assert.equal(r.body.caja.saldo_apertura, 50000);
  assert.equal(r.body.caja.saldo_esperado, 50000);
  assert.equal(r.body.caja.saldo_cierre, null);
  assert.ok(r.body.caja.abierta_en);
  assert.equal(r.body.caja.cerrada_en, null);
  const [[a]] = await sequelize.query("SELECT accion, id_usuario FROM auditoria WHERE entidad = 'caja' ORDER BY id_auditoria DESC LIMIT 1");
  assert.equal(a.accion, 'crear');
  assert.equal(a.id_usuario, ctx.admin.id_usuario);
});

test('no se abre dos veces el mismo día y se valida el saldo', async () => {
  assert.equal((await api.post('/api/caja/abrir').send({ saldo_apertura: 1 })).status, 409);
  for (const malo of [-1, 'abc', 10.555, null, undefined]) {
    const r = await api.post('/api/caja/abrir').send(malo === undefined ? {} : { saldo_apertura: malo });
    assert.equal(r.status, 400, `saldo ${malo}`);
  }
});

test('ingresos y egresos manuales cambian el saldo esperado', async () => {
  const ing = await api.post('/api/caja/hoy/movimientos').send({ tipo: 'ingreso', concepto: 'Aporte para cambio', valor: 10000 });
  assert.equal(ing.status, 201);
  assert.equal(ing.body.caja.saldo_esperado, 60000);
  const egr = await api.post('/api/caja/hoy/movimientos').send({ tipo: 'egreso', concepto: 'Compra de bolsas', valor: 5000 });
  assert.equal(egr.body.caja.saldo_esperado, 55000);
  assert.equal(egr.body.caja.ingresos, 10000);
  assert.equal(egr.body.caja.egresos, 5000);
  assert.equal(egr.body.movimientos.length, 2);
  const hoy = await api.get('/api/caja/hoy');
  assert.equal(hoy.body.caja.saldo_esperado, 55000);
  assert.equal(hoy.body.saldo_apertura_sugerido, 0);
});

test('un egreso no puede superar el efectivo que hay en caja', async () => {
  const r = await api.post('/api/caja/hoy/movimientos').send({ tipo: 'egreso', concepto: 'Retiro grande', valor: 55001 });
  assert.equal(r.status, 422);
  assert.match(r.body.error.mensaje, /efectivo/i);
  assert.equal((await api.get('/api/caja/hoy')).body.caja.saldo_esperado, 55000);
});

test('valida los datos de un movimiento de caja', async () => {
  const base = { tipo: 'ingreso', concepto: 'Prueba', valor: 100 };
  for (const cambio of [{ tipo: 'venta' }, { concepto: 'ab' }, { valor: 0 }, { valor: -5 }, { valor: 'mil' }, { concepto: undefined }]) {
    const r = await api.post('/api/caja/hoy/movimientos').send({ ...base, ...cambio });
    assert.equal(r.status, 400, JSON.stringify(cambio));
  }
});

test('cierra la caja con el efectivo contado e informa la diferencia', async () => {
  const r = await api.post('/api/caja/hoy/cerrar').send({ saldo_cierre: 54500 });
  assert.equal(r.status, 200);
  assert.equal(r.body.caja.estado, 'cerrada');
  assert.equal(r.body.caja.saldo_esperado, 55000);
  assert.equal(r.body.caja.saldo_cierre, 54500);
  assert.equal(r.body.diferencia, -500);
  assert.ok(r.body.caja.cerrada_en);
  const [[a]] = await sequelize.query("SELECT detalle FROM auditoria WHERE entidad = 'caja' AND accion = 'editar' AND detalle->>'cambio' = 'cerrar'");
  assert.equal(a.detalle.diferencia, -500);
});

test('una caja cerrada no se reabre ni admite movimientos, y el siguiente día sugiere su cierre', async () => {
  assert.equal((await api.post('/api/caja/abrir').send({ saldo_apertura: 1 })).status, 409);
  assert.equal((await api.post('/api/caja/hoy/cerrar').send({ saldo_cierre: 1 })).status, 409);
  const mov = await api.post('/api/caja/hoy/movimientos').send({ tipo: 'ingreso', concepto: 'Tarde', valor: 100 });
  assert.equal(mov.status, 422);
  const hoy = await api.get('/api/caja/hoy');
  assert.equal(hoy.body.caja.estado, 'cerrada');
  assert.equal(hoy.body.saldo_apertura_sugerido, 54500);
});

test('el historial lista las cajas y el detalle trae movimientos y número de ventas', async () => {
  const lista = await api.get('/api/caja');
  assert.equal(lista.body.total, 1);
  const id = lista.body.cajas[0].id_caja;
  const detalle = await api.get(`/api/caja/${id}`);
  assert.equal(detalle.status, 200);
  assert.equal(detalle.body.movimientos.length, 2);
  assert.equal(detalle.body.ventas, 0);
  assert.equal((await api.get('/api/caja/99999')).status, 404);
  assert.equal((await api.get('/api/caja?desde=2020-01-01&hasta=2020-12-31')).body.total, 0);
  assert.equal((await api.get('/api/caja?desde=hoy')).status, 400);
});

test('si quedó una caja abierta de un día anterior, hay que cerrarla antes de abrir la de hoy', async () => {
  await sequelize.query("DELETE FROM movimiento_caja; DELETE FROM caja_diaria;");
  await sequelize.query(
    "INSERT INTO caja_diaria (id_usuario, fecha, saldo_apertura) VALUES (:u, (now() AT TIME ZONE 'America/Bogota')::date - 3, 1000)",
    { replacements: { u: ctx.admin.id_usuario } }
  );
  const estado = await api.get('/api/caja/hoy');
  assert.equal(estado.body.caja, null);
  assert.match(estado.body.caja_pendiente_de_cerrar, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(estado.body.caja_pendiente);
  assert.equal(estado.body.caja_pendiente.saldo_esperado, 1000);

  // Intentar abrir sin cerrar la anterior debe fallar con 409
  const r = await api.post('/api/caja/abrir').send({ saldo_apertura: 0 });
  assert.equal(r.status, 409);
  assert.match(r.body.error.mensaje, /Cierra primero/);

  // Cerrar la caja pendiente con el efectivo contado
  const cierre = await api.post('/api/caja/pendiente/cerrar').send({ saldo_cierre: 1000 });
  assert.equal(cierre.status, 200);
  assert.equal(cierre.body.caja.estado, 'cerrada');
  assert.equal(cierre.body.diferencia, 0);

  // Ahora el estado de hoy no tiene cajas pendientes
  const estadoLimpio = await api.get('/api/caja/hoy');
  assert.equal(estadoLimpio.body.caja_pendiente_de_cerrar, null);
  assert.equal(estadoLimpio.body.caja_pendiente, null);

  // Ahora sí se puede abrir la caja de hoy
  const apertura = await api.post('/api/caja/abrir').send({ saldo_apertura: 1000 });
  assert.equal(apertura.status, 201);
  assert.equal(apertura.body.caja.estado, 'abierta');
});

test('todas las rutas de caja exigen sesión', async () => {
  for (const [metodo, ruta] of [
    ['get', '/api/caja/hoy'],
    ['post', '/api/caja/abrir'],
    ['post', '/api/caja/hoy/cerrar'],
    ['post', '/api/caja/pendiente/cerrar'],
    ['get', '/api/caja'],
  ]) {
    assert.equal((await request(ctx.app)[metodo](ruta)).status, 401, ruta);
  }
});
