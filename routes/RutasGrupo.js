const express = require('express');
const router = express.Router();
const Grupo = require('../models/Grupo');
const Usuario = require('../models/Usuario');
const InvitacionGrupo = require('../models/InvitacionesGrupo');
const Gasto = require('../models/Gasto');

// Listar todos los grupos (para admin)
router.get('/', async (req, res) => {
  try {
    const grupos = await Grupo.find({})
      .populate('miembros', '_id')
      .sort({ updatedAt: -1 });

    const respuesta = grupos.map(g => ({
      _id: g._id,
      nombre: g.nombre,
      miembros: g.miembros,
      miembrosCount: Array.isArray(g.miembros) ? g.miembros.length : 0,
    }));

    res.json(respuesta);
  } catch (err) {
    console.error("Error al obtener todos los grupos:", err);
    res.status(500).json({ message: "Error interno al obtener grupos", error: err.message });
  }
});

// 1. Crear un nuevo grupo
router.post('/', async (req, res) => {
    try {
        const { nombre, creadorId, moneda, amigosAInvitar } = req.body;

        if (!nombre || !creadorId) {
            return res.status(400).json({ message: 'El nombre del grupo y el ID del creador son obligatorios.' });
        }
        const creadorExiste = await Usuario.findById(creadorId);
        if (!creadorExiste) {
            return res.status(404).json({ message: 'Usuario creador no encontrado.' });
        }

        const nuevoGrupo = new Grupo({
            nombre,
            creador: creadorId,
            miembros: [creadorId],
            moneda: moneda 
        });

        const grupoGuardado = await nuevoGrupo.save();

        await Usuario.findByIdAndUpdate(creadorId, { $addToSet: { grupos: grupoGuardado._id } });

        if (amigosAInvitar && Array.isArray(amigosAInvitar) && amigosAInvitar.length > 0) {
            const invitacionesPromises = amigosAInvitar.map(amigoId => {
                if (amigoId.toString() === creadorId.toString()) {
                    return null;
                }

                const nuevaInvitacion = new InvitacionGrupo({
                    invitador: creadorId,
                    invitado: amigoId,
                    grupo: grupoGuardado._id,
                    estado: 'pendiente'
                });
                return nuevaInvitacion.save().catch(err => {
                    console.error(`Error al crear invitación para ${amigoId} al grupo ${grupoGuardado._id}:`, err.message);
                    return null;
                });
            });
            await Promise.all(invitacionesPromises.filter(p => p !== null));
        }

        res.status(201).json(grupoGuardado);
    } catch (err) {
        console.error("Error al crear grupo:", err);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ message: 'Error de validación al crear grupo', errors: err.errors });
        }
        res.status(500).json({ message: "Error interno del servidor al crear grupo", error: err.message });
    }
});

// 2. Obtener los grupos de un usuario específico

router.get('/mis-grupos/:usuarioId', async (req, res) => {
    try {
        const { usuarioId } = req.params;
        const usuarioExiste = await Usuario.findById(usuarioId);
        if (!usuarioExiste) {
            return res.status(404).json({ message: 'Usuario para filtrar grupos no encontrado.' });
        }

        const grupos = await Grupo.find({ miembros: usuarioId })
            .populate('creador', 'nombre foto')
            .populate('miembros', 'nombre foto')
            .sort({ updatedAt: -1 });
        
        res.json(grupos);
    } catch (err) {
        console.error("Error al obtener los grupos del usuario:", err);
        res.status(500).json({ message: "Error interno del servidor al obtener grupos", error: err.message });
    }
});

// 4. Obtener detalles de un grupo específico

router.get('/:grupoId', async (req, res) => {
    try {
        const { grupoId } = req.params;
        const grupo = await Grupo.findById(grupoId)
            .populate('creador', 'nombre email foto')
            .populate('miembros', 'nombre email foto');

        if (!grupo) {
            return res.status(404).json({ message: 'Grupo no encontrado.' });a
        }

        res.json(grupo);
    } catch (err) {
        console.error("Error al obtener detalles del grupo:", err);
        if (err.kind === 'ObjectId') {
             return res.status(400).json({ message: 'ID de grupo no válido.' });
        }
        res.status(500).json({ message: "Error interno del servidor al obtener el grupo", error: err.message });
    }
});

// 4. Actualizar información de un grupo (ej. nombre, moneda)

