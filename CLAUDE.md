# Peporra — Porra/Quiniela de La Liga

## Resumen del proyecto
App de porra (quiniela) de La Liga española para jugar en peñas/grupos de amigos.
No es una app web — se instala desde store (React Native / Expo).

## Stack tecnológico
- **Lenguaje**: TypeScript en todo el proyecto (backend y, cuando se cree, frontend Expo)
- **Frontend**: Expo (React Native) — el usuario viene de MERN/React web, así que reutiliza conocimientos de React/hooks pero compila a app nativa iOS/Android
- **Backend**: Node.js + Express 5 + MongoDB (Mongoose) — TypeScript, ejecutado en dev con `tsx watch` y compilado con `tsc` para producción
- **Base de datos**: MongoDB Atlas, plan free (M0), cluster en región Paris (eu-west-3)
- **Auth**: JWT (access + refresh tokens) — implementado, ver sección "Autenticación" más abajo
- **Repo**: monorepo en GitHub → https://github.com/josemc96/peporra.git

## Estructura del monorepo
```
peporra/
  /backend
    /src
      /config         ← env.ts, db.ts
      /models
      /controllers    ← auth.controller.ts, group.controller.ts, admin.controller.ts, match.controller.ts
      /routes         ← auth.routes.ts, group.routes.ts, admin.routes.ts, match.routes.ts
      /middleware     ← auth.middleware.ts (requireAuth/requireAdmin), errorHandler.ts
      /services
        /auth         ← password.service.ts (bcrypt), token.service.ts (JWT), types.ts
        /rules        ← motor de reglas: evaluadores, registro, resolveActiveRules, resolveMultiplier
        footballApi.service.ts (llamadas a football-data.org)
      /jobs           ← syncMatches.job.ts, scheduler.ts (cron cada 10 minutos); cálculo de puntos pendiente
      /scripts        ← seedRules.ts (siembra el catálogo Rule en Mongo)
      /utils          ← AppError.ts
      /types          ← enums.ts, express.d.ts (augmenta Request.user)
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

Scripts de `backend/package.json`: `npm run dev` (tsx watch), `npm run build` (tsc → dist/), `npm start` (node dist/server.js), `npm run typecheck` (tsc --noEmit), `npm run seed:rules` (siembra el catálogo `Rule`).

## API externa de partidos
- **football-data.org** (free tier) — cubre La Liga (código de competición `PD`), calendario,
  resultados y horarios. Límite: 10 peticiones/min, así que los partidos se sincronizan a la
  BD propia (no se llama a la API en cada request de usuario).
- Alternativa si se necesita más adelante (cuotas, stats avanzadas): API-Football (api-sports.io)
- **Sincronización** (`services/footballApi.service.ts` + `jobs/syncMatches.job.ts`):
  - `env.currentSeason` (`CURRENT_SEASON`, ej. `2026-2027`) se traduce al año de inicio que
    espera football-data.org (`2026`) para pedir `/competitions/PD/matches?season=2026`.
  - Cada partido tiene un `Match.externalId` (id de football-data.org) para hacer upsert fiable
    sin duplicar ni depender de que la fecha/hora no cambie (aplazamientos, etc.)
  - `jobs/scheduler.ts` programa la sincronización cada 10 minutos con `node-cron` (se omite si no
    hay `FOOTBALL_API_KEY` configurada)
  - `POST /api/admin/sync-matches` (requiere `role: admin`): fuerza una sincronización manual
    sin esperar al cron, útil para pruebas o para forzar un resync
  - `GET /api/matches` (requiere `requireAuth`, cualquier usuario): lista los partidos ya
    guardados en Mongo — filtros opcionales por query string `season`, `matchday`, `competition`.
    Es la única forma de "ver" lo que trajo la sincronización; el sync en sí no devuelve la lista.

## Autenticación (JWT)
- `POST /api/auth/register`, `/login`, `/refresh`, `/logout` (protegido), `GET /api/auth/me` (protegido)
- Access token corto (`JWT_ACCESS_EXPIRES_IN`, 15m) firmado con `JWT_SECRET`; refresh token largo
  (`JWT_REFRESH_EXPIRES_IN`, 30d) firmado con `JWT_REFRESH_SECRET`. Ambos JWT sin estado (no se
  guardan en BD) — se validan por firma + expiración.
- `User.tokenVersion` (número, empieza en 0): el refresh token incluye el `tokenVersion` con el
  que se emitió; `logout` incrementa el contador, invalidando de golpe todos los refresh tokens
  ya emitidos para ese usuario (no hay tabla de tokens revocados ni rotación por token individual).
- `requireAuth` (middleware): exige `Authorization: Bearer <accessToken>`, cuelga `req.user =
  { id, role }` (tipo aumentado en `types/express.d.ts`). `requireAdmin`: exige `role === 'admin'`.
- Errores de negocio se lanzan como `AppError(message, statusCode)` y los captura
  `middleware/errorHandler.ts` (Express 5 reenvía rechazos de async handlers automáticamente).

## Grupos (peñas)
- `POST /api/groups` (crear), `POST /api/groups/join` (unirse por inviteCode), `GET /api/groups`
  (mis peñas), `GET /api/groups/:id` (detalle, solo si eres miembro) — todas requieren `requireAuth`
- `inviteCode` generado con `nanoid(8)`, reintenta hasta 5 veces si hay colisión (prácticamente nunca)
- Al crear un grupo se genera automáticamente su `GroupRuleSettings` con las 6 reglas del catálogo
  (`points = defaultPoints`, todas `active: false`) — el admin las activa/ajusta después desde su panel
- Unirse dos veces al mismo grupo devuelve 409; ver un grupo sin ser miembro devuelve 403

## Modelos de datos (MongoDB / Mongoose, TypeScript)

Implementados en `backend/src/models/` (interfaz `IX` + `Schema<IX>` + `model<IX>`).
Enums compartidos en `backend/src/types/enums.ts`.

### User
- email, password (hasheada con bcrypt), alias, avatarUrl opcional, role (`user`/`admin`), createdAt

### Group (peñas)
- name, inviteCode (único, tipo nanoid), admin (ref User), members (ref User[]), season, createdAt
- Un usuario puede pertenecer a varios grupos; el ranking se calcula filtrando por grupo

### Match
- season, competition (`la_liga`/`copa_del_rey`/`supercopa`, default `la_liga`), matchday
  (opcional, solo aplica a `la_liga`), isKnockout (Boolean), homeTeam, awayTeam, startTime,
  homeScore/awayScore opcionales, status (`pending`/`finished`)
- Se sincroniza vía cron desde football-data.org (solo La Liga; Copa del Rey/Supercopa se
  crean/gestionan aparte, sin API — pendiente de detallar cuando se implementen)
- `isKnockout = true` en la final de Copa del Rey y en los partidos de Supercopa: si acaban
  empatados a los 90' (sin prórroga/penaltis), hay una predicción adicional de quién se clasifica

### Rule (catálogo global de tipos de regla)
- key (único), scope (`match` \| `standings` \| `award` \| `knockout`), name, description, defaultPoints
- Cada `key` tiene su lógica de evaluación programada en `backend/src/services/rules/` (pendiente).
  Añadir un tipo de regla realmente nuevo requiere un desarrollador (evaluador de código);
  activarla/desactivarla y ajustar sus puntos por peña es cosa del admin, sin tocar código.
- `knockout_qualifier` (scope `knockout`, defaultPoints 2): acertar quién se clasifica cuando
  un partido `isKnockout` termina empatado a los 90'. Solo se puntúa si de verdad hubo empate.

### GroupRuleSettings (configuración de reglas por peña y temporada)
- group, season, rules: `[{ rule: ObjectId(Rule), points: Number, active: Boolean }]`,
  enabledCompetitions: `('copa_del_rey' | 'supercopa')[]`
- Único por `(group, season)`. Panel de admin edita este documento.
- `enabledCompetitions` (vacío por defecto): el admin decide si su peña juega con Copa del Rey
  y/o Supercopa de España — opt-in explícito, no vienen activadas por defecto.

### Prediction (datos crudos de la predicción de partido)
- user, match, predictedHome, predictedAway, status (`pending`/`scored`)
- Único por `(user, match)`. Se bloquea el envío cuando `now >= match.startTime`
- **Ya no tiene `points` propio** — los puntos dependen de la peña (ver `PredictionScore`)

### PredictionScore (puntos de una predicción, por peña)
- prediction, group, points, ruleBreakdown (`[{ rule, points }]`), multiplierApplied opcional
- Único por `(prediction, group)`. Generado por el job de puntuación por lote.

### StandingsPrediction (datos crudos de la predicción de clasificación)
- user, season, phase (`ida`=jornada 19 / `vuelta`=jornada 38), predictedTable (`[{ position, team }]`), status
- Único por `(user, season, phase)`. Se predice antes de que empiece la temporada;
  **el bloqueo por fecha es fijo (no configurable por el admin)**

### StandingsPredictionScore (puntos de clasificación, por peña)
- standingsPrediction, group, points, ruleBreakdown. Único por `(standingsPrediction, group)`

### AwardPrediction (predicción de Pichichi / Zamora)
- user, season, award (`pichichi`/`zamora`), predictedPlayer, status
- Único por `(user, season, award)`. Se bloquea antes de jornada 1.
- El resultado real se introduce manualmente por el admin al terminar la temporada
  (la API gratuita no lo da fiable)

### AwardPredictionScore (puntos de Pichichi/Zamora, por peña)
- awardPrediction, group, points. Único por `(awardPrediction, group)`
- Pichichi y Zamora tienen puntuaciones **independientes** configurables por el admin

### ScoreMultiplier (multiplicador manual x2/x3/xN)
- group, season, scope (`match` \| `matchday`), match u opcional matchday, multiplier (≥1)
- Decisión puntual y externa del grupo sobre un partido concreto o una jornada entera.
  No es una "regla" del catálogo — es un modificador aplicado al puntuar.
  Precedencia: si hay multiplicador de `match` para ese partido, se usa ese; si no, se
  busca uno de `matchday` para su jornada.

## Sistema de puntuación (CONFIGURABLE POR PEÑA)

El sistema fijo original (`calculatePoints`/`calculateStandingsPoints` con valores hardcodeados)
se sustituyó por un motor de reglas configurable, porque las reglas siguen en debate y cada
peña puede querer puntuaciones distintas.

- **Catálogo de reglas** (`Rule`): cada tipo de regla (acertar signo, resultado exacto, posición
  en tabla, Pichichi, Zamora...) tiene una clave (`key`) con su evaluador en código.
- **Configuración por peña** (`GroupRuleSettings`): el admin de cada peña decide, por temporada,
  qué reglas están activas y con cuántos puntos vale cada una.
- **Multiplicadores** (`ScoreMultiplier`): el admin puede aplicar x2/x3/xN a un partido concreto
  (incluidos partidos de Copa del Rey/Supercopa) o a una jornada entera, decidido externamente
  por el grupo. Se aplica tanto a `PredictionScore` como a `QualifierPredictionScore`.
- **Cálculo por lote, no en tiempo real**: jobs (`backend/src/jobs/`, pendientes) recorren
  partidos `finished`/fases cerradas/premios confirmados, y generan `PredictionScore`,
  `StandingsPredictionScore`, `AwardPredictionScore` y `QualifierPredictionScore` por cada
  peña del usuario, aplicando las reglas activas de esa peña y el multiplicador si corresponde.
- **Ranking por peña**: se agregan los cuatro `*Score` filtrados por `group`.

### Copa del Rey (solo final) y Supercopa de España
- Ya modeladas (`Match.competition`/`isKnockout`, `QualifierPrediction`/`QualifierPredictionScore`,
  `Rule` con `key: 'knockout_qualifier'`, `GroupRuleSettings.enabledCompetitions`) — ver arriba.
- Solo se cuenta el resultado a los 90' (sin prórroga ni penaltis) para el resultado normal;
  si acaba en empate, se puntúa aparte quién se clasifica (`QualifierPredictionScore`).
- Opt-in por peña: si el admin no activa `copa_del_rey`/`supercopa` en `enabledCompetitions`,
  esos partidos no generan puntuación para su grupo.
- **Confirmado**: football-data.org (plan free) no cubre Copa del Rey ni Supercopa de España,
  así que estos partidos NO se sincronizan por cron — el admin los da de alta a mano. Endpoints
  admin pendientes de construir:
  - Crear partido manual: elegir equipos (home/away), fecha/hora, `competition` (`copa_del_rey`/
    `supercopa`), `isKnockout: true`
  - Introducir el resultado final (90') una vez jugado, marcando `status: 'finished'`
  - Si acabó empatado a los 90': introducir quién se clasifica (alimenta `QualifierPrediction`
    → `QualifierPredictionScore` vía `resolveActiveRules`/`knockout_qualifier`)

### Champions League (backlog, sin diseñar aún)
- A diferencia de Copa del Rey/Supercopa, football-data.org (plan free) **sí cubre** la Champions
  (código `CL`), así que en principio se podría sincronizar por cron igual que La Liga.
- Pero es más compleja que un partido único: tiene fase de grupos **y** eliminatorias a **ida y
  vuelta** (octavos/cuartos/semis — solo la final es partido único). "Quién se clasifica" ya no
  depende de un partido a 90', sino del **resultado agregado de ambos partidos** de la eliminatoria.
- Opt-in por peña, igual que Copa del Rey/Supercopa (`enabledCompetitions` se ampliaría con
  `'champions_league'`).
- Pendiente de sesión de diseño (como se hizo con Copa del Rey/Supercopa) antes de tocar código:
  cómo modelar el agregado de dos partidos, qué pasa con la fase de grupos (¿se puntúa como partidos
  normales de `scope: match`?), y si aplica algún multiplicador especial.

## Estado actual del proyecto
- [x] Cluster de MongoDB Atlas creado y activo (plan free M0, región Paris)
- [x] Usuario de base de datos creado (`pepe`)
- [x] Network Access configurado (0.0.0.0/0 para desarrollo)
- [x] Repo de GitHub creado (monorepo): josemc96/peporra
- [x] Estructura de carpetas del backend (TypeScript)
- [x] `npm init` + instalación de dependencias (express, mongoose, dotenv, cors, bcryptjs, jsonwebtoken + typescript, tsx, @types/*)
- [x] `.env` con MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET, FOOTBALL_API_KEY, CURRENT_SEASON — todo con valores reales
- [x] `server.ts` con conexión a Mongo + endpoint `/health`
- [x] Modelos Mongoose (User, Group, Match, Rule, GroupRuleSettings, Prediction, PredictionScore,
      StandingsPrediction, StandingsPredictionScore, AwardPrediction, AwardPredictionScore,
      ScoreMultiplier, QualifierPrediction, QualifierPredictionScore)
- [x] Motor de reglas (`src/services/rules/`): evaluadores puros por `key` (exact_score, correct_sign,
      standings_position, pichichi_correct, zamora_correct, knockout_qualifier), registro
      (`registry.ts`), `resolveActiveRules` y `resolveMultiplier`. Catálogo `Rule` sembrado en
      Atlas vía `npm run seed:rules`. Falta integrarlo en los jobs de cálculo de puntos (aún no
      creados) y en endpoints admin para gestionar `GroupRuleSettings`/`ScoreMultiplier`.
- [x] Auth (registro/login JWT con refresh tokens): `/api/auth/register|login|refresh|logout|me`,
      `requireAuth`/`requireAdmin`, `User.tokenVersion` para invalidar refresh tokens en logout,
      `AppError` + `errorHandler` centralizado. Probado end-to-end contra el servidor real.
- [x] Grupos: crear (con inviteCode nanoid + GroupRuleSettings inicial autogenerado), unirse por
      inviteCode, listar mis peñas, detalle de peña (solo miembros). Probado end-to-end.
- [x] Sincronización de partidos desde football-data.org: `footballApi.service.ts` +
      `syncMatches.job.ts` (upsert por `Match.externalId`) + `scheduler.ts` (cron cada 10 minutos
      con `node-cron`) + `POST /api/admin/sync-matches` para forzarla manualmente. Probado
      contra la API real: 380 partidos de La Liga 2026-2027 sincronizados e idempotente.
- [x] `GET /api/matches`: lista partidos guardados (filtros season/matchday/competition). Probado.
- [ ] Endpoints de predicciones de partido (crear, listar, bloqueo por fecha)
- [ ] Endpoints de predicción de clasificación y Pichichi/Zamora
- [ ] Endpoints de predicción de "quién se clasifica" en partidos `isKnockout` (Copa del Rey/Supercopa)
- [ ] Endpoints admin (GroupRuleSettings, ScoreMultiplier, enabledCompetitions, resultado real de Pichichi/Zamora)
- [ ] Alta manual de partidos de Copa del Rey (final) y Supercopa de España — confirmado que no
      vienen del cron (football-data.org free no las cubre): admin elige equipos, introduce
      resultado final y, si hubo empate a 90', quién se clasifica
- [ ] Jobs de cálculo de puntos (partidos, clasificación, premios, clasificados en empates)
- [ ] Endpoint de ranking por peña
- [ ] Proyecto Expo (frontend) — pendiente de crear en `/app`

## Preferencias del usuario
- Prefiere respuestas concisas y prácticas
- Viene de stack MERN/React, cómodo con contenido técnico en español o inglés
- Dispuesto a aprender tecnología nueva si aporta valor al proyecto
