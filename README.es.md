# openfde

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md) | **Español**

> Convierte entrevistas con clientes en memoria, la memoria en tareas trazables, y las tareas en trabajo para coding agents — con evals como puerta de control.

**openfde** es un sistema de memoria de engagements, local-first, para forward deployed engineers (FDEs). Introduce notas de entrevistas, registros de chat y documentos; los extrae en un grafo de conocimiento estructurado, citable y con línea temporal — y tanto tú como tus coding agents lo manejan con la misma CLI: buscar memoria, reclamar tareas, obtener paquetes de contexto y entregar al jefe del cliente un informe donde cada afirmación cita su fuente.

![Interfaz de notas de openfde](./docs/notes-ui.png)

## Por qué

El estado de trabajo de un FDE vive en tres lugares frágiles:

- **El conocimiento vive en conversaciones.** Quién confía en qué fuente de datos, por qué se tomó una decisión, qué restricción bloquea un flujo de trabajo — se dijo una vez en una reunión y se perdió dos semanas después.
- **Las tareas viven en cabezas.** Entre "lo escuché en una entrevista" y "se lo asigné a un coding agent" no hay sistema, ni contexto, ni rastro hacia la fuente.
- **La verificación vive en sensaciones.** El trabajo de los agents se acepta por intuición en lugar de por evals.

openfde convierte las tres cosas en un solo sistema, empezando por la memoria.

## Características

- **Local-first.** Un directorio SQLite por engagement (`~/.openfde/engagements/<slug>/`). Los datos del cliente nunca salen de tu máquina; traspasar un engagement es entregar un directorio.
- **La procedencia se exige, no se recomienda.** El contenido sin URI de origen se rechaza al escribir. Cada hecho recuperado se expande hasta la cita literal de la que proviene.
- **Memoria bitemporal.** Los hechos contradictorios se reemplazan, nunca se borran. `recall --mode handoff` reproduce la línea temporal — incluyendo lo que creías antes y qué lo sustituyó.
- **Sin LLM en la ruta de lectura.** Búsqueda de texto completo (con segmentación CJK) más expansión de grafo a un salto, en milisegundos. El LLM solo trabaja en la escritura, restringido por una ontología de dominio fija.
- **Nativo para agents.** Todos los comandos soportan `--json`. Añade unas líneas a las instrucciones de tu agent y podrá consultar la memoria, reclamar tareas y devolver hallazgos en plena tarea.
- **Tareas trazables (dispatch agent-pull).** Las tarjetas de tarea viven en el ledger con una máquina de estados y un registro de auditoría; `openfde context <task>` ensambla el paquete de munición — restricciones primero, memoria relacionada después, todo citado.
- **Un espacio de trabajo markdown-first al estilo Obsidian.** `openfde serve` abre una interfaz local donde cada entidad, episodio y tarea es una nota markdown — árbol jerárquico, [[wiki-enlaces]] entre entidades, citas en línea — con un grafo de fuerzas dirigidas como vista complementaria (haz clic en un nodo para abrir su nota).
- **Un informe ejecutivo para el jefe del cliente — en vivo.** `/report` genera una página clara e imprimible que responde cuatro preguntas desde el grafo: qué podemos asumir, cuánta carga elimina, qué se reemplaza y cuánto vale — con preguntas de cuantificación generadas automáticamente donde aún faltan números. `openfde share` reparte un enlace LAN de solo lectura que se actualiza en tiempo real mientras los agents trabajan, con un feed de progreso en vivo.

  ![Informe ejecutivo de openfde](./docs/report-ui.png)

## Inicio rápido

