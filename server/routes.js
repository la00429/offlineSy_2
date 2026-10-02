// Routes.js - Módulo de rutas
var express = require('express');
var router = express.Router();


const mensajes = [

  {
    _id: 'XXX',
    user: 'spiderman',
    mensaje: 'Hola Mundo'
  }

];

let idContador = mensajes.length;

// Get mensajes
router.get('/', function (req, res) {
  // res.json('Obteniendo mensajes');
  res.json( mensajes );
});


// Post mensaje
router.post('/', function(req, res) {
  const { user, mensaje } = req.body;

  if (!user || !mensaje || user.trim() === '' || mensaje.trim() === '') {
    return res.status(400).json({
      ok: false,
      mensaje: 'El usuario y el mensaje son obligatorios.'
    });
  }

  idContador++;

  const nuevoMensaje = {
    _id: idContador,
    user: user.trim(),
    mensaje: mensaje.trim()
  };

  mensajes.push(nuevoMensaje);

  res.json({
    ok: true,
    mensaje: nuevoMensaje
  });
});


router.delete('/:id', function(req, res) {
  const id = req.params.id;
  const index = mensajes.findIndex(m => m._id == id);

  if (index === -1) {
    return res.status(404).json({
      ok: false,
      mensaje: `No se encontró el mensaje con ID: ${id}`
    });
  }

  const eliminado = mensajes.splice(index, 1)[0];

  res.json({
    ok: true,
    mensaje: 'Mensaje eliminado exitosamente',
    eliminado: eliminado
  });
});

module.exports = router;