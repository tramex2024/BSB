// Archivo: test_sign.js

const CryptoJS = require('crypto-js');
require('dotenv').config();

const API_SECRET = process.env.BITMART_SECRET_KEY;
const API_MEMO = process.env.BITMART_API_MEMO || "GainBot";

const TEST_TIMESTAMP = "1724021509000"; // Un timestamp de prueba
const TEST_BODY = JSON.stringify({ "recvWindow": 5000 }); // Un cuerpo de petición de prueba

function generateSign(timestamp, memo, body) {
    const message = `${timestamp}#${memo || ''}#${body || ''}`;
    return CryptoJS.HmacSHA256(message, API_SECRET).toString(CryptoJS.enc.Hex);
}

console.log("--- Iniciando prueba de firma ---");
console.log("Secret Key: " + (API_SECRET ? "OK" : "Error"));
console.log("API Memo: " + (API_MEMO ? "OK" : "Error"));

if (!API_SECRET) {
    console.error("ERROR: No se encontró la clave secreta en las variables de entorno.");
    process.exit(1);
}

try {
    const signature = generateSign(TEST_TIMESTAMP, API_MEMO, TEST_BODY);
    console.log(`Mensaje para la firma: ${TEST_TIMESTAMP}#${API_MEMO}#${TEST_BODY}`);
    console.log("Firma generada: " + signature);
    console.log("--- Prueba de firma finalizada ---");
} catch (error) {
    console.error("❌ Falló la generación de la firma:", error.message);
}