```sh
pnpm install

# 1. memoria: entrevistas dentro, hechos citados fuera
pnpm openfde engagement create "acme corp"
pnpm openfde ingest ./notes/entrevista.md --kind message --speaker García
pnpm openfde extract               # requiere ANTHROPIC_API_KEY; usa --mock sin conexión
pnpm openfde recall conciliación
pnpm openfde recall "fuente de datos" --mode handoff   # línea temporal con hechos reemplazados

# 2. dispatch: la memoria se convierte en trabajo trazable
pnpm openfde task create "Automatizar la limpieza de CSV" --criteria "Se ejecuta sin supervisión" --source "interview://onsite#pain-csv"
pnpm openfde task claim <id> && pnpm openfde context <id>   # lo que un agent ejecuta antes de empezar

# 3. enséñaselo al jefe
pnpm openfde report                # markdown por stdout
pnpm openfde serve                 # espacio de trabajo en :4517, informe imprimible en /report
```

## CLI

| Comando | Qué hace |
| --- | --- |
| `openfde engagement create/list/use` | Gestiona engagements (un directorio local por proyecto de cliente) |
| `openfde ingest <files…>` | Ingiere material como episodios, con procedencia obligatoria |
| `openfde extract` | Extracción restringida por ontología + resolución en dos fases (deduplicar / reemplazar) |
| `openfde recall <query>` | Busca en la memoria; `--mode handoff` para la línea temporal; `--json` para agents |
| `openfde remember <fact> --source <uri>` | Registra conocimiento descubierto en plena tarea (escritura de agents) |
| `openfde task create/list/claim/start/done/accept` | Tarjetas de tarea trazables: máquina de estados + registro de auditoría (dispatch agent-pull) |
| `openfde context <task>` | Ensambla el paquete de memoria de una tarea: restricciones + hechos relacionados, todo citado |
| `openfde status` | Resumen de memoria del engagement actual |
| `openfde report` | Informe ejecutivo del engagement: oportunidades, alivio de carga, cobertura de automatización, valor — cada afirmación citada |
| `openfde serve` | Espacio de trabajo local de notas + grafo, con un informe ejecutivo imprimible en `/report` (daemon opcional — la CLI funciona sin él) |
| `openfde share` | Comparte en tu LAN un informe ejecutivo en vivo y de solo lectura mediante un enlace no adivinable — el jefe ve el progreso en tiempo real; todo lo demás sigue siendo solo loopback |

## Integración con agents

Añade a tu `CLAUDE.md` / `AGENTS.md`:

```
Consulta la memoria del engagement con `openfde recall <query> --json`.
Toma trabajo: `openfde task list --status ready --json`, luego
`openfde task claim <id>` y `openfde context <id>` antes de empezar.
Registra nuevos hallazgos con `openfde remember "<fact>" --source <uri>`.
Reporta progreso con `openfde task update <id> --note "..."`; termina con `openfde task done <id>`.
```

Eso es todo — cualquier agent que ejecute comandos de shell puede usar la memoria FDE. Sin capa de protocolo, sin configuración.

## Estructura del repositorio

```
packages/ontology   Ontología del dominio FDE (Zod, fuente única de verdad)
packages/core       Ledger: engagements / memoria / dispatch / proyecciones / informes
packages/webui      Espacio de trabajo local opcional (notas + grafo + informe ejecutivo)
apps/cli            El comando openfde (punto de entrada compartido para humanos y agents)
```

Consulta [ARCHITECTURE.md](./ARCHITECTURE.md) (en inglés) para el mapa de módulos y dónde encaja el trabajo futuro.

## Desarrollo

```sh
pnpm test                 # vitest
pnpm typecheck
pnpm -C apps/cli build    # empaqueta la CLI con la interfaz del espacio de trabajo
```

## Hoja de ruta

- **Dispatch, modo orchestrated** — agent-pull ya disponible (`openfde task` + `openfde context`); lo siguiente es un runner opcional que lanza agents automáticamente sobre tareas `ready` en git worktrees aislados
- **Biblioteca de activos con evals integrados** — prompts, rúbricas y datasets de eval son activos versionados; la evaluación consume rúbricas y devuelve puntuaciones y nuevos casos de prueba a la biblioteca
- **Promoción de activos** — los patrones que sobreviven a un engagement se anonimizan y promueven para su reutilización
