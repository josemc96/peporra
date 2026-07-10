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
        prediction.controller.ts, standingsPrediction.controller.ts, awardPrediction.controller.ts
        scorer.controller.ts, qualifierPrediction.controller.ts, groupRuleSettings.controller.ts
        multiplier.controller.ts, awardResult.controller.ts, ranking.controller.ts
      /routes         ← auth.routes.ts, group.routes.ts, admin.routes.ts, match.routes.ts
        prediction.routes.ts, standingsPrediction.routes.ts, awardPrediction.routes.ts
        scorer.routes.ts, qualifierPrediction.routes.ts, groupRuleSettings.routes.ts
        multiplier.routes.ts, awardResult.routes.ts, ranking.routes.ts
      /middleware     ← auth.middleware.ts (requireAuth/requireAdmin), errorHandler.ts
      /services
        /auth         ← password.service.ts (bcrypt), token.service.ts (JWT), types.ts
        /rules        ← motor de reglas: evaluadores, registro, resolveActiveRules, resolveMultiplier
        footballApi.service.ts (llamadas a football-data.org: partidos y goleadores)
        season.service.ts (getSeasonKickoff/isSeasonLocked — bloqueo compartido standings/awards)
        groupAuth.service.ts (requireGroupMember/requireGroupAdmin — admin POR PEÑA, distinto de requireAdmin)
        standingsTable.service.ts (calcula la tabla real de La Liga a partir de nuestros Match)
        competitionEligibility.service.ts (opt-in de Copa del Rey/Supercopa por peña)
      /jobs           ← syncMatches.job.ts, syncScorers.job.ts, scoreMatchPredictions.job.ts,
        scoreQualifierPredictions.job.ts, scoreStandingsPredictions.job.ts,
        scoreAwardPredictions.job.ts, calculateScores.job.ts (orquestador), scheduler.ts
        (cron cada 10 minutos: sync + cálculo de puntos)
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

## Predicciones de partido
- `PUT /api/predictions` (crear o actualizar mi predicción — upsert por `user`+`match`),
  `GET /api/predictions` (las mías, filtros opcionales `matchday`/`season`),
  `GET /api/predictions/:matchId` (mi predicción para ese partido, o `null`) — todas `requireAuth`
- Bloqueo: si `now >= match.startTime` el `PUT` devuelve 409 — no se puede predecir ni editar
  un partido que ya ha empezado
- Como los partidos de toda la temporada se sincronizan de una vez (`Match.startTime` ya
  guardado), un usuario puede predecir cualquier jornada futura desde ya, sin esperar a que
  se jueguen las anteriores — el bloqueo es por partido, no por orden de jornada
- Validación: `predictedHome`/`predictedAway` deben ser enteros no negativos (400 si no)

## Predicciones de clasificación y premios (Pichichi/Zamora)
- `PUT/GET /api/standings-predictions` (+ `GET /:season/:phase`) y
  `PUT/GET /api/award-predictions` (+ `GET /:season/:award`) — mismo patrón de upsert que
  `/api/predictions`, todas `requireAuth`
- Bloqueo compartido (`src/services/season.service.ts`): se calcula el kickoff de la temporada
  (el `startTime` más temprano entre los partidos de La Liga de esa `season`) y se bloquea el
  `PUT` con 409 si `now >= kickoff` — **fijo, no configurable por el admin**, tal como estaba
  definido. Si aún no hay partidos sincronizados para esa temporada, no se bloquea.
- Validación de `predictedTable`: array no vacío de `{ position, team }`, posiciones enteras
  positivas sin duplicar, equipos sin duplicar (no se valida contra los 20 equipos reales de
  La Liga, solo consistencia estructural)
- `predictedPlayer` en premios es texto libre (no hay catálogo de jugadores) — el resultado real
  lo introduce el admin manualmente al terminar la temporada (endpoint aún pendiente)

