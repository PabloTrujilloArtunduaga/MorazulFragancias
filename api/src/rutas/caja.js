const express = require('express');
const { QueryTypes } = require('sequelize');
const { sequelize, CajaDiaria, MovimientoCaja } = require('../modelos');
const { auditar } = require('../servicios/auditoria');
const servicio = require('../servicios/caja');
const { conflicto, noEncontrado, reglaDeNegocio, validacion } = require('../utilidades/errores');
const { texto, entero, opcion, dinero, fecha, cuerpo, paginacion } = require('../utilidades/validar');

const router = express.Router();

router.get('/hoy', async (_req, res) => {
  const { hoy, caja } = await servicio.buscarHoy();
  const pendiente = await servicio.buscarPendiente(hoy);
  const sugerido = await servicio.saldoSugerido();
  const resumenPendiente = pendiente ? await servicio.resumen(pendiente.id_caja) : null;
  if (!caja) {
    return res.json({
      fecha: hoy,
      caja: null,
      movimientos: [],
      saldo_apertura_sugerido: sugerido,
      caja_pendiente_de_cerrar: pendiente ? pendiente.fecha : null,
      caja_pendiente: resumenPendiente,
    });
  }
  res.json({
    fecha: hoy,
    caja: await servicio.resumen(caja.id_caja),
    movimientos: await servicio.movimientos(caja.id_caja),
    saldo_apertura_sugerido: sugerido,
    caja_pendiente_de_cerrar: pendiente ? pendiente.fecha : null,
    caja_pendiente: resumenPendiente,
  });
});

router.post('/abrir', async (req, res) => {
  const b = cuerpo(req);
  const saldo = dinero(b.saldo_apertura, 'El saldo de apertura');

  const idCaja = await sequelize.transaction(async (t) => {
    const { hoy, caja } = await servicio.buscarHoy(t, 'exclusivo');
    if (caja) {
      throw conflicto(caja.estado === 'abierta' ? 'La caja de hoy ya está abierta' : 'La caja de hoy ya fue cerrada y no se puede reabrir');
    }
    const pendiente = await servicio.pendienteDeCerrar(hoy, t);
    if (pendiente) throw conflicto(`Cierra primero la caja del ${pendiente}, que quedó abierta`);

    const nueva = await CajaDiaria.create(
      { id_usuario: req.usuario.id, fecha: hoy, saldo_apertura: saldo, estado: 'abierta' },
      { transaction: t }
    );
    await auditar(t, req.usuario.id, 'caja', nueva.id_caja, 'crear', { fecha: hoy, saldo_apertura: saldo });
    return nueva.id_caja;
  });
  res.status(201).json({ caja: await servicio.resumen(idCaja), movimientos: [] });
});

// Ingresos y egresos que no son ventas (gastos, retiros, aportes).
router.post('/hoy/movimientos', async (req, res) => {
  const b = cuerpo(req);
  const tipo = opcion(b.tipo, 'El tipo', ['ingreso', 'egreso']);
  const concepto = texto(b.concepto, 'El concepto', { min: 3, max: 150 });
  const valor = dinero(b.valor, 'El valor', { permiteCero: false });

  const idCaja = await sequelize.transaction(async (t) => {
    const { caja } = await servicio.buscarHoy(t, 'exclusivo');
    if (!caja) throw reglaDeNegocio('Abre la caja del día antes de registrar movimientos');
    if (caja.estado !== 'abierta') throw reglaDeNegocio('La caja de hoy está cerrada');

    if (tipo === 'egreso') {
      const { saldo_esperado: efectivo } = await servicio.resumen(caja.id_caja, t);
      if (valor > efectivo) {
        throw reglaDeNegocio(`El egreso supera el efectivo que hay en caja ($${efectivo.toLocaleString('es-CO')})`);
      }
    }
    const mov = await MovimientoCaja.create({ id_caja: caja.id_caja, id_usuario: req.usuario.id, tipo, concepto, valor }, { transaction: t });
    await auditar(t, req.usuario.id, 'caja', caja.id_caja, 'editar', { cambio: 'movimiento', id_mov_caja: mov.id_mov_caja, tipo, concepto, valor });
    return caja.id_caja;
  });
  res.status(201).json({ caja: await servicio.resumen(idCaja), movimientos: await servicio.movimientos(idCaja) });
});

