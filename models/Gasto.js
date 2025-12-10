const mongoose = require('mongoose');

const gastoSchema = new mongoose.Schema({
    grupo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Grupo',
        required: true,
        index: true
    },
    nombre: {
        type: String,
        required: true,
        trim: true
    },
    total: {
        type: Number,
        required: true,
        min: [0, 'El importe no puede ser negativo']
    },
    pagadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true
    },
    fecha: {
        type: Date,
        default: Date.now
    },
    tipoDivision: {
        type: String,
        enum: ['Iguales', 'Manual'], 
        required: true
    },
    detalleDivision: [{
        _id: false,
        usuario: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Usuario',
            required: true
        },
        importe: {
            type: Number,
            required: true,
            min: 0
        }
    }],


}, {
    timestamps: true,
    collection: 'gastos'
});


gastoSchema.pre('save', function(next) {

    if (this.detalleDivision && this.detalleDivision.length > 0) {
        const sumaDivision = this.detalleDivision.reduce((acc, item) => acc + item.importe, 0);
        const epsilon = 0.01;
        if (Math.abs(sumaDivision - this.total) > epsilon) {
            const err = new Error('La suma de los importes en detalleDivision no coincide con el importe total del gasto.');
            return next(err);
        }
    }
    next();
});

module.exports = mongoose.model('Gasto', gastoSchema);