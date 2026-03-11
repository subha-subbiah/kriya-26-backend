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
    unique: true
  },
  shipConfig: {
    type: String,
    enum: ["Warship", "Merchant Vessel", "Ghost Ship"],
    required: true,
    trim: true
  },
  round1: {
    selectedScrolls: [
      // { type: mongoose.Schema.Types.ObjectId, ref: "Problem" }
      {name: String,difficultyTag: String}
    ],
    score: { type: Number, default: 0 }
  },
  round2: {
    score: { type: Number, default: 0 },
    problemStatus: [
      {
        problemId: { type: mongoose.Schema.Types.ObjectId, ref: "Problem" },
        livesLeft: { type: Number, default: 3 },
        wrongSubmissions: { type: Number, default: 0 },
        status: {
          type: String,
          enum: ["NOT_STARTED", "SOLVED", "SANK"],
          default: "NOT_STARTED"
        }
      }
    ]
  },
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