// Cierre con el efectivo contado. La diferencia contra lo esperado se informa, no bloquea el cierre.
router.post('/hoy/cerrar', async (req, res) => {
  const b = cuerpo(req);
  const contado = dinero(b.saldo_cierre, 'El efectivo contado');

  const { idCaja, diferencia } = await sequelize.transaction(async (t) => {
    const { caja } = await servicio.buscarHoy(t, 'exclusivo');
    if (!caja) throw reglaDeNegocio('No hay caja abierta hoy');
    if (caja.estado !== 'abierta') throw conflicto('La caja de hoy ya está cerrada');

    const { saldo_esperado: esperado } = await servicio.resumen(caja.id_caja, t);
    await CajaDiaria.update({ estado: 'cerrada', saldo_cierre: contado, cerrada_en: new Date() }, { where: { id_caja: caja.id_caja }, transaction: t });
    const dif = Math.round((contado - esperado) * 100) / 100;
    await auditar(t, req.usuario.id, 'caja', caja.id_caja, 'editar', { cambio: 'cerrar', saldo_esperado: esperado, saldo_cierre: contado, diferencia: dif });
    return { idCaja: caja.id_caja, diferencia: dif };
  });
  res.json({ caja: await servicio.resumen(idCaja), diferencia });
});

// Cierre de una caja anterior que quedó pendiente de cerrar.
router.post('/pendiente/cerrar', async (req, res) => {
  const b = cuerpo(req);
  const contado = dinero(b.saldo_cierre, 'El efectivo contado');

  const { idCaja, diferencia } = await sequelize.transaction(async (t) => {
    const hoy = await servicio.fechaHoy(t);
    const caja = await servicio.buscarPendiente(hoy, t, 'exclusivo');
    if (!caja) throw reglaDeNegocio('No hay ninguna caja pendiente de cerrar anterior a hoy');
    if (caja.estado !== 'abierta') throw conflicto('La caja ya está cerrada');

    const { saldo_esperado: esperado } = await servicio.resumen(caja.id_caja, t);
    await CajaDiaria.update({ estado: 'cerrada', saldo_cierre: contado, cerrada_en: new Date() }, { where: { id_caja: caja.id_caja }, transaction: t });
    const dif = Math.round((contado - esperado) * 100) / 100;
    await auditar(t, req.usuario.id, 'caja', caja.id_caja, 'editar', { cambio: 'cerrar', saldo_esperado: esperado, saldo_cierre: contado, diferencia: dif });
    return { idCaja: caja.id_caja, diferencia: dif };
  });
  res.json({ caja: await servicio.resumen(idCaja), diferencia });
});

router.get('/', async (req, res) => {
  const { pagina, limite, desplazamiento } = paginacion(req.query, { limitePorDefecto: 31, limiteMax: 100 });
  const condiciones = [];
  const reemplazos = { limite, desplazamiento };
  if (req.query.desde !== undefined) {
    reemplazos.desde = fecha(req.query.desde, 'desde');
    condiciones.push('fecha >= :desde');
  }
  if (req.query.hasta !== undefined) {
    reemplazos.hasta = fecha(req.query.hasta, 'hasta');
    condiciones.push('fecha <= :hasta');
  }
  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const filas = await sequelize.query(
    `SELECT id_caja, to_char(fecha, 'YYYY-MM-DD') AS fecha, estado, saldo_apertura, ingresos, egresos, saldo_esperado, saldo_cierre
       FROM v_resumen_caja ${donde} ORDER BY v_resumen_caja.fecha DESC LIMIT :limite OFFSET :desplazamiento`,
    { replacements: reemplazos, type: QueryTypes.SELECT }
  );
  const [{ total }] = await sequelize.query(`SELECT COUNT(*)::int AS total FROM v_resumen_caja ${donde}`, {
    replacements: reemplazos,
    type: QueryTypes.SELECT,
  });
  res.json({ pagina, limite, total, total_paginas: Math.ceil(total / limite), cajas: filas.map(servicio.serializar) });
});

router.get('/:id', async (req, res) => {
  const id = entero(req.params.id, 'id', { min: 1 });
  const caja = await servicio.resumen(id);
  if (!caja) throw noEncontrado('La caja no existe');
  const [{ ventas }] = await sequelize.query('SELECT COUNT(*)::int AS ventas FROM venta WHERE id_caja = :id', {
    replacements: { id },
    type: QueryTypes.SELECT,
  });
  res.json({ caja, ventas, movimientos: await servicio.movimientos(id) });
});

module.exports = router;
