# Analizador-Financiero
# Analizador de Inversiones · IA

Sistema multiagente de análisis de inversiones con precio en tiempo real, 4 agentes especializados y gráfica interactiva de trading.

---

## 🚀 Despliegue en Vercel (5 minutos)

### Paso 1 — Sube el proyecto a GitHub

1. Ve a [github.com](https://github.com) e inicia sesión (o crea cuenta gratis)
2. Haz clic en **"New repository"**
3. Nombre: `investment-analyzer` → clic en **"Create repository"**
4. Sube todos los archivos de esta carpeta al repositorio

> Si no sabes usar Git, puedes usar la opción **"uploading an existing file"** que aparece en la página del repositorio vacío.

---

### Paso 2 — Conecta con Vercel

1. Ve a [vercel.com](https://vercel.com) e inicia sesión con tu cuenta de GitHub
2. Clic en **"Add New Project"**
3. Selecciona el repositorio `investment-analyzer`
4. Vercel detectará automáticamente que es un proyecto Vite/React
5. **NO hagas clic en Deploy todavía** — primero agrega la API key

---

### Paso 3 — Agrega tu API Key de Anthropic

En la pantalla de configuración del proyecto en Vercel:

1. Abre la sección **"Environment Variables"**
2. Agrega esta variable:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** `sk-ant-api03-...` ← tu API key de Anthropic
3. Haz clic en **"Add"**

> Obtén tu API key en: [console.anthropic.com](https://console.anthropic.com)

---

### Paso 4 — Deploy

1. Clic en **"Deploy"**
2. Espera ~2 minutos mientras Vercel construye el proyecto
3. ¡Listo! Vercel te dará una URL pública como:
   `https://investment-analyzer-tuusuario.vercel.app`

---

## 🔗 Compartir

Una vez desplegado, comparte la URL con cualquier persona.
Todos los análisis usan tu API key (que está segura en el servidor, nunca expuesta al navegador).

---

## 💰 Costos estimados

| Servicio | Costo |
|----------|-------|
| Vercel (hosting) | **Gratis** (plan hobby) |
| Anthropic API | ~$0.01–0.03 por análisis completo |

---

## 📁 Estructura del proyecto

```
investment-analyzer/
├── api/
│   └── anthropic.js      ← Proxy seguro (guarda la API key en el servidor)
├── src/
│   ├── main.jsx          ← Entry point React
│   └── App.jsx           ← Componente principal
├── index.html
├── package.json
├── vite.config.js
└── vercel.json           ← Configuración de rutas
```

---

## ⚙️ Desarrollo local (opcional)

```bash
# 1. Instala dependencias
npm install

# 2. Crea archivo .env.local con tu API key
echo "ANTHROPIC_API_KEY=sk-ant-api03-..." > .env.local

# 3. Inicia el servidor de desarrollo
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173)

