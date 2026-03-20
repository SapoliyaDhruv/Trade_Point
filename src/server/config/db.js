require('dotenv').config();
const mongoose = require('mongoose');

const globalCache = global;
if (!globalCache._tradePointMongoose) {
    globalCache._tradePointMongoose = { conn: null, promise: null };
}

const connectDB = async () => {
    try {
        if (globalCache._tradePointMongoose.conn) {
            return globalCache._tradePointMongoose.conn;
        }

        if (!globalCache._tradePointMongoose.promise) {
            const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/trade_point';
            globalCache._tradePointMongoose.promise = mongoose.connect(mongoUri);
        }

        globalCache._tradePointMongoose.conn = await globalCache._tradePointMongoose.promise;
        console.log('MongoDB connected');
        return globalCache._tradePointMongoose.conn;
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        globalCache._tradePointMongoose.promise = null;
        throw err;
    }
};

module.exports = connectDB;