### Goleadores (apoyo a la predicción de Pichichi — confirmado con la API real)
- `GET /competitions/PD/scorers` de football-data.org **sí existe y funciona en el plan gratuito**:
  da la clasificación de máximos goleadores de la temporada completa (jugador, equipo, goles,
  asistencias, penaltis). Se sincroniza igual que los partidos: `syncScorers.job.ts` +
  `Scorer` (upsert por `season`+`externalPlayerId`) + mismo cron de 10 min (`scheduler.ts`) +
  `POST /api/admin/sync-scorers` manual + `GET /api/scorers` (público, `requireAuth`, filtro
  `season`, cachea en Mongo, no llama a la API en cada request de usuario).
- **Confirmado que NO existe** el desglose de goles por partido (`GET /matches/:id` no incluye
  eventos de gol) ni ningún dato de portero/goles encajados individual — ambos están bloqueados
  en el plan de pago. Por eso:
  - **Pichichi**: se apoya en datos reales (`/api/scorers`) mientras el usuario decide su
    predicción, pero el resultado final para puntuar sigue siendo introducido a mano por el
    admin (la API no confirma oficialmente "quién ganó el Pichichi", solo da el conteo de goles)
  - **Zamora**: sigue siendo 100% manual, sin ningún apoyo de datos — no hay forma de derivar
    goles encajados por portero individual con el plan gratuito

## Predicción de "quién se clasifica" en partidos de eliminatoria
- `PUT /api/qualifier-predictions` (upsert por `user`+`match`), `GET /api/qualifier-predictions`
  (las mías), `GET /api/qualifier-predictions/:matchId` — todas `requireAuth`
- Solo válido si `match.isKnockout === true` (final de Copa del Rey / partidos de Supercopa);
  si no, el `PUT` devuelve 400. Mismo bloqueo que `/api/predictions`: 409 si `now >= match.startTime`
- `predictedQualifier` es `'home'` o `'away'` (no hay modelo de equipos aparte, se referencia
  el lado del partido)
- **Resuelto**: ver "Alta manual de partidos de Copa del Rey/Supercopa" más abajo — ya se puede
  probar con un `matchId` real de principio a fin.

## Alta manual de partidos de Copa del Rey / Supercopa (admin)
- `POST /api/matches` (`competition` debe ser `copa_del_rey` o `supercopa` — `la_liga` solo viene
  del cron, rechazado con 400 aquí). `isKnockout` se fuerza a `true` automáticamente, no es
  configurable en el body.
- `PUT /api/matches/:id/result`: introduce el resultado final a los 90' (`homeScore`/`awayScore`),
  pone `status: 'finished'`. Funciona sobre cualquier partido (también sirve para corregir un
  partido de La Liga si hiciera falta).
- `PUT /api/matches/:id/qualifier`: introduce quién se clasificó de verdad (`home`/`away`),
  guardado en el nuevo campo `Match.realQualifier`. Solo se acepta si `match.isKnockout`, el
  partido ya tiene resultado (`status: 'finished'`) y ese resultado fue empate (`homeScore ===
  awayScore`) — si no hubo empate, esta predicción no tenía sentido y se rechaza con 400.
- Las tres rutas requieren `requireAuth` + `requireAdmin`.

## Configuración por peña y resultados reales de premios (admin)
**Importante — dos roles de "admin" distintos, no confundir:**
- **Admin de la peña** (`Group.admin`, campo por documento): decide `GroupRuleSettings` y
  `ScoreMultiplier` de SU peña. Se comprueba con un helper propio (`groupAuth.service.ts`,
  `requireGroupAdmin`/`requireGroupMember`), NO con `req.user.role`.
- **Admin global del sitio** (`User.role === 'admin'`, `requireAdmin` de siempre): el mismo que
  ya usábamos para sincronizar partidos/goleadores. Gestiona el resultado real de Pichichi/Zamora,
  que es un hecho objetivo de la temporada, no algo que decida cada peña por separado.

### GroupRuleSettings (admin de la peña)
- `GET /api/groups/:groupId/rule-settings?season=X` — cualquier miembro puede ver la configuración
- `PUT /api/groups/:groupId/rule-settings` — solo el admin de esa peña. Body:
  `{ season, rules?: [{ key, points?, active? }], enabledCompetitions?: [...] }`. Actualiza solo
  las reglas incluidas (parcial, no hace falta mandar las 6); `key` desconocida → 400.

