# Study Flow Assistant — Obsidian Plugin

Plugin modular para Obsidian enfocado en la productividad académica y de estudio:
1. **Temporizador Pomodoro:** Barra de estado interactiva, modal visual con cuenta regresiva en vivo, barra de progreso y panel lateral (Sidebar View).
2. **Gestor de Tareas & Inbox:** Captura rápida, dashboard interactivo con filtros (Pendientes, Completadas, Todas), marcado de checkboxes en vivo y eliminación directa en Markdown.
3. **Planificador Diario (Daily Planning):** Editor de bloques de estudio (Time Blocking) y asignación de tareas prioritarias para hoy o mañana.
4. **Study Flow Hub (Panel Lateral):** Vista completa acoplable en la barra lateral con pestañas para alternar entre Pomodoro, Tareas y Planificador.

---

## Interfaces Disponibles

### 1. Panel Lateral (Study Flow Hub)
- Accesible desde el ícono de reloj en el Ribbon o el comando `Study Flow: Abrir panel principal (Hub)`.
- Pestañas integradas:
  - 🍅 **Pomodoro:** Reloj gigante, barra de progreso animada, botones Iniciar/Pausar, Reiniciar, Saltar ciclo, +5 min, y contador de sesiones hoy.
  - 📋 **Tareas:** Barra para añadir tareas a `Inbox.md`, filtros por estado, checkboxes interactivos que actualizan el archivo en tiempo real y botón para eliminar.
  - 📅 **Planificador:** Selector de fecha (Hoy / Mañana), lista de tareas pendientes a incorporar, vista previa en vivo y botón para aplicar en la nota diaria.

### 2. Modales Dedicados
- **Temporizador Pomodoro (`PomodoroModal`):** Interfaz emergente centrada en el enfoque.
- **Gestor de Tareas (`TasksManagerModal`):** Dashboard emergente para gestionar todo tu Inbox.
- **Captura Rápida (`QuickCaptureModal`):** Input veloz para registrar tareas sin salir del flujo de trabajo.
- **Planificador de Mañana (`NextDayPlannerModal`):** Editor de bloques de estudio y selección de pendientes.

---

## Comandos de la Paleta (`Ctrl + P`)

- `Study Flow: Abrir panel principal (Hub)`
- `Study Flow: Abrir temporizador Pomodoro`
- `Study Flow: Abrir gestor de tareas & Inbox`
- `Capturar tarea rápida`
- `Planificar el día siguiente`
- `Pomodoro: Iniciar / Pausar`
- `Pomodoro: Reiniciar`
- `Pomodoro: Alternar entre trabajo y descanso`

---

## Desarrollo y Despliegue

```bash
# Compilar producción
npm run build

# Desplegar al vault local
npm run deploy

# Tests unitarios
npm test
```
