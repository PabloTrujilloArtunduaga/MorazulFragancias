import { useState } from 'react';
import { api } from '../api/cliente.js';
import { useCarga } from '../util/ganchos.js';
import { fechaCompleta, fechaLarga, horaCorta, hoyISO, numeroVenta, pesos, pesosConSigno, plural, sumarDias } from '../util/formato.js';
import { useAvisos } from '../componentes/Avisos.jsx';
import { Campo } from '../componentes/Campo.jsx';
import Boton from '../componentes/Boton.jsx';
import Segmentado from '../componentes/Segmentado.jsx';
import Ventana from '../componentes/Ventana.jsx';
import { Cargando, ErrorCarga, Mensaje, Vacio } from '../componentes/Estados.jsx';

const soloDigitos = (t) => t.replace(/[^\d]/g, '').slice(0, 9);

function Indicador({ titulo, valor, detalle }) {
  return (
    <div className="tarjeta indicador">
      <p className="pequeno tenue">{titulo}</p>
      <p className="numero-grande">{valor}</p>
      <p className="pequeno tenue">{detalle}</p>
    </div>
  );
}

function AbrirCaja({ sugerido, onAbierta }) {
  const avisos = useAvisos();
  const [saldo, setSaldo] = useState(String(sugerido || 0));
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function abrir(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await api('/api/caja/abrir', { metodo: 'POST', cuerpo: { saldo_apertura: Number(saldo || 0) } });
      avisos.mostrar('Caja abierta. Ya puedes registrar ventas.');
      onAbierta();
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <form className="tarjeta apertura" onSubmit={abrir} noValidate>
      <h2 className="titulo-m">La caja de hoy no está abierta</h2>
      <p className="tenue">Indica con cuánto efectivo empiezas el día. Sin la caja abierta no se pueden registrar ventas.</p>
      <Campo
        etiqueta="Saldo de apertura"
        inputMode="numeric"
        autoComplete="off"
        value={saldo}
        onChange={(e) => setSaldo(soloDigitos(e.target.value))}
        ayuda={sugerido ? `Sugerido: ${pesos(sugerido)} (efectivo con el que cerró la última caja).` : `Se registrará ${pesos(Number(saldo || 0))}.`}
      />
      <Mensaje>{error}</Mensaje>
      <Boton type="submit" disabled={enviando}>
        {enviando ? 'Abriendo…' : 'Abrir caja'}
      </Boton>
    </form>
  );
}

