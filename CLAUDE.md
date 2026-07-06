# Peporra — Porra/Quiniela de La Liga

## Resumen del proyecto
App de porra (quiniela) de La Liga española para jugar en peñas/grupos de amigos.
No es una app web — se instala desde store (React Native / Expo).

## Stack tecnológico
- **Lenguaje**: TypeScript en todo el proyecto (backend y, cuando se cree, frontend Expo)
- **Frontend**: Expo (React Native) — el usuario viene de MERN/React web, así que reutiliza conocimientos de React/hooks pero compila a app nativa iOS/Android
- **Backend**: Node.js + Express 5 + MongoDB (Mongoose) — TypeScript, ejecutado en dev con `tsx watch` y compilado con `tsc` para producción
- **Base de datos**: MongoDB Atlas, plan free (M0), cluster en región Paris (eu-west-3)
- **Auth**: JWT (access + refresh tokens) — pendiente de implementar
- **Repo**: monorepo en GitHub → https://github.com/josemc96/peporra.git

## Estructura del monorepo
```
peporra/
  /backend
    /src
      /config         ← env.ts, db.ts
      /models
      /controllers
      /routes
      /middleware
      /services       ← footballApi.service.ts (llamadas a la API externa)
      /jobs           ← cron de sincronización de partidos y cálculo de puntos
      /types
      app.ts
      server.ts
    tsconfig.json
    package.json
    .env
    .env.example
  /app                ← proyecto Expo (pendiente de crear)
  .gitignore
  README.md
```

Scripts de `backend/package.json`: `npm run dev` (tsx watch), `npm run build` (tsc → dist/), `npm start` (node dist/server.js), `npm run typecheck` (tsc --noEmit).

## API externa de partidos
- **football-data.org** (free tier) — cubre La Liga, calendario, resultados y horarios.
  Límite: 10 peticiones/min, así que los partidos se sincronizan a la BD propia
  (no se llama a la API en cada request de usuario).
- Alternativa si se necesita más adelante (cuotas, stats avanzadas): API-Football (api-sports.io)

## Modelos de datos (MongoDB / Mongoose)

### User
- email, password (hasheada con bcrypt), nombre/alias visible, avatar opcional, fecha de registro
- Roles: usuario normal vs admin

### Group (peñas)
```js
{
  name: String,
  inviteCode: String,        // código único para unirse (tipo nanoid)
  admin: ObjectId(User),
  members: [ObjectId(User)],
  season: String,             // "2026-2027"
  createdAt: Date
}
```
- Un usuario puede pertenecer a varios grupos
- El ranking se calcula filtrando por grupo, no solo global

### Match
- Jornada, equipos, fecha/hora, resultado, estado (pending/finished)
- Se sincroniza vía cron desde football-data.org

### Prediction (predicción de partido)
```js
{
  user: ObjectId(User),
  match: ObjectId(Match),
  predictedHome: Number,
  predictedAway: Number,
  points: Number,        // calculado al terminar el partido
  status: 'pending' | 'scored'
}
```
- Se bloquea el envío de predicción cuando `now >= match.startTime`

### StandingsPrediction (predicción de clasificación)
```js
{
  user: ObjectId(User),
  season: String,
  phase: 'ida' | 'vuelta',   // jornada 19 o jornada 38
  predictedTable: [{ position: Number, team: String }],
  points: Number,
  status: 'pending' | 'scored'
}
```
- Se predice ANTES de que empiece la temporada
- Se bloquea antes de la jornada 1

## Sistema de puntuación (DEFINITIVO)

### Partidos
- **1 punto** por acertar el signo (victoria local, empate o victoria visitante)
- **3 puntos** por acertar el resultado exacto

```js
function calculatePoints(predHome, predAway, realHome, realAway) {
  const predResult = Math.sign(predHome - predAway);
  const realResult = Math.sign(realHome - realAway);

  if (predHome === realHome && predAway === realAway) return 3; // resultado exacto
  if (predResult === realResult) return 1;                       // acierta signo
  return 0;
}
```

### Clasificación (ida/vuelta)
- **2 puntos** por cada posición exacta acertada en la tabla predicha, tanto en la de la ida
  (jornada 19) como en la de la vuelta (jornada 38) — son dos tablas independientes

```js
function calculateStandingsPoints(predictedTable, realTable) {
  let points = 0;
  predictedTable.forEach(pred => {
    const real = realTable.find(r => r.team === pred.team);
    if (real && real.position === pred.position) points += 2;
  });
  return points;
}
```

- El cálculo de puntos de partidos se hace por lote (job/cron), no en tiempo real:
  revisa partidos `finished` sin puntuar y recorre sus `Prediction` pendientes.

## Estado actual del proyecto
- [x] Cluster de MongoDB Atlas creado y activo (plan free M0, región Paris)
- [x] Usuario de base de datos creado (`pepe`)
- [x] Network Access configurado (0.0.0.0/0 para desarrollo)
- [x] Repo de GitHub creado (monorepo): josemc96/peporra
- [x] Estructura de carpetas del backend (TypeScript)
- [x] `npm init` + instalación de dependencias (express, mongoose, dotenv, cors, bcryptjs, jsonwebtoken + typescript, tsx, @types/*)
- [x] `.env` con MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET, FOOTBALL_API_KEY (placeholders — falta URI real de Atlas)
- [x] `server.ts` con conexión a Mongo + endpoint `/health`
- [ ] Modelos Mongoose (User, Match, Prediction, Group, StandingsPrediction)
- [ ] Auth (registro/login JWT con refresh tokens)
- [ ] Sincronización de partidos desde football-data.org (cron)
- [ ] Endpoints de predicciones (crear, listar, bloqueo por fecha)
- [ ] Job de cálculo de puntos
- [ ] Proyecto Expo (frontend) — pendiente de crear en `/app`

## Preferencias del usuario
- Prefiere respuestas concisas y prácticas
- Viene de stack MERN/React, cómodo con contenido técnico en español o inglés
- Dispuesto a aprender tecnología nueva si aporta valor al proyecto
