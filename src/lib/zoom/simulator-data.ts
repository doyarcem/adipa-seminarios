/**
 * Corpus de datos del simulador.
 *
 * Los nombres son sinteticos y no corresponden a personas reales. Estan elegidos
 * para reproducir el desorden real de una sala de Zoom latinoamericana: gente con
 * nombre completo, gente con solo el nombre de pila, telefonos que aparecen como
 * "iPhone", equipo de Adipa, tildes, mayusculas inconsistentes y homonimos.
 */

export const FIRST_NAMES = [
  'María', 'Camila', 'Valentina', 'Sofía', 'Isidora', 'Josefa', 'Antonia', 'Fernanda',
  'Catalina', 'Javiera', 'Constanza', 'Daniela', 'Carolina', 'Paulina', 'Andrea',
  'Francisca', 'Macarena', 'Rocío', 'Bárbara', 'Nicole', 'Trinidad', 'Emilia',
  'Juan', 'Diego', 'Matías', 'Sebastián', 'Benjamín', 'Vicente', 'Tomás', 'Cristóbal',
  'Ignacio', 'Felipe', 'Rodrigo', 'Andrés', 'Gabriel', 'Nicolás', 'Pablo', 'Daniel',
  'Alejandro', 'Manuel', 'Esteban', 'Joaquín', 'Álvaro', 'Marcelo', 'Patricio',
  'Ana', 'Paula', 'Claudia', 'Verónica', 'Alejandra', 'Marcela', 'Pamela', 'Karen',
  'Luis', 'Jorge', 'Ricardo', 'Eduardo', 'Mauricio', 'Gonzalo', 'Cristian', 'Héctor',
];

export const LAST_NAMES = [
  'González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva',
  'Martínez', 'Sepúlveda', 'Morales', 'Rodríguez', 'López', 'Fuentes', 'Hernández',
  'Torres', 'Araya', 'Flores', 'Espinoza', 'Valenzuela', 'Castillo', 'Tapia',
  'Reyes', 'Gutiérrez', 'Castro', 'Vargas', 'Álvarez', 'Vásquez', 'Sánchez',
  'Ramírez', 'Carrasco', 'Gómez', 'Cortés', 'Herrera', 'Núñez', 'Jara', 'Vergara',
  'Rivera', 'Figueroa', 'Bravo', 'Molina', 'Guzmán', 'Riquelme', 'Salazar',
  'Ortiz', 'Miranda', 'Campos', 'Navarro', 'Pizarro', 'Cárdenas', 'Aguilera',
];

/** Envoltorios de dispositivo tal como los genera cada cliente de Zoom. */
export const DEVICE_WRAPPERS = [
  (name: string) => `${name}'s iPhone`,
  (name: string) => `iPhone de ${name}`,
  (name: string) => `Android de ${name}`,
  (name: string) => `Galaxy de ${name}`,
  (name: string) => `${name}'s iPad`,
  (name: string) => `MacBook de ${name}`,
];

/** Nombres que NO identifican a nadie. Deben terminar excluidos. */
export const DEVICE_ONLY_NAMES = [
  'iPhone', 'iPad', 'Android', 'MacBook', 'Galaxy S24', 'Galaxy A54', 'Redmi Note 12',
  'iPhone de usuario', 'Motorola', 'Huawei', 'PC', 'Notebook', 'Sala de reuniones',
  'Usuario', 'Guest', 'Invitado', 'Zoom User', 'Samsung', 'Xiaomi', 'Windows',
];

/** Nombres del equipo Adipa. Deben excluirse por la regla del nombre (seccion 15). */
export const ADIPA_STAFF_NAMES = [
  'Soporte ADIPA', 'Adipa Monitores', 'Equipo Adipa', 'ADIPA Chile', 'Adipa - Académica',
  'Monitora Adipa', 'aDiPa Soporte', 'Adipa México',
];

/** Seminarios por Escuela, con la terminologia de cada area (product-desk). */
export const SEMINAR_TOPICS = [
  { topic: 'Seminario Psicología 2026', school: 'adult_mental_health' },
  { topic: 'Evaluación diagnóstica infantojuvenil', school: 'child_youth_mental_health' },
  { topic: 'Seminario Educación y Neurodesarrollo 2026', school: 'education_neurodevelopment' },
  { topic: 'Informes periciales y rol del perito', school: 'psychosocial_legal' },
  { topic: 'Bienestar laboral y gestión del talento', school: 'organizational_psychology' },
  { topic: 'Ansiedad y depresión en la adultez', school: 'adult_mental_health' },
  { topic: 'Neurodivergencias en el aula: TEA y TDAH', school: 'education_neurodevelopment' },
  { topic: 'Terapia de pareja: herramientas prácticas', school: 'adult_mental_health' },
  { topic: 'Evaluación parental en contextos judiciales', school: 'psychosocial_legal' },
  { topic: 'Mindfulness aplicado a la práctica clínica', school: 'adult_mental_health' },
] as const;

/** Las 17 salas de la organizacion. Cada una es un usuario dentro de la cuenta Business. */
export const ROOM_ACCOUNTS = [
  'sala1', 'sala2', 'sala3', 'sala4', 'sala5', 'sala6', 'sala7', 'sala8', 'sala9',
  'sala10', 'sala11', 'sala500', 'sala12', 'sala13', 'sala14', 'sala15', 'sala16',
] as const;

export const HOST_NAMES = [
  'Dra. Carolina Muñoz',
  'Dr. Rodrigo Sepúlveda',
  'Ps. Valentina Rojas',
  'Dra. Andrea Fuentes',
  'Ps. Matías Contreras',
];
