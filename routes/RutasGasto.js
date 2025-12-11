const express = require('express');
const router = express.Router();
const Gasto = require('../models/Gasto');
const Grupo = require('../models/Grupo');
const Usuario = require('../models/Usuario');

// Listar todos los gastos (uso admin)
router.get('/', async (req, res) => {
    try {
        const gastos = await Gasto.find({})
            .populate('grupo', 'nombre')
            .populate('pagadoPor', 'nombre')
            .populate({ path: 'detalleDivision.usuario', select: 'nombre' })
            .sort({ fecha: -1 });
        res.json(gastos);
    } catch (err) {
        console.error("Error al obtener todos los gastos:", err);
        res.status(500).json({ message: "Error interno al obtener gastos", error: err.message });
    }
});

// Middleware para verificar si un usuario es miembro de un grupo (lo usaremos más adelante)
async function verificarMiembro(req, res, next) {
    try {
        const { grupoId } = req.params.grupoId ? req.params : req.body; // Puede venir de params o body
        const { usuarioId } = req.body.pagadoPor ? { usuarioId: req.body.pagadoPor } : req.currentUser; // Asumimos que currentUser puede estar disponible

        if (!grupoId || !usuarioId) {
            return res.status(400).json({ message: "Falta ID de grupo o ID de usuario para la verificación." });
        }

        const grupo = await Grupo.findById(grupoId);
        if (!grupo) {
            return res.status(404).json({ message: "Grupo no encontrado." });
        }

        const esMiembro = grupo.miembros.map(m => m.toString()).includes(usuarioId.toString());
        if (!esMiembro) {
            return res.status(403).json({ message: "El usuario no es miembro del grupo." });
        }
        
        req.grupo = grupo; // Adjuntamos el grupo al request para no tener que buscarlo de nuevo
        next();
    } catch (error) {
        console.error("Error en middleware verificarMiembro:", error);
        res.status(500).json({ message: "Error interno al verificar miembro del grupo.", error: error.message });
    }
}


// 1. Crear un nuevo gasto
router.post('/', async (req, res) => {
    try {
        const {
            grupoId,
            nombre,
            total,
            pagadoPor, // ID del usuario que pagó
            tipoDivision, // 'Iguales' o 'Manual'
            detalleDivision, // Array de { usuario: ID, importe: Number } solo si tipoDivision es 'Manual'
            fecha // Opcional, por defecto Date.now()
        } = req.body;

        if (!grupoId || !nombre || total === undefined || !pagadoPor || !tipoDivision) {
            return res.status(400).json({ message: 'Faltan campos obligatorios: grupoId, nombre, total, pagadoPor, tipoDivision.' });
        }

        if (parseFloat(total) <= 0) {
            return res.status(400).json({ message: 'El total del gasto debe ser mayor que cero.' });
        }

        const grupo = await Grupo.findById(grupoId).populate('miembros');
        if (!grupo) {
            return res.status(404).json({ message: 'Grupo no encontrado.' });
        }

        const pagadorExiste = await Usuario.findById(pagadoPor);
        if (!pagadorExiste) {
            return res.status(404).json({ message: 'Usuario pagador no encontrado.' });
        }

        const esPagadorMiembro = grupo.miembros.some(m => m._id.toString() === pagadoPor.toString());
        if (!esPagadorMiembro) {
            return res.status(403).json({ message: 'El usuario que pagó debe ser miembro del grupo.' });
        }

        let divisionCalculada = [];

        if (tipoDivision === 'Iguales') {
            if (!grupo.miembros || grupo.miembros.length === 0) {
                return res.status(400).json({ message: 'No hay miembros en el grupo para dividir el gasto en partes iguales.' });
            }
            const importePorMiembro = parseFloat(total) / grupo.miembros.length;
            divisionCalculada = grupo.miembros.map(miembro => ({
                usuario: miembro._id,
                importe: importePorMiembro
            }));
        } else if (tipoDivision === 'Manual') {
            if (!detalleDivision || !Array.isArray(detalleDivision) || detalleDivision.length === 0) {
                return res.status(400).json({ message: 'Para división manual, se requiere detalleDivision con al menos un usuario.' });
            }
            
            const sumaDetalle = detalleDivision.reduce((acc, item) => acc + parseFloat(item.importe || 0), 0);
            const epsilon = 0.01; // Para comparaciones de punto flotante
            if (Math.abs(sumaDetalle - parseFloat(total)) > epsilon) {
                return res.status(400).json({ message: `La suma de los importes en detalleDivision (${sumaDetalle.toFixed(2)}) no coincide con el importe total del gasto (${parseFloat(total).toFixed(2)}).` });
            }

            // Validar que todos los usuarios en detalleDivision son miembros del grupo
            for (const item of detalleDivision) {
                if (!item.usuario || item.importe === undefined || parseFloat(item.importe) < 0) {
                     return res.status(400).json({ message: 'Cada item en detalleDivision debe tener un usuario y un importe no negativo.' });
                }
                const esUsuarioDetalleMiembro = grupo.miembros.some(m => m._id.toString() === item.usuario.toString());
                if (!esUsuarioDetalleMiembro) {
                    return res.status(400).json({ message: `El usuario ${item.usuario} en detalleDivision no es miembro del grupo.` });
                }
            }
            divisionCalculada = detalleDivision.map(d => ({usuario: d.usuario, importe: parseFloat(d.importe) }));

        } else {
            return res.status(400).json({ message: "tipoDivision debe ser 'Iguales' o 'Manual'." });
        }

        const nuevoGasto = new Gasto({
            grupo: grupoId,
            nombre,
            total: parseFloat(total),
            pagadoPor,
            tipoDivision,
            detalleDivision: divisionCalculada,
            fecha: fecha ? new Date(fecha) : Date.now()
        });

        const gastoGuardado = await nuevoGasto.save();
        
        // Podríamos querer popular aquí antes de enviar, o dejarlo para las rutas GET
        res.status(201).json(gastoGuardado);

    } catch (err) {
        console.error("Error al crear gasto:", err);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ message: 'Error de validación al crear gasto', errors: err.errors });
        }
        res.status(500).json({ message: "Error interno del servidor al crear gasto", error: err.message });
    }
});

