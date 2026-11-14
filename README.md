# StreamLab

Práctica de Cómputo en la Nube. Plataforma de transmisión con canales, categorías, chat, seguidores y grabaciones MP4.

**Integrantes:** Gustavo Adolfo Martínez Enríquez y Jovanni Emmanuel Hernández Martínez.

## Ejecutar en local

Se requiere Node.js 22.13 o posterior de la rama 22 y ffmpeg.

```bash
npm ci
cp .env.example .env
# Ajustar FFMPEG_PATH y PORT en .env.
npm start
```

El sitio usa el puerto HTTP indicado en `.env` (3000 por defecto) y recibe RTMP en el puerto 1935. Regístrate, abre Mi canal y copia el servidor y la clave en OBS. Usa H.264, AAC, 1280 × 720, 30 FPS y fotogramas clave cada 2 segundos.

## AWS

En una instancia Ubuntu 24.04 t3.micro, clonar este repositorio y ejecutar:

```bash
bash deploy/setup-ec2.sh
```

Abrir los puertos 80 y 1935; restringir SSH (22) a la IP del administrador. El script deja la aplicación con PM2, crea 1 GB de swap y permite usar el puerto 80 sin ejecutar la aplicación como root.

`HLS_TIME=1`, `2` o `4` permite comparar el tamaño de los segmentos. Reiniciar el servicio después de cambiarlo. Los archivos `.env`, `data/` y `media/` no se publican. La clave se valida al recibir RTMP y no aparece en las direcciones HLS públicas.

## Pruebas

```bash
TEST_URL=http://localhost:3000 TEST_OUTPUT=/ruta/privada/pruebas node scripts/probar.mjs
```

El recorrido comprueba los diez puntos del manual contra HTTP, RTMP, HLS y Socket.io reales. Genera video de prueba con ffmpeg, registra los resultados y guarda las cuentas de prueba únicamente en el directorio privado indicado. Se necesita `npm ci` con dependencias de desarrollo para ejecutarlo.

## Origen del código

Basado en el Anexo B y la especificación del **Manual StreamLab: Streaming en AWS**, proporcionado por el profesor Monico Sánchez Velasco. Se adaptó la configuración a macOS, se restauraron los saltos de línea al extraer el PDF, se añadió el recorrido de pruebas y se hizo configurable la duración HLS. Se usó Codex como apoyo.
