// Routes.js - Módulo de rutas
var express = require('express');
var router = express.Router();
const mongoose = require('mongoose');
const Mensaje = require('./mensajes');

// Get mensajes
router.get('/', async function (req, res) {
  try {
    const mensajes = await Mensaje.find().sort({ createdAt: 1 }).lean();
    res.json(mensajes);
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: 'No se pudieron obtener los mensajes.' });
  }
});


// Post mensaje
router.post('/', async function(req, res) {
  const { user, mensaje } = req.body;

  if (!user || !mensaje || user.trim() === '' || mensaje.trim() === '') {
    return res.status(400).json({
      ok: false,
      mensaje: 'El usuario y el mensaje son obligatorios.'
    });
  }

  try {
    const nuevoMensaje = await Mensaje.create({
      user: user.trim(),
      mensaje: mensaje.trim()
    });

    res.status(200).json({
      ok: true,
      mensaje: nuevoMensaje
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      tipoError: 'base-de-datos',
      mensaje: 'No se pudo guardar el mensaje en la base de datos.'
    });
  }
});


router.delete('/:id', async function(req, res) {
  const id = req.params.id;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      ok: false,
      mensaje: `El ID no es válido: ${id}`
    });
  }

  try {
    const eliminado = await Mensaje.findByIdAndDelete(id);

    if (!eliminado) {
    return res.status(404).json({
      ok: false,
      mensaje: `No se encontró el mensaje con ID: ${id}`
    });
  }

    res.json({
      ok: true,
      mensaje: 'Mensaje eliminado exitosamente',
      eliminado: eliminado
    });
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: 'No se pudo eliminar el mensaje.' });
  }
});

module.exports = router;