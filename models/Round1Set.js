import mongoose from "mongoose";

const algorithmCardSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    description: { type: String, default: "" },
    difficultyTag: { type: String, default: "" },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    questionType: { type: String, required: true },
    questionNo: { type: Number, required: true },
    question: { type: String, required: true },
    imageUrl: { type: String, default: "" },
    options: [{ type: String }],
    answer: { type: String, required: true },
    points: { type: Number, default: 10 },
    algorithmCard: { type: algorithmCardSchema, default: null },
  },
  { _id: true }
);

const round1SetSchema = new mongoose.Schema(
  {
    setNumber: { type: Number, required: true, unique: true }, // unique identifier
    totalQuestions: { type: Number, default: 0 },
    questions: [questionSchema],
  },
  { timestamps: true }
);

export default mongoose.model("Round1Set", round1SetSchema);