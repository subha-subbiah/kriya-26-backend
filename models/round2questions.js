import { Schema, model } from "mongoose";

const round2QuestionSchema = new Schema({
  title: String,
  description: String,
  allowedAlgorithms: [{ type: Schema.Types.ObjectId, ref: "Algorithm" }],
  timeLimitSec: Number,
  code:String,
  testCases: [
    {
      input: String,
      output: String,
      isHidden: Boolean
    }
  ],
  createdBy: { type: Schema.Types.ObjectId, ref: "Admin" }
}, { timestamps: true });

export default model("Round2Question", round2QuestionSchema);