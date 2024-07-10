const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { handleUserMessage } = require('./services/chatbotService');
const hotels = require('./hotels.json');

const app = express();

app.use(cors());

app.get('/api/hotels', (req, res) => {
  res.json(hotels);
});

// Initialize Firebase Admin SDK
var admin = require("firebase-admin");
var serviceAccount = require(path.join(__dirname, "config", "internettechnologien-27dcc-firebase-adminsdk-cxr74-cee4fa98fb.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://internettechnologien-27dcc-default-rtdb.europe-west1.firebasedatabase.app"
});

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

let userStates = {};

const verifyToken = async (token) => {
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying token:', error);
    return null;
  }
};

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  const decodedToken = await verifyToken(token);
  if (!decodedToken) {
    return next(new Error('Authentication error'));
  }
  socket.user = decodedToken;
  next();
});

io.on('connection', (socket) => {
  console.log('New client connected', socket.user.email);

  socket.on('message', (msg) => {
    const { message } = msg;
    const userId = socket.user.email;
    console.log(`Message received from ${userId}: `, message);

    if (!userStates[userId]) {
      userStates[userId] = { intent: null, entities: {}, userState: {} };
    }

    const response = handleUserMessage(message, userId);
    console.log('Generated response:', response);

    // Send response back to the client
    socket.emit('response', response);

    if (response.history.userState.bookingStep === 'booking_completed' && response.history.userState.bookingSuccess) {
      // Emit a booking confirmation event with booking details
      socket.emit('booking_confirmation', response.bookingDetails);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.user.email);
  });
});

module.exports = { app, server };