router.put('/:grupoId', async (req, res) => {
    try {
        const { grupoId } = req.params;
        const { nombre, moneda, usuarioIdAccion } = req.body;

        if (!usuarioIdAccion) {
            return res.status(401).json({ message: 'No autenticado o ID de usuario no proporcionado para la acción.' });
        }

        const grupo = await Grupo.findById(grupoId);
        if (!grupo) {
            return res.status(404).json({ message: 'Grupo no encontrado.' });
        }

        if (grupo.creador.toString() !== usuarioIdAccion) {
            return res.status(403).json({ message: 'No autorizado para actualizar este grupo. Solo el creador puede.' });
        }

        if (nombre) grupo.nombre = nombre;
        if (moneda) grupo.moneda = moneda;

        const grupoActualizado = await grupo.save();
        res.json(grupoActualizado);
    } catch (err) {
        console.error("Error al actualizar grupo:", err);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ message: 'Error de validación al actualizar', errors: err.errors });
        }
        res.status(500).json({ message: "Error interno del servidor al actualizar grupo", error: err.message });
    }
});


// 5. Eliminar un grupo

router.delete('/:grupoId', async (req, res) => {
    try {
        const { grupoId } = req.params;
        const { usuarioIdAccion } = req.body; 

        if (!usuarioIdAccion) {
            return res.status(401).json({ message: 'No autenticado o ID de usuario no proporcionado para la acción.' });
        }

        const grupo = await Grupo.findById(grupoId);
        if (!grupo) {
            return res.status(404).json({ message: 'Grupo no encontrado.' });
        }

        if (grupo.creador.toString() !== usuarioIdAccion) {
            return res.status(403).json({ message: 'No autorizado para eliminar este grupo. Solo el creador puede.' });
        }

        const gastosDelGrupo = await Gasto.find({ grupo: grupoId });
        if (gastosDelGrupo && gastosDelGrupo.length > 0) {
            return res.status(400).json({ 
                message: 'Este grupo no se puede eliminar porque tiene gastos pendientes. Por favor, salda todos los gastos antes de eliminar el grupo.',
                tieneGastos: true
            });
        }

        await Usuario.updateMany(
            { _id: { $in: grupo.miembros } },
            { $pull: { grupos: grupo._id } }
        );
        
        await InvitacionGrupo.deleteMany({ grupo: grupoId });

        await Grupo.findByIdAndDelete(grupoId);

        res.json({ message: 'Grupo eliminado exitosamente.' });
    } catch (err) {
        console.error("Error al eliminar grupo:", err);
        if (err.kind === 'ObjectId') {
             return res.status(400).json({ message: 'ID de grupo no válido.' });
        }
        res.status(500).json({ message: "Error interno del servidor al eliminar grupo", error: err.message });
    }
});


// 6. Quitar un miembro de un grupo (solo el creador puede hacerlo)

router.delete('/:grupoId/miembros/:miembroId', async (req, res) => {
    try {
        const { grupoId, miembroId } = req.params;
        const { usuarioIdAccion } = req.body;

        if (!usuarioIdAccion) {
            return res.status(401).json({ message: 'No autenticado o ID de usuario no proporcionado para la acción.' });
        }
        if (usuarioIdAccion === miembroId) {
             return res.status(400).json({ message: 'Un usuario no puede eliminarse a sí mismo de un grupo mediante esta ruta.' });
        }


        const grupo = await Grupo.findById(grupoId);
        if (!grupo) {
            return res.status(404).json({ message: 'Grupo no encontrado.' });
        }

        if (grupo.creador.toString() !== usuarioIdAccion) {
            return res.status(403).json({ message: 'No autorizado. Solo el creador puede quitar miembros.' });
        }
        
        if (grupo.creador.toString() === miembroId) {
            return res.status(400).json({ message: 'El creador no puede eliminarse a sí mismo del grupo usando esta ruta. Debe eliminar el grupo.' });
        }

        const esMiembro = grupo.miembros.some(m => m.toString() === miembroId);
        if (!esMiembro) {
            return res.status(404).json({ message: 'El usuario especificado no es miembro de este grupo.' });
        }

        await Grupo.findByIdAndUpdate(grupoId, { $pull: { miembros: miembroId } });

        await Usuario.findByIdAndUpdate(miembroId, { $pull: { grupos: grupoId } });
        
        const grupoActualizado = await Grupo.findById(grupoId)
            .populate('creador', 'nombre foto')
            .populate('miembros', 'nombre foto');

        res.json({ message: 'Miembro eliminado del grupo exitosamente.', grupo: grupoActualizado });

    } catch (err) {
        console.error("Error al quitar miembro:", err);
        res.status(500).json({ message: 'Error interno al quitar miembro', error: err.message });
    }
});

module.exports = router;