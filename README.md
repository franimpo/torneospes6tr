# Gestor de torneos PES 6 — Netlify + Supabase

Web pública de torneos PES 6, con tabla automática, participantes y equipos por separado, fixture por fechas (solo ida / ida y vuelta) y edición mediante clave compartida. Admite muchos torneos e historial, con límite configurable de 2 a 64 participantes por torneo.

## 1. Crear la base de datos

1. Crear un proyecto gratuito en https://supabase.com.
2. Abrir **SQL Editor** y ejecutar el contenido de `supabase/migrations/001_schema.sql`.
3. Ir a **Project Settings / API** (o **Connect**, según la interfaz) y copiar la **Project URL** y la clave **anon/public** (o *publishable*). **Nunca usar service_role en Netlify**.

## 2. Crear la función de edición segura

El archivo `supabase/functions/manage/index.ts` contiene la función que valida la contraseña EN EL SERVIDOR antes de cualquier escritura. El navegador nunca recibe `EDIT_PASSWORD` ni `service_role`.

Requiere Supabase CLI. En la carpeta del proyecto ejecutar:

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase secrets set EDIT_PASSWORD=tr
npx supabase functions deploy manage --no-verify-jwt
```

`TU_PROJECT_REF` aparece en la URL de Supabase / General Settings. Las variables `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` vienen provistas por Supabase dentro de las Edge Functions alojadas; si el proyecto no las proporciona automáticamente, configurarlas como secretos SOLO en Supabase, nunca en Netlify ni en el navegador.

**Importante:** `tr` es una contraseña MUY débil, tal como se solicitó. Cualquiera que la conozca puede crear, cambiar y eliminar torneos. Para una web pública, recomendamos cambiarla por una clave larga. La función acepta solicitudes sin JWT porque habilitamos edición pública con contraseña, por lo que conviene añadir rate limiting / protección antiabusos antes de compartir masivamente.

## 3. Ejecutar en tu computadora

Instalar Node.js 20 o superior, después:

```bash
npm install
cp .env.example .env
```

En Windows copiar `.env.example` como `.env`. Completar allí:

```dotenv
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU-CLAVE-PUBLICA
```

Iniciar:

```bash
npm run dev
```

## 4. Publicar en Netlify

1. Subir esta carpeta a un repositorio de GitHub (sin `.env`).
2. En Netlify: **Add new project → Import an existing project → GitHub** y elegir el repositorio.
3. Build command: `npm run build`, Publish directory: `dist`.
4. En **Project configuration → Environment variables**, agregar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los valores públicos obtenidos de Supabase.
5. Deploy. Después de modificar variables, volver a desplegar el sitio.

La función de Supabase debe estar desplegada **antes** de intentar iniciar edición. El archivo `netlify.toml` habilita las rutas de SPA.

## Flujo de uso

1. Ingresar con la contraseña compartida (por defecto `tr`, configurada en Supabase).
2. Crear torneo con nombre, edición, cupo de jugadores y modalidad.
3. Agregar exactamente la cantidad de participantes definida; cada uno tiene **nombre del participante** y **nombre del equipo/selección**.
4. Generar fixture; partidos con descanso automático si hay una cantidad impar. No se puede alterar el cupo después de crear el torneo ni eliminar jugadores con fixture existente; sí editar sus nombres y equipos.
5. Cargar o corregir goles desde el fixture. Un marcador vacío es un partido pendiente, sin incidencia en la tabla.
6. La tabla ordena por puntos, diferencia de gol y goles a favor. Para ida y vuelta se puede ver tabla general y tablas por rueda.
7. Crear otros torneos: cada uno conserva su información.

## Notas técnicas

- **No hay cuentas individuales**: cualquiera que sepa la contraseña puede realizar las mismas acciones.
- La contraseña se almacena en `sessionStorage` solo durante la pestaña/sesión actual; **no** en el código fuente. Como toda clave que se escribe en un navegador, puede verse en el propio dispositivo o en su tráfico HTTPS descifrado por el usuario; la comunicación de red se realiza mediante HTTPS.
- Resultados visibles sin contraseña. Se consultan de nuevo automáticamente cada 20 segundos; también hay botón de actualizar en portada.
- RLS permite lectura pública de tablas y deniega escritura directa desde credenciales públicas. La Edge Function emplea service_role **solo del lado del servidor**.
- No hay migración automática desde el ZIP anterior de PHP/MySQL: este proyecto crea una **nueva base de datos vacía**.
- Primera versión diseñada para torneos amistosos; para despliegues públicos de alto tráfico conviene agregar bloqueo de solicitudes, auditoría de ediciones y reglas de acceso más granulares.
