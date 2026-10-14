# Study Flow Assistant — Obsidian Plugin

Asistente integral de estudio y productividad académica para Obsidian. Combina un temporizador Pomodoro personalizable, gestión de tareas e Icebox (backlog de ideas), seguimiento de hábitos, calendario con bloques de tiempo (time blocking), métricas de rendimiento y modo Zen sin distracciones.

---

## 🚀 Características Principales

### 🍅 1. Temporizador Pomodoro
- **Presets guardables:** Accesos directos predeterminados (25/5, 50/10, 90/20) y presets personalizados con nombre, seleccionables desde la pestaña y el menú contextual del status bar.
- **Modo sin límite (Flujo):** Modo cronómetro ascendente para sesiones de estudio abiertas, registrado con la misma precisión que los bloques tradicionales.
- **Selector de audio:** Sonidos sintetizados mediante Web Audio API (campana armónica, tono suave, clic táctil y silencio) con botón de prueba interactivo.
- **Cierre de sesión reflexivo:** Modal opcional y configurable al terminar cada sesión de enfoque para responder "¿Qué avanzaste?" y registrar distracciones.
- **Pausas activas rotativas:** Notificaciones con consejos de estiramiento, hidratación y descanso visual (regla 20-20-20).
- **Auto-inicio opcional:** Transición automática entre ciclos de estudio y descanso.
- **Mini Timer Modal:** Ventana emergente compacta y minimalista para controlar el temporizador sin abrir la vista completa.
- **Persistencia de estado:** El temporizador mantiene su cuenta y fase activa en almacenamiento local del dispositivo incluso al recargar Obsidian.
- **Registro en Nota Diaria:** Guarda automáticamente cada sesión completada en la nota diaria correspondiente bajo viñetas de Pomodoro.

### 📋 2. Gestor de Tareas & Icebox
- **4 Vistas Claras:** **Hoy** (incluye tareas vencidas y de hoy), **Próximas** (entregas futuras), **Por materia** (agrupadas por asignatura y sección **Sin clasificar**) e **Icebox** (ideas sin fecha).
- **Interruptor de completadas:** Permite alternar la visualización de tareas hechas en la vista activa.
- **Metadatos enriquecidos:** Prioridades (⏫ Alta, 🔼 Media, 🔽 Baja), estimaciones y pomodoros completados (🍅 1/3), fechas límite (📅 YYYY-MM-DD), tareas programadas (⏳) y recurrencias (🔁).
- **Subtareas interactivas:** Soporte para listas anidadas con checkboxes interactivos.
- **Indexación reactiva:** Escaneo en tiempo real de tareas en todo el vault con soporte para carpetas incluidas y excluidas (`taskIncludedFolders`, `taskExcludedFolders`).
- **Nueva tarea y Captura rápida:** Botón "Nueva tarea" en la pestaña y acceso veloz (`plus-circle` en ribbon) para registrar tareas o ideas directamente en `Inbox.md` o en la nota activa.

### 🔥 3. Hábitos y Rutinas
- **Frecuencias flexibles:** Soporte para hábitos diarios (`diaria`), N veces por semana (`weekly`, ej. 3x/sem) o días específicos (`specific_days`, ej. Lun-Vie).
- **Día de descanso:** Posibilidad de marcar días de descanso (`💤`) para pausar un hábito sin penalizar ni romper la racha.
- **Rachas recalculadas:** Algoritmo dinámico que evalúa la racha continua según la frecuencia configurada (días para hábitos diarios o específicos, semanas para hábitos semanales).
- **Progreso semanal visual:** Barra y contador de cumplimiento semanal directo en la tarjeta del hábito (ej. `3/4 esta semana`).
- **Almacenamiento limpio:** Archivo centralizado `StudyFlow/Habits.md` en formato Markdown estándar con metadatos no intrusivos en comentarios HTML (migración automática y reversible).
- **Mapa de calor (Heatmap):** Visualización interactiva de consistencia de los últimos 35 días (5 semanas).

### 📅 4. Calendario, Bloques de Tiempo & Exportación ICS
- **Vistas Mensual y Semanal:** Cuadrícula con inicio de semana configurable (Lunes o Domingo).
- **Bloques de tiempo en la Nota Diaria:** Almacenamiento transparente bajo `## Bloques de Tiempo` en formato `- [ ] HH:mm—HH:mm Título [[nota]]`.
- **Detección de solapamientos:** Advertencia visible automática cuando dos bloques de tiempo compiten por el mismo horario.
- **Hub de Entregas (Deadlines):** Panel unificado con tareas ordenadas por vencimiento, destacando entregas vencidas (🚨) y próximas (⚠️).
- **Exportación iCalendar (.ics):** Comando `Study Flow: Exportar bloques y deadlines a .ics` que escribe `StudyFlow/study-flow.ics` con eventos RFC 5545 y **UIDs estables** para sincronización sin duplicados en Google Calendar, Apple Calendar o Thunderbird.

---

## 🔗 Protocol Handler (`obsidian://study-flow`)

Study Flow registra el manejador de protocolo `study-flow` para controlar el plugin externamente mediante URIs de Obsidian (compatible con Raycast, Alfred, Atajos de iOS, cron o terminal):

