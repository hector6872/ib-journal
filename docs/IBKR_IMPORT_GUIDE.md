# 📥 Guía de Importación Histórica y Gestión de Desincronizaciones (IBKR)

Esta guía explica cómo importar el histórico completo de operaciones (más de 365 días) de Interactive Brokers en tu base de datos SQLite local, cómo configurar la sincronización periódica semanal y qué hacer cuando regresas de vacaciones con un desfase de sincronización.

---

## 📌 Contexto y Limitaciones de la API de IBKR
* **Flex Web Service API:** IBKR limita las consultas automáticas por API a un **máximo de 365 días hacia atrás**.
* **Estrategia Recomendada:**
  1. **Día a día:** Configurar una Flex Query en el portal de IBKR que consulte los **últimos 7 días** (`Last 7 Calendar Days`) para sincronizaciones rápidas y ligeras cada hora.
  2. **Histórico multi-año (Años anteriores):** Descargar extractos anuales desde el portal de IBKR e importarlos con el script `import_trades.py` o directamente desde la interfaz web.
  3. **Ausencias / Vacaciones (>7 días):** La interfaz web detectará automáticamente el desfase (`⚠️ Desync (>7d)`) y te permitirá arrastrar el extracto manual sin riesgo de duplicar operaciones.

---

## 🚀 Método 1: Importador por Terminal CLI (`scripts/import_trades.py`)

El script `import_trades.py` es totalmente **idempotente** (utiliza `INSERT ON CONFLICT(ib_exec_id) DO UPDATE`), lo que significa que puedes pasarle el mismo archivo o múltiples archivos repetidas veces sin duplicar nunca operaciones.

### Formatos soportados:
* **IBKR Flex Query XML (`.xml`)**
* **IBKR Flex Query CSV (`.csv`)**
* **IBKR Activity Statement CSV (`.csv`)** (Extractos estándar de actividad)
* **IBKR Trade Confirmation Reports (`.csv`)**

### Ejemplos de uso:

#### 1. Importar un archivo individual:
```bash
python3 scripts/import_trades.py ~/Downloads/U1234567_2022.csv
```

#### 2. Importar múltiples archivos de golpe:
```bash
python3 scripts/import_trades.py ~/Downloads/2021.csv ~/Downloads/2022.csv ~/Downloads/2023.xml
```

#### 3. Importar una carpeta entera con todos los extractos históricos:
```bash
python3 scripts/import_trades.py ~/Downloads/ibkr_history/
```

#### 4. Simulación (Dry-Run sin escribir en disco):
```bash
python3 scripts/import_trades.py --dry-run ~/Downloads/2022.csv
```

#### 5. Modo Detallado (Verbose):
```bash
python3 scripts/import_trades.py -v ~/Downloads/2022.csv
```

---

## 🌐 Método 2: Importación Directa desde la Interfaz Web (Drag & Drop)

1. Abre tu journal en el navegador (`http://localhost:8000` o `http://raspberrypi.local:8000`).
2. En la barra superior derecha (junto al botón de sincronización), haz clic en el icono de **Importar** 📥 o en el badge de aviso `⚠️ Desync`.
3. Arrastra tus archivos `.csv` o `.xml` al cuadro o pulsa **Seleccionar Archivo**.
4. Las operaciones se importarán y actualizarán automáticamente los calendarios y las métricas de rendimiento en tiempo real.

---

## ⚙️ Cómo descargar el Histórico de Años Anteriores desde IBKR

Para descargar tus extractos de años previos:

1. Inicia sesión en el **[Portal de Clientes de IBKR](https://www.interactivebrokers.com/)**.
2. Ve al menú **Rendimiento e Informes** (*Performance & Reports*) > **Extractos** (*Statements*).
3. En la sección **Actividad** (*Activity*):
   - **Periodo:** Selecciona `Anual` (*Annual*) o `Personalizado` (*Custom Date Range*).
   - **Año / Fechas:** Selecciona el año deseado (ej. 2021, 2022, 2023).
   - **Formato:** Elige `CSV` o `XML`.
4. Haz clic en **Descargar**.
5. Ejecuta el importador con todos los archivos descargados:
   ```bash
   python3 scripts/import_trades.py ~/Downloads/U*.csv
   ```

---

## 🔄 Configuración de la Flex Query para el Día a Día (7 Días)

Para que el journal funcione de forma óptima en el día a día sin sobrecargar la API de IBKR ni la memoria de tu Raspberry Pi:

1. En el Portal de IBKR ve a **Rendimiento e Informes** > **Flex Queries**.
2. Edita tu consulta Flex de **Operaciones / Trades** (`IBKR_QUERY_ID`):
   - **Periodo:** Selecciona `Last 7 Calendar Days` (Últimos 7 días naturales).
   - **Formato:** `XML`.
   - **Secciones:** `Trades` (con ejecuciones, órdenes y Realized P&L).
3. Guarda los cambios.

El servidor consultará automáticamente esta consulta durante las horas de mercado (07:00 a 21:15 UTC) de lunes a viernes.

---

## 🏖️ ¿Qué hacer tras unas Vacaciones o Desconexión Prolongada?

Si el journal ha estado apagado o no has sincronizado en **más de 7 días**:

1. **Aviso en la UI:** Aparecerá automáticamente un distintivo ámbar `⚠️ Desync (Xd)` en la cabecera.
2. **Descarga el extracto del periodo ausente:**
   - En IBKR, descarga el extracto de actividad en CSV/XML para las fechas en que estuviste desconectado.
3. **Arrastra el archivo en la UI** o ejecuta `python3 scripts/import_trades.py archivo.csv`.
4. El journal integrará todas las operaciones pasadas, recalculará el P&L y el aviso de desincronización desaparecerá automáticamente.
