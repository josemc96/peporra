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
- Pendiente de detallar: de dónde salen estos partidos (no vienen del cron de football-data.org
  de La Liga) — probablemente alta manual por el admin cuando se implemente esta parte.

## Estado actual del proyecto
- [x] Cluster de MongoDB Atlas creado y activo (plan free M0, región Paris)
- [x] Usuario de base de datos creado (`pepe`)
- [x] Network Access configurado (0.0.0.0/0 para desarrollo)
- [x] Repo de GitHub creado (monorepo): josemc96/peporra
- [x] Estructura de carpetas del backend (TypeScript)
- [x] `npm init` + instalación de dependencias (express, mongoose, dotenv, cors, bcryptjs, jsonwebtoken + typescript, tsx, @types/*)
- [x] `.env` con MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET, FOOTBALL_API_KEY (placeholders — falta URI real de Atlas)
- [x] `server.ts` con conexión a Mongo + endpoint `/health`
- [x] Modelos Mongoose (User, Group, Match, Rule, GroupRuleSettings, Prediction, PredictionScore,
      StandingsPrediction, StandingsPredictionScore, AwardPrediction, AwardPredictionScore,
      ScoreMultiplier, QualifierPrediction, QualifierPredictionScore)
- [ ] Motor de reglas (evaluadores por `key` en `src/services/rules/`)
- [ ] Auth (registro/login JWT con refresh tokens)
- [ ] Grupos: crear, unirse por inviteCode, generar GroupRuleSettings inicial
- [ ] Sincronización de partidos desde football-data.org (cron)
- [ ] Endpoints de predicciones de partido (crear, listar, bloqueo por fecha)
- [ ] Endpoints de predicción de clasificación y Pichichi/Zamora
- [ ] Endpoints de predicción de "quién se clasifica" en partidos `isKnockout` (Copa del Rey/Supercopa)
- [ ] Endpoints admin (GroupRuleSettings, ScoreMultiplier, enabledCompetitions, resultado real de Pichichi/Zamora)
- [ ] Alta manual de partidos de Copa del Rey (final) y Supercopa de España (no vienen del cron)
- [ ] Jobs de cálculo de puntos (partidos, clasificación, premios, clasificados en empates)
- [ ] Endpoint de ranking por peña
- [ ] Proyecto Expo (frontend) — pendiente de crear en `/app`

## Preferencias del usuario
- Prefiere respuestas concisas y prácticas
- Viene de stack MERN/React, cómodo con contenido técnico en español o inglés
- Dispuesto a aprender tecnología nueva si aporta valor al proyecto
