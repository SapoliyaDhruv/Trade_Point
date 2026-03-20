const Notification = require('../models/Notification');

exports.createNotification = async ({
  userId,
  type = 'GENERAL',
  title,
  message,
  link = '',
  meta = {}
}) => {
  if (!userId || !title || !message) {
    return null;
  }

  try {
    return await Notification.create({
      userId,
      type,
      title,
      message,
      link,
      meta
    });
  } catch (err) {
    console.error('Notification create failed:', err.message);
    return null;
  }
};