### ScoreMultiplier (admin de la peña)
- `POST/GET /api/groups/:groupId/multipliers` (+ `DELETE /:id`) — crear/listar/borrar. Crear y
  borrar exigen ser el admin de la peña; listar solo exige ser miembro. Validación de
  `scope`/`match`/`matchday`/`multiplier` (≥1) en el controller, además del schema.

### AwardResult (admin global — resultado real de Pichichi/Zamora)
- Nuevo modelo `AwardResult { season, award, realPlayer }`, único por `(season, award)`
- `PUT /api/admin/award-results` (admin global): introduce/actualiza el resultado real
- `GET /api/award-results` (cualquier usuario autenticado): consulta pública de resultados ya
  confirmados — útil para que la app muestre "el Pichichi real fue X" cuando se sepa

## Cálculo de puntos (jobs de puntuación)
Cuatro jobs independientes en `src/jobs/`, orquestados por `calculateScores.job.ts`
(`POST /api/admin/calculate-scores`, admin global; y automático cada 10 min tras el sync, en
`scheduler.ts`). Cada uno solo procesa predicciones con `status: 'pending'` y las marca
`'scored'` al terminar — **idempotente**: repetir la ejecución no reprocesa ni duplica nada.

- **`scoreMatchPredictions.job.ts`**: por cada `Match` `finished` con `Prediction` pendientes,
  recorre los grupos del usuario, comprueba `isCompetitionEnabledForGroup` (opt-in de Copa del
  Rey/Supercopa), calcula puntos con `resolveActiveRules(scope: 'match')` +
  `resolveMultiplier`, y guarda `PredictionScore`.
- **`scoreQualifierPredictions.job.ts`**: mismo patrón para partidos `isKnockout` `finished`.
  Si acabó empatado a los 90' pero el admin aún no introdujo `realQualifier`, esas predicciones
  se quedan `pending` (no se puntúan como fallo prematuramente).
- **`scoreStandingsPredictions.job.ts`**: usa `standingsTable.service.ts` — **la tabla real se
  calcula nosotros mismos** a partir de los partidos de La Liga ya guardados (no se sincroniza
  aparte desde la API), sumando puntos/goles de los partidos `finished` con `matchday <=
  19` (ida) o `<= 38` (vuelta). Solo puntúa una fase cuando está "completa" (cero partidos
  `pending` hasta esa jornada).
- **`scoreAwardPredictions.job.ts`**: solo puntúa si existe `AwardResult` para esa
  `season`+`award`; compara contra la regla específica (`pichichi_correct` para Pichichi,
  `zamora_correct` para Zamora — nunca se mezclan aunque una peña tenga las dos activas).
- **`services/competitionEligibility.service.ts`**: `isCompetitionEnabledForGroup` — La Liga
  siempre puntúa; Copa del Rey/Supercopa solo si están en `GroupRuleSettings.enabledCompetitions`.

## Ranking por peña
- `GET /api/groups/:groupId/ranking?season=X` (cualquier miembro): suma `PredictionScore` +
  `QualifierPredictionScore` + `StandingsPredictionScore` + `AwardPredictionScore` filtrados por
  `group`, agrupados por usuario, ordenado de mayor a menor puntuación.
- Incluye a **todos los miembros de la peña**, aunque tengan 0 puntos (nadie "desaparece" del
  ranking por no haber predicho nada todavía).

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
  homeScore/awayScore opcionales, status (`pending`/`finished`), realQualifier opcional (`home`/`away`)
- La Liga se sincroniza vía cron desde football-data.org; Copa del Rey/Supercopa se dan de alta
  a mano por el admin (`POST /api/matches` + `PUT /:id/result` + `PUT /:id/qualifier`)
- `isKnockout = true` en la final de Copa del Rey y en los partidos de Supercopa (se fuerza
  automáticamente al crearlos a mano): si acaban empatados a los 90' (sin prórroga/penaltis),
  hay una predicción adicional de quién se clasifica, y `realQualifier` guarda el resultado real