// 2. Obtener todos los gastos de un grupo específico
router.get('/grupo/:grupoId', async (req, res) => {
    try {
        const { grupoId } = req.params;

        const grupo = await Grupo.findById(grupoId);
        if (!grupo) {
            return res.status(404).json({ message: 'Grupo no encontrado.' });
        }

        // Aquí podrías añadir una verificación si el usuario que hace la petición es miembro del grupo,
        // si esa es una lógica de negocio deseada (ej. req.currentUser.id debe estar en grupo.miembros)
        // Por ahora, se asume que si se tiene el grupoId, se pueden ver sus gastos si el grupo es válido.

        const gastos = await Gasto.find({ grupo: grupoId })
            .populate('pagadoPor', 'nombre foto') // Popula quién pagó el gasto
            .populate({
                path: 'detalleDivision.usuario',
                select: 'nombre foto' // Popula los usuarios en el detalle de la división
            })
            .sort({ fecha: -1 }); // Ordenar por fecha, los más recientes primero

        res.json(gastos);

    } catch (err) {
        console.error("Error al obtener gastos del grupo:", err);
        if (err.kind === 'ObjectId') {
             return res.status(400).json({ message: 'ID de grupo no válido.' });
        }
        res.status(500).json({ message: "Error interno del servidor al obtener gastos del grupo", error: err.message });
    }
});

// 3. Obtener detalles de un gasto específico
router.get('/:gastoId', async (req, res) => {
    try {
        const { gastoId } = req.params;

        const gasto = await Gasto.findById(gastoId)
            .populate('grupo', 'nombre moneda') // Popula el grupo al que pertenece el gasto
            .populate('pagadoPor', 'nombre foto email') // Popula quién pagó el gasto
            .populate({
                path: 'detalleDivision.usuario',
                select: 'nombre foto email' // Popula los usuarios en el detalle de la división
            });

        if (!gasto) {
            return res.status(404).json({ message: 'Gasto no encontrado.' });
        }

        // Aquí también podrías verificar si el usuario actual es miembro del grupo al que pertenece el gasto,
        // antes de devolver los detalles. Ejemplo: const grupoDelGasto = await Grupo.findById(gasto.grupo._id);
        // if (!grupoDelGasto.miembros.map(m=>m.toString()).includes(req.currentUser.id)) { return res.status(403).json(...)}
        // Esto dependerá de si un usuario puede obtener un gasto por ID directo sin ser miembro.

        res.json(gasto);

    } catch (err) {
        console.error("Error al obtener detalles del gasto:", err);
        if (err.kind === 'ObjectId') {
             return res.status(400).json({ message: 'ID de gasto no válido.' });
        }
        res.status(500).json({ message: "Error interno del servidor al obtener detalles del gasto", error: err.message });
    }
});

