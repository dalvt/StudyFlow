# Study Flow Assistant — Obsidian Plugin

Asistente integral de estudio y productividad académica para Obsidian. Combina un temporizador Pomodoro personalizable, gestión de tareas e Icebox (backlog de ideas), seguimiento de hábitos, calendario con bloques de tiempo (time blocking), métricas de rendimiento y modo Zen sin distracciones.

---

## 🚀 Características Principales

### 🍅 1. Temporizador Pomodoro
- **Fases personalizables:** Configuración de minutos de trabajo, descanso corto, descanso largo e intervalo de sesiones.
- **Auto-inicio opcional:** Transición automática entre ciclos de estudio y descanso.
- **Mini Timer Modal:** Ventana emergente compacta y minimalista para controlar el temporizador sin abrir la vista completa.
- **Audio Zen (Web Audio API):** Campana armónica sintetizada sin archivos de audio externos.
- **Persistencia de estado:** El temporizador mantiene su cuenta y fase activa incluso si recargas Obsidian.
- **Registro en Nota Diaria:** Guarda automáticamente cada sesión completada en la nota diaria correspondiente.

### 📋 2. Gestor de Tareas & Icebox
- **Separación de Tareas e Ideas:** Tareas accionables con checkboxes vs. notas e ideas espontáneas en `Icebox` sin saturar la lista de pendientes.
- **Metadatos enriquecidos:** Prioridades (⏫ Alta, 🔼 Media, 🔽 Baja), estimaciones y pomodoros completados (🍅 1/3), fechas límite (📅 YYYY-MM-DD), tareas programadas (⏳) y recurrencias (🔁).
- **Subtareas interactivas:** Soporte para listas anidadas con checkboxes interactivos.
- **Indexación reactiva:** Escaneo en tiempo real de tareas en todo el vault con soporte para carpetas incluidas y excluidas (`taskIncludedFolders`, `taskExcludedFolders`).
- **Captura rápida:** Modal veloz (`plus-circle` en ribbon) para registrar tareas o ideas directamente en `Inbox.md` o en la nota activa.

### 🔥 3. Hábitos y Rutinas
- **Almacenamiento limpio:** Archivo centralizado `StudyFlow/Habits.md` en formato Markdown estándar.
- **Rachas y Consistencia:** Cálculo automático de rachas actuales y frecuencias (diario, días por semana).
- **Mapa de calor semanal (Heatmap):** Visualización interactiva de consistencia de los últimos 35 días (5 semanas).
- **Tasa de cumplimiento:** Monitoreo porcentual semanal del cumplimiento de tus hábitos.

### 📅 4. Calendario & Time Blocking
- **Vistas Mensual y Semanal:** Cuadrícula con inicio de semana configurable (Lunes o Domingo).
- **Bloques de tiempo en la Nota Diaria:** Almacenamiento transparente bajo `## Bloques de Tiempo` en formato `- [ ] HH:mm—HH:mm Título [[nota]]`.
- **Detección de solapamientos:** Advertencia visible automática cuando dos bloques de tiempo compiten por el mismo horario.
- **Hub de Entregas (Deadlines):** Panel unificado con tareas ordenadas por vencimiento, destacando entregas vencidas (🚨) y próximas (⚠️).

### 📊 5. Métricas y Rendimiento de Estudio
- **Historial ilimitado en JSONL:** Sesiones de estudio registradas de forma atómica en `StudyFlow/Sessions.jsonl`.
- **KPIs en tiempo real:** Minutos totales de enfoque hoy, promedio diario, sesiones completadas y tasa de hábitos.
- **Tendencia semanal:** Gráfico de barras de minutos de estudio durante los últimos 7 días.
- **Distribución por Materia / Etiquetas:** Análisis porcentual del tiempo invertido según etiquetas (`#materia`).
- **Sincronización histórica:** Herramienta para importar sesiones previas registradas en tus notas diarias.

### 🧘 6. Modo Zen
- **Enfoque sin distracciones:** Pliega automáticamente las barras laterales izquierda y derecha de Obsidian.
- **Auto-Zen:** Opción para activar el modo Zen de manera automática al iniciar cualquier sesión de Pomodoro.
- **Atajo rápido:** Comando dedicado para alternar el modo Zen en cualquier momento.

---

## 🖥️ Interfaz y Navegación

### Ribbon (Barra Lateral Izquierda)
La interfaz mantiene una superficie minimalista con solo dos íconos esenciales:
1. 🕒 **Abrir vista principal:** Abre el Hub interactivo completo de Study Flow en la pestaña central o lateral.
2. ➕ **Captura rápida:** Despliega el modal compacto para registrar una tarea o idea en segundos.

### Paleta de Comandos (`Ctrl + P` / `Cmd + P`)
- `Study Flow: Abrir interfaz completa (Pestaña central)`
- `Study Flow: Abrir en panel lateral (Sidebar)`
- `Study Flow: Abrir Calendario y Bloques de Tiempo`
- `Study Flow: Abrir temporizador Pomodoro` (Mini Timer)
- `Study Flow: Abrir gestor de tareas & Inbox`
- `Study Flow: Abrir registro de hábitos diarios`
- `Study Flow: Abrir métricas y rendimiento de estudio`
- `Study Flow: Capturar tarea rápida`
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
