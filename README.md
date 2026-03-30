# Inst Schedule (Node.js + SQLite)

Proyecto pequeño y escalable para gestionar agenda de capacitaciones.

## Requisitos

- Node.js 18+
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
- Slots permanentemente bloqueados definidos en semilla.