// 4. Actualizar un gasto existente
router.put('/:gastoId', async (req, res) => {
    try {
        const { gastoId } = req.params;
        const { nombre, total, tipoDivision, detalleDivision, fecha, usuarioIdAccion, participanteAEliminarId } = req.body;

        if (!usuarioIdAccion) {
            return res.status(401).json({ message: 'ID de usuario que realiza la acción es requerido.' });
        }

        const gasto = await Gasto.findById(gastoId).populate('grupo');
        if (!gasto) {
            return res.status(404).json({ message: 'Gasto no encontrado.' });
        }

        if (gasto.pagadoPor.toString() !== usuarioIdAccion) {
            return res.status(403).json({ message: 'No autorizado. Solo el usuario que pagó el gasto puede modificarlo.' });
        }

        // Nueva lógica para eliminar un participante
        if (participanteAEliminarId) {
            const participanteIndex = gasto.detalleDivision.findIndex(p => p.usuario.toString() === participanteAEliminarId);

            if (participanteIndex === -1) {
                return res.status(404).json({ message: 'Participante a eliminar no encontrado en el detalle de división.' });
            }

            const participanteEliminado = gasto.detalleDivision[participanteIndex];
            const importeEliminado = participanteEliminado.importe;

            // Actualizar el total del gasto
            gasto.total = parseFloat(gasto.total) - parseFloat(importeEliminado);
            if (gasto.total < 0) gasto.total = 0; // Asegurarse que el total no sea negativo

            // Filtrar el participante de detalleDivision
            gasto.detalleDivision.splice(participanteIndex, 1);

            // Si después de eliminar, no quedan participantes y el tipo de división es 'Iguales'
            // o si el total es cero, podríamos querer cambiar el tipo de división o manejarlo de alguna manera.
            // Por ahora, solo eliminamos y ajustamos el total.
            // Si el tipo de división era 'Iguales' y aún quedan participantes, el reparto ya no será igual
            // a menos que se recalcule. El requerimiento actual no pide recalcular, solo quitar.
            // Si no quedan participantes, el gasto.total se habrá reducido, pero detalleDivision estará vacío.

        } else {
            // Lógica de actualización general del gasto (existente)
            let divisionActualizada = gasto.detalleDivision;
            let totalActualizado = gasto.total;

            if (total !== undefined) {
                if (parseFloat(total) <= 0) {
                    return res.status(400).json({ message: 'El total del gasto debe ser mayor que cero.' });
                }
                totalActualizado = parseFloat(total);
                gasto.total = totalActualizado;
            }

            if (nombre) gasto.nombre = nombre;
            if (fecha) gasto.fecha = new Date(fecha);
            // No se permite cambiar pagadoPor ni el grupo del gasto directamente aquí.

            // Si se cambia el tipo de división o el detalle, o el total (que afecta la división igualitaria)
            if (tipoDivision) {
                gasto.tipoDivision = tipoDivision;
                // Necesitamos el grupo para la división igualitaria o para validar miembros en división manual
                const grupoDeGasto = await Grupo.findById(gasto.grupo._id).populate('miembros'); 
                if (!grupoDeGasto) {
                    return res.status(404).json({ message: 'El grupo asociado a este gasto ya no existe.' });
                }

                if (tipoDivision === 'Iguales') {
                    if (!grupoDeGasto.miembros || grupoDeGasto.miembros.length === 0) {
                        return res.status(400).json({ message: 'No hay miembros en el grupo para dividir el gasto en partes iguales.' });
                    }
                    const importePorMiembro = totalActualizado / grupoDeGasto.miembros.length;
                    divisionActualizada = grupoDeGasto.miembros.map(miembro => ({
                        usuario: miembro._id,
                        importe: importePorMiembro
                    }));
                } else if (tipoDivision === 'Manual') {
                    if (!detalleDivision || !Array.isArray(detalleDivision) || detalleDivision.length === 0) {
                        return res.status(400).json({ message: 'Para división manual, se requiere detalleDivision.' });
                    }
                    const sumaDetalle = detalleDivision.reduce((acc, item) => acc + parseFloat(item.importe || 0), 0);
                    const epsilon = 0.01;
                    if (Math.abs(sumaDetalle - totalActualizado) > epsilon) {
                        return res.status(400).json({ message: `La suma de los importes en detalleDivision (${sumaDetalle.toFixed(2)}) no coincide con el total del gasto (${totalActualizado.toFixed(2)}).` });
                    }
                    // Validar que todos los usuarios en detalleDivision son miembros del grupo
                    for (const item of detalleDivision) {
                        if (!item.usuario || item.importe === undefined || parseFloat(item.importe) < 0) {
                            return res.status(400).json({ message: 'Cada item en detalleDivision debe tener un usuario y un importe no negativo.' });
                        }
                        const esUsuarioDetalleMiembro = grupoDeGasto.miembros.some(m => m._id.toString() === item.usuario.toString());
                        if (!esUsuarioDetalleMiembro) {
                            return res.status(400).json({ message: `El usuario ${item.usuario} en detalleDivision no es miembro del grupo ${grupoDeGasto.nombre}.` });
                        }
                    }
                    divisionActualizada = detalleDivision.map(d => ({ usuario: d.usuario, importe: parseFloat(d.importe) }));
                } else {
                    return res.status(400).json({ message: "tipoDivision debe ser 'Iguales' o 'Manual'." });
                }
                gasto.detalleDivision = divisionActualizada;
            } else if (total !== undefined && gasto.tipoDivision === 'Iguales') {
                // Si solo se actualiza el total y la división es 'Iguales', recalcular
                const grupoDeGasto = await Grupo.findById(gasto.grupo._id).populate('miembros');
                if (!grupoDeGasto) {
                    return res.status(404).json({ message: 'El grupo asociado a este gasto ya no existe.' });
                }
                if (!grupoDeGasto.miembros || grupoDeGasto.miembros.length === 0) {
                    return res.status(400).json({ message: 'No hay miembros en el grupo para recalcular la división igualitaria.' });
                }
                const importePorMiembro = totalActualizado / grupoDeGasto.miembros.length;
                gasto.detalleDivision = grupoDeGasto.miembros.map(miembro => ({
                    usuario: miembro._id,
                    importe: importePorMiembro
                }));
            }
        } // Fin del else para la lógica de actualización general

        const gastoActualizado = await gasto.save();
        
        // Popular respuesta para consistencia
        const gastoRespuesta = await Gasto.findById(gastoActualizado._id)
            .populate('grupo', 'nombre moneda')
            .populate('pagadoPor', 'nombre foto email')
            .populate({
                path: 'detalleDivision.usuario',
                select: 'nombre foto email'
            });

        res.json(gastoRespuesta);

    } catch (err) {
        console.error("Error al actualizar gasto:", err);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ message: 'Error de validación al actualizar gasto', errors: err.errors });
        }
        if (err.kind === 'ObjectId') {
             return res.status(400).json({ message: 'ID de gasto no válido.' });
        }
        res.status(500).json({ message: "Error interno del servidor al actualizar gasto", error: err.message });
    }
});

