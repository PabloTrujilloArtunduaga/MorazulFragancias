import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/cliente.js';
import { useCarga } from '../util/ganchos.js';
import { fechaLarga, horaCorta, hoyISO, numero, pesos, plural, saludo, sumarDias } from '../util/formato.js';
import Boton from '../componentes/Boton.jsx';
import Etiqueta from '../componentes/Etiqueta.jsx';
import VentanaEntrada from '../componentes/VentanaEntrada.jsx';
import { Cargando, ErrorCarga, Vacio } from '../componentes/Estados.jsx';

function Indicador({ titulo, valor, detalle, aviso = false }) {
  return (
    <div className="tarjeta indicador">
      <p className="pequeno tenue">{titulo}</p>
      <p className={`numero-grande${aviso ? ' indicador__valor--aviso' : ''}`}>{valor}</p>
      <p className="pequeno tenue">{detalle}</p>
    </div>
  );
}

export default function Inicio() {
  const hoy = hoyISO();
  const [entrada, setEntrada] = useState(null);

  const caja = useCarga(() => api('/api/caja/hoy'), []);
  const ventas = useCarga(() => api('/api/ventas', { consulta: { desde: hoy, hasta: hoy, limite: 1 } }), [hoy]);
  const inventario = useCarga(() => api('/api/inventario/resumen'), []);
  const alertas = useCarga(() => api('/api/alertas', { consulta: { estado: 'activa', limite: 4 } }), []);
  const masVendidos = useCarga(() => api('/api/reportes/mas-vendidos', { consulta: { desde: sumarDias(hoy, -6), hasta: hoy, limite: 5 } }), [hoy]);

  const todas = [caja, ventas, inventario, alertas, masVendidos];
  const error = todas.find((c) => c.error)?.error;
  const cargando = todas.some((c) => c.cargando && !c.datos);
  const recargarTodo = () => todas.forEach((c) => c.recargar());

  if (error) return <div className="pagina"><ErrorCarga error={error} onReintentar={recargarTodo} /></div>;
  if (cargando) return <div className="pagina"><Cargando /></div>;

  const r = inventario.datos.resumen;
  const cajaHoy = caja.datos.caja;
  const registrados = r.activos + r.borradores + r.inactivos;
  let detalleCaja = 'La caja de hoy no está abierta';
  if (cajaHoy?.estado === 'abierta') detalleCaja = `Caja abierta desde las ${horaCorta(cajaHoy.abierta_en)}`;
  if (cajaHoy?.estado === 'cerrada') detalleCaja = `Caja cerrada a las ${horaCorta(cajaHoy.cerrada_en)}`;

  const saldoCajaMostrar = cajaHoy
    ? pesos(cajaHoy.estado === 'cerrada' ? cajaHoy.saldo_cierre : cajaHoy.saldo_esperado)
    : '—';

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo-l">{saludo()}</h1>
          <p className="tenue">{fechaLarga(hoy)}</p>
        </div>
        <Link to="/vender" className="boton boton--primario">
          Registrar venta
        </Link>
      </div>

      <div className="indicadores">
        <Indicador
          titulo="Ventas de hoy"
          valor={pesos(ventas.datos.suma_total)}
          detalle={`${numero(ventas.datos.total)} ${plural(ventas.datos.total, 'venta registrada', 'ventas registradas')}`}
        />
        <Indicador
          titulo={cajaHoy?.estado === 'cerrada' ? 'Saldo al cierre' : 'Saldo de caja'}
          valor={saldoCajaMostrar}
          detalle={detalleCaja}
        />
        <Indicador
          titulo="Stock crítico"
          valor={numero(r.alertas_activas)}
          detalle={plural(r.alertas_activas, 'producto por debajo del umbral', 'productos por debajo del umbral')}
          aviso={r.alertas_activas > 0}
        />
        <Indicador titulo="Productos activos" valor={numero(r.activos)} detalle={`de ${numero(registrados)} productos registrados`} />
      </div>

      <div className="columnas">
        <section className="tarjeta" aria-labelledby="titulo-alertas">
          <div className="tarjeta__encabezado">
            <h2 className="titulo-s" id="titulo-alertas">
              Alertas de stock
            </h2>
            <Link to="/alertas" className="boton boton--texto">
              Ver todas
            </Link>
          </div>
          {alertas.datos.alertas.length === 0 ? (
            <Vacio>No hay alertas de stock pendientes.</Vacio>
          ) : (
            <ul className="lista">
              {alertas.datos.alertas.map((a) => (
                <li key={a.id_alerta} className="lista__fila">
                  <div className="lista__principal">
                    <span className="cuerpo-fuerte">{a.producto}</span>
                    <span className="pequeno tenue">
                      Quedan {a.existencias_actuales} · umbral {a.umbral_actual}
                    </span>
                  </div>
                  <div className="lista__acciones">
                    <Etiqueta estado={a.existencias_actuales === 0 ? 'Agotado' : 'Crítico'} />
                    <Boton variante="texto" className="solo-escritorio" onClick={() => setEntrada({ id_producto: a.id_producto, nombre: a.producto })}>
                      Registrar entrada
                    </Boton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tarjeta" aria-labelledby="titulo-top">
          <div className="tarjeta__encabezado">
            <h2 className="titulo-s" id="titulo-top">
              Más vendidos esta semana
            </h2>
          </div>
          {masVendidos.datos.ranking.length === 0 ? (
            <Vacio>Todavía no hay ventas esta semana.</Vacio>
          ) : (
            <ol className="lista" style={{ listStyle: 'none' }}>
              {masVendidos.datos.ranking.map((p) => (
                <li key={p.id_producto} className="lista__fila">
                  <span style={{ display: 'flex', gap: 12 }}>
                    <span className="etiqueta-texto mudo">{p.posicion}</span>
                    <span>{p.nombre}</span>
                  </span>
                  <span className="cuerpo-fuerte tenue" style={{ whiteSpace: 'nowrap' }}>
                    {numero(p.unidades_vendidas)} {plural(p.unidades_vendidas, 'unidad', 'unidades')}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {entrada && (
        <VentanaEntrada
          producto={entrada}
          onCerrar={() => setEntrada(null)}
          onGuardado={() => {
            alertas.recargar();
            inventario.recargar();
          }}
        />
      )}
    </div>
  );
}
