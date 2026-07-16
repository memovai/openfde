# OpenFDE: AI workspace for FDEs

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md) | **Español**

> **Entrega soluciones de IA 100x más rápido.** Las entrevistas se vuelven memoria, la memoria tareas trazables, y las tareas trabajo para coding agents — con evals como puerta de control.

**OpenFDE** es un espacio de trabajo de IA, local-first, para forward deployed engineers. Compila el material del engagement — entrevistas, registros de chat, documentos, PDF, imágenes — en una memoria operativa respaldada por ontología, y cierra el bucle entre humanos y coding agents: los agents reclaman tareas y paquetes de contexto del ledger, ejecutan y devuelven hallazgos — mientras la dirección del cliente observa el progreso en vivo, con cada afirmación citando su fuente.

![Interfaz de notas de openfde](./docs/notes-ui.png)

## Por qué

El estado de trabajo de un FDE vive en tres lugares frágiles:

- **El conocimiento vive en conversaciones.** Quién confía en qué fuente de datos, por qué se tomó una decisión, qué restricción bloquea un flujo de trabajo — se dijo una vez en una reunión y se perdió dos semanas después.
- **Las tareas viven en cabezas.** Entre "lo escuché en una entrevista" y "se lo asigné a un coding agent" no hay sistema, ni contexto, ni rastro hacia la fuente.
- **La verificación vive en sensaciones.** El trabajo de los agents se acepta por intuición en lugar de por evals.

OpenFDE convierte las tres cosas en un solo sistema, empezando por la memoria.

## Qué hace OpenFDE

- **Memoria operativa respaldada por ontología (ontology-backed operational memory).** Una ontología fija del dominio FDE — objetivos, flujos de negocio, decisiones, restricciones, fuentes de datos, puntos de dolor — restringe la extracción, de modo que lo que entra al ledger es conocimiento operativo, no prosa. La lente punto-línea-plano (planos de valor → flujos de negocio → puntos de decisión) lo organiza como piensa la dirección.
- **Gestión de contexto con procedencia obligatoria (context management).** Mantienes autoridad y visibilidad completas sobre lo que leen los agents: aislamiento por engagement, hechos con cita a la fuente y paquetes de contexto que siempre empiezan por las restricciones.
- **Operación de agents en bucle cerrado (closed-loop operation).** Los coding agents reclaman tareas, obtienen contexto, ejecutan y devuelven resultados por la misma CLI — un bucle de retroalimentación continua donde la salida de una operación es la entrada de la siguiente (memoria → tareas → hallazgos → memoria). Nada aterriza en silencio: el trabajo vuelve como transiciones de estado revisables con un registro de auditoría completo.
- **Revisión human-in-the-loop y gobernanza.** Una máquina de estados de tareas controla la aceptación; el compartir es de solo lectura y con alcance por capacidades; la aceptación con evals — rúbricas como activos versionados — está en la hoja de ruta.

## Capacidades

- **Local-first.** Un directorio SQLite por engagement (`~/.openfde/engagements/<slug>/`). Los datos del cliente nunca salen de tu máquina; traspasar un engagement es entregar un directorio.
- **La procedencia se exige, no se recomienda.** El contenido sin URI de origen se rechaza al escribir. Cada hecho recuperado se expande hasta la cita literal de la que proviene.
- **Memoria bitemporal.** Los hechos contradictorios se reemplazan, nunca se borran. `recall --mode handoff` reproduce la línea temporal — incluyendo lo que creías antes y qué lo sustituyó.
- **Sin LLM en la ruta de lectura.** Búsqueda de texto completo (con segmentación CJK) más expansión de grafo a un salto, en milisegundos. El LLM solo trabaja en la escritura, restringido por una ontología de dominio fija.
- **Nativo para agents.** Todos los comandos soportan `--json`. Añade unas líneas a las instrucciones de tu agent y podrá consultar la memoria, reclamar tareas y devolver hallazgos en plena tarea.
- **Un kit de campo para el movimiento FDE.** Investigación web con citas (`research`), briefs de demo para el día siguiente (`demo`), evaluación de aceptación por rúbrica (`eval`), biblioteca de activos lista para git (`asset`) y mapa de negociación de datos (`datamap`).
- **Tareas trazables (dispatch agent-pull).** Las tarjetas de tarea viven en el ledger con una máquina de estados y un registro de auditoría; `openfde context <task>` ensambla el paquete de munición — restricciones primero, memoria relacionada después, todo citado.
- **Un espacio de trabajo markdown-first al estilo Obsidian.** `openfde serve` abre una interfaz local donde cada entidad, episodio y tarea es una nota markdown — árbol jerárquico, [[wiki-enlaces]], citas en línea — más un grafo de fuerzas dirigidas y Vistas que reflejan las proyecciones de la CLI (guías de entrevista, mapa de datos, biblioteca de activos). Los humanos usan el workspace; los agents, la CLI.
- **Diagramas de flujo auto-extraídos.** `openfde flows` convierte los hechos de workflow en diagramas mermaid — objetivos, pasos, dependencias, restricciones bloqueantes y lo que ya está automatizado — renderizados en línea en el workspace (y en GitHub), con cada arista respaldada por un hecho citado. La prosa explica entidades; los flujos explican el proceso.

  ![Flujos de openfde](./docs/flows-ui.png)