// 5. Eliminar un gasto
router.delete('/:gastoId', async (req, res) => {
    try {
        const { gastoId } = req.params;
        // Asegúrate de enviar el ID del usuario que realiza la acción desde el frontend
        // Puede ser a través del cuerpo de la solicitud o de un token de autenticación decodificado (ej. req.currentUser.id)
        const { usuarioIdAccion } = req.body; // O la forma que uses para identificar al usuario

        if (!usuarioIdAccion) {
            return res.status(401).json({ message: 'ID de usuario que realiza la acción es requerido para eliminar.' });
        }

        const gasto = await Gasto.findById(gastoId);

        if (!gasto) {
            return res.status(404).json({ message: 'Gasto no encontrado.' });
        }

        if (gasto.pagadoPor.toString() !== usuarioIdAccion) {
            return res.status(403).json({ message: 'No autorizado. Solo el usuario que pagó el gasto puede eliminarlo.' });
        }

        await Gasto.findByIdAndDelete(gastoId);

        res.json({ message: 'Gasto eliminado exitosamente.' });

    } catch (err) {
        console.error("Error al eliminar gasto:", err);
        if (err.kind === 'ObjectId') {
             return res.status(400).json({ message: 'ID de gasto no válido.' });
        }
        res.status(500).json({ message: "Error interno del servidor al eliminar gasto", error: err.message });
    }
});


// Obtener todos los gastos de un usuario a través de sus grupos
router.get('/usuario/:usuarioId', async (req, res) => {
    try {
        const { usuarioId } = req.params;

        const usuarioExiste = await Usuario.findById(usuarioId);
        if (!usuarioExiste) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        // Encontrar todos los grupos a los que pertenece el usuario
        const gruposDelUsuario = await Grupo.find({ miembros: usuarioId });

        // Obtener los IDs de esos grupos
        const grupoIds = gruposDelUsuario.map(grupo => grupo._id);

        // Encontrar todos los gastos asociados a esos grupos
        const gastos = await Gasto.find({ grupo: { $in: grupoIds } })
            .populate('grupo', 'nombre moneda')
            .populate('pagadoPor', 'nombre foto')
            .populate({
                path: 'detalleDivision.usuario',
                select: 'nombre foto'
            })
            .sort({ fecha: -1 });

        res.json(gastos);

    } catch (err) {
        console.error("Error al obtener gastos de los grupos del usuario:", err);
        res.status(500).json({ message: "Error interno del servidor al obtener gastos de grupos", error: err.message });
    }
});

// Listar todos los gastos (solo admin)
router.get('/', async (req, res) => {
    try {
      const gastos = await Gasto.find({})
        .populate('detalleDivision.usuario', '_id')
        .populate('pagadoPor', 'nombre')
        .sort({ fecha: -1 });
      res.json(gastos);
    } catch (err) {
      res.status(500).json({ message: 'Error al obtener gastos', error: err.message });
    }
  });
  
module.exports = router;