### Scorer (clasificación de goleadores, apoyo a la predicción de Pichichi)
- season, externalPlayerId (id de football-data.org), playerName, team, goals, assists/penalties/
  playedMatches opcionales
- Único por `(season, externalPlayerId)`. Se sincroniza igual que `Match` (cron + endpoint admin)

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

### AwardResult (resultado real de Pichichi/Zamora, global — no por peña)
- season, award (`pichichi`/`zamora`), realPlayer. Único por `(season, award)`
- Introducido por el admin GLOBAL del sitio (`PUT /api/admin/award-results`), no por cada peña
  por separado — es un hecho objetivo de la temporada real, no una decisión de la peña

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
- [x] Endpoints de predicciones de partido: `PUT/GET /api/predictions`, `GET /api/predictions/:matchId`,
      upsert por `(user, match)`, bloqueo por `match.startTime` (409), validación de inputs. Probado end-to-end.
- [x] Endpoints de predicción de clasificación y Pichichi/Zamora: `PUT/GET /api/standings-predictions`,
      `PUT/GET /api/award-predictions` (+ variantes `/:season/:phase|award`), bloqueo compartido por
      kickoff de temporada (`season.service.ts`), validación de tabla/jugador. Probado end-to-end.
- [x] Sincronización de goleadores (apoyo a Pichichi): `syncScorers.job.ts` + `Scorer` +
      `POST /api/admin/sync-scorers` + `GET /api/scorers`. Confirmado con la API real que no hay
      desglose de goles por partido ni datos de portero — Zamora sigue siendo 100% manual.
- [x] Endpoints de predicción de "quién se clasifica" en partidos `isKnockout`: `PUT/GET
      /api/qualifier-predictions` (+ `/:matchId`), valida `match.isKnockout`, mismo bloqueo por
      `startTime`. Probado end-to-end (con partidos de prueba, ya que aún no hay alta manual real).
- [x] Endpoints admin: `GET/PUT /api/groups/:groupId/rule-settings` y `POST/GET/DELETE
      /api/groups/:groupId/multipliers` (admin de la peña, vía `groupAuth.service.ts` — distinto
      de `requireAdmin` global), `PUT /api/admin/award-results` + `GET /api/award-results`
      (admin global, nuevo modelo `AwardResult`). Probado end-to-end (22 casos).
