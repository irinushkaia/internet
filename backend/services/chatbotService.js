// ChatbotService.js

const intents = require('../intents.json');
const hotelData = require('../hotels.json');

const chatHistory = {};

// Normalize string: lowercases and trims
const normalizeString = (str) => str.toLowerCase().trim();

// Capitalize the first letter of a string
const capitalizeFirstLetter = (str) => str.charAt(0).toUpperCase() + str.slice(1);

// Create a map for quick hotel name lookup
const hotelNameMap = new Map(
  hotelData.hotels.map(hotel => [normalizeString(hotel.name), hotel])
);

const STATES = {
  INITIAL: 'initial',
  SELECT_HOTEL: 'select_hotel',
  SELECT_SERVICES: 'select_services',
  SELECT_PEOPLE: 'select_people',
  CONFIRM_BOOKING: 'confirm_booking',
  BOOKING_COMPLETED: 'booking_completed',
  RECOMMEND_ACCOMMODATION: 'recommend_accommodation',
  CANCEL_BOOKING: 'cancel_booking',
};

function getIntentAndEntities(message, userState) {
  // Normalize and split message by both spaces and commas
  const tokens = message.toLowerCase().split(/[\s,]+/);

  // Detect intent
  const detectedIntent = intents.intents.find(intent =>
    intent.keywords.some(keyword => tokens.includes(keyword))
  );

  // Detect entities
  const normalizedMessage = normalizeString(message);

  // Extract services from the message considering multi-word services
  const services = [];
  intents.serviceKeywords.forEach(service => {
    const serviceTokens = service.split(' ');
    if (serviceTokens.every(token => tokens.includes(token))) {
      services.push(service);
    }
  });

  const entities = {
    hotel: hotelNameMap.get(normalizedMessage) || userState.hotel,
    country: hotelData.hotels.map(hotel => hotel.country.toLowerCase()).find(country => tokens.includes(country)) || userState.country,
    city: hotelData.hotels.map(hotel => hotel.city.toLowerCase()).find(city => tokens.includes(city)) || userState.city,
    services: services,
    people: tokens.find(token => /^\d+$/.test(token)) || userState.people,
    confirm: tokens.includes('bestätigen')
  };

  return { intent: detectedIntent || { intent: 'unknown', response: 'Entschuldigung, ich bin mir nicht sicher, wie ich Ihnen dabei helfen kann.' }, entities };
}

function handleBooking(entities, userState) {
  switch (userState.bookingStep) {
    case STATES.SELECT_HOTEL:
      if (!entities.hotel) {
        return { response: "Bitte wählen Sie eine Unterkunft aus unserem Angebot. ", nextState: { ...userState, bookingStep: STATES.SELECT_HOTEL } };
      }
      userState.hotel = entities.hotel;
      userState.country = entities.hotel.country;
      userState.city = entities.hotel.city;
      return { response: `Sie haben ${entities.hotel.name} in ${capitalizeFirstLetter(entities.hotel.city)}, ${capitalizeFirstLetter(entities.hotel.country)} ausgewählt. Dieses Hotel bietet die folgenden Dienstleistungen an: ${entities.hotel.services.join(', ')}. Bitte wählen Sie die für Sie passenden aus.`, nextState: { ...userState, hotel: entities.hotel, country: entities.hotel.country, city: entities.hotel.city, bookingStep: STATES.SELECT_SERVICES } };

    case STATES.SELECT_SERVICES:
      const hotelServices = userState.hotel.services.map(service => normalizeString(service));
      const matchedServices = entities.services.filter(service => hotelServices.includes(service));

      if (!userState.services) {
        userState.services = [];
      }

      userState.services = [...new Set([...userState.services, ...matchedServices])];

      if (matchedServices.length === 0) {
        return { response: `Keine der ausgewählten Dienstleistungen sind in ${userState.hotel.name} verfügbar. Bitte wählen Sie aus den verfügbaren Dienstleistungen: ${hotelServices.join(', ')}.`, nextState: { ...userState, bookingStep: STATES.SELECT_SERVICES } };
      }

      return { response: `Sie haben gewählt: ${userState.services.join(', ')}. Wenn Sie mit der Buchung fortfahren möchten, geben Sie die Anzahl der mitreisenden Personen ein.`, nextState: { ...userState, services: userState.services, bookingStep: STATES.SELECT_PEOPLE } };

    case STATES.SELECT_PEOPLE:
      if (!entities.people) {
        return { response: "Bitte geben Sie die Anzahl der Personen an.", nextState: userState };
      }
      userState.people = entities.people;
      const pricePerNight = userState.hotel.price;
      const serviceCost = userState.services.reduce((total, service) => total + 20, 0); // Assuming each service adds a fixed cost
      const totalPrice = pricePerNight * userState.people + serviceCost;
      return { response: `Der Gesamtpreis für Ihren Aufenthalt in ${userState.hotel.name} beträgt $${totalPrice}. Bitte geben Sie 'bestätigen' ein, um die Buchung abzuschließen.`, nextState: { ...userState, people: entities.people, totalPrice: totalPrice, bookingStep: STATES.CONFIRM_BOOKING } };

    case STATES.CONFIRM_BOOKING:
      if (entities.confirm) {
        const bookingDetails = {
          hotelName: userState.hotel.name,
          country: userState.country,
          city: userState.city,
          services: userState.services,
          people: userState.people,
          totalPrice: userState.totalPrice
        };
        return { response: `Buchung bestätigt. Hotel: ${userState.hotel.name}, Land: ${userState.hotel.country}, Stadt: ${userState.hotel.city}, Dienstleistungen: ${userState.services.join(', ')}, Personen: ${userState.people}, Gesamtpreis: $${userState.totalPrice}. Wir freuen uns, dass Sie sich für uns entschieden haben. Gute Reise!`, nextState: { ...userState, bookingStep: STATES.BOOKING_COMPLETED, bookingSuccess: true, bookingDetails: bookingDetails } };
      }
      return { response: "Bitte bestätigen Sie die Buchung, indem Sie 'bestätigen' eingeben.", nextState: userState };

    default:
      return { response: 'Entschuldigung, ich bin mir nicht sicher, wie ich Ihnen dabei helfen kann.', nextState: userState };
  }
}

