# Study Flow Assistant — Obsidian Plugin

Plugin modular para Obsidian enfocado en la productividad académica y de estudio:
1. **Temporizador Pomodoro** interactivo en la barra de estado con registro automático de sesiones completadas.
2. **Captura rápida de tareas** en Markdown hacia `Inbox.md` o la nota activa bajo la sección `## Tareas`.
3. **Planificador del día siguiente** que analiza tareas pendientes y genera la plantilla del día siguiente con bloques de estudio.

---

## Características

### 1. Temporizador Pomodoro (`src/pomodoro.ts`)
- Widget en la Status Bar: `[🍅 25:00]`.
- Clic izquierdo: Alterna entre Iniciar y Pausar.
- Clic derecho: Reinicia el temporizador.
- Modos Trabajo y Descanso automáticos.
- Notificación nativa `new Notice('¡Pomodoro completado!')`.
- Registro automático en la nota diaria: `- [x] Pomodoro completado a las HH:mm`.

### 2. Captura Rápida de Tareas (`src/tasks.ts`)
- Comando en la paleta: `Capturar tarea rápida`.
- Modal interactivo con selección de destino (`Inbox.md` o nota activa).
- Inserta tareas formateadas `- [ ] {texto}` al final de la sección `## Tareas`.

### 3. Planificador del Día Siguiente (`src/planner.ts`)
- Comando en la paleta: `Planificar el día siguiente`.
- Ícono dedicado en la barra lateral (Ribbon).
- Detecta tareas pendientes (`- [ ]`) en la nota diaria de hoy y en `Inbox.md`.
- Permite seleccionar cuáles migrar y marcarlas opcionalmente como migradas (`[>]`).
- Genera la nota diaria del día siguiente (`YYYY-MM-DD.md`) con bloques horarios de estudio y tareas prioritarias.

### 4. Pestaña de Ajustes (`src/settings.ts`)
- Duración de trabajo y descanso.
- Carpeta de notas diarias y formato de fecha.
- Ruta del archivo de Inbox.
- Conmutador de registro automático de sesiones.

---

## Compatibilidad Móvil
- `isDesktopOnly: false` en `manifest.json`.
- Implementado 100% sobre la API de Obsidian (`App`, `Vault`, `normalizePath`, `TFile`), sin dependencias de Node.js en tiempo de ejecución.

---

## Comandos y Compilación

```bash
# Instalar dependencias
npm install

# Ejecutar tests unitarios
npm test

# Verificar tipos de TypeScript
npm run check-types

# Compilar para producción (genera main.js)
npm run build

# Desplegar en el vault local de Obsidian
npm run deploy
```
