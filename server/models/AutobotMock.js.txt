// BSB/server/models/AutobotMock.js

const fs = require('fs');
const path = require('path');

// Ruta al archivo de datos
const DATA_FILE = path.join(__dirname, '..', 'data', 'autobotState.json');

// Función auxiliar para leer el estado actual
function readState() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("MOCK DB ERROR: Could not read state file. Ensure 'autobotState.json' exists and is valid JSON.");
        return null; 
    }
}

// Función auxiliar para escribir el nuevo estado
function writeState(newState) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(newState, null, 4), 'utf8');
        return newState;
    } catch (error) {
        console.error("MOCK DB ERROR: Could not write state file.", error);
        return null;
    }
}

// ---------------------------------------------------------------------
// MOCK DE LAS FUNCIONES DE MONGOOSE (Autobot.findOne, Autobot.findOneAndUpdate)
// ---------------------------------------------------------------------

const AutobotMock = {
    // 1. Simula Autobot.findOne({})
    async findOne() {
        // Devuelve el estado actual
        return readState();
    },

    // 2. Simula Autobot.findOneAndUpdate({}, { $set: updateObject }, { new: true })
    // NOTA: Esta implementación simplificada no maneja la sintaxis de $set o $inc de Mongo.
    // Solo actualiza los campos de nivel superior. Para actualizaciones anidadas, 
    // manejaremos la lógica en la aplicación (como ya lo haces en orderManager).
    async findOneAndUpdate(query, update) {
        let currentState = readState();
        if (!currentState) return null;

        let updatedState = { ...currentState };

        // Aplica las actualizaciones directamente
        // Manejo de la sintaxis simple de update (ej: { lstate: 'BUYING' } )
        for (const key in update) {
            if (update.hasOwnProperty(key)) {
                updatedState[key] = update[key];
            }
        }
        
        // Simula la actualización de campos anidados (lStateData.pm, etc.)
        // IMPORTANTE: Tu código ya maneja esto leyendo el estado, modificándolo, y luego pasándolo
        // a findOneAndUpdate. Por ejemplo, si pasas { 'lStateData': updatedData }, esto funcionará.

        // Simula el manejo de la notación de puntos de MongoDB, si es necesario (ej: { 'lStateData.pm': 0.123 })
        if (update['lStateData.pm'] !== undefined) {
             updatedState.lStateData.pm = update['lStateData.pm'];
        }
        if (update['lStateData.lastOrder'] !== undefined) {
             updatedState.lStateData.lastOrder = update['lStateData.lastOrder'];
        }
        if (update['lStateData.orderCountInCycle'] !== undefined) {
             updatedState.lStateData.orderCountInCycle = update['lStateData.orderCountInCycle'];
        }
        // ... añadir más si es necesario, pero la lógica principal ya actualiza 'lStateData' completo.


        writeState(updatedState);
        return updatedState; // Retorna el documento actualizado, como haría mongoose con { new: true }
    }
};

module.exports = AutobotMock;