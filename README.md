# Analizador de Inversiones · IA
## Guía de despliegue en Netlify (sin GitHub, sin comandos)

---

### ✅ Lo que necesitas
- Cuenta gratuita en [netlify.com](https://netlify.com)
- Tu API key de Anthropic: [console.anthropic.com](https://console.anthropic.com)

---

## PASO 1 — Crea cuenta en Netlify
1. Ve a **netlify.com** → clic en **"Sign up"**
2. Regístrate con Google o con email
3. Cuando te pregunte cómo quieres empezar, elige **"Deploy manually"**

---

## PASO 2 — Sube el proyecto

1. En tu panel de Netlify, busca el recuadro que dice:
   **"Want to deploy a new site without connecting to Git?"**
   y debajo dice **"drag and drop"**

2. Abre la carpeta **`inv-netlify`** que descargaste en tu computadora

3. **Arrastra toda la carpeta** `inv-netlify` al recuadro de Netlify

4. Netlify empezará a construir el proyecto automáticamente (~2 minutos)

---

## PASO 3 — Agrega tu API Key

Una vez que el deploy termine (aunque diga "failed", no importa aún):

1. Ve a **Site configuration** → **Environment variables**
2. Clic en **"Add a variable"**
3. Llena así:
   - **Key:** `ANTHROPIC_API_KEY`
   - **Value:** `sk-ant-api03-XXXXXXXXXX` ← tu API key real
4. Clic en **"Save"**

---

## PASO 4 — Redeploy

1. Ve a la pestaña **"Deploys"**
2. Clic en **"Trigger deploy"** → **"Deploy site"**
3. Espera ~2 minutos
4. Netlify te dará una URL como: `https://amazing-name-123.netlify.app`

---

## PASO 5 — ¡Comparte!

Esa URL funciona para cualquier persona en el mundo. 🎉

---

## 💰 Costos
| Servicio | Costo |
|----------|-------|
| Netlify (hosting) | **Gratis** |
| Anthropic API | ~$0.02 por análisis |
