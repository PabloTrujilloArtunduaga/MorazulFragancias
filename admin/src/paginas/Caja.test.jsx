import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AvisosProvider } from '../componentes/Avisos.jsx';
import Caja from './Caja.jsx';
import { instalarFetch } from '../test/ayudas.jsx';

const CAJA_ABIERTA = {
  fecha: '2026-10-07',
  caja: {
    id_caja: 1,
    fecha: '2026-10-07',
    estado: 'abierta',
    saldo_apertura: 50000,
    ingresos: 40000,
    egresos: 5000,
    saldo_esperado: 85000,
    saldo_cierre: null,
    abierta_en: '2026-10-07T08:00:00Z',
    cerrada_en: null,
  },
  movimientos: [
    {
      id_mov_caja: 1,
      tipo: 'ingreso',
      concepto: 'Venta #0001',
      valor: 40000,
      id_venta: 1,
      fecha_hora: '2026-10-07T09:30:00Z',
      productos: 2,
    },
    {
      id_mov_caja: 2,
      tipo: 'egreso',
      concepto: 'Compra de bolsas',
      valor: 5000,
      id_venta: null,
      fecha_hora: '2026-10-07T11:00:00Z',
      productos: 0,
    },
  ],
  saldo_apertura_sugerido: 50000,
  caja_pendiente_de_cerrar: null,
  caja_pendiente: null,
};

const CAJA_CERRADA = {
  fecha: '2026-10-07',
  caja: {
    id_caja: 1,
    fecha: '2026-10-07',
    estado: 'cerrada',
    saldo_apertura: 50000,
    ingresos: 40000,
    egresos: 5000,
    saldo_esperado: 85000,
    saldo_cierre: 85000,
    abierta_en: '2026-10-07T08:00:00Z',
    cerrada_en: '2026-10-07T18:00:00Z',
  },
  movimientos: CAJA_ABIERTA.movimientos,
  saldo_apertura_sugerido: 85000,
  caja_pendiente_de_cerrar: null,
  caja_pendiente: null,
};

function montar(rutas = {}) {
  const fetch = instalarFetch({
    'GET /api/reportes/caja': () => ({ total: 0, cajas: [] }),
    ...rutas,
  });
  render(
    <AvisosProvider>
      <MemoryRouter>
        <Caja />
      </MemoryRouter>
    </AvisosProvider>
  );
  return fetch;
}

describe('Página de Caja', () => {
  it('sin caja abierta muestra el formulario de apertura con el saldo sugerido', async () => {
    montar({
      'GET /api/caja/hoy': () => ({
        fecha: '2026-10-07',
        caja: null,
        movimientos: [],
        saldo_apertura_sugerido: 30000,
        caja_pendiente_de_cerrar: null,
        caja_pendiente: null,
      }),
    });

    expect(await screen.findByRole('heading', { name: 'La caja de hoy no está abierta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir caja' })).toBeInTheDocument();
  });

  it('con caja anterior pendiente muestra tarjeta de advertencia y botón para cerrarla, ocultando la apertura', async () => {
    const { llamadas } = montar({
      'GET /api/caja/hoy': () => ({
        fecha: '2026-10-08',
        caja: null,
        movimientos: [],
        saldo_apertura_sugerido: 20000,
        caja_pendiente_de_cerrar: '2026-10-07',
        caja_pendiente: {
          id_caja: 1,
          fecha: '2026-10-07',
          estado: 'abierta',
          saldo_esperado: 50000,
        },
      }),
      'POST /api/caja/pendiente/cerrar': () => [{ caja: { id_caja: 1, estado: 'cerrada' }, diferencia: 0 }, 200],
    });

    expect(await screen.findByRole('heading', { name: 'Caja anterior pendiente de cierre' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'La caja de hoy no está abierta' })).not.toBeInTheDocument();

    const botonCerrarPendiente = screen.getByRole('button', { name: /Cerrar caja del/ });
    expect(botonCerrarPendiente).toBeInTheDocument();

    await userEvent.click(botonCerrarPendiente);
    expect(await screen.findByText(/Al cerrar esta caja pendiente podrás abrir la caja de hoy/)).toBeInTheDocument();

    const inputContado = screen.getByPlaceholderText('0');
    await userEvent.type(inputContado, '50000');
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar caja pendiente' }));

    await waitFor(() => {
      const envio = llamadas.find((l) => l.clave === 'POST /api/caja/pendiente/cerrar');
      expect(envio).toBeDefined();
      expect(envio.cuerpo).toEqual({ saldo_cierre: 50000 });
    });
  });

  it('con caja abierta muestra indicadores, movimientos y botón Registrar movimiento', async () => {
    montar({
      'GET /api/caja/hoy': () => CAJA_ABIERTA,
    });

    expect(await screen.findByText('Caja del día')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar movimiento' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar caja' })).toBeInTheDocument();
    expect(screen.getAllByText('Venta #0001 · 2 productos').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Compra de bolsas').length).toBeGreaterThan(0);
  });

  it('permite cerrar la caja de hoy con el efectivo contado', async () => {
    const { llamadas } = montar({
      'GET /api/caja/hoy': () => CAJA_ABIERTA,
      'POST /api/caja/hoy/cerrar': () => [{ caja: CAJA_CERRADA.caja, diferencia: 0 }, 200],
    });

    await screen.findByText('Caja del día');
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar caja' }));

    const modal = await screen.findByRole('dialog', { name: 'Cerrar caja' });
    expect(within(modal).getByText(/Al cerrar la caja ya no se pueden registrar ventas ni movimientos hoy/)).toBeInTheDocument();

    const inputContado = within(modal).getByPlaceholderText('0');
    await userEvent.type(inputContado, '85000');
    await userEvent.click(within(modal).getByRole('button', { name: 'Cerrar caja' }));

    await waitFor(() => {
      const envio = llamadas.find((l) => l.clave === 'POST /api/caja/hoy/cerrar');
      expect(envio).toBeDefined();
      expect(envio.cuerpo).toEqual({ saldo_cierre: 85000 });
    });
  });

  it('con la caja de hoy cerrada muestra el aviso de la regla de negocio y oculta acciones', async () => {
    montar({
      'GET /api/caja/hoy': () => CAJA_CERRADA,
    });

    expect(await screen.findByText(/La caja de hoy ya fue cerrada/)).toBeInTheDocument();
    expect(screen.getByText(/el registro de ventas y movimientos está cerrado por hoy y se reanudará mañana/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar movimiento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar caja' })).not.toBeInTheDocument();
    expect(screen.getByText('Efectivo contado al cierre')).toBeInTheDocument();
  });
});
