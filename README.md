# Inst Schedule (Node.js + SQLite)

Proyecto pequeño y escalable para gestionar agenda de capacitaciones.

## Requisitos

- Node.js 22+
- pnpm (opcional, recomendado)

## Instalar pnpm en Windows

Si `pnpm` no es reconocido, instala globalmente:

```bash
npm install -g pnpm
```

Luego cierra y vuelve a abrir PowerShell.

Si aun no aparece, usa temporalmente:

```bash
npx pnpm --version
```

## Configuracion

1. Copiar archivo de entorno:

```bash
copy .env.example .env
```

2. Instalar dependencias:

```bash
pnpm install
```

Alternativa si el comando global no esta disponible:

```bash
npx pnpm install
```

3. Inicializar base de datos:

```bash
pnpm db:init
```

Alternativa:

```bash
npx pnpm db:init
```

4. Iniciar servidor:

```bash
pnpm dev
```

Alternativa:

```bash
npx pnpm dev
```

Aplicacion en: http://localhost:3000

## Produccion (Docker + rootgamez.dev)

Este proyecto incluye despliegue production-ready con Docker Compose + Caddy (SSL automatico con Let's Encrypt).

### 1) Requisitos del servidor

- Docker y Docker Compose instalados
- Puertos 80 y 443 abiertos
- DNS A/AAAA de `rootgamez.dev` (y opcional `www.rootgamez.dev`) apuntando al servidor

### 2) Variables de entorno de produccion

Crea `.env` en el servidor con una clave admin fuerte:

```bash
ADMIN_PASSWORD=CAMBIA_ESTA_CLAVE_SUPER_SEGURA
```

Notas:

- `CORS_ORIGIN` ya viene en `docker-compose.yml` para `https://rootgamez.dev` y `https://www.rootgamez.dev`.
- La base SQLite persistira en el volumen Docker `app_data`.

### 3) Levantar en produccion

```bash
docker compose up -d --build
```

### 4) Verificar

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f caddy
```

La app quedara disponible en:

- `https://rootgamez.dev`
- `https://www.rootgamez.dev`

### 5) Actualizar version

```bash
git pull
docker compose up -d --build
```

### 6) Backup de SQLite

El archivo DB esta en el volumen `app_data` (`/app/data/app.db` dentro del contenedor `app`).
Haz backup periodico de ese volumen.

## Arquitectura

- public/: Frontend HTML/CSS/JS vanilla.
- src/server.js: Arranque de Express.
- src/routes/api.js: Endpoints de negocio.
- src/auth.js: Login admin y middleware.
- src/db/connection.js: Conexion SQLite.
- data/seed-data.json: Datos hardcodeados movidos a semilla.
- scripts/init-db.js: Script inicial de DB.

## Reglas implementadas

- Solo admin puede editar o eliminar horarios existentes.
- Cualquier usuario puede reservar un slot vacio si la semana no esta bloqueada.
- Concurrencia protegida en backend (transaccion + restriccion unica por slot/semana).
- Bloqueo general de agenda por admin.
- Los bloqueos manuales se guardan por semana activa y no se arrastran a semanas siguientes.
- CRUD de profesores, aulas y grados desde la interfaz admin.
- Bloqueo manual de franjas horarias por admin, con liberacion de reservas de esa semana.

## Seguridad de autenticacion

- Claves admin con hash `bcrypt`.
- Sesiones admin persistentes en DB con expiracion.
- Logout invalida token de sesion.
- Migracion automatica de clave legacy (texto plano) a hash en el primer login exitoso.
