// Consultas de la caja diaria. El "hoy" del negocio es la fecha de Bogotá, igual que en las vistas de reportes.
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../modelos');

const num = (v) => (v === null || v === undefined ? null : Number(v));

async function fechaHoy(transaccion) {
  const [{ hoy }] = await sequelize.query(
    "SELECT to_char((now() AT TIME ZONE 'America/Bogota')::date, 'YYYY-MM-DD') AS hoy",
    { type: QueryTypes.SELECT, transaction: transaccion }
  );
  return hoy;
}

// Caja de hoy. modo: 'ninguno' (solo lectura), 'compartido' (ventas) o 'exclusivo' (cierre y movimientos).
async function buscarHoy(transaccion, modo = 'ninguno') {
  const cierre = { ninguno: '', compartido: ' FOR SHARE', exclusivo: ' FOR UPDATE' }[modo];
  const hoy = await fechaHoy(transaccion);
  const [caja] = await sequelize.query(
    `SELECT id_caja, estado, to_char(fecha, 'YYYY-MM-DD') AS fecha FROM caja_diaria WHERE fecha = :hoy${cierre}`,
    { replacements: { hoy }, type: QueryTypes.SELECT, transaction: transaccion }
  );
  return { hoy, caja: caja || null };
}

const serializar = (c) => ({
  id_caja: c.id_caja,
  fecha: c.fecha,
  estado: c.estado,
  saldo_apertura: num(c.saldo_apertura),
  ingresos: num(c.ingresos),
  egresos: num(c.egresos),
  saldo_esperado: num(c.saldo_esperado),
  saldo_cierre: num(c.saldo_cierre),
  abierta_en: c.abierta_en,
  cerrada_en: c.cerrada_en,
});

async function resumen(idCaja, transaccion) {
  const [fila] = await sequelize.query(
    `SELECT r.id_caja, to_char(r.fecha, 'YYYY-MM-DD') AS fecha, r.estado, r.saldo_apertura, r.ingresos, r.egresos,
            r.saldo_esperado, r.saldo_cierre, c.abierta_en, c.cerrada_en
       FROM v_resumen_caja r JOIN caja_diaria c USING (id_caja) WHERE r.id_caja = :idCaja`,
    { replacements: { idCaja }, type: QueryTypes.SELECT, transaction: transaccion }
  );
  return fila ? serializar(fila) : null;
}

async function movimientos(idCaja, transaccion) {
  const filas = await sequelize.query(
    `SELECT m.id_mov_caja, m.tipo, m.concepto, m.valor, m.id_venta, m.fecha_hora, u.nombre AS usuario,
            (SELECT COUNT(*)::int FROM detalle_venta dv WHERE dv.id_venta = m.id_venta) AS productos
       FROM movimiento_caja m JOIN usuario u USING (id_usuario)
      WHERE m.id_caja = :idCaja ORDER BY m.fecha_hora, m.id_mov_caja`,
    { replacements: { idCaja }, type: QueryTypes.SELECT, transaction: transaccion }
  );
  return filas.map((m) => ({ ...m, valor: Number(m.valor) }));
}

// Saldo con el que cerró la última caja: se sugiere como apertura del día siguiente.
async function saldoSugerido() {
  const [fila] = await sequelize.query(
    "SELECT saldo_cierre FROM caja_diaria WHERE estado = 'cerrada' ORDER BY fecha DESC LIMIT 1",
    { type: QueryTypes.SELECT }
  );
  return fila ? Number(fila.saldo_cierre) : 0;
}

// Fecha de la caja más antigua que quedó abierta antes de hoy, o null.
async function pendienteDeCerrar(hoy, transaccion) {
  const [fila] = await sequelize.query(
    "SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha FROM caja_diaria WHERE estado = 'abierta' AND fecha < :hoy ORDER BY fecha LIMIT 1",
    { replacements: { hoy }, type: QueryTypes.SELECT, transaction: transaccion }
  );
  return fila ? fila.fecha : null;
}

// Caja más antigua que quedó abierta antes de hoy (para cerrarla si quedó pendiente).
async function buscarPendiente(hoy, transaccion, modo = 'ninguno') {
  const cierre = { ninguno: '', exclusivo: ' FOR UPDATE' }[modo];
  const [caja] = await sequelize.query(
    `SELECT id_caja, estado, to_char(fecha, 'YYYY-MM-DD') AS fecha FROM caja_diaria WHERE estado = 'abierta' AND fecha < :hoy ORDER BY fecha LIMIT 1${cierre}`,
    { replacements: { hoy }, type: QueryTypes.SELECT, transaction: transaccion }
  );
  return caja || null;
}

module.exports = { fechaHoy, buscarHoy, buscarPendiente, resumen, movimientos, saldoSugerido, pendienteDeCerrar, serializar, num };

