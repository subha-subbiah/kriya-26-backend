import mongoose from "mongoose";


// const algorithmCardSchema = new Schema({
//   name: { type: String, required: true },
//   description: String,
//   difficultyTag: String,
//   iconUrl: String,
//   createdAt: { type: Date, default: Date.now }
// });

// export default model("AlgorithmCard", algorithmCardSchema);

const algorithmCardSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  Array: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Round2Question"
    }
  ],
  description: {
    type: String
  },
  difficultyTag: {
    type: String
  },
  iconUrl: {
    type: String
  }
}, { timestamps: true });

export default mongoose.model("AlgorithmCard", algorithmCardSchema);