function VentanaMovimiento({ onCerrar, onGuardado }) {
  const avisos = useAvisos();
  const [tipo, setTipo] = useState('egreso');
  const [concepto, setConcepto] = useState('');
  const [valor, setValor] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function guardar(e) {
    e.preventDefault();
    setError('');
    if (concepto.trim().length < 3) return setError('Escribe el concepto (por ejemplo: compra de bolsas).');
    if (!valor || Number(valor) < 1) return setError('El valor debe ser mayor que cero.');
    setEnviando(true);
    try {
      await api('/api/caja/hoy/movimientos', { metodo: 'POST', cuerpo: { tipo, concepto: concepto.trim(), valor: Number(valor) } });
      avisos.mostrar(tipo === 'egreso' ? 'Egreso registrado.' : 'Ingreso registrado.');
      onGuardado();
      onCerrar();
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <Ventana titulo="Registrar movimiento de caja" onCerrar={onCerrar}>
      <form onSubmit={guardar} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Segmentado
          suave
          etiqueta="Tipo de movimiento"
          valor={tipo}
          onCambiar={setTipo}
          opciones={[
            { valor: 'egreso', texto: 'Egreso (sale dinero)' },
            { valor: 'ingreso', texto: 'Ingreso (entra dinero)' },
          ]}
        />
        <Campo etiqueta="Concepto" placeholder="Ej.: pago de domicilio" maxLength={150} value={concepto} onChange={(e) => setConcepto(e.target.value)} />
        <Campo etiqueta="Valor" inputMode="numeric" autoComplete="off" placeholder="0" value={valor} onChange={(e) => setValor(soloDigitos(e.target.value))} ayuda={valor ? pesos(Number(valor)) : undefined} />
        <Mensaje>{error}</Mensaje>
        <div style={{ display: 'flex', gap: 12 }}>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" style={{ flex: 1 }} disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar movimiento'}
          </Boton>
        </div>
      </form>
    </Ventana>
  );
}

function textoDiferencia(dif) {
  if (dif === 0) return 'Coincide con lo esperado';
  return dif > 0 ? `Sobran ${pesos(dif)}` : `Faltan ${pesos(Math.abs(dif))}`;
}

function VentanaCierre({ caja, esPendiente = false, onCerrar, onCerrada }) {
  const avisos = useAvisos();
  const [contado, setContado] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const diferencia = contado === '' ? null : Math.round((Number(contado) - caja.saldo_esperado) * 100) / 100;

  async function cerrar(e) {
    e.preventDefault();
    setError('');
    if (contado === '') return setError('Escribe el efectivo que contaste en la caja.');
    setEnviando(true);
    try {
      const ruta = esPendiente ? '/api/caja/pendiente/cerrar' : '/api/caja/hoy/cerrar';
      const r = await api(ruta, { metodo: 'POST', cuerpo: { saldo_cierre: Number(contado) } });
      avisos.mostrar(`Caja ${esPendiente ? `del ${fechaCompleta(caja.fecha)} ` : ''}cerrada. ${textoDiferencia(r.diferencia)}.`);
      onCerrada();
      onCerrar();
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <Ventana titulo={esPendiente ? `Cerrar caja del ${fechaCompleta(caja.fecha)}` : 'Cerrar caja'} onCerrar={onCerrar}>
      <form onSubmit={cerrar} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p className="tenue">
          Según el sistema debería haber <strong className="cuerpo-fuerte" style={{ color: 'var(--ink-900)' }}>{pesos(caja.saldo_esperado)}</strong> en la caja (apertura más ingresos menos egresos). Cuenta el efectivo y escríbelo:
        </p>
        <Campo etiqueta="Efectivo contado" inputMode="numeric" autoComplete="off" placeholder="0" value={contado} onChange={(e) => setContado(soloDigitos(e.target.value))} ayuda={diferencia === null ? undefined : textoDiferencia(diferencia)} />
        <Mensaje tipo="aviso">
          {esPendiente
            ? 'Al cerrar esta caja pendiente podrás abrir la caja de hoy y continuar con la operación normal.'
            : 'Al cerrar la caja ya no se pueden registrar ventas ni movimientos hoy, y no se puede reabrir.'}
        </Mensaje>
        <Mensaje>{error}</Mensaje>
        <div style={{ display: 'flex', gap: 12 }}>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" style={{ flex: 1 }} disabled={enviando}>
            {enviando ? 'Cerrando…' : esPendiente ? 'Cerrar caja pendiente' : 'Cerrar caja'}
          </Boton>
        </div>
      </form>
    </Ventana>
  );
}

function detalleDeMovimiento(m) {
  if (m.id_venta) return `Venta ${numeroVenta(m.id_venta)} · ${m.productos} ${plural(m.productos, 'producto', 'productos')}`;
  return m.concepto;
}

export default function Caja() {
  const hoy = hoyISO();
  const [ventana, setVentana] = useState(null);
  const estado = useCarga(() => api('/api/caja/hoy'), []);
  const anteriores = useCarga(() => api('/api/reportes/caja', { consulta: { desde: sumarDias(hoy, -30), hasta: sumarDias(hoy, -1) } }), [hoy]);

  if (estado.error) return <div className="pagina"><ErrorCarga error={estado.error} onReintentar={estado.recargar} /></div>;
  if (!estado.datos) return <div className="pagina"><Cargando /></div>;

  const d = estado.datos;
  const caja = d.caja;
  const filas = caja
    ? [
        ...[...d.movimientos].reverse().map((m) => ({
          clave: `m${m.id_mov_caja}`,
          hora: horaCorta(m.fecha_hora),
          detalle: detalleDeMovimiento(m),
          tipo: m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
          monto: pesosConSigno(m.valor, m.tipo === 'ingreso'),
        })),
        { clave: 'apertura', hora: horaCorta(caja.abierta_en), detalle: 'Apertura de caja', tipo: 'Apertura', monto: pesos(caja.saldo_apertura) },
      ]
    : [];
  const ingresosVentas = d.movimientos.filter((m) => m.id_venta).reduce((s, m) => s + m.valor, 0);
  const otrosIngresos = caja ? caja.ingresos - ingresosVentas : 0;
  const ventasContadas = d.movimientos.filter((m) => m.id_venta).length;
  const egresosContados = d.movimientos.filter((m) => m.tipo === 'egreso').length;
  const abierta = caja?.estado === 'abierta';

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo-l">Caja del día</h1>
          <p className="tenue">
            {fechaLarga(d.fecha)}
            {caja && ` · ${abierta ? `Abierta desde las ${horaCorta(caja.abierta_en)}` : `Cerrada a las ${horaCorta(caja.cerrada_en)}`}`}
          </p>
        </div>
        {abierta && (
          <div className="pagina__acciones">
            <Boton variante="secundario" onClick={() => setVentana('movimiento')}>
              Registrar movimiento
            </Boton>
            <Boton onClick={() => setVentana('cierre')}>Cerrar caja</Boton>
          </div>
        )}
      </div>

      {!abierta && caja && (
        <Mensaje tipo="aviso">
          La caja de hoy ya fue cerrada a las {horaCorta(caja.cerrada_en)}. Por regla del negocio, el registro de ventas y movimientos está cerrado por hoy y se reanudará mañana al abrir una nueva caja.
        </Mensaje>
      )}

      {d.caja_pendiente ? (
        <div className="tarjeta apertura" style={{ borderLeft: '4px solid var(--aviso-borde, #d97706)' }}>
          <h2 className="titulo-m">Caja anterior pendiente de cierre</h2>
          <p className="tenue">
            La caja del <strong>{fechaCompleta(d.caja_pendiente.fecha)}</strong> quedó abierta con un saldo esperado de{' '}
            <strong className="cuerpo-fuerte">{pesos(d.caja_pendiente.saldo_esperado)}</strong>.
            Debes cerrarla con el efectivo contado antes de poder abrir la caja de hoy.
          </p>
          <div style={{ marginTop: 12 }}>
            <Boton onClick={() => setVentana('cierre-pendiente')}>
              Cerrar caja del {fechaCompleta(d.caja_pendiente.fecha)}
            </Boton>
          </div>
        </div>
      ) : !caja ? (
        <AbrirCaja sugerido={d.saldo_apertura_sugerido} onAbierta={estado.recargar} />
      ) : (
        <>
          <div className="indicadores">
            <Indicador titulo="Apertura" valor={pesos(caja.saldo_apertura)} detalle="Monto inicial en caja" />
            <Indicador
              titulo="Ingresos por ventas"
              valor={pesos(ingresosVentas)}
              detalle={`${ventasContadas} ${plural(ventasContadas, 'venta', 'ventas')}${otrosIngresos > 0 ? ` · otros ingresos ${pesos(otrosIngresos)}` : ''}`}
            />
            <Indicador titulo="Egresos" valor={pesos(caja.egresos)} detalle={`${egresosContados} ${plural(egresosContados, 'gasto registrado', 'gastos registrados')}`} />
            <Indicador
              titulo={abierta ? 'Saldo actual' : 'Efectivo contado al cierre'}
              valor={pesos(abierta ? caja.saldo_esperado : caja.saldo_cierre)}
              detalle={abierta ? 'Apertura + ingresos − egresos' : `Esperado ${pesos(caja.saldo_esperado)} · ${textoDiferencia(Math.round((caja.saldo_cierre - caja.saldo_esperado) * 100) / 100)}`}
            />
          </div>

          <section className="tarjeta" aria-labelledby="titulo-movimientos">
            <div className="tarjeta__encabezado">
              <h2 className="titulo-s" id="titulo-movimientos">
                Movimientos de hoy
              </h2>
            </div>
            <div className="tabla-envoltura solo-escritorio">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Detalle</th>
                    <th>Tipo</th>
                    <th className="numerico">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.clave}>
                      <td className="nombre" style={{ whiteSpace: 'nowrap' }}>{f.hora}</td>
                      <td>{f.detalle}</td>
                      <td>{f.tipo}</td>
                      <td className="numerico">{f.monto}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="lista solo-movil">
              {filas.map((f) => (
                <li key={f.clave} className="lista__fila">
                  <div className="lista__principal">
                    <span className="cuerpo-fuerte">{f.detalle}</span>
                    <span className="pequeno tenue">
                      {f.hora} · {f.tipo}
                    </span>
                  </div>
                  <span className="cuerpo-fuerte">{f.monto}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {anteriores.datos?.cajas.length > 0 && (
        <section className="tarjeta" aria-labelledby="titulo-anteriores">
          <div className="tarjeta__encabezado">
            <h2 className="titulo-s" id="titulo-anteriores">
              Cajas anteriores (últimos 30 días)
            </h2>
          </div>
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th className="numerico">Apertura</th>
                  <th className="numerico">Ingresos</th>
                  <th className="numerico">Egresos</th>
                  <th className="numerico">Esperado</th>
                  <th className="numerico">Contado</th>
                  <th>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {[...anteriores.datos.cajas].reverse().map((c) => (
                  <tr key={c.id_caja}>
                    <td className="nombre" style={{ whiteSpace: 'nowrap' }}>{fechaCompleta(c.fecha)}</td>
                    <td className="numerico">{pesos(c.saldo_apertura)}</td>
                    <td className="numerico">{pesos(c.ingresos)}</td>
                    <td className="numerico">{pesos(c.egresos)}</td>
                    <td className="numerico">{pesos(c.saldo_esperado)}</td>
                    <td className="numerico">{c.saldo_cierre === null ? '—' : pesos(c.saldo_cierre)}</td>
                    <td>{c.estado === 'abierta' ? 'Sin cerrar' : textoDiferencia(c.diferencia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {!caja && !anteriores.datos?.cajas.length && !anteriores.cargando && <Vacio>Aún no hay cajas registradas.</Vacio>}

      {ventana === 'movimiento' && <VentanaMovimiento onCerrar={() => setVentana(null)} onGuardado={estado.recargar} />}
      {ventana === 'cierre' && caja && (
        <VentanaCierre
          caja={caja}
          onCerrar={() => setVentana(null)}
          onCerrada={() => {
            estado.recargar();
            anteriores.recargar();
          }}
        />
      )}
      {ventana === 'cierre-pendiente' && d.caja_pendiente && (
        <VentanaCierre
          caja={d.caja_pendiente}
          esPendiente
          onCerrar={() => setVentana(null)}
          onCerrada={() => {
            estado.recargar();
            anteriores.recargar();
          }}
        />
      )}
    </div>
  );
}
