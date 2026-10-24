'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
const config = require('../src/config');

const raiz = path.resolve(__dirname, '../..');

const migraciones = [
  {
    nombre: '001_morazul_modelo_relacional_v1.sql',
    archivo: 'db/morazul_modelo_relacional_v1.sql',
    sha256: 'fb362cb03cb13c8595eff58933102f2f382a1c5278a15aa10e6f8d1e193725a5'
  },
  {
    nombre: '002_fragancia_y_presentacion.sql',
    archivo: 'db/migrations/002_fragancia_y_presentacion.sql',
    sha256: 'aae613533669a18605a0206c7d9586f1a71c0a5c2111901d731ddbcfb65095b6'
  },
  {
    nombre: '003_carga_catalogo.sql',
    archivo: 'db/migrations/003_carga_catalogo.sql',
    sha256: '9d35705070631c0cf8b3909af397b8b1db5484707f87bc1a3b78299fafa9b98d'
  },
  {
    nombre: '004_venta_solo_productos_activos.sql',
    archivo: 'db/migrations/004_venta_solo_productos_activos.sql',
    sha256: 'b912831d003f539f33121ee56e93418fd6288695759380d013ceb406669aa45d'
  },
  {
    nombre: '005_solo_30ml.sql',
    archivo: 'db/migrations/005_solo_30ml.sql',
    sha256: '2de6381f1a0adfe814b9911f94dc1690e6bcddd33c85e99bbac64411f3f4bbc0'
  }
];

function comprobarConfiguracion() {
  const db = config.db;

  if (
    config.enPruebas ||
    db.nombre !== 'neondb' ||
    !String(db.host || '').includes('neon.tech') ||
    !db.clave ||
    !db.ssl
  ) {
    throw new Error(
      'Instalación cancelada: no se cumplen las condiciones de seguridad para Neon.'
    );
  }
}

function cargarSQL(m) {
  const ruta = path.join(raiz, m.archivo);
  const sql = fs.readFileSync(ruta, 'utf8');
  const huella = crypto.createHash('sha256').update(sql).digest('hex');

  if (huella !== m.sha256) {
    throw new Error(
      `La huella de ${m.archivo} no coincide. No se ejecutará.`
    );
  }

  // Quitamos únicamente las transacciones externas del archivo.
  // El instalador controla BEGIN/COMMIT junto con el registro.
  let contenido = sql.replace(/^\s*BEGIN;\s*$/m, '');
  contenido = contenido.replace(/^\s*COMMIT;\s*$/m, '');

  return contenido;
}

async function main() {
  comprobarConfiguracion();

  // Validar todos los archivos antes de modificar la base.
  const archivos = migraciones.map(m => ({
    migracion: m,
    sql: cargarSQL(m)
  }));

  const db = config.db;
  const client = new Client({
    host: db.host,
    port: db.puerto,
    database: db.nombre,
    user: db.usuario,
    password: db.clave,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 15000,
    application_name: 'morazul-migration-installer'
  });

  let conectado = false;

  try {
    await client.connect();
    conectado = true;

    const conexion = await client.query(`
      SELECT
        current_database() AS base,
        current_user AS usuario,
        current_schema() AS esquema,
        version() AS version
    `);

    if (
      conexion.rows[0].base !== 'neondb' ||
      conexion.rows[0].esquema !== 'public'
    ) {
      throw new Error('Conexión cancelada: base o esquema inesperados.');
    }

    console.log('Conexión confirmada a neondb / public.');
    console.log(conexion.rows[0].version);

    await client.query('SELECT pg_advisory_lock(728194, 1)');

    const registroExiste = await client.query(`
      SELECT to_regclass('public.schema_migrations') AS nombre
    `);

    let registroConFilas = false;

    if (registroExiste.rows[0].nombre) {
      const previas = await client.query(`
        SELECT count(*)::int AS total
        FROM public.schema_migrations
      `);
      registroConFilas = previas.rows[0].total > 0;
    }

    const objetos = await client.query(`
      SELECT count(*)::int AS total
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
        AND c.relname <> 'schema_migrations'
    `);

    if (!registroConFilas && objetos.rows[0].total > 0) {
      throw new Error(
        'Instalación cancelada: public contiene objetos no registrados. Revisión manual necesaria.'
      );
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const item of archivos) {
      const { migracion: m, sql } = item;

      const existente = await client.query(
        `SELECT checksum FROM public.schema_migrations WHERE name = $1`,
        [m.nombre]
      );

      if (existente.rows.length) {
        if (existente.rows[0].checksum !== m.sha256) {
          throw new Error(
            `La huella registrada para ${m.nombre} no coincide. Se detiene la instalación.`
          );
        }

        console.log(`YA APLICADA: ${m.nombre}`);
        continue;
      }

      console.log(`APLICANDO: ${m.nombre}`);

      try {
        await client.query('BEGIN');
        await client.query(sql);

        await client.query(
          `INSERT INTO public.schema_migrations (name, checksum)
           VALUES ($1, $2)`,
          [m.nombre, m.sha256]
        );

        await client.query('COMMIT');
        console.log(`CORRECTA: ${m.nombre}`);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(
          `Falló ${m.nombre}; su transacción fue revertida. Detalle: ${error.message}`
        );
      }
    }

    const verificacion = await client.query(`
      SELECT
        (SELECT count(*) FROM public.categoria) AS categorias,
        (SELECT count(*) FROM public.fragancia) AS fragancias,
        (SELECT count(*) FROM public.producto) AS productos,
        (SELECT count(*) FROM public.imagen_generica) AS imagenes_genericas
    `);

    const presentaciones = await client.query(`
      SELECT presentacion_ml, count(*) AS cantidad
      FROM public.producto
      GROUP BY presentacion_ml
      ORDER BY presentacion_ml
    `);

    const objetosFinales = await client.query(`
      SELECT
        (SELECT count(*) FROM information_schema.views
         WHERE table_schema = 'public') AS vistas,
        (SELECT count(*) FROM information_schema.triggers
         WHERE trigger_schema = 'public') AS triggers
    `);

    const aplicadas = await client.query(`
      SELECT name, applied_at
      FROM public.schema_migrations
      ORDER BY name
    `);

    console.log('\n--- RESUMEN DE LA BASE ---');
    console.table(verificacion.rows);
    console.log('Presentaciones:');
    console.table(presentaciones.rows);
    console.log('Objetos:');
    console.table(objetosFinales.rows);
    console.log('Registro de migraciones:');
    console.table(aplicadas.rows);
    console.log('\nInstalación completada y verificada.');
  } finally {
    if (conectado) {
      await client.end().catch(() => {});
    }
  }
}

main().catch(error => {
  console.error('\nINSTALACIÓN DETENIDA:');
  console.error(error.message);
  process.exitCode = 1;
});