function handleRecommendation(entities, userState) {
  if (entities.country && !entities.city) {
    const citiesInCountry = Array.from(new Set(hotelData.hotels.filter(hotel => hotel.country.toLowerCase() === entities.country).map(hotel => hotel.city)));
    return { response: `Dies sind alle unsere Unterkunftsmöglichkeiten in ${capitalizeFirstLetter(entities.country)}: ${citiesInCountry.join(', ')}. Bitte wählen Sie eine Stadt aus.`, nextState: { ...userState, country: entities.country } };
  } else if (entities.city && entities.country) {
    const hotelsInCity = hotelData.hotels.filter(hotel => hotel.city.toLowerCase() === entities.city && hotel.country.toLowerCase() === entities.country);
    return { response: `Dies sind alle unsere Unterkunftsmöglichkeiten für ${capitalizeFirstLetter(entities.city)}: ${hotelsInCity.map(hotel => hotel.name).join(', ')}. Bitte wählen Sie ein Hotel aus.`, nextState: { ...userState, city: entities.city, bookingStep: STATES.SELECT_HOTEL } };
  } else if (entities.city) {
    const hotelsInCity = hotelData.hotels.filter(hotel => hotel.city.toLowerCase() === entities.city);
    return { response: `Dies sind alle unsere Unterkunftsmöglichkeiten für ${capitalizeFirstLetter(entities.city)}: ${hotelsInCity.map(hotel => hotel.name).join(', ')}. Bitte wählen Sie ein Hotel aus.`, nextState: { ...userState, city: entities.city, bookingStep: STATES.SELECT_HOTEL } };
  } else {
    return { response: "Bitte geben Sie das Land an, für das Sie Unterkunftsempfehlungen wünschen.", nextState: userState };
  }
}

function handleUserMessage(message, userId) {
  if (!chatHistory[userId]) {
    chatHistory[userId] = { intent: null, entities: {}, userState: { bookingStep: STATES.INITIAL } };
  }

  if (typeof message !== 'string') {
    console.error('Message is not a string:', message);
    return 'Ungültiges Nachrichtenformat';
  }

  const { intent, entities } = getIntentAndEntities(message, chatHistory[userId].userState);
  const userState = chatHistory[userId].userState;

  let response, nextState;

  switch (intent.intent) {
    case 'buchen':
      if (userState.bookingStep === STATES.INITIAL) {
        response = intent.response;
        nextState = { ...userState, bookingStep: STATES.SELECT_HOTEL };
      } else {
        ({ response, nextState } = handleBooking(entities, userState));
      }
      break;

    case 'empfehlen':
      response = intent.response;
      nextState = { ...userState, bookingStep: STATES.RECOMMEND_ACCOMMODATION };
      break;

    case 'abbrechen':
      response = intent.response;
      nextState = { ...userState, bookingStep: STATES.INITIAL, hotel: null, services: [], people: null, totalPrice: null, country: null, city: null };
      break;

    default:
      if (userState.bookingStep === STATES.RECOMMEND_ACCOMMODATION) {
        ({ response, nextState } = handleRecommendation(entities, userState));
      } else {
        switch (userState.bookingStep) {
          case STATES.INITIAL:
            response = "Ich bin Ihr Buchungsassistent. Ob Sie eine Reservierung vornehmen möchten oder eine Empfehlung für ein Hotel benötigen, ich bin hier, um Ihnen zu helfen. Was kann ich für Sie tun?";
            nextState = userState;
            break;

          case STATES.SELECT_HOTEL:
          case STATES.SELECT_SERVICES:
          case STATES.SELECT_PEOPLE:
          case STATES.CONFIRM_BOOKING:
            ({ response, nextState } = handleBooking(entities, userState));
            break;

          case STATES.BOOKING_COMPLETED:
            response = "Ich bin Ihr Buchungsassistent. Ob Sie eine Reservierung vornehmen möchten oder eine Empfehlung für ein Hotel benötigen, ich bin hier, um Ihnen zu helfen. Was kann ich für Sie tun?";
            nextState = { ...userState, bookingStep: STATES.INITIAL, hotel: null, services: [], people: null, totalPrice: null, country: null, city: null };
            break;

          default:
            response = 'Entschuldigung, ich bin mir nicht sicher, wie ich Ihnen dabei helfen kann.';
            nextState = userState;
        }
      }
  }

  // Ensure transitions and responses are handled appropriately
  if (userState.bookingStep === STATES.BOOKING_COMPLETED) {
    nextState = { ...userState, bookingStep: STATES.INITIAL, hotel: null, services: [], people: null, totalPrice: null, country: null, city: null };
  } else if (!nextState.bookingStep) {
    response = intent.response;
    nextState = userState;
  }

  chatHistory[userId] = { intent, entities, userState: nextState };

  return { response, history: chatHistory[userId], bookingDetails: nextState.bookingDetails || null };
}

module.exports = {
  handleUserMessage
};
