# Chat Server Client

Servidor Express para el chat de mensajes. Los mensajes se almacenan en MongoDB.

## Prerrequisitos

- Node.js y npm. Comprueba la instalación con `node --version` y `npm --version`.
- MongoDB ejecutándose localmente o una URI de MongoDB accesible.
- Postman u otro cliente HTTP para probar la API.

## Instalación

Instala las dependencias con:

```
npm install
```

Configura la conexión copiando `.env.example` como `.env` y ajustando `MONGODB_URI` si es necesario. Si MongoDB es local, el valor por defecto es `mongodb://127.0.0.1:27017/offlineSy`.

Para ejecutar en producción:

```
npm start
```

Para ejecutar en desarrollo:

```
npm run dev
```

La API de mensajes está disponible en `GET /api`, `POST /api` y `DELETE /api/:id`.
