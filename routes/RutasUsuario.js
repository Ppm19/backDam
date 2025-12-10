const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer'); // Importar nodemailer
require('dotenv').config();

// Configuración de Nodemailer (ejemplo con Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Obtener todos los usuarios
router.get('/', async (req, res) => {
  try {
    const usuarios = await Usuario.find({});
    res.json(usuarios);
  } catch (err) {
    console.error('Error al obtener usuarios:', err);
    res.status(500).json({ message: 'Error interno del servidor', error: err.message });
  }
});

// Buscar usuarios por email
router.get('/buscar', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email || email.trim().length < 2) {
      return res.status(400).json({ message: 'El término de búsqueda por email debe tener al menos 2 caracteres.' });
    }

    const regex = new RegExp(email.trim(), 'i');

    const usuariosEncontrados = await Usuario.find({ email: { $regex: regex } })
      .select('nombre email  _id');

    res.json(usuariosEncontrados);

  } catch (err) {
    console.error('Error al buscar usuarios por email:', err);
    res.status(500).json({ message: 'Error interno del servidor al buscar usuarios.', error: err.message });
  }
});

// Obtener usuario por ID
router.get('/:id', async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json(usuario);
  } catch (err) {
    console.error('Error al obtener usuario:', err);
    res.status(500).json({ message: 'Error interno del servidor', error: err.message });
  }
});

// Crear usuario
router.post('/', async (req, res) => {
  try {
    const { nombre, email, password } = req.body;

    if (!nombre || !email || !password) {
        return res.status(400).json({ message: 'Nombre, email y password son requeridos.' });
    }
    
    const nuevoUsuario = new Usuario({ nombre, email, password });
    await nuevoUsuario.save();
    const usuarioParaDevolver = nuevoUsuario.toObject();
    delete usuarioParaDevolver.password;
    res.status(201).json(usuarioParaDevolver);
  } catch (err) {
    console.error('Error al crear usuario:', err);
    if (err.name === 'ValidationError') {
        return res.status(400).json({ message: 'Error de validación', errors: err.errors });
    }
    if (err.code === 11000) {
        return res.status(400).json({ message: 'Error: El email ya está registrado.' });
    }
    res.status(500).json({ message: 'Error interno del servidor', error: err.message });
  }
});

// Endpoint de Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email y password son requeridos.' });
    }

    const usuario = await Usuario.findOne({ email });
    if (!usuario) {
      return res.status(400).json({ message: 'Credenciales inválidas.' });
    }

    const isMatch = await bcrypt.compare(password, usuario.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Credenciales inválidas.' });
    }

    const payload = {
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '5h' },
      (err, token) => {
        if (err) throw err;
        const usuarioParaDevolver = usuario.toObject();
        delete usuarioParaDevolver.password;
        res.json({ token, usuario: usuarioParaDevolver });
      }
    );

  } catch (err) {
    console.error('Error en el login:', err);
    res.status(500).json({ message: 'Error interno del servidor', error: err.message });
  }
});

// Ruta para solicitar el restablecimiento de contraseña
router.post('/restablecer-pwd', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await Usuario.findOne({ email });

    if (!user) {
      return res.status(404).send('No hay ningún usuario con ese email.');
    }

    const resetToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hora
    await user.save();

    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

    const mailOptions = {
      to: user.email,
      from: process.env.EMAIL_USER,
      subject: 'Restablecimiento de Contraseña',
      html: `
        <p>Has solicitado restablecer tu contraseña.</p>
        <p>Haz clic en el siguiente enlace para completar el proceso:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>Este enlace expirará en 1 hora.</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).send('Si el email existe, se ha enviado un enlace para restablecer la contraseña.');

  } catch (error) {
    console.error('Error en restablecer-pwd:', error);
    res.status(500).send('Error del servidor.');
  }
});

// Ruta para restablecer la contraseña
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await Usuario.findOne({
      _id: decoded.userId,
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).send('Token inválido o caducado.');
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).send('Contraseña restablecida exitosamente.');

  } catch (error) {
    console.error('Error en reset-password:', error);
    res.status(500).send('Error del servidor.');
  }
});

// Actualizar usuario
router.put('/:id', async (req, res) => {

  if (req.body.password) {
    delete req.body.password;
  }
  try {
    const usuario = await Usuario.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).select('-password');
    if (!usuario) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json(usuario);
  } catch (err) {
    console.error('Error al actualizar usuario:', err);
    if (err.name === 'ValidationError') {
        return res.status(400).json({ message: 'Error de validación', errors: err.errors });
    }
    res.status(500).json({ message: 'Error interno del servidor', error: err.message });
  }
});

// Eliminar usuario
router.delete('/:id', async (req, res) => {
  try {
    const usuario = await Usuario.findByIdAndDelete(req.params.id);
    if (!usuario) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json({ message: 'Usuario eliminado exitosamente' });
  } catch (err) {
    console.error('Error al eliminar usuario:', err);
    res.status(500).json({ message: 'Error interno del servidor', error: err.message });
  }
});


// Eliminar un amigo de un usuario
router.delete('/:userId/amigos/:friendId', async (req, res) => {
  try {
    const { userId, friendId } = req.params;

    // 1. Verificar que ambos usuarios existan
    const user = await Usuario.findById(userId);
    const friend = await Usuario.findById(friendId);

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }
    if (!friend) {
      return res.status(404).json({ message: 'Amigo no encontrado.' });
    }

    // 2. Eliminar amigo de la lista del usuario actual
    await Usuario.findByIdAndUpdate(userId, {
      $pull: { amigos: friendId }
    });

    // 3. Eliminar usuario actual de la lista del amigo
    await Usuario.findByIdAndUpdate(friendId, {
      $pull: { amigos: userId }
    });

    res.json({ message: 'Amigo eliminado exitosamente.' });

  } catch (err) {
    console.error('Error al eliminar amigo:', err);
    res.status(500).json({ message: 'Error interno del servidor al eliminar amigo.', error: err.message });
  }
});
module.exports = router;