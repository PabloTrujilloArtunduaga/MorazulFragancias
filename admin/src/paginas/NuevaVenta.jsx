import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api/cliente.js';
import { useCarga, useEsMovil, useRetraso } from '../util/ganchos.js';
import { cantidadEnCarrito, cuerpoDeVenta } from '../util/carrito.js';
import { numeroVenta, pesos, plural } from '../util/formato.js';
import { useCarrito } from '../sesion/CarritoContext.jsx';
import { useAvisos } from '../componentes/Avisos.jsx';
import Boton from '../componentes/Boton.jsx';
import Etiqueta from '../componentes/Etiqueta.jsx';
import Icono from '../componentes/Icono.jsx';
import { Cargando, ErrorCarga, Mensaje, Vacio } from '../componentes/Estados.jsx';

function textoDeProblema(p) {
  const nombre = p.nombre ? `${p.nombre}: ` : '';
  if (p.solicitado !== undefined) return `${nombre}pediste ${p.solicitado} y solo quedan ${p.disponible}.`;
  return `${nombre}${p.motivo}.`;
}

function Carrito({ cajaAbierta, onVendida }) {
  const { carrito, total, cambiar, vaciar } = useCarrito();
  const avisos = useAvisos();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  async function confirmar() {
    setError(null);
    setEnviando(true);
    try {
      const r = await api('/api/ventas', { metodo: 'POST', cuerpo: cuerpoDeVenta(carrito) });
      avisos.mostrar(`Venta ${numeroVenta(r.venta.id_venta)} registrada por ${pesos(r.venta.total)}.`);
      vaciar();
      onVendida?.();
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="tarjeta" aria-labelledby="titulo-carrito">
      <div className="tarjeta__encabezado">
        <h2 className="titulo-s" id="titulo-carrito">
          Venta actual
        </h2>
        <span className="pequeno tenue">
          {carrito.lineas.length} {plural(carrito.lineas.length, 'producto', 'productos')}
        </span>
      </div>

      {carrito.lineas.length === 0 ? (
        <Vacio>Agrega productos de la lista para armar la venta.</Vacio>
      ) : (
        <div>
          {carrito.lineas.map((l) => (
            <div key={l.id_producto} className="linea-carrito">
              <span className="cuerpo-fuerte">{l.nombre}</span>
              <span className="linea-carrito__total">{pesos(l.precio * l.cantidad)}</span>
              <span className="pequeno tenue">{pesos(l.precio)} c/u</span>
              <div className="cantidad" role="group" aria-label={`Cantidad de ${l.nombre}`} style={{ justifySelf: 'end' }}>
                <button type="button" onClick={() => cambiar(l.id_producto, -1)} aria-label={l.cantidad === 1 ? `Quitar ${l.nombre}` : `Restar una unidad de ${l.nombre}`}>
                  <Icono nombre="minus" />
                </button>
                <output aria-live="polite">{l.cantidad}</output>
                <button type="button" onClick={() => cambiar(l.id_producto, 1)} disabled={l.cantidad >= l.existencias} aria-label={`Sumar una unidad de ${l.nombre}`}>
                  <Icono nombre="plus" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="carrito__resumen">
        <div className="carrito__total">
          <span className="cuerpo-fuerte">Total</span>
          <span className="titulo-l" style={{ fontWeight: 800 }}>
            {pesos(total)}
          </span>
        </div>
        {error && (
          <Mensaje>
            <strong>{error.message}</strong>
            {Array.isArray(error.detalles) && (
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {error.detalles.map((p) => (
                  <li key={p.id_producto}>{textoDeProblema(p)}</li>
                ))}
              </ul>
            )}
          </Mensaje>
        )}
        <Boton bloque onClick={confirmar} disabled={enviando || !cajaAbierta || carrito.lineas.length === 0}>
          {enviando ? 'Registrando…' : 'Confirmar venta'}
        </Boton>
        <Boton variante="texto" onClick={() => { vaciar(); setError(null); }} disabled={carrito.lineas.length === 0} style={{ alignSelf: 'center', fontSize: 15, lineHeight: '24px' }}>
          Cancelar venta
        </Boton>
      </div>
    </section>
  );
}

export default function NuevaVenta({ soloCarrito = false }) {
  const movil = useEsMovil();
  const navegar = useNavigate();
  const { carrito, total, agregar } = useCarrito();
  const [busqueda, setBusqueda] = useState('');
  const q = useRetraso(busqueda.trim(), 250);

  const caja = useCarga(() => api('/api/caja/hoy'), []);
  // Sin búsqueda se listan los productos con existencias; al buscar también aparecen los agotados.
  const lista = useCarga(
    () => api('/api/productos', { consulta: { estado: 'activo', q: q || undefined, con_stock: q ? undefined : 'true', limite: 30 } }),
    [q]
  );

  if (soloCarrito && !movil) return <Navigate to="/vender" replace />;

  const cajaAbierta = caja.datos?.caja?.estado === 'abierta';
  const cajaCerrada = caja.datos?.caja?.estado === 'cerrada';
  const productos = lista.datos?.productos ?? [];

  return (
    <div className="pagina">
      <h1 className="solo-lectores">{soloCarrito ? 'Venta actual' : 'Nueva venta'}</h1>

      {caja.datos && !cajaAbierta && (
        <Mensaje tipo="aviso">
          {cajaCerrada ? (
            'La caja de hoy ya fue cerrada: no se pueden registrar más ventas hoy. Podrás vender mañana cuando se abra la nueva caja.'
          ) : (
            <>
              Abre la caja del día antes de registrar ventas.{' '}
              <Link to="/caja" className="cuerpo-fuerte" style={{ textDecoration: 'underline' }}>
                Ir a la caja
              </Link>
            </>
          )}
        </Mensaje>
      )}

      <div className="venta">
        <div className={soloCarrito ? 'solo-escritorio' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div className="buscador">
            <Icono nombre="search" />
            <input
              className="entrada"
              type="search"
              aria-label="Buscar producto para agregar"
              placeholder="Buscar producto para agregar"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoComplete="off"
            />
          </div>
          <section className="tarjeta" aria-label="Productos disponibles">
            {lista.error ? (
              <ErrorCarga error={lista.error} onReintentar={lista.recargar} />
            ) : !lista.datos ? (
              <Cargando />
            ) : productos.length === 0 ? (
              <Vacio>{q ? 'No se encontraron productos activos con ese nombre.' : 'No hay productos con existencias para vender.'}</Vacio>
            ) : (
              productos.map((p) => {
                const enCarrito = cantidadEnCarrito(carrito, p.id_producto);
                const sinStock = p.existencias === 0;
                const tope = enCarrito >= p.existencias;
                return (
                  <div key={p.id_producto} className="producto-fila">
                    <div className="producto-fila__datos">
                      <span className="cuerpo-fuerte">{p.nombre}</span>
                      <span className="pequeno tenue">
                        <span className="solo-movil">{pesos(p.precio_venta)} · </span>
                        {sinStock ? 'Sin existencias' : `Quedan ${p.existencias}`}
                      </span>
                    </div>
                    <span className="solo-escritorio">
                      <Etiqueta estado={p.estado_stock} />
                    </span>
                    <span className="producto-fila__precio solo-escritorio">{pesos(p.precio_venta)}</span>
                    <Boton variante="secundario" className="solo-escritorio" disabled={sinStock || tope} onClick={() => agregar(p)}>
                      Agregar
                    </Boton>
                    <Boton className="solo-movil boton--cuadrado" disabled={sinStock || tope} onClick={() => agregar(p)} aria-label={`Agregar ${p.nombre}`}>
                      <Icono nombre="plus" />
                    </Boton>
                  </div>
                );
              })
            )}
          </section>
        </div>

        <div className={`venta__carrito${!soloCarrito ? ' venta__carrito--oculto' : ''}`} style={!movil ? { display: 'block' } : undefined}>
          <Carrito cajaAbierta={cajaAbierta} onVendida={() => { lista.recargar(); caja.recargar(); if (soloCarrito) navegar('/vender'); }} />
        </div>
      </div>

      {!soloCarrito && carrito.lineas.length > 0 && (
        <Link to="/vender/carrito" className="barra-venta solo-movil">
          <span>
            <span className="pequeno" style={{ display: 'block' }}>
              {carrito.lineas.length} {plural(carrito.lineas.length, 'producto', 'productos')}
            </span>
            <strong>{pesos(total)}</strong>
          </span>
          <span className="cuerpo-fuerte">Ver venta</span>
        </Link>
      )}
    </div>
  );
}
