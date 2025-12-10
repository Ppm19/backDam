const express = require('express');
const router = express.Router();
const InvitacionGrupo = require('../models/InvitacionesGrupo');
const Usuario = require('../models/Usuario');
const Grupo = require('../models/Grupo');
const mongoose = require('mongoose');

router.get('/pendientes/usuario/:usuarioId', async (req, res) => {
    try {
        const { usuarioId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(usuarioId)) {
            return res.status(400).json({ message: 'ID de usuario no válido.' });
        }

        const invitaciones = await InvitacionGrupo.find({ invitado: usuarioId, estado: 'pendiente' })
            .populate('invitador', 'nombre email')
            .populate('grupo', 'nombre descripcion icono moneda')
            .sort({ createdAt: -1 });

        res.json(invitaciones);

    } catch (err) {
        console.error('Error al obtener invitaciones pendientes para el usuario:', err);
        res.status(500).json({ message: 'Error interno del servidor.', error: err.message });
    }
});

router.put('/:invitacionId/aceptar', async (req, res) => {
    try {
        const { invitacionId } = req.params;
        const { usuarioActualId } = req.body; 

        if (!mongoose.Types.ObjectId.isValid(invitacionId)) {
            return res.status(400).json({ message: 'ID de invitación no válido.' });
        }
        if (!usuarioActualId || !mongoose.Types.ObjectId.isValid(usuarioActualId)) {
            return res.status(400).json({ message: 'ID de usuario actual no válido o no proporcionado.' });
        }

        const invitacion = await InvitacionGrupo.findById(invitacionId);

        if (!invitacion) {
            return res.status(404).json({ message: 'Invitación no encontrada.' });
        }

        if (invitacion.invitado.toString() !== usuarioActualId) {
            return res.status(403).json({ message: 'No autorizado para aceptar esta invitación.' });
        }

        if (invitacion.estado !== 'pendiente') {
            return res.status(400).json({ message: `Esta invitación ya ha sido ${invitacion.estado}.` });
        }

        invitacion.estado = 'aceptada';
        await invitacion.save();

        // 2. Añadir usuario a miembros del grupo
        const grupoActualizado = await Grupo.findByIdAndUpdate(
            invitacion.grupo,
            { $addToSet: { miembros: invitacion.invitado } },
            { new: true }
        );

        if (!grupoActualizado) {
            invitacion.estado = 'pendiente';
            await invitacion.save();
            return res.status(404).json({ message: 'Grupo asociado a la invitación no encontrado al intentar añadir miembro.' });
        }

        // 3. Añadir grupo a la lista de grupos del usuario
        const usuarioActualizado = await Usuario.findByIdAndUpdate(
            invitacion.invitado,
            { $addToSet: { grupos: invitacion.grupo } },
            { new: true }
        );
        
        if (!usuarioActualizado) {
            invitacion.estado = 'pendiente';
            await invitacion.save();
            await Grupo.findByIdAndUpdate(invitacion.grupo, { $pull: { miembros: invitacion.invitado } });
            return res.status(404).json({ message: 'Usuario invitado no encontrado al intentar añadir grupo a su lista.' });
        }
        
        const invitacionAceptadaPoblada = await InvitacionGrupo.findById(invitacion._id)
            .populate('invitador', 'nombre email')
            .populate('grupo', 'nombre')
            .populate('invitado', 'nombre email');


        res.json({ message: 'Invitación aceptada exitosamente.', invitacion: invitacionAceptadaPoblada });

    } catch (err) {
        console.error('Error al aceptar la invitación a grupo:', err);
        res.status(500).json({ message: 'Error interno del servidor.', error: err.message });
    }
});

router.delete('/:invitacionId/rechazar', async (req, res) => {
    try {
        const { invitacionId } = req.params;
        const { usuarioActualId } = req.body;

        if (!mongoose.Types.ObjectId.isValid(invitacionId)) {
            return res.status(400).json({ message: 'ID de invitación no válido.' });
        }
        if (!usuarioActualId || !mongoose.Types.ObjectId.isValid(usuarioActualId)) {
            return res.status(400).json({ message: 'ID de usuario actual no válido o no proporcionado.' });
        }

        const invitacion = await InvitacionGrupo.findById(invitacionId);

        if (!invitacion) {
            return res.status(404).json({ message: 'Invitación no encontrada.' });
        }

        if (invitacion.invitado.toString() !== usuarioActualId) {
            return res.status(403).json({ message: 'No autorizado para rechazar esta invitación.' });
        }

        if (invitacion.estado !== 'pendiente') {
            return res.status(400).json({ message: `Esta invitación ya ha sido ${invitacion.estado} y no puede ser rechazada/eliminada de esta manera.` });
        }

        await InvitacionGrupo.findByIdAndDelete(invitacionId);

        res.json({ message: 'Invitación rechazada y eliminada exitosamente.' });

    } catch (err) {
        console.error('Error al rechazar la invitación a grupo:', err);
        res.status(500).json({ message: 'Error interno del servidor.', error: err.message });
    }
});

router.get('/pendientes/grupo/:grupoId', async (req, res) => {
    try {
        const { grupoId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(grupoId)) {
            return res.status(400).json({ message: 'ID de grupo no válido.' });
        }

        const invitaciones = await InvitacionGrupo.find({ grupo: grupoId, estado: 'pendiente' })
            .populate('invitado', 'nombre email')
            .populate('invitador', 'nombre email')
            .sort({ createdAt: -1 });

        res.json(invitaciones);

    } catch (err) {
        console.error('Error al obtener invitaciones pendientes para el grupo:', err);
        res.status(500).json({ message: 'Error interno del servidor.', error: err.message });
    }
});


module.exports = router;
