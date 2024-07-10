
const chatbotService = require('../services/chatbotService');

exports.processMessage = (req, res) => {
    const userMessage = req.body.message;
    const userId = req.body.userId;

    const response = chatbotService.handleMessage(userId, userMessage);
    res.json(response);
};
