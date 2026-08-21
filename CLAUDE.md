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
        multiplier.controller.ts, awardResult.controller.ts, ranking.controller.ts,
        card.controller.ts (deal/config admin), cardPlay.controller.ts (jugar carta/espiar),
        manualAdjustment.controller.ts, penaltyConfig.controller.ts
      /routes         ← auth.routes.ts, group.routes.ts, admin.routes.ts, match.routes.ts
        prediction.routes.ts, standingsPrediction.routes.ts, awardPrediction.routes.ts
        scorer.routes.ts, qualifierPrediction.routes.ts, groupRuleSettings.routes.ts
        multiplier.routes.ts, awardResult.routes.ts, ranking.routes.ts, card.routes.ts,
        manualAdjustment.routes.ts, penaltyConfig.routes.ts
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
        scoreAwardPredictions.job.ts, calculateScores.job.ts (orquestador),
        dealCards.job.ts (reparte cartas por jornada), applyCardEffects.job.ts (efectos post-partido),
        applyMatchdayPenalties.job.ts (deuda/penalización por jornada), scheduler.ts
        (cron cada 10 minutos: sync + cálculo de puntos)
      /scripts        ← seedRules.ts (siembra el catálogo Rule en Mongo), seedPastSeason.ts,
        seedMockCards.ts / finishMockCards.ts (datos de prueba del sistema de cartas)
      /utils          ← AppError.ts
      /types          ← enums.ts (incl. CardKey/ALL_CARD_KEYS), express.d.ts (augmenta Request.user)
      app.ts
      server.ts
    tsconfig.json
    package.json
    render.yaml         ← config de deploy del backend en Render
    .env
    .env.example
  /app                ← app Expo (React Native), YA CONSTRUIDA — ver sección "Frontend Expo"
    eas.json            ← config de build EAS (iOS/Android)
    vercel.json          ← rewrite SPA para el build web en Vercel
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
- `PUT /api/predictions` (crear o actualizar mi predicción — upsert por `user`+`match`+`group`),
  `GET /api/predictions` (las mías, filtros opcionales `matchday`/`season`/`group`),
  `GET /api/predictions/:matchId` (mi predicción para ese partido, o `null`) — todas `requireAuth`
- Bloqueo: si `now >= match.startTime` el `PUT` devuelve 409 — no se puede predecir ni editar
  un partido que ya ha empezado
- Como los partidos de toda la temporada se sincronizan de una vez (`Match.startTime` ya
  guardado), un usuario puede predecir cualquier jornada futura desde ya, sin esperar a que
  se jueguen las anteriores — el bloqueo es por partido, no por orden de jornada
- Validación: `predictedHome`/`predictedAway` deben ser enteros no negativos (400 si no)
- **Predicciones por peña** (`feature/predictions-per-group`, ya mergeada): `Prediction` pasó a
  llevar `group` y el índice único es `(user, match, group)`, no `(user, match)` — un usuario
  puede predecir el mismo partido con valores distintos en cada peña a la que pertenezca. Se
  migró con un script (`scripts/`, ya ejecutado en Atlas) y varios fixes posteriores corrigieron
  doble conteo en ranking/ranking de jornada al no filtrar por `group` en algunas consultas.

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
  enabledCompetitions: `('copa_del_rey' | 'supercopa')[]`, enabledFeatures: `('standings' |
  'pichichi' | 'zamora')[]`
- Único por `(group, season)`. Panel de admin edita este documento.
- `enabledCompetitions` (vacío por defecto): el admin decide si su peña juega con Copa del Rey
  y/o Supercopa de España — opt-in explícito, no vienen activadas por defecto.
- `enabledFeatures`: igual de opt-in pero para Clasificación/Pichichi/Zamora — el admin de la
  peña las activa o no desde el panel; si no están activas, esas pestañas no se muestran en el
  frontend para esa peña.

### Prediction (datos crudos de la predicción de partido)
- user, match, group, predictedHome, predictedAway, status (`pending`/`scored`)
- Único por `(user, match, group)` — **por peña**, no global (ver "Predicciones de partido" arriba).
  Se bloquea el envío cuando `now >= match.startTime`
- **Ya no tiene `points` propio** — los puntos dependen de la peña (ver `PredictionScore`)