| Acción | URI de Ejemplo | Descripción | Parámetros Opcionales |
|---|---|---|---|
| **Iniciar Pomodoro** | `obsidian://study-flow?action=start` | Inicia una nueva sesión de enfoque o reanuda el temporizador. | `task=Texto`: Vincula y enfoca una tarea.<br>`subject=Nombre`: Vincula una materia configurada. |
| **Pausar Pomodoro** | `obsidian://study-flow?action=pause` | Pausa el temporizador Pomodoro en ejecución. | — |
| **Reiniciar Pomodoro** | `obsidian://study-flow?action=reset` | Reinicia el temporizador a su duración base o detiene el modo flujo. | — |
| **Saltar Fase** | `obsidian://study-flow?action=skip` | Salta a la siguiente fase (trabajo ↔ descanso). | — |
| **Completar Tarea** | `obsidian://study-flow?action=complete-task` | Marca como completada la tarea actualmente vinculada en el temporizador. | — |
| **Captura Rápida** | `obsidian://study-flow?action=capture&text=Repasar%20Álgebra` | Guarda la tarea en `Inbox.md` bajo `## Tareas` y reindexa. Si se omite `text`, abre el modal de captura. | `text=Texto`: Contenido de la tarea. |
| **Abrir Pestaña Hub** | `obsidian://study-flow?action=open&tab=calendar` | Abre la vista interactiva de Study Flow en la pestaña indicada (`today`, `pomodoro`, `calendar`, `tasks`, `habits`, `analytics`). Por defecto `today`. | `tab=NombrePestaña` |

*Ejemplos en terminal (macOS/Linux):*
```bash
# Iniciar sesión de 25m enfocada en Álgebra
xdg-open "obsidian://study-flow?action=start&task=Resolver%20guia%203&subject=Matematicas"

# Abrir directamente la pestaña de hábitos en Obsidian
xdg-open "obsidian://study-flow?action=open&tab=habits"

# Capturar tarea rápida en el Inbox
open "obsidian://study-flow?action=capture&text=Comprar%20cuaderno"
```

---

## 🖥️ Interfaz y Navegación

### Ribbon (Barra Lateral Izquierda)
La interfaz mantiene una superficie minimalista con solo dos íconos esenciales:
1. 🕒 **Abrir vista principal:** Abre el Hub interactivo completo de Study Flow en la pestaña central o lateral.
2. ➕ **Captura rápida:** Despliega el modal compacto para registrar una tarea o idea en segundos.

### Paleta de Comandos (`Ctrl + P` / `Cmd + P`)
- `Study Flow: Abrir interfaz completa (Pestaña central)`
- `Study Flow: Abrir en panel lateral (Sidebar)`
- `Study Flow: Abrir Calendario y Bloques de Tiempo` (Pestaña Calendario)
- `Study Flow: Abrir gestor de tareas & Inbox` (Pestaña Tareas)
- `Study Flow: Abrir registro de hábitos diarios` (Pestaña Hábitos)
- `Study Flow: Abrir métricas y rendimiento de estudio` (Pestaña Métricas)
- `Study Flow: Abrir temporizador Pomodoro` (Mini Timer flotante)
- `Study Flow: Capturar tarea rápida`
- `Study Flow: Planificar el día de mañana`
- `Study Flow: Exportar bloques y deadlines a .ics`
- `Study Flow: Generar revisión semanal`
- `Study Flow: Iniciar repaso espaciado en la nota activa`
- `Study Flow: Migrar logs de Pomodoro a nuevo formato`
- `Study Flow: Modo Zen: Alternar enfoque sin distracciones`
- `Study Flow: Pomodoro: Iniciar / Pausar`
- `Study Flow: Pomodoro: Reiniciar`
- `Study Flow: Pomodoro: Alternar entre trabajo y descanso`
- `Study Flow: Pomodoro: Completar tarea activa actual`

---

## ⚙️ Configuración (Ajustes)

Los ajustes del plugin están organizados en secciones limpias sin encabezados redundantes:
- **Pomodoro:** Duración de trabajo, descansos corto y largo, frecuencia de descanso largo, auto-inicio, sonido de campana (volumen y prueba de audio), notificaciones del sistema y registro automático.
- **Tareas:** Encabezado de sección para tareas (ej. `## Tareas`), encabezado de Icebox (ej. `## Icebox`) y carpetas incluidas/excluidas para el escaneo.
- **Notas:** Carpeta de notas diarias, formato de fecha (Moment.js) y ruta del archivo Inbox.
- **Hábitos:** Ruta del archivo de hábitos (`StudyFlow/Habits.md`).
- **Apariencia:** Día de inicio de semana (Lunes o Domingo) y modo Zen automático.
- **Avanzado:** Idioma (Español / English / Automático), sincronización de sesiones históricas y botón **Restablecer valores predeterminados**.

Todos los campos numéricos cuentan con validación en tiempo real y mensajes visibles de advertencia en caso de valores fuera de rango o inválidos.

---

## 🛠️ Desarrollo y Pruebas

```bash
# Verificar tipos de TypeScript
npm run check-types

# Ejecutar suite de pruebas unitarias
npm test

# Compilar para producción
npm run build
```

---

## 📄 Licencia

MIT © dalt
