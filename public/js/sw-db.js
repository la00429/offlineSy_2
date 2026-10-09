// PouchDB usa IndexedDB como almacenamiento local en el navegador.
const dbOffline = new PouchDB('mensajes-offline');
const dbMensajes = new PouchDB('mensajes');

function guardarMensajeOffline(mensaje) {
    const documento = {
        _id: `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        user: mensaje.user,
        mensaje: mensaje.mensaje
    };

    return dbOffline.put(documento).then(() => {
        self.registration.sync.register('nuevo-post');

        return new Response(JSON.stringify({
            ok: true,
            offline: true,
            mensaje: documento
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    });
}

function listarMensajesOffline() {
    return dbOffline.allDocs({ include_docs: true });
}

function eliminarMensajeOffline(documento) {
    return dbOffline.remove(documento);
}

function guardarMensajesLocales(mensajes) {
    return dbMensajes.allDocs({ include_docs: true }).then(docs => {
        const documentosActuales = docs.rows.map(row => row.doc);
        const documentosPorId = new Map(
            documentosActuales.map(documento => [String(documento._id), documento])
        );
        const idsNuevos = new Set(mensajes.map(mensaje => String(mensaje._id)));
        const eliminaciones = documentosActuales
            .filter(documento => !idsNuevos.has(String(documento._id)))
            .map(documento => ({
                _id: documento._id,
                _rev: documento._rev,
                _deleted: true
            }));

        return dbMensajes.bulkDocs([
            ...mensajes.map(mensaje => {
                const id = String(mensaje._id);
                const documentoActual = documentosPorId.get(id);
                return {
                    ...mensaje,
                    _id: id,
                    ...(documentoActual ? { _rev: documentoActual._rev } : {})
                };
            }),
            ...eliminaciones
        ]);
    });
}

function listarMensajesLocales() {
    return dbMensajes.allDocs({ include_docs: true });
}

function postearMensajes() {
    return listarMensajesOffline().then(docs => {
        const posteos = docs.rows.map(row => {
            const documento = row.doc;
            const payload = {
                user: documento.user,
                mensaje: documento.mensaje
            };

            return fetch('api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(respuesta => respuesta.json().then(respuestaJson => ({
                respuesta,
                respuestaJson
            }))).then(({ respuesta, respuestaJson }) => {
                if (!respuesta.ok || !respuestaJson.ok) {
                    throw new Error(respuestaJson.mensaje || 'No se pudo sincronizar el mensaje.');
                }

                return dbMensajes.put({
                    ...respuestaJson.mensaje,
                    _id: String(respuestaJson.mensaje._id)
                }).then(() => eliminarMensajeOffline(documento))
                    .then(() => respuestaJson.mensaje);
            });
        });

        return Promise.all(posteos);
    });
}

