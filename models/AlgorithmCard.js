import mongoose from "mongoose";


// const algorithmCardSchema = new Schema({
//   name: { type: String, required: true },
//   description: String,
//   difficultyTag: String,
//   iconUrl: String,
//   createdAt: { type: Date, default: Date.now }
// });

// export default model("AlgorithmCard", algorithmCardSchema);

const algorithmSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  Array: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Round2Question"
    }
  ]
});

const Algorithm = mongoose.model("AlgorithmCard", algorithmSchema, "algorithmcards");

export default Algorithm;
