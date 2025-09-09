const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Servidor de prueba de BSB está funcionando.');
});

app.listen(port, () => {
  console.log(`Servidor de prueba escuchando en el puerto ${port}`);
});