### PredictionScore (puntos de una predicción, por peña)
- prediction, group, points, preCardPoints, ruleBreakdown (`[{ rule, points }]`), multiplierApplied opcional
- Único por `(prediction, group)`. Generado por el job de puntuación por lote.
- `preCardPoints`: puntos antes de aplicar efectos de cartas (ver "Sistema de cartas" abajo);
  `points` es el resultado final tras aplicar cartas jugadas sobre ese partido/usuario.

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
  así que estos partidos NO se sincronizan por cron — el admin los da de alta a mano (ver
  "Alta manual de partidos de Copa del Rey/Supercopa" arriba, ya implementado end-to-end).

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

## Sistema de cartas (power-ups por jornada, opt-in por peña)

Feature grande, no diseñada originalmente — construida entera después de v1 en varias ramas
(`feature/card-system` con sub-ramas `cards/backend-models`, `cards/backend-deal-job`,
`cards/backend-play`, `cards/backend-scoring`, `cards/frontend-admin`, `cards/frontend-play`,
`cards/frontend-visibility`), ya mergeada en `main`.

- **Modelos**: `CardConfig` (qué cartas están activas por `group`+`season` y el límite de
  apuesta de "Me la juego"), `CardDeal` (una carta repartida a un usuario en una jornada,
  `status`: `locked`/`pending`/`played`/`expired`), `CardPlay` (los datos concretos de cómo se
  jugó: `targetUser`/`targetMatch`/`params`), `CardEffect` (puntos ganados/perdidos por cartas
  cuya resolución no es un simple ajuste de `PredictionScore`, ej. Me la Juego / La Afición).
- **`CardKey`** (`types/enums.ts`, catálogo cerrado en código, no en Mongo como `Rule`):
  - `la_mina` — trampa sobre tu propio partido: si un rival acierta el resultado exacto que tú
    predijiste, ese rival se queda a 0 puntos en ese partido
  - `la_roja` — sobre un rival en un partido: ese rival se queda a 0 puntos
  - `la_lesion` — sobre un rival en un partido: puntos del rival a la mitad (floor)
  - `el_doblete` — sobre tu propio partido: tus puntos en ese partido se duplican
    (`la_lesion` + `el_doblete` sobre el mismo usuario/partido se cancelan entre sí)
  - `el_autobus` — sobre tu propio partido: inmune a Mina/Roja/Lesión y garantiza mínimo 1 punto
  - `el_var` — self-buff antes del inicio: si fallas por solo 1 gol en un lado del marcador
    (`varCoversResult` en `scoreMatchPredictions.job.ts`), se cuenta como acierto exacto
  - `el_espia` — ver la predicción de un rival en un partido concreto antes del kickoff
    (`spyMatch`), opcionalmente copiarla a la tuya al jugar la carta
  - `rueda_prensa` — sobre un rival en un partido (efecto builder solo tiene el target, la
    resolución concreta está en el frontend/scoring de esa carta)
  - `me_la_juego` — apuestas una cantidad (hasta `CardConfig.melaJuegoLimit`, 10 pts por
    defecto) a que aciertas el resultado exacto de un partido: si aciertas ganas esa cantidad
    en puntos extra, si fallas pierdes la mitad (floor)
  - `la_aficion` — apoyas a un compañero para toda la jornada: si ese compañero acaba en el
    podio (top 3) de la jornada, tú ganas la mitad (floor) de sus puntos de esa jornada
- **Reparto y juego**: `dealCards.job.ts` reparte cartas por jornada/grupo (según `CardConfig`),
  `POST /api/groups/:groupId/cards/:dealId/play` (`cardPlay.controller.ts`) valida y registra la
  jugada según el tipo de carta (`validatePlay`, un `switch` por `CardKey`), marca el `CardDeal`
  como `played`. Endpoint aparte para el Espía (`GET .../cards/spy/:matchId`, solo si tienes una
  carta de Espía `pending` para esa jornada).
