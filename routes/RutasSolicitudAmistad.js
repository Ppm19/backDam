const express = require('express');
const router = express.Router();
const SolicitudAmistad = require('../models/SolicitudAmistad');
const Usuario = require('../models/Usuario');

// --- Crear una nueva Solicitud de Amistad ---
router.post('/', async (req, res) => {
  try {
    const { solicitanteId, receptorId } = req.body;

    // 1. Validar que los IDs fueron proporcionados
    if (!solicitanteId || !receptorId) {
      return res.status(400).json({ message: 'Se requieren los IDs del solicitante y del receptor.' });
    }

    // 2. El solicitante y el receptor no pueden ser la misma persona
    if (solicitanteId === receptorId) {
      return res.status(400).json({ message: 'No puedes enviarte una solicitud de amistad a ti mismo.' });
    }

    // 3. Verificar que ambos usuarios existan
    const [solicitante, receptor] = await Promise.all([
      Usuario.findById(solicitanteId).select('amigos'),
      Usuario.findById(receptorId).select('amigos')
    ]);

    if (!solicitante) {
      return res.status(404).json({ message: 'Usuario solicitante no encontrado.' });
    }
    if (!receptor) {
      return res.status(404).json({ message: 'Usuario receptor no encontrado.' });
    }

    // 4. Verificar si ya son amigos
    if (solicitante.amigos.includes(receptorId)) {
        return res.status(400).json({ message: 'Ya sois amigos.' });
    }

    // 5. Verificar si ya existe una solicitud pendiente (en cualquier dirección)
    const solicitudPendientePrevia = await SolicitudAmistad.findOne({
      $or: [
        { solicitante: solicitanteId, receptor: receptorId, estado: 'pendiente' },
        { solicitante: receptorId, receptor: solicitanteId, estado: 'pendiente' }
      ]
    });

    if (solicitudPendientePrevia) {
      let mensaje = 'Ya existe una solicitud de amistad pendiente ';
      if (solicitudPendientePrevia.solicitante.toString() === solicitanteId) {
          mensaje += 'que enviaste a este usuario.';
      } else {
          mensaje += 'de este usuario hacia ti. Revisa tus solicitudes.';
      }
      return res.status(400).json({ message: mensaje });
    }

    // 6. Crear y guardar la nueva solicitud
    const nuevaSolicitud = new SolicitudAmistad({
      solicitante: solicitanteId,
      receptor: receptorId,
    });

    await nuevaSolicitud.save();

    const solicitudPoblada = await SolicitudAmistad.findById(nuevaSolicitud._id)
        .populate('solicitante', 'nombre email')
        .populate('receptor', 'nombre email');

    res.status(201).json({ message: 'Solicitud de amistad enviada exitosamente.', solicitud: solicitudPoblada });

  } catch (err) {
    console.error('Error al crear solicitud de amistad:', err);
    if (err.name === 'ValidationError') {
        return res.status(400).json({ message: 'Error de validación', errors: err.errors });
    }
    if (err.code === 11000) {
        return res.status(400).json({ message: 'No se pudo enviar la solicitud. Es posible que ya exista solicitud previa.' });
    }
    res.status(500).json({ message: 'Error interno del servidor al crear la solicitud de amistad.', error: err.message });
  }
});

// --- Obtener todas las solicitudes de amistad donde el usuario es el receptor y están pendientes ---
router.get('/recibidas/:usuarioId', async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const solicitudes = await SolicitudAmistad.find({ receptor: usuarioId, estado: 'pendiente' })
      .populate('solicitante', 'nombre email')
      .sort({ createdAt: -1 });

    res.json(solicitudes);
  } catch (err) {
    console.error('Error al obtener solicitudes recibidas:', err);
    res.status(500).json({ message: 'Error interno del servidor.', error: err.message });
  }
});

// --- Obtener todas las solicitudes de amistad que el usuario ha enviado y están pendientes ---
router.get('/enviadas/:usuarioId', async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const solicitudes = await SolicitudAmistad.find({ solicitante: usuarioId, estado: 'pendiente' })
      .populate('receptor', 'nombre email')
      .sort({ createdAt: -1 });

    res.json(solicitudes);
  } catch (err) {
    console.error('Error al obtener solicitudes enviadas:', err);
    res.status(500).json({ message: 'Error interno del servidor.', error: err.message });
  }
});


// --- Aceptar o Rechazar una solicitud de amistad ---
router.put('/:solicitudId', async (req, res) => {
  try {
    const { solicitudId } = req.params;
    const { accion, usuarioActualId } = req.body;

    if (!accion || (accion !== 'aceptar' && accion !== 'rechazar')) {
      return res.status(400).json({ message: 'Acción no válida. Debe ser "aceptar" o "rechazar".' });
    }
    if(!usuarioActualId){
        return res.status(400).json({ message: 'Se requiere el ID del usuario que realiza la acción.' });
    }

    const solicitud = await SolicitudAmistad.findById(solicitudId);

    if (!solicitud) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    if (solicitud.receptor.toString() !== usuarioActualId) {
        return res.status(403).json({ message: 'No autorizado para modificar esta solicitud.' });
    }

    if (solicitud.estado !== 'pendiente') {
      return res.status(400).json({ message: `Esta solicitud ya ha sido ${solicitud.estado}.` });
    }

    if (accion === 'aceptar') {
      solicitud.estado = 'aceptada';
      await Usuario.findByIdAndUpdate(solicitud.solicitante, { $addToSet: { amigos: solicitud.receptor } });
      await Usuario.findByIdAndUpdate(solicitud.receptor, { $addToSet: { amigos: solicitud.solicitante } });
      await solicitud.save(); 

      const solicitudPoblada = await SolicitudAmistad.findById(solicitud._id)
        .populate('solicitante', 'nombre email')
        .populate('receptor', 'nombre email');
      
      res.json({ message: 'Solicitud aceptada exitosamente.', solicitud: solicitudPoblada });

    } else {
      await SolicitudAmistad.findByIdAndDelete(solicitudId);
      res.json({ message: 'Solicitud rechazada y eliminada exitosamente.' });
    }

  } catch (err) {
    console.error('Error al actualizar solicitud de amistad:', err);
    res.status(500).json({ message: 'Error interno del servidor.', error: err.message });
  }
});

router.delete('/cancelar/:solicitudId', async (req, res) => {
    try {
        const { solicitudId } = req.params;
        const { usuarioActualId } = req.body;

        if (!usuarioActualId) {
            return res.status(400).json({ message: 'Se requiere el ID del usuario que realiza la acción.' });
        }

        const solicitud = await SolicitudAmistad.findById(solicitudId);

        if (!solicitud) {
            return res.status(404).json({ message: 'Solicitud no encontrada.' });
        }

        if (solicitud.solicitante.toString() !== usuarioActualId) {
            return res.status(403).json({ message: 'No autorizado para cancelar esta solicitud.' });
        }

        if (solicitud.estado !== 'pendiente') {
            return res.status(400).json({ message: 'Solo se pueden cancelar solicitudes pendientes.' });
        }
        await SolicitudAmistad.findByIdAndDelete(solicitudId);

        res.json({ message: 'Solicitud de amistad cancelada exitosamente.' });

    } catch (err) {
        console.error('Error al cancelar solicitud de amistad:', err);
        res.status(500).json({ message: 'Error interno del servidor.', error: err.message });
    }
});


module.exports = router;