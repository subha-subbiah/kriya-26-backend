import mongoose from "mongoose";

const teamSchema = new mongoose.Schema({
  teamName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  kriyaID: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  captainName: {
    type: String,
    required: true,
    trim: true
  },
  regMail: {
    type: String,
    required: true,
    lowercase: true,
    unique: true
  },
  shipConfig: {
    type: String,
    enum: ["WARSHIP", "MERCHANT", "GHOST"],
    default: null
  },
  setNo: {
    type: Number,
    min: 1,
    max: 6,
    default: null
  },
  round1: {
    selectedScrolls: [
      // { type: mongoose.Schema.Types.ObjectId, ref: "Problem" }
      {
        name: { type: String },
        questionNo: { type: Number, default: null }  // initially null
      }
    ],
    score: { type: Number, default: 0 }
  },
  round2: {
    score: { type: Number, default: 0 },
    problemsStatus: [
      {
        problemId: { type: mongoose.Schema.Types.ObjectId, ref: "Round2Question" },
        livesLeft: { type: Number, default: 3 },
        bonusLives: { type: Number, default: 0 },
        wrongSubmissions: { type: Number, default: 0 },
        startTime: { type: Date, default: null },
        status: {
          type: String,
          enum: ["NOT_STARTED", "ACTIVE", "SOLVED", "SUNK"],
          default: "NOT_STARTED"
        }
      }
    ],
    // Action card usage + effect flags for Round 2
    totalCardsUsed: { type: Number, default: 0 },
  },
  claimedActionCards: [String],
  usedActionCards: [String],
  ignoreNextFailedTestcase: { type: Boolean, default: false },
  revealFailedTestcase: { type: Boolean, default: false },
  totalScore: { type: Number, default: 0 },
  currentIsland: {
    type: String,
    enum: ["ISLAND1", "ISLAND2", "ISLAND3"],
    default: "ISLAND1"
  },
  isEliminated: { type: Boolean, default: false },
  otp: String,
  otpExpiry: Date
}, { timestamps: true });

export default mongoose.model("Team", teamSchema);