- **Resolución de efectos** (`applyCardEffects.job.ts`, se ejecuta dentro del pipeline de
  `calculateScores.job.ts`): recorre las jornadas con partidos terminados, agrupa las jugadas por
  partido, y **reescribe `PredictionScore.points`** partiendo de `preCardPoints` (los puntos ya
  calculados por el motor de reglas normal) aplicando las cartas en este orden de prioridad:
  Autobús (inmunidad) > Roja/Mina (0 pts) > Lesión+Doblete (se cancelan) > Lesión sola (mitad) >
  Doblete solo (x2). Me la Juego y La Afición generan `CardEffect` aparte (no tocan
  `PredictionScore`, se suman en el ranking). La Afición solo se resuelve cuando la jornada está
  **completa** (todos los partidos `finished`), porque necesita el ranking final de la jornada.
- **Visibilidad**: `GET .../cards/plays?season=X&matchday=Y` solo revela jugadas de cartas cuyo
  partido objetivo ya ha empezado (para no filtrar información antes de tiempo); La Afición/Me la
  Juego/El Doblete/El VAR se muestran siempre porque no dan ventaja informativa al rival.
- **Frontend**: `app/app/cards/[groupId].tsx` (pantalla de jugar carta + banner en predicciones),
  panel admin de cartas dentro de `app/app/admin/[groupId].tsx`.
- **Scripts de prueba** (`seedMockCards.ts` + `finishMockCards.ts`): crean usuarios "Fake*" con
  una carta de cada tipo ya asignada para poder probar el ciclo completo sin esperar a jornadas
  reales — pensados para usar y tirar en desarrollo, no para producción.

## Deuda de jornada, bote y penalizaciones (dinero, no puntos)

Paralelo al sistema de puntos: cada peña puede llevar un "bote" económico donde el que queda
último en una jornada (o en varias posiciones de cola configurables) paga una cantidad.

- **`PenaltyConfig`**: `{ group, season, penalties: [{ position, amount }] }`, único por
  `(group, season)` — el admin de la peña define cuánto paga cada posición de cola de la
  clasificación de jornada (ej. `{ position: 1 (=último), amount: 5 }`).
- **`MatchdayPenalty`**: `{ group, season, matchday, user, position, amount }`, único por
  `(group, season, matchday, user)` — el resultado ya calculado de aplicar `PenaltyConfig` a la
  clasificación real de esa jornada. Generado por `applyMatchdayPenalties.job.ts` dentro del
  pipeline de `calculateScores.job.ts`.
- **Ranking de jornada**: `ranking.controller.ts` expone también la clasificación por jornada
  (no solo la acumulada de temporada), con el importe de "deuda" de cada usuario visible en la
  pantalla de ranking (`app/app/ranking/[groupId].tsx`) y en el perfil.
- El importe del bote admite decimales (fix `27ad982`).

## Ajustes manuales (admin de la peña)

- **`ManualAdjustment`**: `{ group, season, user, points, moneyAmount, reason?, createdAt }` —
  el admin de la peña puede corregir a mano tanto puntos como dinero de un usuario concreto
  (ej. para compensar un fallo de sincronización, o cuadrar cuentas del bote fuera de la app).
  No es único por usuario/temporada: se pueden acumular varios ajustes, cada uno con su motivo.
- `manualAdjustment.routes.ts`/`.controller.ts` — requiere ser admin de esa peña
  (`groupAuth.service.ts`), igual que `GroupRuleSettings`/`ScoreMultiplier`.
- Se suma tanto al ranking de puntos como al cálculo de deuda/bote.

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
- [x] Predicciones por peña: `Prediction` pasó a llevar `group` (índice único `user+match+group`
      en vez de `user+match`), con migración y fixes de doble conteo en ranking/ranking de
      jornada. Ver "Predicciones de partido" arriba.
- [x] Sistema de cartas (10 power-ups por jornada, opt-in por peña): modelos, reparto
      (`dealCards.job.ts`), endpoints de juego para las 10 cartas, resolución de efectos
      integrada en `calculateScores.job.ts`, panel admin y pantalla de juego en frontend,
      visibilidad de jugadas tras el kickoff del partido objetivo. Ver "Sistema de cartas" arriba.
- [x] Deuda/bote/penalizaciones por jornada (`PenaltyConfig`, `MatchdayPenalty`,
      `applyMatchdayPenalties.job.ts`) y ajustes manuales de puntos/dinero por el admin de la
      peña (`ManualAdjustment`). Ver secciones correspondientes arriba.
- [x] Frontend Expo (React Native, iOS/Android/Web) — **construido de punta a punta**, ver
      checklist detallado en "Frontend Expo" abajo. Ya no es "pendiente de crear".