- [x] Alta manual de partidos de Copa del Rey (final) y Supercopa de España: `POST /api/matches`
      (elige equipos, fuerza `isKnockout: true`), `PUT /:id/result` (resultado final), `PUT
      /:id/qualifier` (solo si empate real a 90'). Probado end-to-end, incluida la integración
      real con `qualifier-predictions` (la limitación de la rama anterior queda resuelta).
- [x] Jobs de cálculo de puntos: `scoreMatchPredictions`, `scoreQualifierPredictions`,
      `scoreStandingsPredictions` (tabla real calculada de nuestros propios `Match`, no
      sincronizada), `scoreAwardPredictions`, orquestados por `calculateScores.job.ts`
      (`POST /api/admin/calculate-scores` + automático en el cron). Idempotente (solo procesa
      `status: 'pending'`). Probado end-to-end (20 casos): las 4 puntuaciones, multiplicador,
      opt-in de competición, no doble conteo, idempotencia verificada con segunda ejecución.
- [x] `GET /api/groups/:groupId/ranking?season=X`: suma los 4 tipos de `*Score` por usuario,
      incluye a todos los miembros aunque tengan 0 puntos. Probado end-to-end (6 casos).
- [~] Proyecto Expo (frontend) — en progreso, ver sección "Frontend Expo" abajo

## Frontend Expo

Backend 100% terminado (ver checklist arriba). El frontend es una app Expo (React Native)
en `peporra/app/`, pensada para compilar a **iOS + Android + Web** desde el mismo código
(Expo tiene soporte de Web integrado, no hace falta un proyecto aparte).

### Decisiones técnicas
- **Routing**: Expo Router (basado en archivos, como Next.js App Router)
- **Datos del servidor**: TanStack Query (React Query)
- **HTTP**: `fetch` nativo envuelto en un cliente propio (`src/api/client.ts`), no `axios`
- **UI**: React Native Paper (Material Design)
- **Auth token storage**: `expo-secure-store` en móvil, `localStorage` en web (abstraído en
  `src/config/storage.ts`)
- **Estado de sesión**: `AuthContext` (React Context), sin Redux/Zustand
- **Importante**: el SDK de Expo (57 en el momento de crear el proyecto) es muy posterior al
  conocimiento de entrenamiento de Claude — el propio scaffold generó un `app/AGENTS.md`
  avisando de esto. Para evitar sintaxis obsoleta, el proyecto se generó con la plantilla
  oficial `tabs` de Expo (`npx create-expo-app app --template tabs`) y se usó su código real
  como referencia de las convenciones actuales de Expo Router, en vez de fiarse de memoria.

### Estructura (dentro de `peporra/app/`)
```
app/                        ← rutas (Expo Router; sí, "app/app/" es lo normal en Expo)
  (tabs)/
    _layout.tsx              ← barra de pestañas: Peñas | Perfil
    index.tsx                ← "Mis peñas" (por ahora: pantalla de test de conexión a /health)
    profile.tsx               ← perfil + logout
  +not-found.tsx
  _layout.tsx                ← layout raíz: QueryClientProvider + AuthProvider + PaperProvider
src/
  api/client.ts               ← fetch con Authorization Bearer + refresco automático en 401
  config/env.ts                ← EXPO_PUBLIC_API_URL (obligatoria, lanza si falta)
  config/storage.ts             ← wrapper SecureStore (móvil) / localStorage (web)
  config/queryClient.ts
  context/AuthContext.tsx        ← login/register/logout/restaurar sesión, ya funcional
  components/useColorScheme.ts(.web.ts)
.env / .env.example            ← EXPO_PUBLIC_API_URL=http://<IP-LOCAL>:4000/api
```

### Conectividad con el backend en desarrollo
El móvil (Expo Go) no puede usar `localhost` — necesita la IP LAN del ordenador
(`ipconfig` → interfaz WiFi). Hace falta:
1. `app/.env` → `EXPO_PUBLIC_API_URL=http://<IP-LOCAL>:4000/api`
2. Regla de Firewall de Windows permitiendo TCP 4000 en el perfil **Privado**:
   `New-NetFirewallRule -DisplayName "Peporra backend (dev, puerto 4000)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4000 -Profile Private`
   (requiere PowerShell como administrador — bloqueado en el PC del trabajo por permisos)
3. Móvil y ordenador en la misma red WiFi

### Plan de ramas (mismo patrón que el backend: una rama por bloque, probada antes de mergear)
1. **`feature/expo-scaffold`** (en progreso, sin mergear) — proyecto creado, Router + Paper +
   React Query + AuthContext + cliente API, todo compila (`tsc --noEmit` limpio). **Pendiente:
   verificar en Expo Go real** (bloqueado en el PC del trabajo por el Firewall — continuar en
   PC personal: `git checkout feature/expo-scaffold`, `cd app`, `npm install`, `npx expo start`,
   confirmar que la pestaña "Peñas" muestra "✓ Conectado" contra `/health`).
2. `feature/frontend-auth` — pantallas de login/registro reales (el `AuthContext` ya está listo)
3. `feature/frontend-groups` — listar/crear/unirme/ver peñas
4. `feature/frontend-predictions` — lista de partidos de una peña + editor de predicción
5. `feature/frontend-ranking` — pantalla de ranking

v1 = camino crítico (login → peñas → predicciones → ranking). Clasificación, Pichichi/Zamora,
goleadores, "quién se clasifica" y paneles de admin se abordan en fases posteriores.

## Preferencias del usuario
- Prefiere respuestas concisas y prácticas
- Viene de stack MERN/React, cómodo con contenido técnico en español o inglés
- Dispuesto a aprender tecnología nueva si aporta valor al proyecto
