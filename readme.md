# backDam - Backend de Gestión de Grupos y Gastos

Este repositorio contiene el código fuente del backend para la aplicación de gestión de grupos y gastos, "Donde Siempre". Proporciona una API RESTful para la autenticación de usuarios, la creación y gestión de grupos, la administración de gastos, y la lógica de autorización.

## 🚀 Tecnologías Utilizadas

*   **Node.js**: Entorno de ejecución de JavaScript.
*   **Express**: Framework web para Node.js, utilizado para construir la API.
*   **MongoDB**: Base de datos NoSQL, utilizada para almacenar los datos de la aplicación(`MongoDB`).
*   **Mongoose**: Librería de modelado de objetos (ODM) para MongoDB y Node.js.
*   **bcryptjs**: Para el hashing y la verificación segura de contraseñas.
*   **jsonwebtoken (JWT)**: Para la autenticación de usuarios y la generación de tokens de sesión.
*   **dotenv**: Para cargar variables de entorno desde un archivo `.env`.

## ✨ Características Principales de la API

*   **Autenticación de Usuarios**:
    *   Registro de nuevos usuarios.
    *   Inicio de sesión (login) con generación de JWT.
*   **Gestión de Usuarios**:
    *   Obtener detalles de usuarios.
    *   Búsqueda de usuarios por email.
    *   Actualización y eliminación de usuarios.
    *   Gestión de amigos (añadir, eliminar).
*   **Gestión de Grupos**:
    *   Creación de grupos con un creador y miembros iniciales.
    *   Obtención de grupos a los que pertenece un usuario.
    *   Obtención de detalles de un grupo específico.
    *   Actualización de información del grupo (nombre, moneda).
    *   Eliminación de grupos (solo el creador o un administrador).
    *   Eliminación de miembros de un grupo (solo el creador).
*   **Gestión de Gastos**:
    *   Creación de gastos dentro de un grupo (división igualitaria o manual).
    *   Obtención de todos los gastos de un usuario a través de sus grupos.
    *   Obtención de detalles de un gasto específico.
    *   Actualización de gastos existentes (nombre, total, división).
    *   Eliminación de gastos (solo el pagador original o un administrador).
*   **Autorización**: Implementación de lógica para permitir a administradores realizar ciertas acciones privilegiadas (ej. eliminar grupos/gastos).

## 🛠️ Configuración del Entorno Local

Sigue estos pasos para poner en marcha el proyecto en tu máquina local:

1.  **Clona el repositorio:**
    ```bash
    git clone https://github.com/tu-usuario/backDam.git
    cd backDam
    ```

2.  **Instala las dependencias:**
    ```bash
    npm install
    ```

3.  **Crea un archivo `.env`:**
    En la raíz del proyecto, crea un archivo llamado `.env` y añade las siguientes variables de entorno. Sustituye los valores de ejemplo por los tuyos:

    ```env
    PORT=3001
    MONGODB_URI="mongodb+srv://<usuario>:<contraseña>@<cluster>.mongodb.net/<nombre_de_la_db>?retryWrites=true&w=majority"
    JWT_SECRET="una_clave_secreta_fuerte_y_larga_para_jwt"
    CLIENT_URL="http://localhost:3000" # URL de tu frontend local
    ```
    *   **`MONGODB_URI`**: Consigue esta URL de tu base de datos MongoDB (local o en la nube como MongoDB Atlas).
    *   **`JWT_SECRET`**: Genera una cadena aleatoria y muy segura.
    *   **`CLIENT_URL`**: La URL base de tu aplicación frontend local (donde se ejecuta tu React Native/React web).

4.  **Inicia el servidor:**
    ```bash
    node server.js
    ```
    El servidor se iniciará y estará disponible en `http://localhost:3001` (o el puerto que hayas configurado en `PORT`).

## 🚀 Despliegue en Vercel

Este backend está diseñado para ser desplegado fácilmente en Vercel.

1.  **Conecta tu repositorio:** En el Dashboard de Vercel, importa tu repositorio de GitHub (o GitLab/Bitbucket).
2.  **Configura las variables de entorno:** Este es un paso CRUCIAL. En la configuración de tu proyecto en Vercel, ve a `Settings > Environment Variables` y añade las siguientes variables para los entornos de `Production`, `Preview` y `Development` según sea necesario:
    *   `MONGODB_URI`: La URL de tu base de datos MongoDB de producción.
    *   `JWT_SECRET`: Una clave secreta **distinta y muy segura** para producción.
3.  **Despliegue automático:** Vercel se encargará de desplegar automáticamente tu backend cada vez que realices un push a la rama principal.

## ⚠️ Consideraciones de Seguridad

*   **Variables de Entorno:** Nunca hardcodees claves sensibles en tu código. Utiliza variables de entorno.
*   **Contraseñas:** Las contraseñas se almacenan hasheadas (usando bcryptjs) en la base de datos, nunca en texto plano.
*   **JWT Secret:** Mantén tu `JWT_SECRET` seguro y no lo expongas públicamente. Genera uno diferente y más fuerte para producción.