- **Páginas al estilo Notion.** Documentos markdown libres junto al ledger, editados por bloques en el workspace — clic para editar, `/` para insertar encabezados, listas, código, diagramas mermaid o páginas nuevas — y legibles/escribibles por agents vía `openfde page`.
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
| `openfde ingest <files…>` | Ingiere material como episodios, con procedencia obligatoria — texto, markdown, **PDF e imágenes** (extraídos nativamente vía Claude) |
| `openfde extract` | Extracción restringida por ontología + resolución en dos fases (deduplicar / reemplazar) |
| `openfde recall <query>` | Busca en la memoria; `--mode handoff` para la línea temporal; `--json` para agents |
| `openfde remember <fact> --source <uri>` | Registra conocimiento descubierto en plena tarea (escritura de agents) |
| `openfde task create/list/claim/start/done/accept` | Tarjetas de tarea trazables: máquina de estados + registro de auditoría (dispatch agent-pull) |
| `openfde context <task>` | Ensambla el paquete de memoria de una tarea: restricciones + hechos relacionados, todo citado |
| `openfde status` | Resumen de memoria del engagement actual |
| `openfde research <query>` | Búsqueda web de métodos con fuentes citadas; `--save` ingiere los hallazgos en la memoria |
| `openfde demo <topic>` | Brief de demo desde la memoria — el dolor del cliente, su vocabulario, restricciones y formas de datos, listo para un coding agent ("la demo es la venta") |
| `openfde eval <task> --input <file>` | Juzga el trabajo entregado contra la rúbrica de la tarea; los veredictos van al registro de auditoría y hacen crecer el dataset de evals |
| `openfde asset add/list/show` | La biblioteca de activos: rúbricas (auto-creadas desde los criterios de la tarea), prompts, casos de eval, demos, playbooks, skills — archivos, listos para git |
| `openfde datamap` | El mapa de negociación de datos: quién posee cada fuente, quién confía en ella, qué depende de ella |
| `openfde flows` | Diagramas de flujo mermaid auto-extraídos: objetivos, workflows, pasos, bloqueos, automatización — cada arista es un hecho citado |
| `openfde page add/list/show/edit/remove` | Páginas markdown libres junto al ledger; edición por bloques en el workspace, scriptables para agents |
| `openfde interview` | Guía de entrevista generada desde los huecos del grafo — top-down (valor → flujos → puntos de decisión, la sesión con el jefe) o bottom-up (pistas de minería de conocimiento) |
| `openfde report` | Informe ejecutivo del engagement: oportunidades, alivio de carga, cobertura de automatización, valor — cada afirmación citada |
| `openfde serve` | Espacio de trabajo local de notas + grafo, con un informe ejecutivo imprimible en `/report` (daemon opcional — la CLI funciona sin él) |
| `openfde share` | Comparte en tu LAN un informe ejecutivo en vivo y de solo lectura mediante un enlace no adivinable — el jefe ve el progreso en tiempo real; todo lo demás sigue siendo solo loopback |

## Integración con agents

Los humanos usan el espacio de trabajo web; **los agents usan la CLI, instalada como skill**:

```sh
cp -r skills/openfde ~/.claude/skills/openfde     # ámbito de usuario
# o: cp -r skills/openfde .claude/skills/openfde   # ámbito de proyecto
```

[`skills/openfde/SKILL.md`](./skills/openfde/SKILL.md) documenta la instalación de la propia CLI y el bucle operativo completo (encontrar trabajo → reclamar → contexto → ejecutar → devolver → eval). Cualquier agent que ejecute comandos de shell puede usarla — sin capa de protocolo, sin configuración.

## Estructura del repositorio

```
packages/ontology   Ontología del dominio FDE (Zod, fuente única de verdad)
packages/core       Ledger: engagements / memoria / dispatch / proyecciones / informes
packages/webui      Espacio de trabajo local opcional (notas + grafo + vistas + informe ejecutivo)
skills/openfde      El skill del agent: cómo instalar y operar la CLI
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
- **Promoción de activos y métricas de apalancamiento** — la biblioteca por engagement ya está (rúbricas desde criterios de tarea, datasets de casos de eval, briefs de demo); siguiente: promoción anonimizada a un repositorio de equipo + métricas entre engagements (contrato al alza, esfuerzo por despliegue a la baja)
- **Write-back operacional** — hoy se registra el linaje de decisiones (`task accept --outcome`); mañana, cerrar el bucle de acción hacia los sistemas del cliente
