# PC Space Manager — Administrador y Limpiador Inteligente de Disco

Herramienta personal avanzada para la auditoría, análisis y limpieza de espacio en disco en Windows, inspirada en la arquitectura, reglas y patrones de descompilación de **Glary Utilities 6**.

---

## 🚀 Características Principales

* **Panel de Unidades en Vivo:**
  * Supervisión en tiempo real de unidades de disco fijas (C:, D:) y dispositivos de almacenamiento.
  * Porcentajes de uso, espacio disponible y alerta preventiva automática ante poco espacio en disco.
  * Información de hardware y memoria RAM en vivo.

* **Limpiador Inteligente de Basura (Glary Engine):**
  * Limpieza basada en los patrones extraídos de `junkInfo.ini` y logs de Glary Utilities:
    * Archivos temporales de usuario (`%TEMP%`)
    * Archivos temporales del sistema (`C:\Windows\Temp`)
    * Volcados de memoria de errores y BSOD (`*.dmp`, `C:\Windows\Minidump`)
    * Reportes de error de Windows (`WER`)
    * Caché de miniaturas de Windows (`thumbcache_*.db`)
    * Cachés de navegadores (Google Chrome y Microsoft Edge: Cache, GPUCache, Service Workers)
    * Cachés de desarrollo (Node.js compile cache, VSCode TypeScript, Pip, npm cache)
    * Vaciado seguro de la Papelera de Reciclaje
  * **Modo Simulación (Dry-Run):** Simula el proceso de limpieza calculando los archivos y megabytes exactos que se liberarían sin tocar ningún archivo.
  * **Visualizador de Muestras:** Permite inspeccionar qué archivos componen cada categoría antes de eliminarlos.

* **Analizador de Espacio en Disco:**
  * Exploración recursiva de cualquier carpeta o unidad completa.
  * Gráfico de distribución de almacenamiento por categorías de archivo (`Imágenes`, `Videos`, `Audio`, `Documentos`, `Comprimidos/ISOs`, `Programas/DLLs`, `Código`, `Otros`) según las reglas de `Category.ini`.
  * Tabla con el **Top 50 Archivos Más Pesados** con acción de **"Abrir en Explorador"** directa en Windows (`explorer.exe /select`).
  * Desglose de subcarpetas más pesadas con opción de navegación interactiva.

* **Buscador de Duplicados:**
  * Algoritmo multifase de alto rendimiento:
    1. Agrupación inicial por tamaño exacto en bytes.
    2. Comparación rápida de hash parcial (primeros 64 KB).
    3. Verificación definitiva mediante hash SHA-256 completo.
  * Pre-selección inteligente que conserva automáticamente una copia original.

* **Carpetas Vacías:**
  * Búsqueda y depuración de directorios huérfanos sin contenido, respetando la lista de exclusión de seguridad del sistema operativo.

* **Registro de Auditoría (Audit Log):**
  * Historial cronológico estilo terminal de cada operación ejecutada.

---

## 🛠️ Tecnologías Utilizadas

* **Backend:** Node.js (Servidor HTTP nativo y API REST sin dependencias externas obligatorias).
* **Frontend:** Single Page Application (HTML5 semántico, Vanilla JavaScript reactivo).
* **Estilos:** Vanilla CSS moderno con estética *Dark Glassmorphism*, tipografías *Outfit* y *JetBrains Mono*, gradientes y micro-animaciones.
* **Integración con el SO:** PowerShell y WMI para consulta de discos fijos y control seguro del sistema.

---

## 💻 Instalación y Ejecución

1. Clona el repositorio:
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd pc-space-manager
   ```

2. Inicia la aplicación:
   * **Opción rápida:** Haz doble clic en el archivo `start.bat`.
   * **O por terminal:**
     ```bash
     npm start
     # o bien
     node server.js
     ```

3. Abre en tu navegador web:
   ```
   http://localhost:3000
   ```

---

## 📖 Documentación de Ingeniería Inversa

Para consultar el análisis técnico detallado sobre cómo se descompilaron los módulos, formatos de compresión ZLIB y archivos `.dat` de Glary Utilities, consulta el archivo:
* `docs/glary_utilities_reverse_engineering.md`

---

## 👤 Autor

* **Adrian Plaza**
* Estudiante de Ingeniería de Software

---

## 📱 App Nativa para Android (Descarga de APK)

Space Manager cuenta con su **aplicación nativa para Android (.apk)** compilada automáticamente mediante **GitHub Actions**.

### ¿Cómo descargar e instalar la app en tu teléfono?
1. Desde tu celular, ve a la sección de **Releases** de este repositorio:  
   👉 **[Releases de Space Manager en GitHub](https://github.com/AdrianP2001/pc-space-manager/releases)**
2. Descarga el archivo adjunto: **`SpaceManager-v1.0.0.apk`**.
3. Abre el archivo descargado para instalarlo (habilita la opción de *Instalar aplicaciones de fuentes desconocidas* si tu teléfono lo solicita).
4. Al abrir la app, pulsa en **"Conceder Permiso"** para otorgarle acceso al almacenamiento y poder limpiar WhatsApp, fotos y cachés.
