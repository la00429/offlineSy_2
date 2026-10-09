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
        const idsNuevos = new Set(mensajes.map(mensaje => String(mensaje._id)));
        const eliminaciones = documentosActuales
            .filter(documento => !idsNuevos.has(String(documento._id)))
            .map(documento => ({
                _id: documento._id,
                _rev: documento._rev,
                _deleted: true
            }));

        return dbMensajes.bulkDocs([
            ...mensajes.map(mensaje => ({ ...mensaje, _id: String(mensaje._id) })),
            ...eliminaciones
        ]);
    });
}

function listarMensajesLocales() {
    return dbMensajes.allDocs({ include_docs: true });
}

