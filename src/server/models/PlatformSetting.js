const mongoose = require('mongoose');

const platformSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'default'
    },
    defaultCommissionPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 10
    },
    highValueThreshold: {
      type: Number,
      min: 1,
      default: 50000
    },
    moderationKeywords: {
      type: [String],
      default: [
        'weapon',
        'gun',
        'drugs',
        'illegal',
        'stolen',
        'fake bill',
        'counterfeit'
      ]
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlatformSetting', platformSettingSchema);