- [x] Deploy: `render.yaml` (backend en Render), `app/eas.json` (build EAS iOS/Android),
      `app/vercel.json` (build web en Vercel, con rewrite para evitar 404 al recargar página).

## Frontend Expo

Backend y frontend **completos** (v1 + fases posteriores, ver checklist arriba). La app Expo
(React Native) vive en `peporra/app/`, compila a **iOS + Android + Web** desde el mismo código
(Expo tiene soporte de Web integrado, no hace falta un proyecto aparte), y ya está desplegada
(Render + Vercel + config EAS para las stores).

### Pantallas construidas (`app/app/`, Expo Router)
- **Auth**: `login.tsx`, `register.tsx`
- **Tabs**: `(tabs)/index.tsx` (mis peñas), `(tabs)/group.tsx` (detalle de peña activa, inline
  para mantener la barra de tabs visible), `(tabs)/predictions.tsx`, `(tabs)/profile.tsx` —
  sidebar/tabs dinámicos según la peña activa seleccionada (persistida entre sesiones)
- **Grupos**: `groups/[id].tsx`, `groups/create.tsx`, `groups/join.tsx`
- **Predicciones**: `predictions/[season].tsx` (lista por jornada, tabs La Liga/Copa/Supercopa),
  `predictions/edit/[matchId].tsx`, `predictions/view/[matchId].tsx` (visibilidad: quién predijo
  qué, agrupado tras el kickoff)
- **Clasificación y premios**: `standings-prediction/[season].tsx` (drag&drop nativo / flechas en
  web), `award-prediction/[season].tsx` (Pichichi/Zamora, vista y edición separadas)
- **Eliminatorias**: `knockout/[season].tsx` (predicción de quién se clasifica, Copa/Supercopa)
- **Ranking**: `ranking/[groupId].tsx` (temporada + jornada, desempate por aciertos exactos,
  deuda/bote, colores de podio)
- **Cartas**: `cards/[groupId].tsx`
- **Admin**: `admin/[groupId].tsx` (reglas, multiplicadores, competiciones/features opt-in,
  partidos de Copa/Supercopa, cartas, ajustes manuales, recalcular puntuaciones),
  `admin/global.tsx` (resultado real Pichichi/Zamora, operaciones de sistema)
- **Usuario**: `user/[userId].tsx` (perfil de un miembro visto desde el ranking de la peña),
  `(tabs)/profile.tsx` (perfil propio: stats de temporada, apuestas de temporada, logout)

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

### Historial de ramas (mismo patrón que el backend: una rama por bloque, probada antes de
mergear en `main` — todas las de abajo ya están mergeadas, no quedan ramas de frontend abiertas)
`feature/expo-scaffold` → `feature/frontend-auth` → `feature/frontend-groups` →
`feature/frontend-predictions` → `feature/frontend-ranking` → `feature/active-group` (persistir
peña activa) → `feature/frontend-standings-prediction` → `feature/frontend-award-predictions` →
`feature/frontend-qualifier-predictions` → `feature/frontend-admin-panel` → panel admin global
→ `feature/match-prediction-visibility` → `feature/manual-score-adjustment` →
`feature/card-system` (+ sub-ramas `cards/*`) → `feature/frontend-dynamic-tabs` →
`feature/frontend-profile-redesign` → `feature/frontend-user-profile` →
`feature/predictions-per-group` → ajustes/fixes sueltos (admin de reglas, cartas, predicciones
de premios bypass, etc. — ver `git log` para el detalle más reciente).

No queda un "plan de ramas" pendiente para v1: el camino crítico (login → peñas → predicciones →
ranking) y todas las fases posteriores planeadas (clasificación, Pichichi/Zamora, "quién se
clasifica", paneles de admin) están implementadas. Lo que sigue abierto son features nuevas que
fueron surgiendo sobre la marcha (cartas, deuda/bote, ajustes manuales — ver secciones arriba) y
Champions League, que sigue en backlog sin diseñar.

## Preferencias del usuario
- Prefiere respuestas concisas y prácticas
- Viene de stack MERN/React, cómodo con contenido técnico en español o inglés
- Dispuesto a aprender tecnología nueva si aporta valor al proyecto
